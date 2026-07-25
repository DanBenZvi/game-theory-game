// Procedurally-generated WebAudio sound effects — no audio files to
// license or fetch. A single AudioContext is created lazily on first
// use (browsers block audio before a user gesture) and everything
// routes through one master gain node so mute/volume is one control.

(function () {
  let ctx = null;
  let masterGain = null;
  let muted = false;
  let ambienceNodes = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(c, duration) {
    const length = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playNoise({
    duration = 0.3,
    filterType = 'bandpass',
    filterFreq = 1000,
    filterFreqTo = null,
    filterQ = 1,
    gain = 0.3,
    delay = 0,
  } = {}) {
    const c = ensureCtx();
    const startTime = c.currentTime + delay;
    const source = c.createBufferSource();
    source.buffer = noiseBuffer(c, duration);

    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = filterQ;
    filter.frequency.setValueAtTime(filterFreq, startTime);
    if (filterFreqTo !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterFreqTo), startTime + duration);
    }

    const g = c.createGain();
    g.gain.setValueAtTime(gain, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    source.connect(filter).connect(g).connect(masterGain);
    source.start(startTime);
    source.stop(startTime + duration + 0.05);
  }

  function playTone({
    freq = 440,
    freqTo = null,
    duration = 0.3,
    type = 'sine',
    gain = 0.2,
    delay = 0,
  } = {}) {
    const c = ensureCtx();
    const startTime = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (freqTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), startTime + duration);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.exponentialRampToValueAtTime(gain, startTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(g).connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  function fire() {
    playNoise({ duration: 0.16, filterType: 'highpass', filterFreq: 700, filterFreqTo: 3500, gain: 0.14 });
    playTone({ freq: 180, freqTo: 700, duration: 0.14, type: 'sawtooth', gain: 0.07 });
  }

  function splash() {
    playNoise({ duration: 0.45, filterType: 'lowpass', filterFreq: 1400, filterFreqTo: 250, gain: 0.22 });
  }

  function explosion() {
    playNoise({ duration: 0.5, filterType: 'lowpass', filterFreq: 2200, filterFreqTo: 180, gain: 0.4 });
    playTone({ freq: 100, freqTo: 40, duration: 0.4, type: 'sine', gain: 0.28 });
  }

  function sunk() {
    playNoise({ duration: 0.9, filterType: 'lowpass', filterFreq: 1600, filterFreqTo: 90, gain: 0.4 });
    playTone({ freq: 160, freqTo: 35, duration: 1.0, type: 'sawtooth', gain: 0.22 });
    playTone({ freq: 80, freqTo: 25, duration: 1.1, type: 'sine', gain: 0.2, delay: 0.15 });
  }

  function victory() {
    // Quick rising arpeggio (C5-E5-G5-C6)...
    const arpeggio = [523.25, 659.25, 783.99, 1046.5];
    const stepMs = 0.11;
    arpeggio.forEach((f, i) => {
      playTone({ freq: f, duration: 0.45, type: 'triangle', gain: 0.16, delay: i * stepMs });
    });
    // ...resolving into a bright layered major chord for a triumphant finish.
    const chordDelay = arpeggio.length * stepMs + 0.02;
    [1046.5, 1318.5, 1568.0, 2093.0].forEach((f) => {
      playTone({ freq: f, duration: 0.9, type: 'triangle', gain: 0.14, delay: chordDelay });
    });
    // A touch of high sparkle on top of the chord.
    playTone({ freq: 3135.96, duration: 0.5, type: 'sine', gain: 0.09, delay: chordDelay + 0.05 });
  }

  function defeat() {
    [392, 349.23, 293.66, 220].forEach((f, i) => {
      playTone({ freq: f, duration: 0.65, type: 'sine', gain: 0.18, delay: i * 0.16 });
    });
  }

  function startAmbience() {
    const c = ensureCtx();
    if (ambienceNodes) return;
    const source = c.createBufferSource();
    source.buffer = noiseBuffer(c, 4);
    source.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.7;

    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.05, c.currentTime + 2);

    source.connect(filter).connect(g).connect(masterGain);
    source.start();
    ambienceNodes = { source, filter, gain: g };
  }

  function setMuted(next) {
    muted = next;
    if (masterGain) {
      masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, ctx.currentTime + 0.08);
    }
  }

  function isMuted() {
    return muted;
  }

  function unlock() {
    ensureCtx();
  }

  window.SoundEngine = {
    unlock,
    fire,
    splash,
    explosion,
    sunk,
    victory,
    defeat,
    startAmbience,
    setMuted,
    isMuted,
  };
})();
