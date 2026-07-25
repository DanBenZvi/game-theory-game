// Background battle music. Looks for a user-supplied audio file (see
// client/audio/README.md) — if it's missing, play() fails silently and
// the game runs exactly as before with no background track. We can't
// ship copyrighted music ourselves, so this only plays a file the user
// has actually placed there.

(function () {
  const TRACK_SRC = 'audio/battle-theme.mp3';
  const TARGET_VOLUME = 0.35;
  const FADE_MS = 900;

  let audio = null;
  let muted = false;
  let wantsMusic = false; // "should be playing" (i.e. currently in a battle)
  let fadeTimer = null;
  let warnedMissing = false;

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio(TRACK_SRC);
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener('error', () => {
      if (warnedMissing) return;
      warnedMissing = true;
      console.warn(
        `[music] No file at client/${TRACK_SRC} — add your own licensed track there for background music (see client/audio/README.md). Continuing without it.`,
      );
    });
    return audio;
  }

  function clearFade() {
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function fadeTo(targetVolume, duration, onDone) {
    clearFade();
    const el = ensureAudio();
    const startVolume = el.volume;
    const steps = Math.max(1, Math.round(duration / 40));
    let step = 0;
    fadeTimer = setInterval(() => {
      step++;
      el.volume = startVolume + (targetVolume - startVolume) * Math.min(1, step / steps);
      if (step >= steps) {
        clearFade();
        if (onDone) onDone();
      }
    }, 40);
  }

  function play() {
    wantsMusic = true;
    if (muted) return;
    const el = ensureAudio();
    el.play().catch(() => {
      // Missing file / blocked autoplay — harmless, game continues without music.
    });
    fadeTo(TARGET_VOLUME, FADE_MS);
  }

  function stop() {
    wantsMusic = false;
    if (!audio) return;
    fadeTo(0, FADE_MS, () => {
      if (audio) audio.pause();
    });
  }

  function setMuted(next) {
    muted = next;
    if (!wantsMusic) return;
    if (muted) {
      fadeTo(0, 300);
    } else {
      const el = ensureAudio();
      el.play().catch(() => {});
      fadeTo(TARGET_VOLUME, 300);
    }
  }

  window.Music = { play, stop, setMuted };
})();
