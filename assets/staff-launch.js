/* Staff Hub: the first-visit launch. About six seconds: stars, 3-2-1, ignition, warp, one soft bloom, the lockup.
   Plays once per account. Skip (or Esc, or a tap) any time. Reduced motion: a short fade to the lockup, nothing else.
   No flashing: the bloom is a single fade. No sound. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const $ = (id) => document.getElementById(id);
  const COLORS = ["#63f4ff", "#ff42d0", "#a855f7", "#ffc861", "#ffffff", "#73ffce"];

  function play(me) {
    return new Promise((resolve) => {
      const root = $("launch"), cv = $("launch-canvas"), ship = $("launch-ship"), count = $("launch-count");
      const lock = $("launch-lockup"), welcome = $("launch-welcome"), skipBtn = $("launch-skip");
      const ctx = cv.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let W = 0, Hh = 0;
      const size = () => { W = window.innerWidth; Hh = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
      size();
      welcome.replaceChildren(H.avatar(me, 40), H.el("span", null, ["Welcome aboard, ", H.el("b", { text: me.name || "crew" })]), H.tierBadge(me.tier));
      lock.classList.remove("show"); lock.style.opacity = "0";
      count.textContent = ""; count.className = "launch-count";
      ship.style.opacity = "0";
      root.classList.remove("fade-out");
      root.style.transform = "";
      root.hidden = false;
      root.removeAttribute("aria-hidden");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", "Staff Hub launch");
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      skipBtn.focus({ preventScroll: true });

      let finished = false, raf = 0;
      function cleanup() {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        root.removeEventListener("click", onClick);
        window.removeEventListener("resize", size);
      }
      function finish(fast) {
        if (finished) return;
        finished = true;
        cleanup();
        root.classList.add("fade-out");
        setTimeout(() => {
          root.hidden = true;
          root.setAttribute("aria-hidden", "true");
          root.classList.remove("fade-out");
          root.style.transform = "";
          document.body.style.overflow = prevOverflow;
          const main = $("hub-main");
          if (main) main.focus({ preventScroll: true });
          resolve();
        }, fast ? 250 : 650);
      }
      const onKey = (e) => { if (e.key === "Escape") finish(true); };
      const onClick = () => finish(true);
      window.addEventListener("keydown", onKey);
      root.addEventListener("click", onClick);
      window.addEventListener("resize", size);

      /* reduced motion: a 600ms fade to the lockup, a beat, done */
      if (H.reduce) {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, Hh);
        lock.style.transition = "opacity .6s ease";
        requestAnimationFrame(() => { lock.style.opacity = "1"; lock.style.transform = "translate(-50%, -50%)"; });
        setTimeout(() => finish(false), 2200);
        return;
      }

      /* the scene */
      let seed = 3;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const stars = Array.from({ length: Math.min(320, Math.round((W * Hh) / 4500)) }, () => ({
        x: (rnd() - 0.5) * 2, y: (rnd() - 0.5) * 2, z: 0.15 + rnd() * 0.85, a: 0.35 + rnd() * 0.65
      }));
      const rings = [], parts = [];
      let shown = { count: 0, ship: false, lock: false, burst: false };
      const t0 = performance.now();
      let last = t0;

      function ring(at) { rings.push({ at: at }); }
      function smoke(x, y) {
        for (let i = 0; i < 3; i++) {
          parts.push({ x: x + (rnd() - 0.5) * 20, y: y, vx: (rnd() - 0.5) * 160, vy: 60 + rnd() * 120, r: 8 + rnd() * 10, grow: 40 + rnd() * 50,
            life: 1.4 + rnd() * 0.8, age: 0, c: rnd() > 0.5 ? "196,179,255" : "143,127,214", kind: "smoke" });
        }
      }
      function burst() {
        for (let i = 0; i < 90; i++) {
          const ang = rnd() * Math.PI * 2, sp = 180 + rnd() * 520;
          parts.push({ x: W / 2, y: Hh / 2 - 40, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 1.6 + rnd() * 3, grow: 0,
            life: 0.9 + rnd() * 0.9, age: 0, col: COLORS[i % COLORS.length], kind: "spark" });
        }
      }

      function frame(now) {
        if (finished) return;
        const t = (now - t0) / 1000;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // 3, 2, 1 (0.6s each from 0.6s), each with a shockwave and a shake that builds
        const n = t < 0.6 ? 0 : t < 1.2 ? 3 : t < 1.8 ? 2 : t < 2.4 ? 1 : 0;
        if (n && n !== shown.count) {
          shown.count = n;
          count.textContent = String(n);
          count.classList.remove("punch"); void count.offsetWidth; count.classList.add("punch");
          ring(t);
        }
        if (!n && shown.count) { shown.count = 0; count.textContent = ""; }
        const shakeAmp = t > 0.6 && t < 2.4 ? 1.5 + t * 2.2 : t >= 2.4 && t < 3.2 ? 6 * (1 - (t - 2.4) / 0.8) : 0;   // builds with each number, eases off after ignition
        if (shakeAmp > 0.2) {
          root.style.transform = "translate(" + ((rnd() - 0.5) * shakeAmp).toFixed(1) + "px," + ((rnd() - 0.5) * shakeAmp).toFixed(1) + "px) scale(1.02)";
        } else if (root.style.transform) root.style.transform = "";

        // background + stars (fade in, then stretch into the warp)
        const warp = t < 3.4 ? 0 : Math.min(1, (t - 3.4) / 0.9);
        ctx.fillStyle = warp > 0 ? "rgba(0,0,0,0.35)" : "#000";
        ctx.fillRect(0, 0, W, Hh);
        const cx = W / 2, cy = Hh / 2, fadeIn = Math.min(1, t / 0.6);
        for (const s of stars) {
          if (warp > 0) s.z -= dt * (0.25 + warp * 2.6);
          if (s.z <= 0.02) { s.x = (rnd() - 0.5) * 2; s.y = (rnd() - 0.5) * 2; s.z = 1; }
          const k = 0.55 / s.z;
          const x = cx + s.x * W * 0.5 * k, y = cy + s.y * Hh * 0.5 * k;
          ctx.globalAlpha = s.a * fadeIn * Math.min(1, (1.05 - s.z) * 2);
          if (warp > 0) {
            const k2 = 0.55 / Math.min(1, s.z + 0.04 + warp * 0.12);
            ctx.strokeStyle = "#cffcff"; ctx.lineWidth = 1 + warp;
            ctx.beginPath(); ctx.moveTo(cx + s.x * W * 0.5 * k2, cy + s.y * Hh * 0.5 * k2); ctx.lineTo(x, y); ctx.stroke();
          } else {
            ctx.fillStyle = "#fff";
            ctx.fillRect(x, y, 1.6 / s.z * 0.5 + 0.6, 1.6 / s.z * 0.5 + 0.6);
          }
        }
        ctx.globalAlpha = 1;

        // shockwaves
        for (let i = rings.length - 1; i >= 0; i--) {
          const k = (t - rings[i].at) / 0.7;
          if (k >= 1) { rings.splice(i, 1); continue; }
          const r = 40 + k * Math.min(W, Hh) * 0.55;
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.strokeStyle = i % 2 ? "#ff42d0" : "#63f4ff";
          ctx.lineWidth = 6 * (1 - k) + 1;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ignition: the rocket lifts off from the bottom and punches through the top
        if (t >= 2.3 && t < 4.0) {
          const k = Math.min(1, (t - 2.3) / 1.6);
          const e = k * k * k;
          const shipH = Math.min(260, Hh * 0.34);
          const y = Hh + 20 - e * (Hh + shipH * 2.2);
          ship.style.opacity = "1";
          ship.style.width = (shipH * 0.47).toFixed(0) + "px";
          ship.style.transform = "translate(-50%," + y.toFixed(1) + "px)";
          shown.ship = true;
          if (y + shipH * 0.9 < Hh + 40) smoke(cx, y + shipH * 0.95);
        } else if (shown.ship && t >= 4.0) { ship.style.opacity = "0"; shown.ship = false; }

        // particles (smoke and the reveal burst)
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.age += dt;
          if (p.age >= p.life) { parts.splice(i, 1); continue; }
          const k = p.age / p.life;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= Math.exp(-(p.kind === "spark" ? 2.2 : 1.4) * dt); p.vy *= Math.exp(-(p.kind === "spark" ? 2.2 : 1.4) * dt);
          if (p.kind === "spark") p.vy += 120 * dt;
          ctx.globalAlpha = p.kind === "smoke" ? (1 - k) * 0.45 : (1 - k);
          ctx.fillStyle = p.kind === "smoke" ? "rgb(" + p.c + ")" : p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + p.grow * k, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // one soft bloom (a single fade up and down, never a strobe)
        if (t >= 4.1 && t < 4.7) {
          const k = (t - 4.1) / 0.6;
          ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85;
          ctx.fillStyle = "#f2feff";
          ctx.fillRect(0, 0, W, Hh);
          ctx.globalAlpha = 1;
        }

        // the lockup lands with a burst, then the welcome
        if (t >= 4.45 && !shown.lock) {
          shown.lock = true;
          lock.style.opacity = "";
          lock.classList.add("show");
        }
        if (t >= 4.55 && !shown.burst) { shown.burst = true; burst(); }
        if (t >= 6.4) { finish(false); return; }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      skipBtn.onclick = (e) => { e.stopPropagation(); finish(true); };
    });
  }

  H.launch = { play: play };
})();
