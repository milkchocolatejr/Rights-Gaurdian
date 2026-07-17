/* ============================================================
   Rights Guardian — live audio waveform visualizer

   Renders a scrolling bar waveform (mirrored around the center
   line, rounded caps, magenta → blue → purple → red → gray
   gradient) inside #listening-waveform.

   Audio comes from the same mic stream recording.js opens: we
   poll for its global `mediaRecorder` and attach an AnalyserNode
   to `mediaRecorder.stream`. No changes to the recording
   pipeline — the analyser is a passive tap.
   ============================================================ */

(function () {
  /* ---------- tuning ---------- */
  const BAR_WIDTH = 4;         // px, before devicePixelRatio scaling
  const BAR_GAP = 3;           // px between bars
  const MIN_BAR_HEIGHT = 4;    // px, baseline when silent
  const SAMPLE_MS = 50;        // one new bar every 50ms
  const GAIN = 2.2;            // visual boost — mic peaks rarely hit 1.0

  /* Left-to-right color stops sampled from the design reference */
  const GRADIENT_STOPS = [
    [0.00, '#d024b5'],  // magenta
    [0.20, '#8b5cf6'],  // violet
    [0.32, '#3b82f6'],  // blue
    [0.50, '#6d4a7c'],  // muted purple
    [0.62, '#e11d2e'],  // red
    [0.85, '#7f2a33'],  // dark red
    [1.00, '#4a4a4a'],  // gray
  ];

  let canvas = null;
  let ctx = null;
  let gradient = null;
  let barCount = 0;
  let amplitudes = [];         // rolling history, one entry per bar (0..1)

  let audioCtx = null;
  let analyser = null;
  let sourceStream = null;     // stream currently feeding the analyser
  let timeData = null;
  let lastSampleTime = 0;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const host = document.getElementById('listening-waveform');
    if (!host) return;

    canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100px';
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');

    sizeCanvas();
    if (window.ResizeObserver) {
      new ResizeObserver(sizeCanvas).observe(host);
    } else {
      window.addEventListener('resize', sizeCanvas);
    }

    // Browsers keep AudioContexts suspended until a user gesture.
    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    requestAnimationFrame(frame);
  }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    barCount = Math.max(1, Math.floor((w + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));

    // Preserve existing history across resizes (keep the newest bars).
    const kept = amplitudes.slice(-barCount);
    amplitudes = new Array(barCount - kept.length).fill(0).concat(kept);

    gradient = ctx.createLinearGradient(0, 0, w, 0);
    for (const [offset, color] of GRADIENT_STOPS) {
      gradient.addColorStop(offset, color);
    }
  }

  /* ---------- audio tap ---------- */

  /* recording.js may start/stop/restart the mic; follow whatever
     stream its mediaRecorder currently holds. */
  function ensureAnalyser() {
    const rec = (typeof mediaRecorder !== 'undefined') ? mediaRecorder : null;
    const stream = rec && rec.stream && rec.stream.active ? rec.stream : null;

    if (!stream) {
      sourceStream = null;
      return;
    }
    if (stream === sourceStream && analyser) return;

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    timeData = new Uint8Array(analyser.fftSize);
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    sourceStream = stream;
    resumeAudio();
  }

  function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  /* Peak deviation from the zero line in the current analyser window, 0..1. */
  function currentAmplitude() {
    if (!analyser || !sourceStream) return 0;
    analyser.getByteTimeDomainData(timeData);
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const d = Math.abs(timeData[i] - 128);
      if (d > peak) peak = d;
    }
    return Math.min(1, (peak / 128) * GAIN);
  }

  /* ---------- render loop ---------- */

  function frame(now) {
    ensureAnalyser();

    if (now - lastSampleTime >= SAMPLE_MS) {
      lastSampleTime = now;
      amplitudes.push(currentAmplitude());
      if (amplitudes.length > barCount) {
        amplitudes.splice(0, amplitudes.length - barCount);
      }
    }

    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const centerY = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = gradient;

    for (let i = 0; i < barCount; i++) {
      const amp = amplitudes[i] || 0;
      const barH = Math.max(MIN_BAR_HEIGHT, amp * h);
      const x = i * (BAR_WIDTH + BAR_GAP);
      const y = centerY - barH / 2;

      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barH, BAR_WIDTH / 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, BAR_WIDTH, barH);
      }
    }
  }
})();
