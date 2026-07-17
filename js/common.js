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

/* ===== Theme registry =====
   One entry per theme: body class → label in the Settings picker.
   The stylesheet must be linked in every page (css/themes/). */
const THEMES = {
  'theme-brass-ink':  'Brass &amp; Ink',
  'theme-dark':       'Dark',
  'theme-light':      'Light',
  'theme-blood-iron': 'Blood &amp; Iron',
  'theme-land-water': 'Land &amp; Water',
  'theme-pretty-pink':'Pretty Pink',
  'theme-black-blue': 'Black &amp; Blue',
  'theme-flaming-hot':'Flaming Hot',
  'theme-royalty':    'Royalty',
  'theme-c-red-tv':   'C-Red-TV',
  'theme-mint':       'Mint',
  'theme-noir':       'Noir',
  'theme-state-farm': 'State Farm',
  'debug':            'Debug',
};

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

function getOrUpdateSettings(autoStart, keepDataLocal, hapticFeedback, theme, location) {
  /* Read mode: no args / all null — return current values from localStorage */
  if (autoStart == null) {
    return {
      autoStart: localStorage.getItem(LOCALSTORAGE_AUTOSTART) !== 'false',   /* default ON — recording begins on page load */
      keepDataLocal: localStorage.getItem(LOCALSTORAGE_KEEPDATALOCAL) !== 'false',
      hapticFeedback: localStorage.getItem(LOCALSTORAGE_SETHAPTICS) !== 'false',
      theme: localStorage.getItem(LOCALSTORAGE_THEME) || 'theme-brass-ink',
      location: localStorage.getItem(LOCALSTORAGE_LOCATION) || ''
    };
  }

  /* Update mode: save each provided value to localStorage */
  localStorage.setItem(LOCALSTORAGE_AUTOSTART, String(!!autoStart));
  localStorage.setItem(LOCALSTORAGE_KEEPDATALOCAL, String(!!keepDataLocal));
  localStorage.setItem(LOCALSTORAGE_SETHAPTICS, String(!!hapticFeedback));
  if (theme) localStorage.setItem(LOCALSTORAGE_THEME, theme);
  if (location !== undefined) localStorage.setItem(LOCALSTORAGE_LOCATION, location);

  return { autoStart, keepDataLocal, hapticFeedback, theme, location };
}

/* ===== Each modal is now just data ===== */
const SETTINGS_MODAL = () => {
  const s = getOrUpdateSettings();
  console.debug('[RightsGuardian] SETTINGS_MODAL rendering — localStorage theme:', localStorage.getItem('RightsGaurdian_theme'), '| parsed:', s.theme);

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
      +     Object.entries(THEMES).map(([value, label]) =>
              `<option value="${value}" ${s.theme === value ? 'selected' : ''}>${label}</option>`
            ).join('')
      +   '</select>'
      + '</div>'
      + '<div class="mb-2">'
      +   '<label class="form-label" for="setLocation" style="color:var(--muted);font-size:.85rem">Location</label>'
      +   `<select class="form-select" id="setLocation" style="background:var(--ink-700);border-color:var(--line);color:var(--parchment)">`
      +     `<option value="" ${s.location === '' ? 'selected' : ''}>— Select a location —</option>`
      +     `<option value="AL" ${s.location === 'AL' ? 'selected' : ''}>Alabama</option>`
      +     `<option value="AK" ${s.location === 'AK' ? 'selected' : ''}>Alaska</option>`
      +     `<option value="AZ" ${s.location === 'AZ' ? 'selected' : ''}>Arizona</option>`
      +     `<option value="AR" ${s.location === 'AR' ? 'selected' : ''}>Arkansas</option>`
      +     `<option value="CA" ${s.location === 'CA' ? 'selected' : ''}>California</option>`
      +     `<option value="CO" ${s.location === 'CO' ? 'selected' : ''}>Colorado</option>`
      +     `<option value="CT" ${s.location === 'CT' ? 'selected' : ''}>Connecticut</option>`
      +     `<option value="DE" ${s.location === 'DE' ? 'selected' : ''}>Delaware</option>`
      +     `<option value="DC" ${s.location === 'DC' ? 'selected' : ''}>District of Columbia</option>`
      +     `<option value="FL" ${s.location === 'FL' ? 'selected' : ''}>Florida</option>`
      +     `<option value="GA" ${s.location === 'GA' ? 'selected' : ''}>Georgia</option>`
      +     `<option value="HI" ${s.location === 'HI' ? 'selected' : ''}>Hawaii</option>`
      +     `<option value="ID" ${s.location === 'ID' ? 'selected' : ''}>Idaho</option>`
      +     `<option value="IL" ${s.location === 'IL' ? 'selected' : ''}>Illinois</option>`
      +     `<option value="IN" ${s.location === 'IN' ? 'selected' : ''}>Indiana</option>`
      +     `<option value="IA" ${s.location === 'IA' ? 'selected' : ''}>Iowa</option>`
      +     `<option value="KS" ${s.location === 'KS' ? 'selected' : ''}>Kansas</option>`
      +     `<option value="KY" ${s.location === 'KY' ? 'selected' : ''}>Kentucky</option>`
      +     `<option value="LA" ${s.location === 'LA' ? 'selected' : ''}>Louisiana</option>`
      +     `<option value="ME" ${s.location === 'ME' ? 'selected' : ''}>Maine</option>`
      +     `<option value="MD" ${s.location === 'MD' ? 'selected' : ''}>Maryland</option>`
      +     `<option value="MA" ${s.location === 'MA' ? 'selected' : ''}>Massachusetts</option>`
      +     `<option value="MI" ${s.location === 'MI' ? 'selected' : ''}>Michigan</option>`
      +     `<option value="MN" ${s.location === 'MN' ? 'selected' : ''}>Minnesota</option>`
      +     `<option value="MS" ${s.location === 'MS' ? 'selected' : ''}>Mississippi</option>`
      +     `<option value="MO" ${s.location === 'MO' ? 'selected' : ''}>Missouri</option>`
      +     `<option value="MT" ${s.location === 'MT' ? 'selected' : ''}>Montana</option>`
      +     `<option value="NE" ${s.location === 'NE' ? 'selected' : ''}>Nebraska</option>`
      +     `<option value="NV" ${s.location === 'NV' ? 'selected' : ''}>Nevada</option>`
      +     `<option value="NH" ${s.location === 'NH' ? 'selected' : ''}>New Hampshire</option>`
      +     `<option value="NJ" ${s.location === 'NJ' ? 'selected' : ''}>New Jersey</option>`
      +     `<option value="NM" ${s.location === 'NM' ? 'selected' : ''}>New Mexico</option>`
      +     `<option value="NY" ${s.location === 'NY' ? 'selected' : ''}>New York</option>`
      +     `<option value="NC" ${s.location === 'NC' ? 'selected' : ''}>North Carolina</option>`
      +     `<option value="ND" ${s.location === 'ND' ? 'selected' : ''}>North Dakota</option>`
      +     `<option value="OH" ${s.location === 'OH' ? 'selected' : ''}>Ohio</option>`
      +     `<option value="OK" ${s.location === 'OK' ? 'selected' : ''}>Oklahoma</option>`
      +     `<option value="OR" ${s.location === 'OR' ? 'selected' : ''}>Oregon</option>`
      +     `<option value="PA" ${s.location === 'PA' ? 'selected' : ''}>Pennsylvania</option>`
      +     `<option value="RI" ${s.location === 'RI' ? 'selected' : ''}>Rhode Island</option>`
      +     `<option value="SC" ${s.location === 'SC' ? 'selected' : ''}>South Carolina</option>`
      +     `<option value="SD" ${s.location === 'SD' ? 'selected' : ''}>South Dakota</option>`
      +     `<option value="TN" ${s.location === 'TN' ? 'selected' : ''}>Tennessee</option>`
      +     `<option value="TX" ${s.location === 'TX' ? 'selected' : ''}>Texas</option>`
      +     `<option value="UT" ${s.location === 'UT' ? 'selected' : ''}>Utah</option>`
      +     `<option value="VT" ${s.location === 'VT' ? 'selected' : ''}>Vermont</option>`
      +     `<option value="VA" ${s.location === 'VA' ? 'selected' : ''}>Virginia</option>`
      +     `<option value="WA" ${s.location === 'WA' ? 'selected' : ''}>Washington</option>`
      +     `<option value="WV" ${s.location === 'WV' ? 'selected' : ''}>West Virginia</option>`
      +     `<option value="WI" ${s.location === 'WI' ? 'selected' : ''}>Wisconsin</option>`
      +     `<option value="WY" ${s.location === 'WY' ? 'selected' : ''}>Wyoming</option>`
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
  title: 'Legal Disclosures',
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
  +       '<span class="label-long">Legal Disclosures</span>'
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

  /* Apply saved theme and location */
  const saved = getOrUpdateSettings();
  console.debug('[RightsGuardian] settings on load:', saved);
  document.body.classList.add(saved.theme);
  console.debug('[RightsGuardian] theme applied:', saved.theme, '→ body classList:', document.body.className);
  if (saved.location) document.body.dataset.location = saved.location;
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
    console.debug('[RightsGuardian] theme change: from', document.body.className.match(/theme-[-a-z]+/)?.[0] || 'none', '→', e.target.value);
    document.body.classList.remove(...Object.keys(THEMES));
    document.body.classList.add(e.target.value);
    getOrUpdateSettings(s.autoStart, s.keepDataLocal, s.hapticFeedback, e.target.value);
    console.debug('[RightsGuardian] theme saved to localStorage:', localStorage.getItem('RightsGaurdian_theme'));
  }

  if (e.target.id === 'setLocation') {
    const loc = e.target.value;
    document.body.dataset.location = loc || '';
    getOrUpdateSettings(s.autoStart, s.keepDataLocal, s.hapticFeedback, s.theme, loc);
  }
});
