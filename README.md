# Rights Guardian

**A lightweight PWA that records, transcribes, and reviews an encounter in real time — then flags the moments where your constitutional rights may have been violated, with the supporting law attached.**

## Why

Clips of misconduct during routine traffic stops and other police encounters are everywhere online. But unless you know your constitutional rights well, these interactions are hard to navigate in the moment — and it can be nearly impossible to tell afterward whether your rights were actually infringed.

Rights Guardian is built for exactly that moment. Point it at an encounter with law enforcement and it captures what is said, transcribes it live, and afterward highlights the parts that implicate your rights alongside the relevant legal resources. Everything runs on your device — audio and transcripts never leave the browser unless you choose to save them.

## How it works

Three screens:

1. **Home** — tap the emblem to begin a session.
2. **Listening** — recording starts automatically. Mic audio streams to [Deepgram](https://deepgram.com) for live, speaker-labeled transcription, shown on screen with an audio waveform. Tap the emblem to pause/resume; tap **End Recording & Review Evidence** when the encounter is over.
3. **Evidence** — the transcript is analyzed on the spot and shown as a list of "evidence" cards — each flagged moment with its timestamp, the quote, the right implicated, and the supporting law. From here you can save the transcript to your device or start a new session.

The transcript is passed between screens in `sessionStorage` and cleared when you save it, start over, or close the tab. Nothing is persisted. Settings (bottom bar) control auto-start, color theme, and your state.

## Detecting rights violations

Analysis is **rule-based and runs entirely on-device** (`js/rightsAnalyzer.js`) — no server, no AI. It scans each transcript line for phrases that mark a constitutionally significant moment and attaches the relevant amendment plus controlling case law (e.g. *Terry v. Ohio*, *Riley v. California*, *Glik v. Cunniffe*).

| Right | Example trigger |
|---|---|
| Recording public officials (1st Am.) | "stop recording", "delete that footage" |
| Unreasonable search (4th Am.) | "I don't consent to a search", "open the trunk" |
| Unlawful detention (4th Am.) | "am I being detained", "you're not free to go" |
| Self-incrimination (5th Am.) | "I'm invoking the fifth" |
| Right to counsel (6th Am.) | "I want a lawyer" |
| Due process / coercion (5th & 14th Am.) | "the easy way or the hard way" |

If you set your state in Settings, all-party-consent states also get a recording-law advisory. Add coverage by appending a rule to `RIGHTS_RULES` — no other changes needed.

> This is keyword matching, not comprehension: it can miss unusual phrasing and does not weigh context. **Flagged items are leads to review — not legal conclusions, and not legal advice.**

## Running it

Fully static — no backend to run. Serve the folder with any static server:

```
cd Rights-Gaurdian
python -m http.server 8123
```

Then open <http://localhost:8123/pages/index.html>. Localhost is required: browsers block microphone access on pages opened directly from disk (`file://`), so the app must be served over `http://localhost` for recording to work.

## Configuration

Live transcription needs a [Deepgram](https://console.deepgram.com) API key. Copy `js/config.example.js` to `js/config.js` (gitignored — it holds your key) and fill it in:

```js
window.RG_CONFIG = { deepgramApiKey: 'your_key_here' };

// Service worker (PWA / offline). Path is relative to pages/, so keep ../js/sw.js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../js/sw.js');
}
```

Without a key the app still records audio, but there is no transcript — and therefore nothing to analyze.
