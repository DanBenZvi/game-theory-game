// Visual effects layer shared by the vs-AI and online battle screens:
// missile arcs, particle bursts, screen shake, and the ship-sinking
// sequence. All transient elements are appended directly to
// `document.body` and positioned with `position: fixed` + viewport
// coordinates from getBoundingClientRect() — NOT inside `.screen`,
// because `.screen` has `backdrop-filter`, which (per the CSS spec)
// makes it the containing block for fixed-position descendants. That
// bit us for ship-drag ghosts in step 2; same fix applies here.

(function () {
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function quadBezier(p0, p1, p2, t) {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
  }

  /** Animates a glowing projectile from `originEl` to `destEl` along an arc. Resolves on arrival. */
  function fireMissile(originEl, destEl, { color = '#29e0ff' } = {}) {
    const origin = centerOf(originEl);
    const dest = centerOf(destEl);
    const control = {
      x: (origin.x + dest.x) / 2,
      y: Math.min(origin.y, dest.y) - 130,
    };

    const el = document.createElement('div');
    el.className = 'missile';
    el.style.setProperty('--missile-color', color);
    document.body.appendChild(el);

    const duration = 380;
    return new Promise((resolve) => {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const x = quadBezier(origin.x, control.x, dest.x, t);
        const y = quadBezier(origin.y, control.y, dest.y, t);
        const dx = 2 * (1 - t) * (control.x - origin.x) + 2 * t * (dest.x - control.x);
        const dy = 2 * (1 - t) * (control.y - origin.y) + 2 * t * (dest.y - control.y);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        el.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
        el.style.opacity = t > 0.85 ? String(1 - (t - 0.85) / 0.15) : '1';
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          el.remove();
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function spawnParticles(point, { count = 14, colors, spread = 55, size = 5, duration = 500, gravity = false, drift = false } = {}) {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'particle';
      el.style.background = colors[i % colors.length];
      el.style.width = el.style.height = size + 'px';
      document.body.appendChild(el);

      const angle = drift
        ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 // mostly upward, for bubbles
        : Math.random() * Math.PI * 2;
      const dist = spread * (0.5 + Math.random() * 0.5);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const start = performance.now();
      const jitter = Math.random() * 80;

      (function frame(now) {
        const t = Math.min(1, (now - start - jitter) / duration);
        if (t < 0) {
          requestAnimationFrame(frame);
          return;
        }
        const ease = 1 - Math.pow(1 - t, 2);
        const x = point.x + dx * ease;
        const y = point.y + dy * ease + (gravity ? 45 * ease * ease : 0);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = String(1 - t);
        if (t < 1) requestAnimationFrame(frame);
        else el.remove();
      })(performance.now());
    }
  }

  function shakeScreen() {
    const el = document.getElementById('battle');
    if (!el) return;
    el.classList.remove('shake-screen');
    void el.offsetWidth; // restart the animation if triggered again quickly
    el.classList.add('shake-screen');
    setTimeout(() => el.classList.remove('shake-screen'), 420);
  }

  function flashCell(cellEl) {
    const flash = document.createElement('div');
    flash.className = 'impact-flash';
    cellEl.appendChild(flash);
    setTimeout(() => flash.remove(), 350);
  }

  function rippleCell(cellEl) {
    const ripple = document.createElement('div');
    ripple.className = 'impact-ripple';
    cellEl.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }

  /** Explosion burst + flash + screen shake, centered on the hit cell. */
  function impactHit(cellEl) {
    flashCell(cellEl);
    shakeScreen();
    spawnParticles(centerOf(cellEl), {
      count: 16,
      colors: ['#ff5a3c', '#ffb199', '#ffe0a3'],
      spread: 60,
      size: 5,
      duration: 480,
    });
  }

  /** Water splash + ripple, centered on the missed cell. */
  function impactMiss(cellEl) {
    rippleCell(cellEl);
    spawnParticles(centerOf(cellEl), {
      count: 8,
      colors: ['#8fd8ff', '#c9ecff'],
      spread: 34,
      size: 4,
      duration: 420,
      gravity: true,
    });
  }

  /** Staggered sink: each cell dips/darkens in sequence with rising bubbles. Resolves when done. */
  function sinkShip(cellEls) {
    return new Promise((resolve) => {
      cellEls.forEach((el, i) => {
        setTimeout(() => {
          el.classList.add('sinking');
          spawnParticles(centerOf(el), {
            count: 6,
            colors: ['#bfe9ff', '#ffffff'],
            spread: 26,
            size: 3,
            duration: 900,
            drift: true,
          });
        }, i * 130);
      });
      setTimeout(resolve, cellEls.length * 130 + 900);
    });
  }

  const CONFETTI_COLORS = ['#29e0ff', '#ff5a3c', '#ffe0a3', '#8fd8ff', '#ffffff', '#5fffb0'];

  /** Victory celebration: a few staggered firework bursts at random points across the viewport. */
  function celebrate() {
    const burstCount = 5;
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        const point = {
          x: window.innerWidth * (0.2 + Math.random() * 0.6),
          y: window.innerHeight * (0.15 + Math.random() * 0.4),
        };
        spawnParticles(point, {
          count: 26,
          colors: CONFETTI_COLORS,
          spread: 130,
          size: 6,
          duration: 900,
          gravity: true,
        });
      }, i * 260);
    }
  }

  window.BattleEffects = { fireMissile, impactHit, impactMiss, sinkShip, shakeScreen, celebrate };
})();
