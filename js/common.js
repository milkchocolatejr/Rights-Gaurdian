recBtn.addEventListener('click', () => {
    window.location.href = window.location.href.replace("index.html", "listening.html");
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
