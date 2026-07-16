function toggleAnimation() {
    var el = document.getElementById('listening-breathing');
    console.debug("Breathing animation clicked, " + el.classList)
    if (el) {
        el.classList.toggle('paused');
    }
}
