var releventEvents = {};
var notifIdCounter = 0;

class RelevantEvent {
  constructor(eventData) {
    this.metadata = {
      seen: false,
      postedTimestamp: new Date().toISOString()
    };
    this.event = eventData;
  }
}

function toggleRecording() {
  var el = document.getElementById('listening-breathing');
  if (el) {
    var wasPaused = el.classList.toggle('paused');
    el.dataset.state = wasPaused ? 'paused' : 'recording';
    if (wasPaused) {
      if (typeof stopRecording === 'function') stopRecording();
    } else {
      if (typeof startRecording === 'function') startRecording();
    }
  }
}

function allSeen() {
  return Object.values(releventEvents).every(function(ev) { return ev.metadata.seen; });
}

function handleNotifClick(e) {
  var item = e.currentTarget;
  var id = item.getAttribute('data-id');
  if (id && releventEvents[id]) {
    releventEvents[id].metadata.seen = true;
    item.dataset.seen = 'true';
  }

  if (allSeen()) {
    var badge = document.querySelector('.notif-alert-badge');
    if (badge) badge.style.display = 'none';
  }
}

function pushReleventEvent(title, fullText, noteText) {
  if (typeof title === 'object') {
    var data = title;
    pushReleventEvent(data.title, data.fullText, data.noteText);
    return;
  }
  console.debug("Nrew Event: title: " + title)
  var ev = new RelevantEvent({ title: title, fullText: fullText, noteText: noteText });
  var id = 'notif-' + (++notifIdCounter);
  releventEvents[id] = ev;

  var panel = document.getElementById('notification-panel');
  if (panel) {
    var div = document.createElement('div');
    div.className = 'notification-item';
    div.setAttribute('data-id', id);
    div.dataset.seen = 'false';
    div.innerHTML =
      '<h3 class="notification-title">' + title + '</h3>' +
      '<p class="notification-text">' + noteText + '</p>';
    div.addEventListener('click', handleNotifClick);
    panel.insertAdjacentElement('afterbegin', div);
  }

  if (panel) panel.dataset.count = Object.keys(releventEvents).length;

  var badge = document.querySelector('.notif-alert-badge');
  if (badge) badge.style.display = 'block';
}

/* On-screen transcript: latest final line per speaker → #live-transcription-N.
   (Console logging of the same events lives in common.js.) */
document.addEventListener('rg-transcript', (e) => {
  const msg = e.detail;
  if (msg.type !== 'transcript' || !msg.final) return;

  for (const l of msg.lines) {
    var textBox = document.getElementById('live-transcription-' + l.speaker);
    if (!textBox) {
      var section = document.getElementById('listening-transcript');
      if (!section) continue;
      textBox = document.createElement('p');
      textBox.id = 'live-transcription-' + l.speaker;
      section.appendChild(textBox);
    }
    textBox.textContent = 'Speaker ' + l.speaker + ': ' + l.text;
  }
});

// Wire up static notification items on page load
document.addEventListener('DOMContentLoaded', function() {
  /* Init state attr on breathing element for debug theme */
  var breathingEl = document.getElementById('listening-breathing');
  if (breathingEl) breathingEl.dataset.state = breathingEl.classList.contains('paused') ? 'paused' : 'idle';

  var items = document.querySelectorAll('.notification-item');
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var id = item.id || 'static-' + i;
    item.setAttribute('data-id', id);

    if (!releventEvents[id]) {
      releventEvents[id] = new RelevantEvent({
        title: item.querySelector('.notification-title')?.textContent || '',
        fullText: '',
        noteText: item.querySelector('.notification-text')?.textContent || ''
      });
    }

    item.dataset.seen = item.dataset.seen || 'false';
    item.addEventListener('click', handleNotifClick);
  }
});
