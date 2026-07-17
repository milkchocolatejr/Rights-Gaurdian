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

function toggleAnimation() {
  var el = document.getElementById('listening-breathing');
  if (el) {
    el.classList.toggle('paused');
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
    div.innerHTML =
      '<h3 class="notification-title">' + title + '</h3>' +
      '<p class="notification-text">' + noteText + '</p>';
    div.addEventListener('click', handleNotifClick);
    panel.insertAdjacentElement('afterbegin', div);
  }

  var badge = document.querySelector('.notif-alert-badge');
  if (badge) badge.style.display = 'block';
}

// Wire up static notification items on page load
document.addEventListener('DOMContentLoaded', function() {
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

    item.addEventListener('click', handleNotifClick);
  }
});