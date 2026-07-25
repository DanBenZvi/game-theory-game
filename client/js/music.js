// Background battle music — fully original and procedurally generated
// with WebAudio, not a licensed/purchased track. No external audio file,
// nothing to attribute, safe to commit and deploy publicly.
//
// Grand/orchestral arrangement: long swelling chords (layered, slightly
// detuned oscillators standing in for a string section) under a sustained
// singing melody, with a synthetic convolution reverb for hall-like space
// — the impulse response is generated from decaying noise, not sampled
// from any real or copyrighted recording. Scheduled with a standard
// lookahead sequencer so it loops indefinitely with no seam or click.

(function () {
  const BPM = 96;
  const BEAT = 60 / BPM; // seconds
  const BAR = BEAT * 4;
  const TARGET_VOLUME = 0.22;
  const LOOKAHEAD_MS = 30;
  const SCHEDULE_AHEAD_S = 0.2;

  // D natural minor, i-VI-III-VII — a common, genre-generic "epic" minor
  // progression, not a copy of any specific piece's harmony.
  const BARS = [
    { bass: 73.42, chord: [146.83, 174.61, 220.0] }, // Dm  (D2 bass; D3 F3 A3 pad)
    { bass: 58.27, chord: [116.54, 146.83, 174.61] }, // Bb  (Bb1; Bb2 D3 F3)
    { bass: 87.31, chord: [174.61, 220.0, 261.63] }, // F   (F2; F3 A3 C4)
    { bass: 65.41, chord: [130.81, 164.81, 196.0] }, // C   (C2; C3 E3 G3)
  ];

  // Original sustained, singing melody — long notes, not a busy rhythmic
  // line. { freq, at (beats into the bar), beats (duration) }.
  const MELODY = [
    [{ freq: 440.0, at: 0, beats: 2 }, { freq: 392.0, at: 2, beats: 2 }], // A .. G
    [{ freq: 349.23, at: 0, beats: 4 }], // F, held the full bar
    [{ freq: 523.25, at: 0, beats: 2 }, { freq: 466.16, at: 2, beats: 2 }], // C .. Bb
    [{ freq: 392.0, at: 0, beats: 4 }], // G, held — resolves the phrase
  ];

  let ctx = null;
  let masterGain = null;
  let dryBus = null;
  let reverbSend = null;
  let muted = false;
  let wantsMusic = false; // "should be playing" (i.e. currently in a battle)
  let schedulerTimer = null;
  let nextBarTime = 0;
  let barIndex = 0;

  /** A decaying-noise impulse response — a synthetic "room," not a sampled one. */
  function createReverbImpulse(c, duration = 2.8, decay = 3.2) {
    const length = Math.floor(c.sampleRate * duration);
    const impulse = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);

      dryBus = ctx.createGain();
      dryBus.gain.value = 1;
      dryBus.connect(masterGain);

      const convolver = ctx.createConvolver();
      convolver.buffer = createReverbImpulse(ctx);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.55;
      convolver.connect(wetGain).connect(masterGain);

      reverbSend = ctx.createGain();
      reverbSend.gain.value = 1;
      reverbSend.connect(convolver);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** A slow-swelling tone (attack in, sustain, release out) sent to both the dry and reverb buses. */
  function swell(freq, startTime, duration, { type = 'sine', gain = 0.15, attack = 0.5, release = 0.6, detune = 0, wet = 0.4 } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;

    const g = ctx.createGain();
    const peakTime = Math.min(attack, duration * 0.45);
    const releaseStart = Math.max(peakTime, duration - release);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + peakTime);
    g.gain.setValueAtTime(gain, startTime + releaseStart);
    g.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(g);
    g.connect(dryBus);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      g.connect(send).connect(reverbSend);
    }
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  }

  /** A soft, distant timpani-like roll — felt more than heard, not a rhythmic hit. */
  function distantRoll(startTime, duration = 1.4) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(0.22, startTime + duration * 0.3);
    g.gain.linearRampToValueAtTime(0, startTime + duration);

    const send = ctx.createGain();
    send.gain.value = 0.5;

    source.connect(filter).connect(g);
    g.connect(dryBus);
    g.connect(send).connect(reverbSend);
    source.start(startTime);
  }

  function scheduleBar(index, startTime) {
    const bar = BARS[index % BARS.length];
    const melodyBar = MELODY[index % MELODY.length];

    // Sustained bass — one long note per bar, not a pulsing ostinato.
    swell(bar.bass, startTime, BAR, { type: 'sine', gain: 0.32, attack: 0.5, release: 0.9, wet: 0.25 });
    swell(bar.bass, startTime, BAR, { type: 'triangle', gain: 0.1, attack: 0.5, release: 0.9, wet: 0.25 });

    // String-like pad: each chord tone doubled with slight detuning for a
    // chorused ensemble texture, long swell in and out.
    for (const freq of bar.chord) {
      swell(freq, startTime, BAR, { type: 'sawtooth', gain: 0.055, attack: 0.9, release: 1.0, detune: -7, wet: 0.6 });
      swell(freq, startTime, BAR, { type: 'sawtooth', gain: 0.055, attack: 0.9, release: 1.0, detune: 7, wet: 0.6 });
      swell(freq, startTime, BAR, { type: 'triangle', gain: 0.05, attack: 1.0, release: 1.0, wet: 0.6 });
    }

    // Sustained, singing melody — brass/horn-ish (triangle + a touch of sawtooth).
    for (const note of melodyBar) {
      const t = startTime + note.at * BEAT;
      const dur = note.beats * BEAT;
      swell(note.freq, t, dur, { type: 'triangle', gain: 0.24, attack: 0.15, release: 0.35, wet: 0.45 });
      swell(note.freq, t, dur, { type: 'sawtooth', gain: 0.06, attack: 0.15, release: 0.35, wet: 0.45 });
    }

    // A distant roll once per 4-bar phrase for periodic gravitas.
    if (index % 4 === 0) distantRoll(startTime, BAR * 0.9);
  }

  function scheduler() {
    while (nextBarTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleBar(barIndex, nextBarTime);
      nextBarTime += BAR;
      barIndex++;
    }
  }

  function startScheduling() {
    const c = ensureCtx();
    if (schedulerTimer) return; // already running
    nextBarTime = c.currentTime + 0.1;
    barIndex = 0;
    masterGain.gain.cancelScheduledValues(c.currentTime);
    masterGain.gain.setValueAtTime(0, c.currentTime);
    masterGain.gain.linearRampToValueAtTime(TARGET_VOLUME, c.currentTime + 1.5);
    scheduler();
    schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
  }

  function stopScheduling(fadeSeconds) {
    if (!ctx || !schedulerTimer) return;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  function play() {
    wantsMusic = true;
    if (muted) return;
    startScheduling();
  }

  function stop() {
    wantsMusic = false;
    stopScheduling(1.2);
  }

  function setMuted(next) {
    muted = next;
    if (!wantsMusic) return;
    if (muted) {
      stopScheduling(0.3);
    } else {
      startScheduling();
    }
  }

  window.Music = { play, stop, setMuted };
})();
