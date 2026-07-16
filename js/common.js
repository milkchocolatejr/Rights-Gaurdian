const recBtn   = document.getElementById('recBtn');
const statusEl = document.getElementById('status');
const timerEl  = document.getElementById('timer');
const subtitle = document.getElementById('subtitle');
const recMeta  = document.getElementById('recMeta');

const IDLE_TEXT = 'Click to begin defending your rights';
const REC_TEXT  = 'Recording in progress — click to stop';

function setRecordingUI(isRecording) {
  recBtn.classList.toggle('is-recording', isRecording);
  recMeta.classList.toggle('active', isRecording);
  recMeta.setAttribute('aria-hidden', String(!isRecording));
  recBtn.setAttribute('aria-label', isRecording ? 'Click to stop recording' : 'Click to begin recording');
  subtitle.textContent = isRecording ? REC_TEXT : IDLE_TEXT;
  statusEl.textContent = isRecording ? 'Recording' : 'Ready';
}

recBtn.addEventListener('click', async () => {
  if (recording) {
    stopRecording();
    setRecordingUI(false);
  } else {
    await startRecording();
    setRecordingUI(recording); // stays false if the mic was denied
  }
});

/* Real-time voice data (from recording.js's Deepgram stream) → console */
document.addEventListener('rg-transcript', (e) => {
  const msg = e.detail;
  switch (msg.type) {
    case 'transcript':
      if (msg.final) {
        for (const l of msg.lines) {
          console.log(`[transcript] Speaker ${l.speaker} (${l.start.toFixed(1)}s–${l.end.toFixed(1)}s): ${l.text}`);
        }
      } else {
        console.log(`[interim] ${msg.text}`);
      }
      break;
    case 'ready':          console.log(`[transcript] session started: ${msg.session}`); break;
    case 'session_closed': console.log(`[transcript] session ${msg.session} done — ${msg.lineCount} lines. Call downloadTranscript() to save it.`); break;
    case 'error':          console.warn(`[transcript] ${msg.message}`); break;
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
