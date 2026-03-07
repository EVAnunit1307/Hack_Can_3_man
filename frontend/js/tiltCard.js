'use strict';

(function () {
  const card  = document.getElementById('title-card-3d');
  if (!card) return;

  const shine = card.querySelector('.title-card-3d__shine');
  const MAX   = 16; // max tilt degrees

  let tilting  = false;
  let targetTx = 0, targetTy = 0;
  let currentTx = 0, currentTy = 0;
  let rafId    = null;

  // ── Apply tilt (tx/ty = -1 to 1) ────────────────────────────────────────
  function applyTilt(tx, ty) {
    if (!tilting) {
      card.classList.add('is-tilting');
      tilting = true;
    }
    targetTx = tx;
    targetTy = ty;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  // ── Smooth lerp in RAF ───────────────────────────────────────────────────
  function tick() {
    currentTx += (targetTx - currentTx) * 0.12;
    currentTy += (targetTy - currentTy) * 0.12;

    const rx = -currentTy * MAX;  // rotateX: forward/back
    const ry =  currentTx * MAX;  // rotateY: left/right

    card.style.transform =
      `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(8px)`;

    // Shine chases the high point
    const sx = 50 + currentTx * 35;
    const sy = 50 + currentTy * 35;
    shine.style.background =
      `radial-gradient(circle at ${sx}% ${sy}%, rgba(255,255,255,0.22) 0%, rgba(200,129,58,0.08) 40%, transparent 65%)`;

    // Keep ticking while we have motion
    const stillMoving = Math.abs(targetTx - currentTx) > 0.001 ||
                        Math.abs(targetTy - currentTy) > 0.001;
    rafId = stillMoving ? requestAnimationFrame(tick) : null;
  }

  // ── Reset to idle float ──────────────────────────────────────────────────
  function resetTilt() {
    tilting  = false;
    targetTx = 0;
    targetTy = 0;
    card.style.transform = '';
    shine.style.background = '';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    card.classList.remove('is-tilting');
  }

  // ── Desktop: mouse ───────────────────────────────────────────────────────
  const splash = card.closest('.screen-splash');
  if (splash) {
    splash.addEventListener('mousemove', function (e) {
      const rect = card.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const tx   = clamp((e.clientX - cx) / (rect.width  / 2));
      const ty   = clamp((e.clientY - cy) / (rect.height / 2));
      applyTilt(tx, ty);
    });

    splash.addEventListener('mouseleave', resetTilt);
  }

  // ── Mobile: gyroscope ───────────────────────────────────────────────────
  if (typeof DeviceOrientationEvent !== 'undefined') {
    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      document.addEventListener('click', function askOnce() {
        DeviceOrientationEvent.requestPermission().then(function (state) {
          if (state === 'granted') listenGyro();
        }).catch(function () {});
        document.removeEventListener('click', askOnce);
      }, { once: true });
    } else {
      listenGyro();
    }
  }

  function listenGyro() {
    window.addEventListener('deviceorientation', function (e) {
      // gamma = left/right (-90→90), beta = front/back (-180→180)
      const tx = clamp((e.gamma || 0) / 25);
      const ty = clamp(((e.beta  || 0) - 30) / 25); // offset for natural hold angle
      applyTilt(tx, ty);
    });
  }

  function clamp(v) { return Math.max(-1, Math.min(1, v)); }
})();
