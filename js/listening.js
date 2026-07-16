function toggleAnimation() {
    let state = document.querySelector('.curcle-inner').style.animationPlayState;

    if (state.includes(paused)) {
        document.querySelectorAll('.circle-outer, .circle-inner').forEach(el => {
            el.style.animationPlayState = 'running';
        });
    } else {
        document.querySelectorAll('.circle-outer, .circle-inner').forEach(el => {
            el.style.animationPlayState = 'paused';
        });
    }
}