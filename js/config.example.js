/* Copy this file to js/config.js (gitignored) and fill in your key.
   Get a free key at https://console.deepgram.com — without it the app
   still records, but live transcription stays off. */
window.RG_CONFIG = {
  deepgramApiKey: 'your_key_here',
};

/* Service worker registration (PWA/offline support). The path is
   relative to the page in pages/, so it must be ../js/sw.js. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../js/sw.js');
}
