/* ============================================================
   Rights Guardian — evidence review screen (fully client-side)

   The listening page stages the finished transcript in
   sessionStorage ('rg-session'); this script runs on page load,
   analyzes it with js/rightsAnalyzer.js — right here in the
   browser, no server — and renders the evidence packages:
   timestamp, quote, the right implicated, supporting legislature.

   Storage lifecycle (nothing persists):
     - "Save Transcript" builds the .txt in the browser, downloads
       it, and removes the stored transcript.
     - "New Session" clears the session and returns home.
     - Closing the tab clears sessionStorage automatically.
   ============================================================ */

const MIN_LOADING_MS = 900;   // let the loading state breathe instead of flashing
const SESSION_KEY = 'rg-session';

function loadStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function show(id) {
  for (const view of ['evidence-loading', 'evidence-results', 'evidence-error']) {
    const el = document.getElementById(view);
    if (el) el.hidden = view !== id;
  }
}

function fail(message) {
  document.getElementById('evidence-error-text').textContent = message;
  show('evidence-error');
}

/* mm:ss offset + absolute wall-clock time when the session start is known */
function timeLabel(item, startedAt) {
  const parts = [];
  if (item.clock) parts.push(item.clock);
  if (startedAt && item.start != null) {
    const abs = new Date(new Date(startedAt).getTime() + item.start * 1000);
    if (!isNaN(abs)) parts.push(abs.toLocaleTimeString());
  }
  return parts.join(' · ');
}

function renderEvidence(data) {
  const meta = document.getElementById('evidence-session-meta');
  meta.textContent = data.session +
    (data.startedAt ? ' — ' + new Date(data.startedAt).toLocaleString() : '');

  const count = data.evidence.length;
  document.getElementById('evidence-summary').textContent = count
    ? count + ' potential rights ' + (count === 1 ? 'violation' : 'violations') + ' flagged in this encounter.'
    : 'The transcript was reviewed against the constitutional rights knowledge base.';

  if (data.advisory) {
    const adv = document.getElementById('evidence-advisory');
    adv.innerHTML = '';
    const cite = document.createElement('span');
    cite.className = 'evidence-mono';
    cite.textContent = data.advisory.statute;
    adv.append('Location note (' + data.advisory.state + '): ' + data.advisory.note + ' ');
    adv.appendChild(cite);
    adv.hidden = false;
  }

  const list = document.getElementById('evidence-list');
  list.innerHTML = '';
  for (const item of data.evidence) {
    const card = document.createElement('article');
    card.className = 'evidence-card';

    const top = document.createElement('div');
    top.className = 'evidence-card-top';

    const right = document.createElement('h3');
    right.className = 'evidence-right';
    right.textContent = item.right;
    const amendment = document.createElement('span');
    amendment.className = 'evidence-amendment';
    amendment.textContent = item.amendment;
    right.appendChild(amendment);

    const time = document.createElement('span');
    time.className = 'evidence-time';
    const t = timeLabel(item, data.startedAt);
    time.textContent = t ? t + (item.speaker != null ? ' · Speaker ' + item.speaker : '') : '';

    top.append(right, time);

    const quote = document.createElement('blockquote');
    quote.className = 'evidence-quote';
    quote.textContent = '“' + item.quote + '”';

    const explanation = document.createElement('p');
    explanation.className = 'evidence-explanation';
    explanation.textContent = item.explanation;

    const cites = document.createElement('ul');
    cites.className = 'evidence-cites';
    for (const law of item.legislature) {
      const li = document.createElement('li');
      const cite = document.createElement('span');
      cite.className = 'evidence-cite';
      cite.textContent = law.cite;
      const summary = document.createElement('span');
      summary.className = 'evidence-cite-summary';
      summary.textContent = law.summary;
      li.append(cite, summary);
      cites.appendChild(li);
    }

    card.append(top, quote, explanation, cites);
    list.appendChild(card);
  }

  document.getElementById('evidence-empty').hidden = count !== 0;
  show('evidence-results');
}

function setSaveButton(btn, icon, text) {
  btn.disabled = true;
  btn.innerHTML = '';
  const i = document.createElement('i');
  i.className = 'bi ' + icon;
  btn.append(i, ' ' + text);
}

function saveTranscript() {
  const btn = document.getElementById('save-transcript-btn');
  const stored = loadStoredSession();

  /* No stored transcript = nothing to download. Say so — don't claim "saved". */
  if (!stored) {
    return setSaveButton(btn, 'bi-slash-circle', 'Already saved or cleared — nothing left to download');
  }
  if (!stored.lines || !stored.lines.length) {
    return setSaveButton(btn, 'bi-slash-circle', 'Transcript is empty — nothing to save');
  }

  const txt = stored.lines
    .map((l) => '[' + (l.start != null ? analyzerClock(l.start) : '--:--') + '] Speaker ' + (l.speaker ?? '?') + ': ' + l.text)
    .join('\n') + '\n';
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = stored.session + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  /* User has their copy — stop keeping one. Evidence stays on screen. */
  sessionStorage.removeItem(SESSION_KEY);
  setSaveButton(btn, 'bi-check2', 'Saved ' + stored.session + '.txt to your Downloads folder');
}

function newSession() {
  /* Session over: clear everything, then head home. */
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

async function loadEvidence() {
  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const stored = loadStoredSession();

  document.getElementById('loading-session').textContent = session || (stored && stored.session) || '';
  const waited = new Promise((r) => setTimeout(r, MIN_LOADING_MS));

  if (!stored || (session && stored.session !== session)) {
    await waited;
    return fail('This session has ended and its transcript is no longer on this device. ' +
      'End a recording from the listening screen to generate evidence.');
  }

  /* Process the data right here — analysis runs on page load. */
  const data = {
    session: stored.session,
    startedAt: stored.startedAt,
    advisory: stateAdvisory(stored.location),
    evidence: analyzeTranscript(stored.lines),
  };

  await waited;
  renderEvidence(data);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('save-transcript-btn').addEventListener('click', saveTranscript);
  document.getElementById('new-session-btn').addEventListener('click', newSession);
  loadEvidence();
});
