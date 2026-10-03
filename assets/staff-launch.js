/* Staff Hub: the launch.
   First visit (once per account): 3-2-1, ignition, liftoff, one soft bloom, then "Welcome aboard" with confetti.
   Coming back (once per browser session): no countdown, no confetti. The rocket goes up, then "Welcome back".
   The action takes about two seconds; the welcome then holds for a couple more before it fades.
   The sound is made live with Web Audio, so there are no files to load: deep booms under the countdown, a
   crackling engine roar, a riser into one big hit, and a low chord under the welcome. Browsers only let a page
   make sound after a click, so when the first launch can't play sound yet it waits on a Launch button.
   Skip (Esc, or a tap) any time. Reduced motion: a short fade to the welcome. The bloom is one fade, never a strobe. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const $ = (id) => document.getElementById(id);
  const COLORS = ["#63f4ff", "#ff42d0", "#a855f7", "#ffc861", "#ffffff", "#73ffce"];
  const FADE = 0.6;                       // seconds the welcome takes to fade away

  /* the beats, in seconds from the start */
  const TIMING = {
    first: { counts: [0.12, 0.42, 0.72], ignite: 1.02, rise: [1.06, 1.72], warp: [1.42, 1.9], bloom: [1.74, 2.1], lock: 1.86, burst: 1.9, end: 4.3 },
    back: { counts: [], ignite: 0.1, rise: [0.14, 0.86], warp: [0.56, 1.0], bloom: [0.82, 1.14], lock: 0.9, burst: null, end: 3.3 }
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

    /* raw material, made once per audio context: stereo noises, rocket crackle, turbulence, a big dark hall */
    function buffers(c) {
      let b = store.get(c);
      if (b) return b;
      const rate = c.sampleRate, len = Math.floor(rate * 2);
      const white = c.createBuffer(2, len, rate), brown = c.createBuffer(2, len, rate), pink = c.createBuffer(2, len, rate);
      const crackle = c.createBuffer(2, len, rate), wobble = c.createBuffer(1, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const w = white.getChannelData(ch), br = brown.getChannelData(ch), pk = pink.getChannelData(ch), cr = crackle.getChannelData(ch);
        let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const x = Math.random() * 2 - 1;
          w[i] = x;
          last = (last + 0.02 * x) / 1.02;
          br[i] = last * 3.5;
          b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
          b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
          pk[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
          b6 = x * 0.115926;
        }
        // the crackle of a real rocket: sparse, lopsided shock pops
        for (let i = 0; ;) {
          i += 1 + Math.floor(-Math.log(1 - Math.random()) * rate / 320);
          if (i >= len) break;
          const a = (0.2 + Math.random() * 0.8) * (Math.random() < 0.12 ? 1.8 : 1), tau = 2 + Math.random() * 14;
          for (let k = 0; k < 48 && i + k < len; k++) cr[i + k] += a * Math.exp(-k / tau);
        }
      }
      // turbulence: a slow churn with a faster flutter on top
      const wb = wobble.getChannelData(0), slowEvery = Math.floor(rate / 9), fastEvery = Math.floor(rate / 33);
      let cur = 0, aim = 0, fast = 0, faim = 0;
      for (let i = 0; i < len; i++) {
        if (i % slowEvery === 0) aim = Math.random() * 2 - 1;
        if (i % fastEvery === 0) faim = Math.random() * 2 - 1;
        cur += (aim - cur) * (40 / rate);
        fast += (faim - fast) * (160 / rate);
        wb[i] = cur * 0.75 + fast * 0.35;
      }
      // a big, dark hall: the tail loses its top end as it dies away
      const irLen = Math.floor(rate * 3.4), ir = c.createBuffer(2, irLen, rate), pre = Math.floor(rate * 0.022);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let y = 0;
        for (let i = pre; i < irLen; i++) {
          const k = (i - pre) / (irLen - pre);
          y += (0.55 - 0.47 * k) * ((Math.random() * 2 - 1) - y);
          d[i] = y * Math.pow(1 - k, 2.2) * 1.6;
        }
        [0.031, 0.047, 0.066, 0.089].forEach((s, n) => { const j = Math.floor(rate * (s + ch * 0.004)); if (j < irLen) d[j] += 0.5 / (n + 1); });
      }
      const curve = (k) => { const a = new Float32Array(2048); for (let i = 0; i < 2048; i++) a[i] = Math.tanh((i / 1023.5 - 1) * k) / Math.tanh(k); return a; };
      // the safety clipper: clean up to 0.66, then rounds off smoothly to a ceiling of 0.95 (the curve covers -2..2)
      const clip = new Float32Array(4096);
      for (let i = 0; i < 4096; i++) { const x = (i / 4095) * 4 - 2, ax = Math.abs(x); clip[i] = ax <= 0.66 ? x : Math.sign(x) * (0.66 + 0.29 * Math.tanh((ax - 0.66) / 0.29)); }
      b = { white: white, brown: brown, pink: pink, crackle: crackle, wobble: wobble, ir: ir, warm: curve(1.6), hot: curve(4), clip: clip };
      store.set(c, b);
      return b;
    }

    /* one launch's worth of instruments, all feeding one bus so a skip can silence everything at once */
    function kit(c, dest) {
      const B = buffers(c);
      const LEVEL = 0.4;
      const bus = c.createGain();
      // no compressor: Web Audio's adds makeup gain and flattens every hit. Levels are set by hand,
      // and a soft clipper rounds off the odd peak instead
      const floor = c.createBiquadFilter();                    // nothing below 30 Hz: you can't hear it and it eats headroom
      floor.type = "highpass"; floor.frequency.value = 30; floor.Q.value = 0.7;
      const master = c.createGain();
      master.gain.value = LEVEL;
      const half = c.createGain();                             // the clip curve covers -2..2
      half.gain.value = 0.5;
      const clip = c.createWaveShaper();
      clip.curve = B.clip; clip.oversample = "4x";
      bus.connect(floor); floor.connect(master); master.connect(half); half.connect(clip); clip.connect(dest || c.destination);
      const rv = c.createConvolver();
      rv.buffer = B.ir;
      rv.connect(bus);

      const G = (v) => { const g = c.createGain(); g.gain.value = v === undefined ? 1 : v; return g; };
      const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
      const out = (node, wet) => { node.connect(bus); if (wet) { const s = G(wet); node.connect(s); s.connect(rv); } return node; };
      function osc(type, f, t, end) { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end); return o; }
      function src(buf, t, end, rate) { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate; s.start(t, Math.random() * 1.5); s.stop(end); return s; }
      function filt(type, f, q) { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
      function shaper(curve) { const w = c.createWaveShaper(); w.curve = curve; w.oversample = "2x"; return w; }
      // env(param, t, [[time, value, "exp"?], ...]): linear unless marked exp
      function env(p, t, pts) {
        p.setValueAtTime(pts[0][1], t + pts[0][0]);
        for (let i = 1; i < pts.length; i++) {
          const [dt, v, kind] = pts[i];
          if (kind === "exp") p.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + dt);
          else p.linearRampToValueAtTime(v, t + dt);
        }
      }
      function churn(t, end, depth, param) { chain(src(B.wobble, t, end), G(depth), param); }

      // under the countdown: a low hum, distant rumble, and a growl that powers up an octave (D1 to D2)
      function charge(t, dur) {
        const hum = out(G(0));
        env(hum.gain, t, [[0, 0], [0.35, 0.08], [dur, 0.11], [dur + 0.12, 0]]);
        osc("sine", 36.71, t, t + dur + 0.2).connect(hum);
        const tri = osc("triangle", 73.42, t, t + dur + 0.2); tri.detune.value = 5;
        chain(tri, filt("lowpass", 260), G(0.5), hum);
        const rum = out(G(0));
        env(rum.gain, t, [[0, 0], [dur, 0.2], [dur + 0.1, 0]]);
        chain(src(B.brown, t, t + dur + 0.2), filt("lowpass", 95, 0.9), rum);
        const growl = out(G(0.0001), 0.2);
        env(growl.gain, t, [[0, 0.0001], [dur, 0.2, "exp"], [dur + 0.05, 0.0001, "exp"]]);
        const lp = filt("lowpass", 110, 5);
        lp.frequency.setValueAtTime(110, t); lp.frequency.exponentialRampToValueAtTime(780, t + dur);
        chain(lp, shaper(B.warm), filt("lowpass", 1400), growl);
        [-11, 0, 8].forEach((d) => {
          const o = osc("sawtooth", 36.71, t, t + dur + 0.1);
          o.detune.value = d; o.frequency.exponentialRampToValueAtTime(73.42, t + dur);
          o.connect(lp);
        });
      }
      // a countdown hit: a deep kick, a dark thump and a low metal ring
      function hit(t, p) {
        const k = out(G(0));
        env(k.gain, t, [[0, 0], [0.004, 0.75 * p], [0.75, 0.0001, "exp"]]);
        const ko = osc("sine", 125, t, t + 0.8);
        ko.frequency.exponentialRampToValueAtTime(41, t + 0.24);
        chain(ko, shaper(B.hot), k);
        const body = out(G(0), 0.3);                             // the thud you hear on small speakers
        env(body.gain, t, [[0, 0], [0.004, 1.0 * p], [0.3, 0.0001, "exp"]]);
        const bo = osc("sine", 220, t, t + 0.35);
        bo.frequency.exponentialRampToValueAtTime(98, t + 0.14);
        chain(bo, shaper(B.hot), filt("lowpass", 1400), body);
        const th = out(G(0), 0.4);
        env(th.gain, t, [[0, 0], [0.006, 0.5 * p], [0.32, 0.0001, "exp"]]);
        const tl = filt("lowpass", 1100, 0.8);
        tl.frequency.setValueAtTime(1100, t); tl.frequency.exponentialRampToValueAtTime(160, t + 0.28);
        chain(src(B.white, t, t + 0.35, 0.6), tl, th);
        const ring = out(G(0), 0.55);
        env(ring.gain, t, [[0, 0], [0.01, 0.13 * p], [0.9, 0.0001, "exp"]]);
        [55, 131.2, 211.4].forEach((f, i) => chain(osc("sine", f, t, t + 1), G([1, 0.8, 0.5][i]), ring));
        const ck = out(G(0), 0.3);
        env(ck.gain, t, [[0, 0], [0.002, 1.2 * p], [0.05, 0.0001, "exp"]]);
        chain(src(B.white, t, t + 0.08), filt("bandpass", 1900, 0.9), ck);
        const skin = out(G(0), 0.45);                            // a taiko-like skin so it lands on laptop speakers too
        env(skin.gain, t, [[0, 0], [0.003, 6 * p], [0.22, 0.0001, "exp"]]);
        chain(src(B.pink, t, t + 0.25), filt("bandpass", 620, 0.8), shaper(B.warm), skin);
      }
      // ignition: a saturated sub boom, a roaring blast and the whoomp of the fuel catching
      function ignite(t, p) {
        const b = out(G(0));
        env(b.gain, t, [[0, 0], [0.006, 0.9 * p], [1.6, 0.0001, "exp"]]);
        const bo = osc("sine", 96, t, t + 2.4);
        bo.frequency.exponentialRampToValueAtTime(26, t + 1.5);
        chain(bo, shaper(B.hot), filt("lowpass", 420), b);
        const n = out(G(0), 0.38);
        env(n.gain, t, [[0, 0], [0.012, 0.9 * p], [1.6, 0.0001, "exp"]]);
        const nl = filt("lowpass", 7000, 0.6);
        nl.frequency.setValueAtTime(7000, t); nl.frequency.exponentialRampToValueAtTime(170, t + 1.7);
        chain(src(B.white, t, t + 2.1), shaper(B.warm), nl, n);
        const w = out(G(0.0001), 0.3);
        env(w.gain, t, [[0, 0.0001], [0.07, 0.65 * p, "exp"], [0.7, 0.0001, "exp"]]);
        chain(src(B.pink, t, t + 0.8), filt("bandpass", 230, 1.1), w);
        const cr = out(G(0), 0.35);
        env(cr.gain, t, [[0, 0], [0.004, 0.6 * p], [0.3, 0.0001, "exp"]]);
        chain(src(B.white, t, t + 0.35), filt("bandpass", 1500, 0.7), shaper(B.warm), cr);
      }
      // the engine: rumble, roar and crackle that churn, then fall away as the ship climbs out of sight
      function engine(t, dur, p, away) {
        const end = t + dur + 0.05;
        const o = out(G(0), 0.22);
        env(o.gain, t, [[0, 0], [0.16, 2.5 * p], [away, 2.5 * p], [dur, 0.0001, "exp"]]);   // filtered noise runs quiet, so it gets a lift
        const dist = filt("lowpass", 9000, 0.5);
        dist.frequency.setValueAtTime(9000, t + away); dist.frequency.exponentialRampToValueAtTime(650, t + dur);
        dist.connect(o);
        const rg = G(0.7), og = G(0.95), tg = G(0.55), cg = G(0.9);
        chain(src(B.brown, t, end), filt("lowpass", 150, 0.8), rg, dist);
        chain(src(B.pink, t, end, 0.9), filt("bandpass", 480, 0.45), shaper(B.warm), og, dist);
        chain(src(B.pink, t, end, 1.1), filt("bandpass", 1600, 0.6), shaper(B.warm), tg, dist);
        chain(src(B.crackle, t, end, 0.85 + Math.random() * 0.1), filt("highpass", 500), filt("bandpass", 2100, 0.65), shaper(B.warm), cg, dist);
        chain(src(B.white, t, end), filt("highpass", 5200), G(0.05), dist);
        chain(osc("sine", 38, t, end), G(0.15), dist);
        churn(t, end, 0.3, rg.gain); churn(t, end, 0.35, og.gain); churn(t, end, 0.3, tg.gain); churn(t, end, 0.55, cg.gain);
      }
      // the ship tearing past and away
      function whoosh(t, dur, p) {
        const g = out(G(0), 0.35);
        env(g.gain, t, [[0, 0], [dur * 0.55, 0.62 * p], [dur, 0]]);
        const bp = filt("bandpass", 170, 1.2);
        bp.frequency.setValueAtTime(170, t); bp.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(300, t + dur);
        chain(src(B.pink, t, t + dur + 0.05), bp, g);
      }
      // the jump: a low saw cluster climbing two octaves (D1 to D3) into the hit, with a reversed swell
      function jump(t, dur, p) {
        const g = out(G(0.0001), 0.25);
        env(g.gain, t, [[0, 0.0001], [dur, 0.36 * p, "exp"], [dur + 0.025, 0.0001, "exp"]]);
        const lp = filt("lowpass", 150, 6);
        lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
        chain(lp, shaper(B.hot), filt("lowpass", 4200), g);
        [-10, 0, 10].forEach((d) => {
          const o = osc("sawtooth", 36.71, t, t + dur + 0.05);
          o.detune.value = d; o.frequency.exponentialRampToValueAtTime(146.83, t + dur);
          o.connect(lp);
        });
        const s = out(G(0.0001));
        env(s.gain, t, [[0, 0.0001], [dur, 0.38 * p, "exp"], [dur + 0.02, 0.0001, "exp"]]);
        chain(src(B.white, t, t + dur + 0.05), filt("highpass", 380), filt("lowpass", 6500), s);
      }
      // the hit everyone feels: a distorted brass-like stack on D, a sub drop under it, a long dark tail
      function braam(t, p, hold, release) {
        const end = t + hold + release;
        const g = out(G(0), 0.45);
        env(g.gain, t, [[0, 0], [0.03, 0.9 * p], [0.5, 0.36 * p, "exp"], [Math.min(1.6, hold), 0.12 * p, "exp"], [hold + release, 0.0001, "exp"]]);
        const lp = filt("lowpass", 220, 2.2);
        lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(3600, t + 0.1);
        lp.frequency.exponentialRampToValueAtTime(1300, t + 0.8); lp.frequency.exponentialRampToValueAtTime(420, end);
        chain(lp, G(1.6), shaper(B.hot), filt("lowpass", 5000), g);
        [36.71, 73.42, 110, 146.83].forEach((f, i) => [-7, 7].forEach((d) => {
          const o = osc(i === 1 && d > 0 ? "square" : "sawtooth", f, t, end + 0.05);
          o.detune.setValueAtTime(d, t); o.detune.linearRampToValueAtTime(d - 35, end);
          chain(o, G([0.6, 0.75, 0.55, 0.45][i]), lp);
        }));
        const sub = out(G(0));
        env(sub.gain, t, [[0, 0], [0.01, 0.55 * p], [2.2, 0.0001, "exp"]]);
        const so = osc("sine", 62, t, t + 2.3);
        so.frequency.exponentialRampToValueAtTime(29, t + 2.0);
        chain(so, shaper(B.warm), sub);
        const k = out(G(0), 0.5);
        env(k.gain, t, [[0, 0], [0.003, 0.5 * p], [0.28, 0.0001, "exp"]]);
        chain(src(B.white, t, t + 0.3), filt("lowpass", 2600), k);
        const slam = out(G(0), 0.55);
        env(slam.gain, t, [[0, 0], [0.004, 1.8 * p], [0.45, 0.0001, "exp"]]);
        chain(src(B.pink, t, t + 0.45), filt("bandpass", 760, 0.7), shaper(B.warm), slam);
      }
      // the welcome: a warm, wide D chord low down that slowly opens, over a far-off rumble
      function pad(t, dur, p) {
        const g = out(G(0), 0.5);
        env(g.gain, t, [[0, 0], [0.7, 0.27 * p], [dur - 0.9, 0.27 * p], [dur, 0]]);
        const lp = filt("lowpass", 420, 1.1);
        lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(1500, t + 1.4); lp.frequency.linearRampToValueAtTime(800, t + dur);
        chain(osc("sine", 0.18, t, t + dur), G(140), lp.frequency);
        lp.connect(g);
        [73.42, 110, 146.83, 164.81, 220].forEach((f) => [-6, 6].forEach((d) => {
          const o = osc("sawtooth", f, t, t + dur + 0.05);
          o.detune.value = d;
          chain(o, G(0.22), lp);
        }));
        const sub = out(G(0));
        env(sub.gain, t, [[0, 0], [0.8, 0.12 * p], [dur, 0]]);
        osc("sine", 36.71, t, t + dur + 0.05).connect(sub);
        const r = out(G(0));
        env(r.gain, t, [[0, 0], [0.5, 0.08 * p], [dur, 0]]);
        chain(src(B.brown, t, t + dur + 0.05), filt("lowpass", 110), r);
      }
      function mute(m) { master.gain.cancelScheduledValues(c.currentTime); master.gain.setTargetAtTime(m ? 0 : LEVEL, c.currentTime, 0.03); }
      function stop(fade) {
        const now = c.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0, now, fade || 0.04);
        setTimeout(() => { try { master.disconnect(); } catch (e) { /* gone */ } }, ((fade || 0.04) * 6 + 0.1) * 1000);
      }
      return { charge, hit, ignite, engine, whoosh, jump, braam, pad, mute, stop };
    }

    /* the score, lined up with the picture */
    function score(K, base, mode) {
      const at = (x) => base + x;
      if (mode === "first" || mode === "back") {
        const T = TIMING[mode], first = mode === "first";
        const hold = T.end - T.bloom[0];                       // how long the welcome stays up
        if (first) {
          K.charge(at(0), T.ignite);
          T.counts.forEach((c, i) => K.hit(at(c), [0.45, 0.56, 0.68][i]));   // each boom bigger than the last
        }
        K.ignite(at(T.ignite), first ? 1 : 0.7);
        K.engine(at(T.ignite), T.bloom[0] - T.ignite + (first ? 0.55 : 0.5), first ? 0.95 : 0.85, T.rise[1] - T.ignite - 0.2);   // full roar until it's nearly out of sight, then room for the hit
        K.whoosh(at(T.rise[0] + (first ? 0.22 : 0.15)), T.rise[1] - T.rise[0] + (first ? 0.2 : 0.15), first ? 1 : 0.85);
        const jumpAt = first ? T.ignite + 0.2 : T.rise[0] + 0.25;
        K.jump(at(jumpAt), T.bloom[0] - jumpAt, first ? 1 : 0.8);
        K.braam(at(T.bloom[0]), first ? 1 : 0.95, hold * 0.45, hold * 0.55 + FADE + 0.6);
        K.pad(at(T.lock - 0.1), T.end - T.lock + FADE + 0.9, first ? 1 : 0.9);
      } else {                                               // reduced motion: just the welcome
        K.pad(at(0.05), 2.6, 0.9);
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
      root.style.setProperty("--fade", FADE + "s");
      root.hidden = false;
      root.removeAttribute("aria-hidden");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", "Staff Hub launch");
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      skipBtn.focus({ preventScroll: true });

      let finished = false, stopped = false, started = false, gated = false, raf = 0, K = null;
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
        window.removeEventListener("keydown", onKey);
        root.removeEventListener("click", onClick);
        window.removeEventListener("resize", size);
      }
      function finish(fast) {
        if (finished) return;
        finished = true;
        cleanup();
        if (fast) { stopped = true; cancelAnimationFrame(raf); }  // a natural end keeps drawing through the fade
        if (K && fast) K.stop(0.05);
        // let the last chord ring out, then let the sound card sleep
        const c = SFX.context();
        if (c) setTimeout(() => { if (root.hidden && c.state === "running" && c.suspend) c.suspend().catch(() => {}); }, fast ? 600 : 3600);
        const fade = fast ? 0.22 : FADE;
        root.style.setProperty("--fade", fade + "s");
        root.classList.add("fade-out");
        setTimeout(() => {
          stopped = true;
          cancelAnimationFrame(raf);
          root.hidden = true;
          root.setAttribute("aria-hidden", "true");
          root.classList.remove("fade-out", "gated");
          root.style.transform = "";
          gateBox.hidden = true;
          document.body.style.overflow = prevOverflow;
          const main = $("hub-main");
          if (main) main.focus({ preventScroll: true });
          resolve();
        }, fade * 1000 + 20);
      }
      function begin() {
        if (started || finished) return;
        started = true;
        const c = SFX.on() ? SFX.context() : null;              // sound off: don't wake the audio at all
        let base = 0;
        if (c && c.state === "running") {
          try {
            K = SFX.kit(c);                                     // made before the clock starts, so the picture and sound line up
            K.mute(!SFX.on());
            base = c.currentTime + 0.03;
            SFX.score(K, base, H.reduce ? "calm" : mode);
          } catch (e) { K = null; }
        }
        t0 = performance.now() + 30;
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
        setTimeout(() => finish(false), 2600);
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
            rot: rnd() * 6.28, vr: (rnd() - 0.5) * 14, r: 1.6 + rnd() * 2.4, life: 1.6 + rnd() * 1.0, age: 0, col: COLORS[i % COLORS.length] });
        }
      }

      function frame(now) {
        if (stopped) return;
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
          const boom = t - TL.bloom[0];
          if (boom >= 0 && boom < 0.45) shake = Math.max(shake, (mode === "first" ? 7 : 4) * (1 - boom / 0.45));
        }
        if (shake > 0.2) root.style.transform = "translate(" + ((rnd() - 0.5) * shake).toFixed(1) + "px," + ((rnd() - 0.5) * shake).toFixed(1) + "px) scale(1.02)";
        else if (root.style.transform) root.style.transform = "";

        // stars: stretch into the warp, then settle to a cruise while the welcome holds
        const warp = t < TL.warp[0] ? 0 : Math.min(1, (t - TL.warp[0]) / (TL.warp[1] - TL.warp[0]));
        const cruise = t > TL.warp[1] ? Math.min(1, (t - TL.warp[1]) / 1.4) : 0;
        const speed = warp * (1 - 0.72 * cruise);
        g2.fillStyle = warp > 0 ? "rgba(0,0,0,0.35)" : "#000";
        g2.fillRect(0, 0, W, Hh);
        const fadeIn = Math.min(1, life / 0.3);
        for (const s of stars) {
          if (warp > 0) s.z -= dt * (0.25 + speed * 2.8);
          if (s.z <= 0.02) { s.x = (rnd() - 0.5) * 2; s.y = (rnd() - 0.5) * 2; s.z = 1; }
          const k = 0.55 / s.z;
          const x = cx + s.x * W * 0.5 * k, y = cy + s.y * Hh * 0.5 * k;
          g2.globalAlpha = s.a * fadeIn * Math.min(1, (1.05 - s.z) * 2);
          if (warp > 0) {
            const k2 = 0.55 / Math.min(1, s.z + 0.04 + speed * 0.12);
            g2.strokeStyle = "#cffcff"; g2.lineWidth = 1 + speed;
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

        // the welcome lands (with confetti the first time), holds, then fades
        if (t >= TL.lock && !shown.lock) {
          shown.lock = true;
          lock.style.opacity = "";
          lock.classList.add("show");
        }
        if (TL.burst !== null && t >= TL.burst && !shown.burst) { shown.burst = true; confetti(cx, cy - 30); }
        if (t >= TL.end && !finished) finish(false);
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

  H.launch = { play: play, sfx: SFX, timing: TIMING, fade: FADE };
})();
