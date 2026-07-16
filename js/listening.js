const releventEvents = [];

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

function pushReleventEvent(event) {
  releventEvents.push(event);
  var panel = document.getElementById('notification-panel');
  if (panel) {
    panel.insertAdjacentHTML('afterbegin',
      '<div id="notification-' + releventEvents.length + '" class="notification-item">' +
        '<h3 class="notification-title">' + event.event.title + '</h3>' +
        '<p class="notification-text">' + event.event.noteText + '</p>' +
      '</div>'
    );
  }
}
