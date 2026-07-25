// Background battle music — fully original and procedurally generated
// with WebAudio, not a licensed/purchased track. No external audio file,
// nothing to attribute, safe to commit and deploy publicly. Uses a
// standard lookahead scheduler (the same pattern any WebAudio sequencer
// uses) so the loop has no seam/click, and it keeps generating fresh bars
// indefinitely rather than looping a fixed clip.
//
// Four layers per bar: a driving bass ostinato, a sustained chord pad, an
// original melodic line, and a soft percussive pulse — a standard "epic
// minor-key" arrangement, built from scratch (not transcribed from or
// modeled on any existing piece).

(function () {
  const BPM = 96;
  const BEAT = 60 / BPM; // seconds
  const BAR = BEAT * 4;
  const TARGET_VOLUME = 0.18; // overall background level; layers below are relative to this
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.15;

  // D natural minor, i-VI-III-VII — a common, genre-generic "epic" minor
  // progression, not a copy of any specific piece's harmony.
  const BARS = [
    { bass: 146.83, chord: [146.83, 174.61, 220.0] }, // Dm  (D3 F3 A3)
    { bass: 116.54, chord: [116.54, 146.83, 174.61] }, // Bb  (Bb2 D3 F3)
    { bass: 174.61, chord: [174.61, 220.0, 261.63] }, // F   (F3 A3 C4)
    { bass: 130.81, chord: [130.81, 164.81, 196.0] }, // C   (C3 E3 G3)
  ];

  // Original 4-bar melodic phrase (one entry per eighth note; null = rest).
  const MELODY = [
    [293.66, null, 349.23, null, 440.0, null, 392.0, null], // D F A G
    [349.23, null, 329.63, null, 293.66, null, null, null], // F E D ...
    [349.23, null, 415.3, null, 523.25, null, 466.16, null], // F Ab C Bb
    [415.3, null, 392.0, null, 349.23, null, null, null], // Ab G F ...
  ];

  let ctx = null;
  let masterGain = null;
  let muted = false;
  let wantsMusic = false; // "should be playing" (i.e. currently in a battle)
  let schedulerTimer = null;
  let nextBarTime = 0;
  let barIndex = 0;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, startTime, duration, { type = 'triangle', gain = 0.3, attack = 0.02 } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g).connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  function drumHit(startTime) {
    const duration = 0.22;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    source.connect(filter).connect(g).connect(masterGain);
    source.start(startTime);
  }

  function scheduleBar(index, startTime) {
    const bar = BARS[index % BARS.length];
    const melodyBar = MELODY[index % MELODY.length];

    for (let beat = 0; beat < 4; beat++) {
      tone(bar.bass, startTime + beat * BEAT, BEAT * 0.9, { type: 'sawtooth', gain: 0.22, attack: 0.008 });
    }

    drumHit(startTime);
    drumHit(startTime + 2 * BEAT);

    for (const freq of bar.chord) {
      tone(freq, startTime, BAR, { type: 'sine', gain: 0.05, attack: 0.35 });
    }

    const eighth = BEAT / 2;
    melodyBar.forEach((freq, i) => {
      if (freq) tone(freq, startTime + i * eighth, eighth * 0.85, { type: 'triangle', gain: 0.16, attack: 0.008 });
    });
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
    masterGain.gain.linearRampToValueAtTime(TARGET_VOLUME, c.currentTime + 1.2);
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
    stopScheduling(0.9);
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
