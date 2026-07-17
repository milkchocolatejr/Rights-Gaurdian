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

/* Service worker registration lives in js/config.js — see README. */

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

/* ===== Each modal is now just data ===== */
const SETTINGS_MODAL = createModal({
  id: 'settingsModal',
  title: 'Settings',
  closeLabel: 'Done',
  body: ''
    + '<div class="form-check form-switch mb-3">'
    +   '<input class="form-check-input" type="checkbox" role="switch" id="setAutoStart">'
    +   '<label class="form-check-label" for="setAutoStart">Start recording on launch</label>'
    + '</div>'
    + '<div class="form-check form-switch mb-3">'
    +   '<input class="form-check-input" type="checkbox" role="switch" id="setKeepLocal" checked>'
    +   '<label class="form-check-label" for="setKeepLocal">Keep recordings on this device</label>'
    + '</div>'
    + '<div class="form-check form-switch">'
    +   '<input class="form-check-input" type="checkbox" role="switch" id="setHaptics" checked>'
    +   '<label class="form-check-label" for="setHaptics">Vibrate when recording starts</label>'
    + '</div>'
});

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

/* ===== Mount them (mirrors the APP_FOOTER injection) ===== */
const APP_MODALS = SETTINGS_MODAL + LEARN_MODAL + NOTICES_MODAL;
const modalContainer = document.getElementById('app-modals');
if (modalContainer) {
  modalContainer.innerHTML = APP_MODALS;
}

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
  var footerContainer = document.getElementById('app-footer');
  if (footerContainer) {
    footerContainer.innerHTML = APP_FOOTER;
  }

  var modal = document.getElementById("settings-modal");
  modal.innerHTML = SETTINGS_MODAL

  modal = document.getElementById("learm-more-modal");
  modal.innerHTML = LEARN_MODAL

  modal = document.getElementById("notices-modal");
  modal.innerHTML = NOTICES_MODAL
});
