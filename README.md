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

## Deepgram setup

Console: https://console.deepgram.com/project/8ba281f1-0e6b-4bae-83d6-9ead7936b7cf

Generate an API key, copy `js/config.example.js` to `js/config.js`, and paste the key in.
`js/config.js` is gitignored — the app reads the key from `window.RG_CONFIG` at runtime.
Without a key, recording still works; live transcription simply stays off.
