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

document.getElementById('recBtn').addEventListener("click", function() {
    window.location.href = window.location.href.replace("index.html", "listening.html");
});