/* ============================================================
   Rights Guardian — serverless recording + live transcription

   Everything runs in the page: mic audio streams directly to
   Deepgram over WebSocket (no local server needed), speaker-
   labelled transcript lines are assembled in memory, and both
   the audio and the transcript are available as downloads.

   Needs js/config.js (gitignored, see config.example.js) with a
   Deepgram API key — without it, recording still works and
   transcription simply stays off.

   Transcript events are re-emitted on `document`:
     document.addEventListener('rg-transcript', (e) => { ... e.detail ... });
   detail shapes:
     { type:'transcript', final:false, text }                        // interim, fast
     { type:'transcript', final:true,  lines:[{speaker,start,end,text}] }
     { type:'session_closed', session, lineCount }                   // transcript done
     { type:'ready' | 'error', ... }
   ============================================================ */

let mediaRecorder = null;
let recording = false;
let timerInterval = null;
let seconds = 0;
let timerEl = null;   // bound to #timer by the listening page's inline script

/* Captured audio (rebuilt each recording) */
const CHUNK_MS = 250;            // small timeslice keeps live transcription snappy
let recordedChunks = [];
let recordingMimeType = '';
let lastRecordingBlob = null;

/* Live transcription — direct browser → Deepgram connection */
const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-3&diarize=true&smart_format=true&interim_results=true';
let transcriptWS = null;
let sessionName = null;
let sessionEnding = false;       // true once we deliberately close the stream
let transcriptLines = [];        // [{speaker,start,end,text}] — grows live
let recordingStartedAt = null;   // ISO wall-clock time recording began

/* Deepgram must receive the audio stream from byte 0 — the first chunk
   carries the WebM container header, and without it nothing that follows
   can be decoded. Chunks produced while the socket is still connecting are
   queued here and flushed on open, instead of being dropped. */
let pendingChunks = [];
let reconnectAttempts = 0;       // unexpected-drop retries for the current recording
const MAX_RECONNECT_ATTEMPTS = 2;

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    recordedChunks = [];
    recordingMimeType = mimeType;
    lastRecordingBlob = null;

    openTranscriptSocket();

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
        sendAudioChunk(e.data);
      }
    };

    // Keep the tracks alive while recording; release them on stop.
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      lastRecordingBlob = new Blob(recordedChunks, { type: recordingMimeType });
    };
    mediaRecorder.start(CHUNK_MS);

    recording = true;
    recordingStartedAt = new Date().toISOString();
    startTimer();

    /* Recording starts automatically on page load — signal it without a
       blocking alert. Vibration honors the Settings toggle. */
    if (typeof getOrUpdateSettings === 'function' &&
        getOrUpdateSettings().hapticFeedback && navigator.vibrate) {
      navigator.vibrate(80);
    }
    console.log('[recording] started');
  } catch (err) {
    recording = false;
    console.error(err)
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  closeTranscriptSocket();
  recording = false;
  stopTimer();
}

/* ---------- downloads ---------- */

function downloadLastRecording() {
  if (!lastRecordingBlob) {
    console.warn('No finished recording to download.');
    return false;
  }
  triggerDownload(lastRecordingBlob, `${sessionName || 'recording'}.webm`);
  return true;
}

/* Downloads the transcript of the last session as .txt and .jsonl. */
function downloadTranscript() {
  if (!transcriptLines.length) {
    console.warn('No transcript to download.');
    return false;
  }
  const txt = transcriptLines
    .map(l => `[${fmtClock(l.start)}] Speaker ${l.speaker}: ${l.text}`)
    .join('\n') + '\n';
  const jsonl = transcriptLines.map(l => JSON.stringify(l)).join('\n') + '\n';
  triggerDownload(new Blob([txt], { type: 'text/plain' }), `${sessionName}.txt`);
  triggerDownload(new Blob([jsonl], { type: 'application/jsonl' }), `${sessionName}.jsonl`);
  return true;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- live transcription ---------- */

/* Route one audio chunk to the current socket. While the socket is still
   connecting the chunk is queued (never dropped — the first chunk holds the
   WebM header Deepgram needs to decode everything after it). */
function sendAudioChunk(chunk) {
  if (!transcriptWS) return;
  if (transcriptWS.readyState === WebSocket.CONNECTING) {
    pendingChunks.push(chunk);
  } else if (transcriptWS.readyState === WebSocket.OPEN) {
    transcriptWS.send(chunk);
  }
  /* CLOSING/CLOSED: drop — recordedChunks keeps the full backlog, and a
     reconnect replays it from the top. */
}

/* Open a Deepgram socket. `resume` reconnects mid-recording after an
   unexpected drop: the session continues, and the entire recording so far
   is replayed so the stream starts at byte 0 again. */
function openTranscriptSocket(resume = false) {
  const key = (window.RG_CONFIG || {}).deepgramApiKey;
  if (!key || key === 'your_key_here') {
    console.warn(
      '[transcript] No Deepgram key — copy js/config.example.js to js/config.js and add yours. ' +
      'Recording works; live transcription is off.'
    );
    return;
  }
  if (!resume) {
    sessionName = `session-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    transcriptLines = [];
    reconnectAttempts = 0;
  }
  sessionEnding = false;
  pendingChunks = resume ? recordedChunks.slice() : [];

  try {
    // Browser auth: Deepgram accepts the API key via WS subprotocol.
    const ws = new WebSocket(DEEPGRAM_URL, ['token', key]);
    transcriptWS = ws;
    let keepalive = null;

    ws.onopen = () => {
      if (ws !== transcriptWS) { ws.close(); return; }   // superseded while connecting
      const queued = pendingChunks;
      pendingChunks = [];
      for (const chunk of queued) ws.send(chunk);
      console.log(`[transcript] connected to Deepgram — streaming audio` +
        (queued.length ? ` (${queued.length} queued chunk${queued.length === 1 ? '' : 's'} flushed)` : ''));
      keepalive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 5000);
      emit({ type: 'ready', session: sessionName });
    };

    ws.onmessage = (ev) => {
      if (ws === transcriptWS) onDeepgramMessage(ev.data);
    };
    ws.onerror = () => {
      if (ws !== transcriptWS) return;
      emit({ type: 'error', message: 'Transcription connection error (check network / API key).' });
    };
    ws.onclose = (ev) => {
      clearInterval(keepalive);
      if (ws !== transcriptWS) return;   // an old socket winding down — already replaced
      transcriptWS = null;
      if (sessionEnding) return;         // expected: closeTranscriptSocket's timer wraps up

      // Dropped mid-recording (network blip, provider timeout, …):
      // reconnect and replay the audio from the top so no speech is lost.
      if (recording && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.warn(`[transcript] stream dropped (code ${ev.code}${ev.reason ? ': ' + ev.reason : ''})` +
          ` — reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) and replaying the recording`);
        transcriptLines = [];            // the replay re-delivers every final line
        openTranscriptSocket(true);
        return;
      }

      // Out of retries (or not recording): surface it and hand over
      // whatever transcript we have.
      const hint =
        ev.code === 1000 ? ' — Deepgram ended the stream. This usually means it never received decodable audio (e.g., the stream was missing its initial WebM header chunk).' :
        ev.code === 1011 ? ' — Deepgram timed out waiting for audio. The mic stream is not producing data; browsers deny mic access on file:// pages, so serve the site over http://localhost instead.' :
        ev.code === 1006 ? ' — handshake or network failure (bad API key, offline, or a proxy blocking wss).' :
        ev.code === 1008 ? ' — Deepgram rejected the audio or request (check API key and audio format).' :
        '';
      console.warn(`[transcript] connection closed unexpectedly (code ${ev.code}${ev.reason ? ': ' + ev.reason : ''})${hint}`);
      emit({ type: 'error', message: `Transcription stream dropped (code ${ev.code}). Partial transcript kept.` });
      emit({ type: 'session_closed', session: sessionName, lineCount: transcriptLines.length });
    };
  } catch (err) {
    console.warn('Live transcription unavailable:', err.message);
    transcriptWS = null;
  }
}

function closeTranscriptSocket() {
  const ws = transcriptWS;
  if (!ws) return;
  sessionEnding = true;
  if (ws.readyState === WebSocket.OPEN) {
    // Ask Deepgram to flush trailing finals, then wrap up the session.
    ws.send(JSON.stringify({ type: 'CloseStream' }));
    const endedSession = sessionName;
    setTimeout(() => {
      emit({ type: 'session_closed', session: endedSession, lineCount: transcriptLines.length });
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      if (transcriptWS === ws) transcriptWS = null;   // don't clobber a newer socket
    }, 2000);
  } else {
    ws.close();
    if (transcriptWS === ws) transcriptWS = null;
  }
}

function onDeepgramMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type !== 'Results') return;

  const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
  if (!alt || !alt.transcript) return;

  if (!msg.is_final) {
    emit({ type: 'transcript', final: false, text: alt.transcript });
    return;
  }

  const lines = speakerLines(alt.words || []);
  transcriptLines.push(...lines);
  emit({ type: 'transcript', final: true, lines });
}

/* Group a final result's words into consecutive same-speaker runs. */
function speakerLines(words) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    const speaker = (w.speaker ?? 0) + 1;
    const text = w.punctuated_word || w.word;
    if (cur && cur.speaker === speaker) {
      cur.text += ' ' + text;
      cur.end = w.end;
    } else {
      if (cur) lines.push(cur);
      cur = { speaker, start: w.start, end: w.end, text };
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fmtClock(secondsFloat) {
  const h = Math.floor(secondsFloat / 3600);
  const m = Math.floor((secondsFloat % 3600) / 60);
  const s = Math.floor(secondsFloat % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function emit(detail) {
  document.dispatchEvent(new CustomEvent('rg-transcript', { detail }));
}

/* ---------- timer ---------- */

function startTimer() {
  seconds = 0;
  timerEl.textContent = '00:00';
  timerInterval = setInterval(() => {
    seconds++;
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  console.log("Seconds Recorded: " + seconds);
}
