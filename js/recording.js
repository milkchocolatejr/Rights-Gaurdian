let mediaRecorder = null;
let recording = false;
let timerInterval = null;
let seconds = 0;

/* Captured audio (rebuilt each recording) */
const CHUNK_MS = 250;            // small timeslice so live transcription stays snappy
let recordedChunks = [];
let recordingMimeType = '';
let lastRecordingBlob = null;
let lastSavedFile = null;

/* Live transcription socket (server relays to Deepgram) */
let transcriptWS = null;

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
    lastSavedFile = null;

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

/* ---------- save / download ----------
   saveLastRecording(): POSTs the last finished recording to the local
   backend, which writes it into the untracked recordings/ folder.
   downloadLastRecording(): browser-download of the same audio. */

async function saveLastRecording() {
  if (!lastRecordingBlob) {
    console.warn('No finished recording to save.');
    return null;
  }
  const res = await fetch('/api/recordings', {
    method: 'POST',
    headers: { 'Content-Type': lastRecordingBlob.type || 'application/octet-stream' },
    body: lastRecordingBlob,
  });
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
  const info = await res.json();          // { file: 'recordings/rec-....webm' }
  lastSavedFile = info.file;
  return info;
}

function downloadLastRecording() {
  if (!lastRecordingBlob) {
    console.warn('No finished recording to download.');
    return false;
  }
  const name = lastSavedFile
    ? lastSavedFile.split('/').pop()
    : `recording-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`;
  const url = URL.createObjectURL(lastRecordingBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/* ---------- live transcription ----------
   Audio chunks stream to the backend over this socket; speaker-labelled
   transcript lines come back and are re-emitted as a DOM event so any
   page (e.g. listening.html) can render them:

   document.addEventListener('rg-transcript', (e) => { ... e.detail ... });

   detail shapes:
     { type:'transcript', final:false, text }                        // interim, fast
     { type:'transcript', final:true,  lines:[{speaker,start,end,text}] }
     { type:'session_closed', txt, jsonl }                           // file paths
     { type:'ready' | 'error', ... }                                 */

function openTranscriptSocket() {
  if (!location.host) {
    console.warn(
      '[transcript] Page was opened from disk (file://) — live transcription needs the local server.\n' +
      'Run `npm start` in the repo, then open http://localhost:8934/pages/index.html instead.'
    );
    return;
  }
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    transcriptWS = new WebSocket(`${proto}://${location.host}/ws/transcribe`);
    transcriptWS.onopen = () => console.log('[transcript] socket connected — streaming audio');
    transcriptWS.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      document.dispatchEvent(new CustomEvent('rg-transcript', { detail: msg }));
      if (msg.type === 'session_closed') {
        transcriptWS.close();
        transcriptWS = null;
      }
    };
    transcriptWS.onerror = () => console.warn('Transcript socket error — is the Node server running?');
  } catch (err) {
    console.warn('Live transcription unavailable:', err.message);
    transcriptWS = null;
  }
}

function closeTranscriptSocket() {
  if (transcriptWS && transcriptWS.readyState === WebSocket.OPEN) {
    // Ask the server to flush Deepgram; it replies with session_closed, then we close.
    transcriptWS.send(JSON.stringify({ type: 'stop' }));
    const ws = transcriptWS;
    setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.close(); }, 4000);
  } else if (transcriptWS) {
    transcriptWS.close();
    transcriptWS = null;
  }
}

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
