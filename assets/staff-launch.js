/* Staff Hub: the launch.
   First visit (once per account): about three seconds. 3-2-1, ignition, liftoff, one soft bloom, then
   "Welcome aboard" with confetti.
   Coming back (once per browser session): no countdown, no confetti. The rocket goes up, then "Welcome back".
   The sound is made live with Web Audio, so there are no files to load. Browsers only let a page make sound
   after a click, so when the first launch can't play sound yet it waits on a Launch button.
   Skip (Esc, or a tap) any time. Reduced motion: a short fade to the welcome. The bloom is one fade, never a strobe. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const $ = (id) => document.getElementById(id);
  const COLORS = ["#63f4ff", "#ff42d0", "#a855f7", "#ffc861", "#ffffff", "#73ffce"];

  /* the beats, in seconds from the start */
  const TIMING = {
    first: { counts: [0.12, 0.42, 0.72], ignite: 1.02, rise: [1.06, 1.72], warp: [1.42, 1.9], bloom: [1.74, 2.1], lock: 1.86, burst: 1.9, end: 2.78 },
    back: { counts: [], ignite: 0.1, rise: [0.14, 0.86], warp: [0.56, 1.0], bloom: [0.82, 1.14], lock: 0.9, burst: null, end: 1.9 }
  };

  /* ================================ sound ================================ */
  const SFX = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const store = new WeakMap();
    let ctx = null;
    const on = () => { try { return localStorage.getItem("eg-hub-sound") !== "off"; } catch (e) { return true; } };
    const setOn = (v) => { try { localStorage.setItem("eg-hub-sound", v ? "on" : "off"); } catch (e) { /* fine */ } };
    function context() {
      if (ctx || !AC) return ctx;
      try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; } }
      return ctx;
    }
    // call from inside a click: that's what lets the browser play sound
    function unlock() {
      const c = context();
      if (c && c.state !== "running") { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* still blocked */ } }
    }
    // true when sound can play right now
    function ready(ms) {
      const c = context();
      if (!c) return Promise.resolve(false);
      if (c.state === "running") return Promise.resolve(true);
      return new Promise((res) => {
        let done = false;
        const fin = () => { if (!done) { done = true; res(c.state === "running"); } };
        try { const p = c.resume(); if (p && p.then) p.then(fin, fin); } catch (e) { fin(); }
        setTimeout(fin, ms || 160);
      });
    }
    function buffers(c) {
      let b = store.get(c);
      if (b) return b;
      const rate = c.sampleRate, len = rate * 2;
      const white = c.createBuffer(1, len, rate), brown = c.createBuffer(1, len, rate);
      const w = white.getChannelData(0), br = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const x = Math.random() * 2 - 1;
        w[i] = x;
        last = (last + 0.02 * x) / 1.02;
        br[i] = last * 3.5;
      }
      const irLen = Math.floor(rate * 2.4), ir = c.createBuffer(2, irLen, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
      }
      const sat = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) sat[i] = Math.tanh((i / 511.5 - 1) * 2.6);
      b = { white: white, brown: brown, ir: ir, sat: sat };
      store.set(c, b);
      return b;
    }

    /* one launch's worth of instruments, all feeding one bus so a skip can silence everything at once */
    function kit(c, dest) {
      const B = buffers(c);
      const LEVEL = 0.72;
      const bus = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      const master = c.createGain();
      master.gain.value = LEVEL;
      bus.connect(comp); comp.connect(master); master.connect(dest || c.destination);
      const rv = c.createConvolver();
      rv.buffer = B.ir;
      rv.connect(bus);

      const send = (node, amt) => { const s = c.createGain(); s.gain.value = amt; node.connect(s); s.connect(rv); };
      function amp(t, peak, a, d, wet) {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
        g.connect(bus);
        if (wet) send(g, wet);
        return g;
      }
      function osc(type, f, t, end) { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end); return o; }
      function src(buf, t, end, loop) { const s = c.createBufferSource(); s.buffer = buf; s.loop = !!loop; s.start(t, loop ? Math.random() * 1.5 : 0); s.stop(end); return s; }
      function filter(type, f, q) { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }

      // countdown: a bright synth pluck on a sub thump, a click on top
      function tick(t, f) {
        const g = amp(t, 0.26, 0.004, 0.32, 0.22);
        const lp = filter("lowpass", 5200, 8);
        lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(650, t + 0.3);
        lp.connect(g);
        osc("square", f, t, t + 0.4).connect(lp);
        const o2 = osc("sawtooth", f, t, t + 0.4); o2.detune.value = 9; o2.connect(lp);
        const s = amp(t, 0.55, 0.003, 0.17);
        const so = osc("sine", 180, t, t + 0.22); so.frequency.exponentialRampToValueAtTime(48, t + 0.15); so.connect(s);
        const k = amp(t, 0.18, 0.001, 0.035);
        const hp = filter("highpass", 2600); hp.connect(k);
        src(B.white, t, t + 0.06).connect(hp);
      }
      // "go": the same voice an octave up, stacked with a fifth, held longer
      function go(t, f) {
        const g = amp(t, 0.2, 0.004, 0.75, 0.4);
        const lp = filter("lowpass", 7000, 6);
        lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.7);
        lp.connect(g);
        [f, f * 1.5, f * 2].forEach((x, i) => { const o = osc(i ? "sawtooth" : "square", x, t, t + 0.85); o.detune.value = i * 6 - 6; o.connect(lp); });
      }
      // ignition: a saturated sub boom, a blast of filtered noise, a crack
      function ignite(t, p) {
        const b = amp(t, 0.9 * p, 0.006, 1.15);
        const lp = filter("lowpass", 650); lp.connect(b);
        const ws = c.createWaveShaper(); ws.curve = B.sat; ws.connect(lp);
        const o = osc("sine", 135, t, t + 1.3); o.frequency.exponentialRampToValueAtTime(30, t + 0.9); o.connect(ws);
        const n = amp(t, 0.6 * p, 0.008, 1.0, 0.3);
        const nlp = filter("lowpass", 3400, 0.8);
        nlp.frequency.setValueAtTime(3400, t); nlp.frequency.exponentialRampToValueAtTime(200, t + 0.95);
        nlp.connect(n);
        src(B.white, t, t + 1.1).connect(nlp);
        const k = amp(t, 0.3 * p, 0.002, 0.2, 0.25);
        const hp = filter("highpass", 1800); hp.connect(k);
        src(B.white, t, t + 0.25).connect(hp);
      }
      // a low rumble building under the countdown
      function drone(t, dur, peak) {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
        g.connect(bus);
        const lp = filter("lowpass", 90, 1.5);
        lp.frequency.setValueAtTime(90, t); lp.frequency.exponentialRampToValueAtTime(240, t + dur);
        lp.connect(g);
        src(B.brown, t, t + dur + 0.3, true).connect(lp);
      }
      // the engine: brown noise opening up as the rocket climbs, with a flutter and a crackle
      function roar(t, dur, peak) {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.1);
        g.gain.setValueAtTime(peak, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        g.connect(bus);
        const fl = c.createGain(); fl.gain.value = 1; fl.connect(g);
        const lfo = osc("sine", 17, t, t + dur); const lg = c.createGain(); lg.gain.value = 0.28; lfo.connect(lg); lg.connect(fl.gain);
        const lp = filter("lowpass", 220, 1.2);
        lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(1300, t + dur * 0.7);
        lp.connect(fl);
        src(B.brown, t, t + dur + 0.05, true).connect(lp);
        const cg = c.createGain();
        cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(peak * 0.16, t + 0.12); cg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        cg.connect(bus);
        const bp = filter("bandpass", 2600, 0.7); bp.connect(cg);
        src(B.white, t, t + dur + 0.05, true).connect(bp);
      }
      // the riser: a noise sweep and two detuned saws climbing into the bloom
      function riser(t, dur, level) {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.38 * level, t + dur * 0.88); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
        g.connect(bus); send(g, 0.3);
        const bp = filter("bandpass", 380, 2.4);
        bp.frequency.setValueAtTime(380, t); bp.frequency.exponentialRampToValueAtTime(7600, t + dur);
        bp.connect(g);
        src(B.white, t, t + dur + 0.15).connect(bp);
        const pg = c.createGain();
        pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.085 * level, t + dur * 0.92); pg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
        pg.connect(bus); send(pg, 0.3);
        const plp = filter("lowpass", 700, 3);
        plp.frequency.setValueAtTime(700, t); plp.frequency.exponentialRampToValueAtTime(6500, t + dur);
        plp.connect(pg);
        [0, 14].forEach((d) => { const o = osc("sawtooth", 115, t, t + dur + 0.15); o.detune.value = d; o.frequency.exponentialRampToValueAtTime(940, t + dur); o.connect(plp); });
      }
      // the bloom: a sub drop, a soft thump and a shimmer
      function impact(t, p) {
        const s = amp(t, 0.8 * p, 0.005, 1.5);
        const o = osc("sine", 92, t, t + 1.6); o.frequency.exponentialRampToValueAtTime(27, t + 1.4); o.connect(s);
        const n = amp(t, 0.4 * p, 0.005, 0.6, 0.55);
        const lp = filter("lowpass", 1600);
        lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(110, t + 0.6);
        lp.connect(n);
        src(B.white, t, t + 0.7).connect(lp);
        const sh = amp(t, 0.09 * p, 0.02, 1.3, 0.8);
        const hp = filter("highpass", 6500); hp.connect(sh);
        src(B.white, t, t + 1.4).connect(hp);
      }
      // the welcome: a wide major-ninth chord that opens up, with a bass note under it
      function pad(t, dur, level) {
        [261.63, 329.63, 392.0, 493.88, 587.33].forEach((f) => {
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.03);
          g.gain.exponentialRampToValueAtTime(level * 0.5, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          g.connect(bus); send(g, 0.55);
          const lp = filter("lowpass", 900, 1.6);
          lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(5200, t + 0.14); lp.frequency.exponentialRampToValueAtTime(1500, t + dur);
          lp.connect(g);
          [-10, 10].forEach((d) => { const o = osc("sawtooth", f, t, t + dur + 0.05); o.detune.value = d; o.connect(lp); });
        });
        const b = amp(t, level * 4, 0.02, dur * 0.9);
        osc("sine", 65.41, t, t + dur).connect(b);
      }
      // a bell: FM, bright and quick
      function bell(t, f, level) {
        const g = amp(t, level, 0.002, 0.85, 0.55);
        const car = osc("sine", f, t, t + 0.95);
        const mod = osc("sine", f * 3.51, t, t + 0.95);
        const mg = c.createGain(); mg.gain.setValueAtTime(f * 1.3, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.3);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g);
      }
      function bells(t, n, level) {
        const S = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
        for (let i = 0; i < n; i++) bell(t + i * 0.055 + Math.random() * 0.02, S[(Math.random() * S.length) | 0], level);
      }
      // "welcome back": two notes up
      function chime(t, level) { bell(t, 783.99, level); bell(t + 0.12, 1046.5, level); bell(t + 0.12, 1567.98, level * 0.4); }
      // confetti: little pitch-up pops
      function pops(t, n) {
        for (let i = 0; i < n; i++) {
          const tt = t + Math.random() * 0.4;
          const g = amp(tt, 0.13, 0.002, 0.07);
          const o = osc("sine", 420 + Math.random() * 300, tt, tt + 0.1);
          o.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 900, tt + 0.045);
          o.connect(g);
        }
      }
      function mute(m) { master.gain.cancelScheduledValues(c.currentTime); master.gain.setTargetAtTime(m ? 0 : LEVEL, c.currentTime, 0.03); }
      function stop(fade) {
        const now = c.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0, now, fade || 0.04);
        setTimeout(() => { try { master.disconnect(); } catch (e) { /* gone */ } }, ((fade || 0.04) * 6 + 0.1) * 1000);
      }
      return { tick, go, ignite, drone, roar, riser, impact, pad, bells, chime, pops, mute, stop };
    }

    /* the score, lined up with the picture */
    function score(K, base, mode) {
      const T = TIMING[mode];
      const at = (x) => base + x;
      if (mode === "first") {
        K.drone(at(0), T.ignite, 0.3);
        [523.25, 659.25, 783.99].forEach((f, i) => K.tick(at(T.counts[i]), f));
        K.go(at(T.ignite), 1046.5);
        K.ignite(at(T.ignite), 1);
        K.roar(at(T.ignite), T.rise[1] - T.ignite + 0.55, 0.7);
        K.riser(at(T.ignite + 0.05), T.bloom[0] - T.ignite - 0.05, 1);
        K.impact(at(T.bloom[0]), 1);
        K.pad(at(T.bloom[0]), 2.2, 0.05);
        K.bells(at(T.burst), 9, 0.08);
        K.pops(at(T.burst), 7);
      } else if (mode === "back") {
        K.roar(at(0), T.rise[1] + 0.45, 0.5);
        K.ignite(at(T.ignite), 0.55);
        K.riser(at(T.rise[0]), T.bloom[0] - T.rise[0], 0.8);
        K.impact(at(T.bloom[0]), 0.5);
        K.pad(at(T.bloom[0]), 1.8, 0.04);
        K.chime(at(T.lock + 0.04), 0.12);
      } else {                                 // reduced motion: just the welcome
        K.pad(at(0.05), 1.8, 0.04);
        K.chime(at(0.2), 0.11);
      }
    }
    return { on: on, setOn: setOn, context: context, unlock: unlock, ready: ready, kit: kit, score: score };
  })();

  /* ================================ picture ================================ */
  function play(me, opts) {
    opts = opts || {};
    const mode = opts.mode === "back" ? "back" : "first";
    if (opts.replay) SFX.unlock();                 // a replay comes from a click, so sound is allowed
    const TL = TIMING[mode];
    return new Promise((resolve) => {
      const root = $("launch"), cv = $("launch-canvas"), ship = $("launch-ship"), count = $("launch-count");
      const lock = $("launch-lockup"), welcome = $("launch-welcome"), skipBtn = $("launch-skip");
      const gateBox = $("launch-gate"), goBtn = $("launch-go"), soundBtn = $("launch-sound"), flame = $("ls-flame-wrap");
      const g2 = cv.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let W = 0, Hh = 0;
      const size = () => { W = window.innerWidth; Hh = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); g2.setTransform(dpr, 0, 0, dpr, 0, 0); };
      size();
      welcome.replaceChildren(H.avatar(me, 40), H.el("span", null, [mode === "back" ? "Welcome back, " : "Welcome aboard, ", H.el("b", { text: me.name || "crew" })]), H.tierBadge(me.tier));
      lock.classList.remove("show"); lock.style.opacity = "0";
      count.textContent = ""; count.className = "launch-count";
      ship.style.opacity = "0";
      gateBox.hidden = true; gateBox.classList.remove("out");
      root.dataset.mode = mode;
      root.classList.remove("fade-out", "gated");
      root.style.transform = "";
      root.hidden = false;
      root.removeAttribute("aria-hidden");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", "Staff Hub launch");
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      skipBtn.focus({ preventScroll: true });

      let finished = false, started = false, gated = false, raf = 0, K = null;
      const born = performance.now();
      let t0 = 0, last = born;

      function paintSound() {
        const onNow = SFX.on();
        soundBtn.setAttribute("aria-pressed", String(onNow));
        soundBtn.replaceChildren(H.ic(onNow ? "volume-2" : "volume-x"), H.el("span", { text: onNow ? "Sound on" : "Sound off" }));
      }
      paintSound();
      soundBtn.onclick = (e) => {
        e.stopPropagation();
        const v = !SFX.on();
        SFX.setOn(v);
        if (v) SFX.unlock();
        if (K) K.mute(!v);                                      // otherwise it takes effect on the next launch
        paintSound();
        syncFooter();
      };

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
        if (K && fast) K.stop(0.04);
        // let the last chord ring out, then let the sound card sleep
        const c = SFX.context();
        if (c) setTimeout(() => { if (root.hidden && c.state === "running" && c.suspend) c.suspend().catch(() => {}); }, fast ? 600 : 3200);
        root.classList.add("fade-out");
        setTimeout(() => {
          root.hidden = true;
          root.setAttribute("aria-hidden", "true");
          root.classList.remove("fade-out", "gated");
          root.style.transform = "";
          gateBox.hidden = true;
          document.body.style.overflow = prevOverflow;
          const main = $("hub-main");
          if (main) main.focus({ preventScroll: true });
          resolve();
        }, fast ? 220 : 320);
      }
      function begin() {
        if (started || finished) return;
        started = true;
        t0 = performance.now() + 30;
        const c = SFX.on() ? SFX.context() : null;              // sound off: don't wake the audio at all
        if (c && c.state === "running") {
          try {
            K = SFX.kit(c);
            K.mute(!SFX.on());
            SFX.score(K, c.currentTime + 0.03, H.reduce ? "calm" : mode);
          } catch (e) { K = null; }
        }
      }
      function launchFromGate() {
        if (!gated) return;
        gated = false;
        SFX.unlock();
        root.classList.remove("gated");
        gateBox.classList.add("out");
        setTimeout(() => { gateBox.hidden = true; }, 360);
        SFX.ready(400).then(begin);
      }
      const onKey = (e) => { if (e.key === "Escape") finish(true); };
      const onClick = () => { if (gated) launchFromGate(); else finish(true); };
      window.addEventListener("keydown", onKey);
      root.addEventListener("click", onClick);
      window.addEventListener("resize", size);
      goBtn.onclick = (e) => { e.stopPropagation(); launchFromGate(); };
      skipBtn.onclick = (e) => { e.stopPropagation(); finish(true); };

      // can it make sound yet? the first launch waits on the button if not; coming back just plays
      (SFX.on() ? SFX.ready(160) : Promise.resolve(false)).then((ok) => {
        if (finished) return;
        if (mode === "first" && !ok && SFX.on() && !H.reduce && SFX.context()) {
          gated = true;
          root.classList.add("gated");
          gateBox.hidden = false;
          goBtn.focus({ preventScroll: true });
        } else begin();
      });

      /* reduced motion: a fade to the welcome, a beat, done */
      if (H.reduce) {
        g2.fillStyle = "#000"; g2.fillRect(0, 0, W, Hh);
        lock.style.transition = "opacity .5s ease";
        requestAnimationFrame(() => { lock.style.opacity = "1"; lock.style.transform = "translate(-50%, -50%)"; });
        setTimeout(() => finish(false), 1900);
        return;
      }

      /* the scene */
      let seed = 3;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const stars = Array.from({ length: Math.min(320, Math.round((W * Hh) / 4500)) }, () => ({
        x: (rnd() - 0.5) * 2, y: (rnd() - 0.5) * 2, z: 0.15 + rnd() * 0.85, a: 0.35 + rnd() * 0.65
      }));
      const rings = [], parts = [];
      const shown = { count: 0, lock: false, burst: false, ignite: false };
      let vent = 0, trail = 0;            // smoke comes out at a steady rate, whatever the frame rate

      function puff(x, y, vx, vy, r, grow, life, alpha) {
        parts.push({ kind: "smoke", x: x, y: y, vx: vx, vy: vy, r: r, grow: grow, life: life, age: 0, a: alpha, c: rnd() > 0.5 ? "196,179,255" : "143,127,214" });
      }
      function confetti(cx, cy) {
        for (let i = 0; i < 120; i++) {
          const ang = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.6, sp = 260 + rnd() * 620;
          parts.push({ kind: i % 5 ? "confetti" : "spark", x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 6 + rnd() * 7, h: 3 + rnd() * 4,
            rot: rnd() * 6.28, vr: (rnd() - 0.5) * 14, r: 1.6 + rnd() * 2.4, life: 1.1 + rnd() * 0.8, age: 0, col: COLORS[i % COLORS.length] });
        }
      }

      function frame(now) {
        if (finished) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const t = started ? (now - t0) / 1000 : -1;          // -1 while waiting on the Launch button
        const life = (now - born) / 1000;
        const cx = W / 2, cy = Hh / 2;

        // 3, 2, 1
        let n = 0;
        if (t >= 0) TL.counts.forEach((at, i) => { if (t >= at && t < (TL.counts[i + 1] || TL.ignite)) n = 3 - i; });
        if (n !== shown.count) {
          shown.count = n;
          count.textContent = n ? String(n) : "";
          if (n) { count.classList.remove("punch"); void count.offsetWidth; count.classList.add("punch"); rings.push({ at: t }); }
        }

        // the shake builds through the countdown and kicks at ignition
        let shake = 0;
        if (t >= 0) {
          if (mode === "first" && t < TL.ignite) shake = 0.6 + (t / TL.ignite) * 2.6;
          const since = t - TL.ignite;
          if (since >= 0 && since < 0.7) shake = Math.max(shake, (mode === "first" ? 10 : 5) * (1 - since / 0.7));
        }
        if (shake > 0.2) root.style.transform = "translate(" + ((rnd() - 0.5) * shake).toFixed(1) + "px," + ((rnd() - 0.5) * shake).toFixed(1) + "px) scale(1.02)";
        else if (root.style.transform) root.style.transform = "";

        // stars, stretching into the warp
        const warp = t < TL.warp[0] ? 0 : Math.min(1, (t - TL.warp[0]) / (TL.warp[1] - TL.warp[0]));
        g2.fillStyle = warp > 0 ? "rgba(0,0,0,0.35)" : "#000";
        g2.fillRect(0, 0, W, Hh);
        const fadeIn = Math.min(1, life / 0.3);
        for (const s of stars) {
          if (warp > 0) s.z -= dt * (0.25 + warp * 2.8);
          if (s.z <= 0.02) { s.x = (rnd() - 0.5) * 2; s.y = (rnd() - 0.5) * 2; s.z = 1; }
          const k = 0.55 / s.z;
          const x = cx + s.x * W * 0.5 * k, y = cy + s.y * Hh * 0.5 * k;
          g2.globalAlpha = s.a * fadeIn * Math.min(1, (1.05 - s.z) * 2);
          if (warp > 0) {
            const k2 = 0.55 / Math.min(1, s.z + 0.04 + warp * 0.12);
            g2.strokeStyle = "#cffcff"; g2.lineWidth = 1 + warp;
            g2.beginPath(); g2.moveTo(cx + s.x * W * 0.5 * k2, cy + s.y * Hh * 0.5 * k2); g2.lineTo(x, y); g2.stroke();
          } else {
            g2.fillStyle = "#fff";
            g2.fillRect(x, y, 1.6 / s.z * 0.5 + 0.6, 1.6 / s.z * 0.5 + 0.6);
          }
        }
        g2.globalAlpha = 1;

        // shockwaves on each number
        for (let i = rings.length - 1; i >= 0; i--) {
          const k = (t - rings[i].at) / 0.55;
          if (k >= 1) { rings.splice(i, 1); continue; }
          g2.globalAlpha = (1 - k) * 0.8;
          g2.strokeStyle = i % 2 ? "#ff42d0" : "#63f4ff";
          g2.lineWidth = 6 * (1 - k) + 1;
          g2.beginPath(); g2.arc(cx, cy, 40 + k * Math.min(W, Hh) * 0.55, 0, Math.PI * 2); g2.stroke();
        }
        g2.globalAlpha = 1;

        // the rocket: slides onto the pad, ignites, then accelerates out through the top
        const shipH = Math.min(250, Hh * 0.33), shipW = shipH * 0.47;
        const padY = Hh - shipH * 0.92;
        const slide = Math.min(1, life / 0.28);
        let y = Hh + 20 - (Hh + 20 - padY) * (1 - Math.pow(1 - slide, 3));
        if (t >= TL.rise[0]) {
          const k = Math.min(1, (t - TL.rise[0]) / (TL.rise[1] - TL.rise[0]));
          y -= Math.pow(k, 2.6) * (y + shipH * 1.3);
        }
        let fs = 0;
        if (t >= TL.ignite) fs = Math.min(1.25, ((t - TL.ignite) / 0.08) * 1.25);
        else if (mode === "first" && t > TL.ignite - 0.25) fs = 0.3 * (t - (TL.ignite - 0.25)) / 0.25;
        const visible = y > -shipH * 1.2;
        ship.style.opacity = visible ? "1" : "0";
        if (visible) {
          ship.style.width = shipW.toFixed(0) + "px";
          ship.style.transform = "translate(-50%," + y.toFixed(1) + "px)";
          flame.setAttribute("transform", "translate(40 114) scale(1 " + Math.max(0.001, fs).toFixed(3) + ") translate(-40 -114)");
        }
        const exY = y + shipH * 0.78;

        // smoke: venting on the pad, billows at ignition, a trail on the way up
        if (mode === "first" && t < TL.ignite) {
          vent += dt * (t >= 0 ? 24 : 6);
          while (vent >= 1) {
            vent -= 1;
            const side = rnd() > 0.5 ? 1 : -1;
            puff(cx + side * shipW * 0.35, padY + shipH * 0.9, side * (60 + rnd() * 120), -10 - rnd() * 20, 5 + rnd() * 6, 24, 0.6 + rnd() * 0.4, 0.3);
          }
        }
        if (t >= TL.ignite && !shown.ignite) {
          shown.ignite = true;
          for (let i = 0; i < (mode === "first" ? 28 : 18); i++) {
            const side = rnd() > 0.5 ? 1 : -1;
            puff(cx + side * rnd() * shipW, Hh - 6, side * (140 + rnd() * 460), -20 - rnd() * 50, 12 + rnd() * 10, 60 + rnd() * 50, 1.0 + rnd() * 0.6, 0.45);
          }
        }
        if (fs > 0 && exY < Hh + 60 && exY > -40) {
          trail += dt * 38;
          while (trail >= 1) {
            trail -= 1;
            puff(cx + (rnd() - 0.5) * 14, exY + shipH * 0.12, (rnd() - 0.5) * 110, 60 + rnd() * 90, 5 + rnd() * 4, 20 + rnd() * 18, 0.55 + rnd() * 0.35, 0.32);
          }
        }

        // engine glow and the flash on the pad
        if (fs > 0 && exY > -80) {
          const rad = shipW * (1.1 + fs * 1.5) * (0.92 + rnd() * 0.16);
          const gr = g2.createRadialGradient(cx, exY, 0, cx, exY, rad);
          gr.addColorStop(0, "rgba(255,255,255," + (0.85 * Math.min(1, fs)) + ")");
          gr.addColorStop(0.25, "rgba(99,244,255," + (0.5 * Math.min(1, fs)) + ")");
          gr.addColorStop(0.6, "rgba(255,66,208," + (0.22 * Math.min(1, fs)) + ")");
          gr.addColorStop(1, "rgba(255,66,208,0)");
          g2.globalCompositeOperation = "lighter";
          g2.fillStyle = gr; g2.beginPath(); g2.arc(cx, exY, rad, 0, Math.PI * 2); g2.fill();
          g2.globalCompositeOperation = "source-over";
        }
        const flash = t - TL.ignite;
        if (flash >= 0 && flash < 0.6) {
          const rad = Math.max(W, Hh) * 0.55;
          const gr = g2.createRadialGradient(cx, Hh, 0, cx, Hh, rad);
          gr.addColorStop(0, "rgba(255,190,240," + (0.55 * (1 - flash / 0.6)) + ")");
          gr.addColorStop(1, "rgba(255,66,208,0)");
          g2.globalCompositeOperation = "lighter";
          g2.fillStyle = gr; g2.fillRect(0, 0, W, Hh);
          g2.globalCompositeOperation = "source-over";
        }

        // particles
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.age += dt;
          if (p.age >= p.life) { parts.splice(i, 1); continue; }
          const k = p.age / p.life;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.kind === "smoke") {
            p.vx *= Math.exp(-1.6 * dt); p.vy *= Math.exp(-1.6 * dt);
            g2.globalAlpha = (1 - k) * p.a * (1 - warp);                 // the warp clears the air for the welcome
            g2.fillStyle = "rgb(" + p.c + ")";
            g2.beginPath(); g2.arc(p.x, p.y, p.r + p.grow * k, 0, Math.PI * 2); g2.fill();
          } else {
            p.vx *= Math.exp(-1.7 * dt); p.vy *= Math.exp(-1.7 * dt); p.vy += 520 * dt;
            g2.globalAlpha = 1 - k * k;
            g2.fillStyle = p.col;
            if (p.kind === "confetti") {
              p.rot += p.vr * dt;
              g2.save(); g2.translate(p.x, p.y); g2.rotate(p.rot);
              g2.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.25 + Math.abs(Math.cos(p.rot * 1.7))));
              g2.restore();
            } else {
              g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, Math.PI * 2); g2.fill();
            }
          }
        }
        g2.globalAlpha = 1;

        // one soft bloom: a single fade up and down, never a strobe
        if (t >= TL.bloom[0] && t < TL.bloom[1]) {
          const k = (t - TL.bloom[0]) / (TL.bloom[1] - TL.bloom[0]);
          g2.globalAlpha = Math.sin(k * Math.PI) * (mode === "first" ? 0.85 : 0.6);
          g2.fillStyle = "#f2feff";
          g2.fillRect(0, 0, W, Hh);
          g2.globalAlpha = 1;
        }

        // the welcome lands (with confetti the first time)
        if (t >= TL.lock && !shown.lock) {
          shown.lock = true;
          lock.style.opacity = "";
          lock.classList.add("show");
        }
        if (TL.burst !== null && t >= TL.burst && !shown.burst) { shown.burst = true; confetti(cx, cy - 30); }
        if (t >= TL.end) { finish(false); return; }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    });
  }

  /* the footer switch */
  function syncFooter() {
    const b = $("hub-sound");
    if (!b) return;
    const onNow = SFX.on();
    b.textContent = "Launch sound: " + (onNow ? "on" : "off");
    b.setAttribute("aria-pressed", String(onNow));
  }
  const foot = $("hub-sound");
  if (foot) {
    syncFooter();
    foot.addEventListener("click", () => { const v = !SFX.on(); SFX.setOn(v); if (v) SFX.unlock(); syncFooter(); });
  }

  H.launch = { play: play, sfx: SFX, timing: TIMING };
})();
