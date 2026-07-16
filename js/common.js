const recBtn = document.getElementById('recBtn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const saveBtn = document.getElementById('saveBtn');
const discardBtn = document.getElementById('discardBtn');
const recordingsList = document.getElementById('recordingsList');

let mediaRecorder = null;
let audioChunks = [];
let recording = false;
let timerInterval = null;
let seconds = 0;
let currentBlob = null;

async function startRecording() {
    try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        currentBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        saveBtn.classList.add('visible');
        discardBtn.classList.add('visible');
        statusEl.textContent = 'Recording stopped. Save or discard.';
    };
    mediaRecorder.start();
    recording = true;
    recBtn.classList.add('recording');
    seconds = 0;
    timerInterval = setInterval(() => {
        seconds++;
        timerEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 1000);
    statusEl.textContent = 'Recording...';
    saveBtn.classList.remove('visible');
    discardBtn.classList.remove('visible');
    } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    }
    recording = false;
    recBtn.classList.remove('recording');
    clearInterval(timerInterval);
}

function saveRecording() {
    if (!currentBlob) return;
    const ext = currentBlob.type.includes('webm') ? 'webm' : 'audio';
    const filename = `recording-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.${ext}`;
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    addToList(currentBlob, filename);
    resetAfterSave();
}

function discardRecording() {
    currentBlob = null;
    resetAfterSave();
    statusEl.textContent = 'Discarded';
}

function resetAfterSave() {
    saveBtn.classList.remove('visible');
    discardBtn.classList.remove('visible');
    timerEl.textContent = '00:00';
}

function addToList(blob, filename) {
    const url = URL.createObjectURL(blob);
    const li = document.createElement('li');
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete recording');
    del.onclick = () => { li.remove(); URL.revokeObjectURL(url); };
    li.append(audio, del);
    recordingsList.prepend(li);
}

if (recBtn) {
    recBtn.addEventListener('click', () => {
        if (recording) stopRecording();
        else startRecording();
    });
}

if (saveBtn) saveBtn.addEventListener('click', saveRecording);
if (discardBtn) discardBtn.addEventListener('click', discardRecording);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
