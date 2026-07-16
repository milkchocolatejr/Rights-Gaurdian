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
let dgKeepalive = null;
let sessionName = null;
let sessionEnding = false;       // true once we deliberately close the stream
let transcriptLines = [];        // [{speaker,start,end,text}] — grows live

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
        if (transcriptWS && transcriptWS.readyState === WebSocket.OPEN) {
          transcriptWS.send(e.data);
        }
      }
    };

    // Keep the tracks alive while recording; release them on stop.
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      lastRecordingBlob = new Blob(recordedChunks, { type: recordingMimeType });
    };
    mediaRecorder.start(CHUNK_MS);

    recording = true;
    startTimer();

    alert('Recording started');
  } catch (err) {
    setRecordingUI(false);
    statusEl.textContent = `Microphone unavailable: ${err.message}`;
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

function openTranscriptSocket() {
  const key = (window.RG_CONFIG || {}).deepgramApiKey;
  if (!key || key === 'your_key_here') {
    console.warn(
      '[transcript] No Deepgram key — copy js/config.example.js to js/config.js and add yours. ' +
      'Recording works; live transcription is off.'
    );
    return;
  }
  sessionName = `session-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  sessionEnding = false;
  transcriptLines = [];
  try {
    // Browser auth: Deepgram accepts the API key via WS subprotocol.
    transcriptWS = new WebSocket(DEEPGRAM_URL, ['token', key]);

    transcriptWS.onopen = () => {
      console.log('[transcript] connected to Deepgram — streaming audio');
      dgKeepalive = setInterval(() => {
        if (transcriptWS && transcriptWS.readyState === WebSocket.OPEN) {
          transcriptWS.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 5000);
      emit({ type: 'ready', session: sessionName });
    };

    transcriptWS.onmessage = (ev) => onDeepgramMessage(ev.data);
    transcriptWS.onerror = () => {
      emit({ type: 'error', message: 'Transcription connection error (check network / API key).' });
    };
    transcriptWS.onclose = (ev) => {
      clearInterval(dgKeepalive);
      dgKeepalive = null;
      if (!sessionEnding) {
        // Dropped mid-recording (network blip, provider timeout, …):
        // surface it and hand over whatever transcript we have.
        console.warn(`[transcript] connection closed unexpectedly (code ${ev.code}${ev.reason ? ': ' + ev.reason : ''})`);
        emit({ type: 'error', message: `Transcription stream dropped (code ${ev.code}). Partial transcript kept.` });
        emit({ type: 'session_closed', session: sessionName, lineCount: transcriptLines.length });
        transcriptWS = null;
      }
    };
  } catch (err) {
    console.warn('Live transcription unavailable:', err.message);
    transcriptWS = null;
  }
}

function closeTranscriptSocket() {
  if (transcriptWS && transcriptWS.readyState === WebSocket.OPEN) {
    // Ask Deepgram to flush trailing finals, then wrap up the session.
    sessionEnding = true;
    transcriptWS.send(JSON.stringify({ type: 'CloseStream' }));
    const ws = transcriptWS;
    setTimeout(() => {
      emit({ type: 'session_closed', session: sessionName, lineCount: transcriptLines.length });
      if (ws.readyState === WebSocket.OPEN) ws.close();
      transcriptWS = null;
    }, 2000);
  } else if (transcriptWS) {
    transcriptWS.close();
    transcriptWS = null;
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
