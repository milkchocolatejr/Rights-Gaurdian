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
  navigator.serviceWorker.register('./sw.js');
}

/* ===== Reusable modal component ===== */
function createModal({ id, title, body, closeLabel = 'Close', scrollable = false }) {
  const scroll = scrollable ? ' modal-dialog-scrollable' : '';
  return ''
    + `<div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">`
    +   `<div class="modal-dialog modal-dialog-centered${scroll}">`
    +     '<div class="modal-content rg-modal">'
    +       '<div class="modal-header">'
    +         `<h2 class="modal-title h5">${title}</h2>`
    +         '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>'
    +       '</div>'
    +       `<div class="modal-body">${body}</div>`
    +       '<div class="modal-footer">'
    +         `<button type="button" class="btn rg-btn-brass" data-bs-dismiss="modal">${closeLabel}</button>`
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

function getOrUpdateSettings(autoStart, keepDataLocal, hapticFeedback, theme) {
  /* Read mode: no args / all null — return current values from localStorage */
  if (autoStart == null) {
    return {
      autoStart: localStorage.getItem(LOCALSTORAGE_AUTOSTART) === 'true',
      keepDataLocal: localStorage.getItem(LOCALSTORAGE_KEEPDATALOCAL) !== 'false',
      hapticFeedback: localStorage.getItem(LOCALSTORAGE_SETHAPTICS) !== 'false',
      theme: localStorage.getItem(LOCALSTORAGE_THEME) || 'theme-brass-ink'
    };
  }

  /* Update mode: save each provided value to localStorage */
  localStorage.setItem(LOCALSTORAGE_AUTOSTART, String(!!autoStart));
  localStorage.setItem(LOCALSTORAGE_KEEPDATALOCAL, String(!!keepDataLocal));
  localStorage.setItem(LOCALSTORAGE_SETHAPTICS, String(!!hapticFeedback));
  if (theme) localStorage.setItem(LOCALSTORAGE_THEME, theme);

  return { autoStart, keepDataLocal, hapticFeedback, theme };
}

/* ===== Each modal is now just data ===== */
const SETTINGS_MODAL = () => {
  const s = getOrUpdateSettings();

  return createModal({
    id: 'settingsModal',
    title: 'Settings',
    closeLabel: 'Done',
    body: ''
      + '<div class="form-check form-switch mb-3">'
      +   `<input class="form-check-input" type="checkbox" role="switch" id="setAutoStart" ${s.autoStart ? 'checked' : ''}>`
      +   '<label class="form-check-label" for="setAutoStart">Start recording on launch</label>'
      + '</div>'
      + '<div class="form-check form-switch mb-3">'
      +   `<input class="form-check-input" type="checkbox" role="switch" id="setKeepLocal" ${s.keepDataLocal ? 'checked' : ''}>`
      +   '<label class="form-check-label" for="setKeepLocal">Keep recordings on this device</label>'
      + '</div>'
      + '<div class="form-check form-switch">'
      +   `<input class="form-check-input" type="checkbox" role="switch" id="setHaptics" ${s.hapticFeedback ? 'checked' : ''}>`
      +   '<label class="form-check-label" for="setHaptics">Vibrate when recording starts</label>'
      + '</div>'
      + '<hr class="my-3" style="border-color:var(--line)">'
      + '<div class="mb-2">'
      +   '<label class="form-label" for="setTheme" style="color:var(--muted);font-size:.85rem">Theme</label>'
      +   `<select class="form-select" id="setTheme" style="background:var(--ink-700);border-color:var(--line);color:var(--parchment)">`
      +     `<option value="theme-brass-ink" ${s.theme === 'theme-brass-ink' ? 'selected' : ''}>Brass &amp; Ink</option>`
      +     `<option value="debug" ${s.theme === 'debug' ? 'selected' : ''}>Debug</option>`
      +   '</select>'
      + '</div>'
  });
}

const LEARN_MODAL = createModal({
  id: 'learnModal',
  title: 'Learn More',
  closeLabel: 'Got it',
  body: ''
    + '<p><strong>Rights Guardian</strong> turns your phone into a witness. Tap the emblem to '
    +   'begin an audio record of any encounter where your rights matter.</p>'
    + '<p>Recordings stay on your device unless you choose to share them. Nothing is uploaded '
    +   'automatically, and the app works even without a connection.</p>'
});

const NOTICES_MODAL = createModal({
  id: 'noticesModal',
  title: 'Notices &amp; Disclosures',
  scrollable: true,
  body: ''
    + '<p>Recording laws vary by jurisdiction. Some regions require the consent of all parties '
    +   'before audio may be captured. You are responsible for knowing the law where you are.</p>'
    + '<p>This app does not provide legal advice. It is a tool for documentation only, and using '
    +   'it does not substitute for the counsel of a licensed attorney.</p>'
});

/* ===== Shared footer ===== */
const APP_FOOTER = ''
  + '<footer class="app-bottom">'
  +   '<div class="d-flex align-items-center justify-content-between">'
  +     '<button class="bar-btn" data-bs-toggle="modal" data-bs-target="#settingsModal">'
  +       '<i class="bi bi-gear-fill"></i><span>Settings</span>'
  +     '</button>'
  +     '<button class="bar-btn center" data-bs-toggle="modal" data-bs-target="#learnModal">'
  +       '<i class="bi bi-shield-check"></i><span>Learn More</span>'
  +     '</button>'
  +     '<button class="bar-btn" data-bs-toggle="modal" data-bs-target="#noticesModal">'
  +       '<span class="label-long">Notices &amp; Disclosures</span>'
  +       '<i class="bi bi-file-earmark-text"></i>'
  +     '</button>'
  +   '</div>'
  + '</footer>';




document.addEventListener('DOMContentLoaded', () => {
  /* Mount footer */
  const footerEl = document.getElementById('app-footer');
  if (footerEl) footerEl.innerHTML = APP_FOOTER;

  /* Mount modals into the placeholder divs in each page */
  const settingsEl = document.getElementById('settings-modal');
  if (settingsEl) settingsEl.innerHTML = SETTINGS_MODAL();

  const learnEl = document.getElementById('learm-more-modal');
  if (learnEl) learnEl.innerHTML = LEARN_MODAL;

  const noticesEl = document.getElementById('notices-modal');
  if (noticesEl) noticesEl.innerHTML = NOTICES_MODAL;

  /* Apply saved theme */
  const saved = getOrUpdateSettings();
  document.body.classList.add(saved.theme);
});

/* Auto-save settings when controls in the settings modal change */
document.addEventListener('change', (e) => {
  if (!e.target.closest('#settingsModal')) return;

  const s = getOrUpdateSettings();

  if (e.target.matches('.form-check-input')) {
    const checked = e.target.checked;
    switch (e.target.id) {
      case 'setAutoStart': getOrUpdateSettings(checked, s.keepDataLocal, s.hapticFeedback, s.theme); break;
      case 'setKeepLocal': getOrUpdateSettings(s.autoStart, checked, s.hapticFeedback, s.theme); break;
      case 'setHaptics':   getOrUpdateSettings(s.autoStart, s.keepDataLocal, checked, s.theme); break;
    }
    return;
  }

  if (e.target.id === 'setTheme') {
    /* Swap body class: remove old theme, add new one */
    document.body.classList.remove('theme-brass-ink', 'debug');
    document.body.classList.add(e.target.value);
    getOrUpdateSettings(s.autoStart, s.keepDataLocal, s.hapticFeedback, e.target.value);
  }
});