/* ============================================================
   End-to-end pipeline test — no microphone needed.

   Generates a two-voice conversation WAV with Windows built-in
   TTS (David + Zira), streams it to the local server's
   /ws/transcribe socket at real-time pace (just like the browser
   does), prints what comes back, and finally checks that the
   transcript files contain two distinct speakers.

   Run (server must be up):  node server/test-stream.js
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'server', 'fixtures', 'two-voices.wav');
const SERVER = process.env.RG_SERVER || 'ws://localhost:8934/ws/transcribe';

/* ---------- 1. fixture: two-voice dialogue via Windows TTS ---------- */
function ensureFixture() {
  if (fs.existsSync(FIXTURE)) return;
  console.log('[test] generating two-voice WAV fixture with Windows TTS…');
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const ps = `
    Add-Type -AssemblyName System.Speech
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.SetOutputToWaveFile('${FIXTURE.replace(/'/g, "''")}')
    $s.SelectVoice('Microsoft David Desktop')
    $s.Speak('Good evening. Do you know why I stopped you tonight?')
    $s.SelectVoice('Microsoft Zira Desktop')
    $s.Speak('No officer, I do not. Am I being detained, or am I free to go?')
    $s.SelectVoice('Microsoft David Desktop')
    $s.Speak('I just need to ask you a few questions about where you are headed.')
    $s.SelectVoice('Microsoft Zira Desktop')
    $s.Speak('I am choosing to remain silent, and I would like to speak with a lawyer.')
    $s.Dispose()
  `;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  console.log(`[test] fixture written: ${path.relative(ROOT, FIXTURE)}`);
}

/* ---------- 2. stream it like the browser would ---------- */
function run() {
  const wav = fs.readFileSync(FIXTURE);
  const byteRate = wav.readUInt32LE(28); // bytes of audio per second
  const chunkBytes = Math.max(1, Math.round(byteRate / 4)); // 250ms chunks
  const durationSec = (wav.length - 44) / byteRate;
  console.log(`[test] streaming ${(wav.length / 1024).toFixed(0)} KB (~${durationSec.toFixed(1)}s of audio) to ${SERVER}`);

  const speakers = new Set();
  let sawError = false;

  const ws = new WebSocket(SERVER);
  const bail = setTimeout(() => { console.error('[test] TIMEOUT — no session_closed within 120s'); process.exit(1); }, 120_000);

  ws.on('open', () => {
    let offset = 0;
    const pump = setInterval(() => {
      if (offset >= wav.length) {
        clearInterval(pump);
        ws.send(JSON.stringify({ type: 'stop' }));
        console.log('[test] audio fully sent, waiting for final results…');
        return;
      }
      ws.send(wav.subarray(offset, offset + chunkBytes));
      offset += chunkBytes;
    }, 250);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'ready') console.log(`[test] session: ${msg.session}`);
    if (msg.type === 'error') { sawError = true; console.error(`[test] SERVER ERROR: ${msg.message}`); }
    if (msg.type === 'transcript' && msg.final) {
      for (const l of msg.lines) {
        speakers.add(l.speaker);
        console.log(`  Speaker ${l.speaker}: ${l.text}`);
      }
    }
    if (msg.type === 'session_closed') {
      clearTimeout(bail);
      ws.close();
      report(msg);
    }
  });

  ws.on('error', (err) => { console.error(`[test] cannot reach server (${err.message}) — is \`npm start\` running?`); process.exit(1); });

  function report(msg) {
    console.log('\n---------------- RESULT ----------------');
    if (sawError) {
      console.log('Pipeline reached the server, but transcription did not run.');
      console.log('→ Put your key in .env (copy .env.example) and restart the server.');
      process.exit(1);
    }
    const txt = path.join(ROOT, msg.txt);
    console.log(`txt   : ${msg.txt}`);
    console.log(`jsonl : ${msg.jsonl}`);
    console.log(`speakers detected: ${[...speakers].sort().join(', ') || 'none'}`);
    console.log('\n----- transcript file contents -----');
    console.log(fs.readFileSync(txt, 'utf8'));
    if (speakers.size >= 2) {
      console.log('PASS — diarization separated multiple voices and files were written live.');
      process.exit(0);
    } else {
      console.log(`WARN — expected 2 speakers, got ${speakers.size}. Transcription worked; check diarization output above.`);
      process.exit(2);
    }
  }
}

ensureFixture();
run();
