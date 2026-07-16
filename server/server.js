/* ============================================================
   Rights Guardian — local backend
   - Serves the static app (replaces `python -m http.server`)
   - POST /api/recordings            → saves audio into recordings/
   - WS   /ws/transcribe             → relays mic audio to Deepgram,
     appends speaker-labelled lines to transcripts/session-*.txt/.jsonl
     and echoes them back to the page for live display.

   Run:  npm start          (http://localhost:8934/pages/index.html)
   Key:  put DEEPGRAM_API_KEY=... in .env (see .env.example)
   ============================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDINGS_DIR = path.join(ROOT, 'recordings');
const TRANSCRIPTS_DIR = path.join(ROOT, 'transcripts');
const PORT = Number(process.env.PORT) || 8934;

/* ---------- .env (no dependency) ---------- */
try {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env — fine, key may come from the environment */ }

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY || '';
if (!DEEPGRAM_KEY) {
  console.warn('[rg] DEEPGRAM_API_KEY not set — recordings will save, but live transcription is disabled.');
}

/* ---------- static file serving ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'audio/webm',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (urlPath === '/') urlPath = '/pages/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- POST /api/recordings ---------- */
function extForType(contentType = '') {
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('mp4')) return 'm4a';
  if (contentType.includes('wav')) return 'wav';
  return 'webm';
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function handleSaveRecording(req, res) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 500 * 1024 * 1024) { req.destroy(); return; } // 500 MB cap
    chunks.push(c);
  });
  req.on('end', () => {
    if (!chunks.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'empty body' }));
      return;
    }
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    const name = `rec-${timestamp()}.${extForType(req.headers['content-type'])}`;
    fs.writeFile(path.join(RECORDINGS_DIR, name), Buffer.concat(chunks), (err) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      console.log(`[rg] saved recordings/${name} (${(size / 1024).toFixed(1)} KB)`);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ file: `recordings/${name}` }));
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/recordings') return handleSaveRecording(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

/* ---------- WS /ws/transcribe → Deepgram relay ---------- */
const DG_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-3&diarize=true&smart_format=true&interim_results=true';

function fmtClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* Group a final result's words into consecutive same-speaker runs. */
function speakerLines(words) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    const speaker = w.speaker ?? 0;
    const text = w.punctuated_word || w.word;
    if (cur && cur.speaker === speaker) {
      cur.text += ' ' + text;
      cur.end = w.end;
    } else {
      if (cur) lines.push(cur);
      cur = { speaker, start: w.start, end: w.end, text };
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

class TranscriptSession {
  constructor(clientWS) {
    this.client = clientWS;
    this.name = `session-${timestamp()}`;
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    this.txtPath = path.join(TRANSCRIPTS_DIR, `${this.name}.txt`);
    this.jsonlPath = path.join(TRANSCRIPTS_DIR, `${this.name}.jsonl`);
    fs.writeFileSync(this.txtPath, `# Rights Guardian transcript — ${new Date().toISOString()}\n`);
    this.pending = [];       // audio buffered until Deepgram socket opens
    this.dg = null;
    this.keepalive = null;
    this.openDeepgram();
    console.log(`[rg] transcript session started: ${this.name}`);
  }

  openDeepgram() {
    if (!DEEPGRAM_KEY) {
      this.send({ type: 'error', message: 'Transcription disabled: DEEPGRAM_API_KEY is not configured on the server.' });
      return;
    }
    this.dg = new WebSocket(DG_URL, { headers: { Authorization: `Token ${DEEPGRAM_KEY}` } });

    this.dg.on('open', () => {
      for (const chunk of this.pending) this.dg.send(chunk);
      this.pending = [];
      this.keepalive = setInterval(() => {
        if (this.dg?.readyState === WebSocket.OPEN) this.dg.send(JSON.stringify({ type: 'KeepAlive' }));
      }, 5000);
      this.send({ type: 'ready', session: this.name });
    });

    this.dg.on('message', (raw) => this.onDeepgramMessage(raw));
    this.dg.on('error', (err) => {
      console.error('[rg] deepgram error:', err.message);
      this.send({ type: 'error', message: `Transcription service error: ${err.message}` });
    });
    this.dg.on('close', () => { clearInterval(this.keepalive); });
  }

  onDeepgramMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type !== 'Results') return;

    const alt = msg.channel?.alternatives?.[0];
    if (!alt || !alt.transcript) return;

    if (!msg.is_final) {
      // interim — display only, never written to disk
      this.send({ type: 'transcript', final: false, text: alt.transcript });
      return;
    }

    const lines = speakerLines(alt.words || []);
    for (const line of lines) {
      const txtLine = `[${fmtClock(line.start)}] Speaker ${line.speaker + 1}: ${line.text}\n`;
      fs.appendFile(this.txtPath, txtLine, () => {});
      fs.appendFile(this.jsonlPath, JSON.stringify({
        speaker: line.speaker + 1,
        start: line.start,
        end: line.end,
        text: line.text,
      }) + '\n', () => {});
    }
    this.send({
      type: 'transcript',
      final: true,
      lines: lines.map((l) => ({ speaker: l.speaker + 1, start: l.start, end: l.end, text: l.text })),
    });
  }

  audio(chunk) {
    if (this.dg?.readyState === WebSocket.OPEN) this.dg.send(chunk);
    else if (this.dg) this.pending.push(chunk);
  }

  /* Client asked to stop: flush Deepgram, then confirm so the page can close. */
  stop() {
    if (this.dg?.readyState === WebSocket.OPEN) {
      this.dg.send(JSON.stringify({ type: 'CloseStream' }));
      // Give Deepgram a moment to emit trailing finals before confirming.
      setTimeout(() => this.finish(), 1500);
    } else {
      this.finish();
    }
  }

  finish() {
    this.send({ type: 'session_closed', txt: `transcripts/${this.name}.txt`, jsonl: `transcripts/${this.name}.jsonl` });
    this.cleanup();
    console.log(`[rg] transcript session closed: ${this.name}`);
  }

  cleanup() {
    clearInterval(this.keepalive);
    if (this.dg && this.dg.readyState === WebSocket.OPEN) this.dg.close();
    this.dg = null;
  }

  send(obj) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(obj));
  }
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWS) => {
  const session = new TranscriptSession(clientWS);
  clientWS.on('message', (data, isBinary) => {
    if (isBinary) { session.audio(data); return; }
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'stop') session.stop();
    } catch { /* ignore malformed control messages */ }
  });
  clientWS.on('close', () => session.cleanup());
});

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname === '/ws/transcribe') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[rg] Rights Guardian server → http://localhost:${PORT}/pages/index.html`);
  console.log(`[rg] transcription: ${DEEPGRAM_KEY ? 'enabled (Deepgram nova-3, diarization on)' : 'DISABLED — set DEEPGRAM_API_KEY in .env'}`);
});
