const recBtn    = document.getElementById('recBtn');
const statusEl  = document.getElementById('status');
const timerEl   = document.getElementById('timer');
const subtitle  = document.getElementById('subtitle');
const recMeta   = document.getElementById('recMeta');

const IDLE_TEXT = 'Click to begin defending your rights';
const REC_TEXT  = 'Recording in progress — click to stop';

let mediaRecorder = null;
let recording = false;
let timerInterval = null;
let seconds = 0;

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    // Keep the tracks alive while recording; release them on stop.
    mediaRecorder.onstop = () => stream.getTracks().forEach(t => t.stop());
    mediaRecorder.start();

    recording = true;
    setRecordingUI(true);
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
  recording = false;
  setRecordingUI(false);
  stopTimer();
}

function setRecordingUI(isRecording) {
  recBtn.classList.toggle('is-recording', isRecording);
  recMeta.classList.toggle('active', isRecording);
  recMeta.setAttribute('aria-hidden', String(!isRecording));
  recBtn.setAttribute('aria-label', isRecording ? 'Click to stop recording' : 'Click to begin recording');
  subtitle.textContent = isRecording ? REC_TEXT : IDLE_TEXT;
  statusEl.textContent = isRecording ? 'Recording' : 'Ready';
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
}

recBtn.addEventListener('click', () => {
  if (recording) stopRecording();
  else startRecording();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
