# Rights-Guardian

## Running the app — localhost required

Browsers deny microphone access to pages opened straight from disk (`file://`), because a
`file://` page has no origin to attach the permission to. The Deepgram WebSocket itself
connects fine from `file://` — but with no mic audio flowing, Deepgram times out after ~10s
and closes the stream (close code 1011), which is why transcription appears to "drop".

Serve the site over HTTP instead — `http://localhost` counts as a secure origin, so the mic
permission prompt works:

```
cd Rights-Gaurdian
python -m http.server 8123
```

Then open <http://localhost:8123/pages/index.html> (or `pages/listening.html` directly).
Leave the terminal running while you use the app; Ctrl+C stops the server. Any static
server works — the VS Code "Live Server" extension is a one-click alternative.

## js/config.js — local, gitignored, required

Every clone needs its own `js/config.js`. It is gitignored (it holds your API key), so it
does not arrive with the repo — copy `js/config.example.js` to `js/config.js` and fill it in.
Every page loads it first, and it must contain **both** of the following:

```js
/* Local secrets — this file is gitignored. */
window.RG_CONFIG = {
  deepgramApiKey: 'your_key_here',
};

/* Service worker registration (PWA/offline support). */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../js/sw.js');
}
```

- **`deepgramApiKey`** — generate one in the
  [Deepgram console](https://console.deepgram.com/project/8ba281f1-0e6b-4bae-83d6-9ead7936b7cf).
  The app reads it from `window.RG_CONFIG` at runtime. Without a key, recording still
  works; live transcription simply stays off.
- **Service worker registration** — the path must be `../js/sw.js`: the URL resolves
  relative to the page in `pages/`, so a bare `sw.js` 404s and the registration fails.
  Note the registered scope is `/js/`, so the worker registers cleanly but won't cache the
  pages for offline use unless `sw.js` is later moved to the site root.
