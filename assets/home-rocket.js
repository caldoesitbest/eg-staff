/* The hero rocket.
   It loops forever: lifts off, slips behind the blue planet, swings back round in front and flies back up to its spot.
   Click a link in the top menu and it flies into that link and blows up. A fresh rocket warps in at home. */
(function () {
  "use strict";

  const hero = document.querySelector(".hero");
  const art = document.getElementById("hero-art");
  const home = document.getElementById("rocket-home");
  const layer = document.getElementById("rocket-layer");    // inside the hero, under the headline (hero coordinates)
  const topLayer = document.getElementById("rocket-top");   // fixed above everything, for the attack run (screen coordinates)
  if (!hero || !art || !home || !layer || !topLayer) return;

  const NS = "http://www.w3.org/2000/svg";
  const byId = (id) => document.getElementById(id);
  const ship = byId("rk-ship");
  const shipWrap = byId("rk-ship-wrap");
  const clipPath = byId("rk-clip-path");   // everything except the planet: whatever uses it looks hidden behind the planet
  const warpG = byId("rk-warp");
  const fxG = byId("rk-fx");
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const PLANET = { x: 0.5, y: 0.2782, r: 0.3125 };  // the blue planet in the hero art: centre (share of width, height), radius (share of width)
  const HOVER = 1.6;         // seconds parked at home between loops
  const TRAIL_LIFE = 0.55;   // seconds a puff of exhaust lasts
  const REACH = 58;          // rocket centre to nose / flame tip at full size, in px
  const PARK = 38;           // parked heading, degrees clockwise from straight up

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const turn = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;      // blend two headings the short way round
  const headingOf = (dx, dy) => (Math.atan2(dy, dx) * 180) / Math.PI + 90;       // 0 = nose up, clockwise

  /* ---------- the loop ----------
     u, v: where to fly, in planet radii from the planet's centre (v down). s: size, smaller = further away.
     b: hidden behind the planet from this point to the next. Each switch happens clear of the planet's edge. */
  const ROUTES = {
    wide: [
      { v: -0.1, s: 0.62, b: true, edge: -1 },
      { u: -0.35, v: 0.02, s: 0.46, b: true },
      { u: 0.55, v: 0.15, s: 0.42, b: true },
      { v: 0.32, s: 0.52, edge: 1 },
      { u: 1.12, v: 0.86, s: 0.74 },
      { u: 0.86, v: 1.3, s: 1.0 },
      { u: 0.0, v: 1.44, s: 1.2 },
      { u: -0.95, v: 1.3, s: 1.25 },
      { u: -1.25, v: 0.8, s: 1.16 }
    ],
    phone: [
      { v: 0.0, s: 0.62, b: true, edge: -1 },
      { u: -0.35, v: 0.06, s: 0.46, b: true },
      { u: 0.55, v: 0.16, s: 0.42, b: true },
      { v: 0.3, s: 0.52, edge: 1 },
      { u: 0.98, v: 0.95, s: 0.72 },
      { u: 0.55, v: 1.3, s: 0.95 },
      { u: -0.2, v: 1.4, s: 1.1 },
      { u: -0.95, v: 1.25, s: 1.15 }
    ]
  };
  // where the rocket parks: left of the planet, a little above its middle (phones use the spot set in home.css)
  const PARK_AT = { u: -1.8, v: -0.2 };

  let L = null, path = null;
  function measure() {
    const r = hero.getBoundingClientRect();
    L = {
      x0: r.left + window.scrollX, y0: r.top + window.scrollY, h: hero.offsetHeight,
      ax: art.offsetLeft, ay: art.offsetTop, aw: art.offsetWidth, ah: art.offsetHeight,
      base: home.offsetHeight / 120 || 1,
      phone: window.innerWidth < 760
    };
    if (L.phone) {
      L.S = { x: home.offsetLeft + home.offsetWidth / 2, y: home.offsetTop + home.offsetHeight / 2 };
    } else {
      const C = planetAt({ tx: 0, ty: 0 });
      L.S = { x: C.x + PARK_AT.u * C.r, y: Math.max(C.y + PARK_AT.v * C.r, 140 * L.base) };
    }
    path = null;
  }
  const origin = () => ({ x: L.x0 - window.scrollX, y: L.y0 - window.scrollY });   // the hero's top left on screen
  const artOff = () => (window.EG_HOME_API && window.EG_HOME_API.art ? window.EG_HOME_API.art() : { tx: 0, ty: 0 });
  const planetAt = (off) => ({ x: L.ax + off.tx + PLANET.x * L.aw, y: L.ay + off.ty + PLANET.y * L.ah, r: PLANET.r * L.aw });
  const heroOnScreen = () => { const o = origin(); return o.y + L.h > 0 && o.y < window.innerHeight; };

  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  // Sample the route as one smooth closed curve, then time it so the rocket eases off home, moves faster when
  // it's closer (bigger) and eases back in. w = how much a point rides along with the art's parallax.
  function buildPath() {
    const C = planetAt({ tx: 0, ty: 0 }), R = C.r, b = L.base, S = L.S;
    const way = [{ x: S.x, y: S.y, s: 1, w: 0 }, { x: S.x + 46 * b, y: S.y - 46 * b, s: 0.9, w: 0 }];
    for (const p of ROUTES[L.phone ? "phone" : "wide"]) {
      // "edge" points sit just clear of the planet's rim, so the switch to/from hidden never shows
      const u = p.edge ? p.edge * (Math.sqrt(1 - p.v * p.v) + (REACH * p.s * b + 6) / R) : p.u;
      way.push({ x: C.x + u * R, y: C.y + p.v * R, s: p.s, w: 1, b: !!p.b });
    }
    way.push({ x: S.x - 6 * b, y: S.y + 96 * b, s: 1.05, w: 0 });
    const n = way.length, W = (j) => way[(j + n) % n], STEPS = 30;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = W(i - 1), p = W(i), q = W(i + 1), d = W(i + 2);
      for (let k = 0; k < STEPS; k++) {
        const t = k / STEPS;
        pts.push({
          x: cr(a.x, p.x, q.x, d.x, t), y: cr(a.y, p.y, q.y, d.y, t),
          s: clamp(cr(a.s, p.s, q.s, d.s, t), Math.min(p.s, q.s), Math.max(p.s, q.s)),
          w: clamp(cr(a.w, p.w, q.w, d.w, t), 0, 1),
          b: !!p.b
        });
      }
    }
    pts.push({ x: S.x, y: S.y, s: 1, w: 0, b: false });
    const m = pts.length;
    let len = 0;
    for (let i = 0; i < m; i++) {
      const p = pts[i], prev = pts[Math.max(0, i - 1)], next = pts[Math.min(m - 1, i + 1)];
      p.h = headingOf(next.x - prev.x, next.y - prev.y);
      if (i) len += Math.hypot(p.x - prev.x, p.y - prev.y);
      p.a = len;
    }
    const V = (L.phone ? 270 : 360) * Math.max(0.75, b), A = 150 * b, D = 240 * b;
    let t = 0;
    for (let i = 0; i < m; i++) {
      const p = pts[i];
      const ramp = Math.sqrt(clamp(p.a / A, 0.012, 1)) * Math.sqrt(clamp((len - p.a) / D, 0.012, 1));
      p.v = V * (0.5 + 0.6 * p.s) * (p.b ? (L.phone ? 3 : 2.3) : 1) * ramp;     // nobody sees the hidden stretch, so hurry through it
      p.cruise = ramp;
      if (i) t += (p.a - pts[i - 1].a) / ((p.v + pts[i - 1].v) / 2);
      p.t = t;
    }
    return { pts: pts, T: t, len: len, A: A, D: D };
  }
  function sample(tt) {
    const P = path.pts;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].t <= tt) lo = mid; else hi = mid; }
    const p = P[lo], q = P[hi], f = clamp((tt - p.t) / ((q.t - p.t) || 1), 0, 1);
    const a = lerp(p.a, q.a, f);
    let h = turn(p.h, q.h, f);
    h = turn(PARK, h, smooth(clamp(a / (path.A * 1.4), 0, 1)));               // lift off from the parked pose
    h = turn(PARK, h, smooth(clamp((path.len - a) / (path.D * 1.2), 0, 1)));  // settle back into it
    return { x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), s: lerp(p.s, q.s, f), w: lerp(p.w, q.w, f), h: h, b: p.b, cruise: lerp(p.cruise, q.cruise, f) };
  }

  /* ---------- drawing the rocket ---------- */
  let shipIn = "hero", clipped = null, thrustNow = -1;
  function moveShip(to) {
    if (shipIn === to) return;
    shipIn = to;
    if (to === "top") topLayer.insertBefore(shipWrap, fxG); else layer.appendChild(shipWrap);
  }
  function setBehind(on) {
    if (on === clipped) return;
    clipped = on;
    if (on) shipWrap.setAttribute("clip-path", "url(#rk-clip)"); else shipWrap.removeAttribute("clip-path");
  }
  function placeShip(x, y, h, sc, alpha) {
    ship.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + h.toFixed(1) + ") scale(" + Math.max(0.001, sc).toFixed(3) + ")");
    ship.setAttribute("opacity", alpha);
  }
  function setThrust(v) {
    if (Math.abs(v - thrustNow) < 0.03) return;
    thrustNow = v;
    ship.style.setProperty("--thrust", v.toFixed(2));
  }

  /* ---------- exhaust trail ----------
     Points live TRAIL_LIFE seconds. Neighbouring points in the same layer are drawn as one tapered ribbon
     (plus a wider, fainter halo), coloured by age: white-hot at the nozzle, then cyan, magenta, gone. */
  const trail = [];
  const TRAIL_SVG = { back: layer, front: layer, top: topLayer };
  const ribbons = {};
  let gradN = 0;
  for (const key in TRAIL_SVG) {
    const defs = TRAIL_SVG[key].querySelector("defs"), g = byId("rk-trail-" + key);
    ribbons[key] = [];
    for (let i = 0; i < 3; i++) {
      const grad = document.createElementNS(NS, "linearGradient");
      grad.id = "rk-tg" + gradN++;
      grad.setAttribute("gradientUnits", "userSpaceOnUse");
      [[0, "#a855f7", 0], [0.4, "#ff42d0", 0.55], [0.78, "#63f4ff", 0.9], [1, "#f2ffff", 1]].forEach((st) => {
        const stop = document.createElementNS(NS, "stop");
        stop.setAttribute("offset", st[0]); stop.setAttribute("stop-color", st[1]); stop.setAttribute("stop-opacity", st[2]);
        grad.appendChild(stop);
      });
      defs.appendChild(grad);
      const halo = document.createElementNS(NS, "path"), core = document.createElementNS(NS, "path");
      halo.setAttribute("fill", "url(#" + grad.id + ")"); halo.setAttribute("opacity", "0.22");
      core.setAttribute("fill", "url(#" + grad.id + ")");
      g.appendChild(halo); g.appendChild(core);
      ribbons[key].push({ grad: grad, halo: halo, core: core, on: false });
    }
  }
  // space "hero": x, y are hero coordinates at rest, plus w x the art's parallax. space "top": screen coordinates.
  function emit(x, y, h, sc, behind, space, w, off, now, wide) {
    const r = (h * Math.PI) / 180, back = 50 * sc;
    const nx = x - Math.sin(r) * back, ny = y + Math.cos(r) * back;
    const p = { x: nx - w * off.tx, y: ny - w * off.ty, w: w, t: now, sc: sc, behind: behind, space: space, wide: wide };
    const last = trail[trail.length - 1];
    if (last && last.space === space && Math.hypot(last.x - p.x, last.y - p.y) < 1.5) return;
    trail.push(p);
  }
  const keyOf = (p) => (p.space === "top" ? "top" : p.behind ? "back" : "front");
  const far = (p, q, off) => Math.hypot(q.x + q.w * off.tx - p.x - p.w * off.tx, q.y + q.w * off.ty - p.y - p.w * off.ty) > 140;
  function drawTrail(now, off) {
    while (trail.length && now - trail[0].t > TRAIL_LIFE) trail.shift();
    const used = { back: 0, front: 0, top: 0 };
    let i = 0;
    while (i < trail.length) {
      const key = keyOf(trail[i]);
      let j = i + 1;
      while (j < trail.length && keyOf(trail[j]) === key && !far(trail[j - 1], trail[j], off)) j++;
      // borrow the point before when it joins on smoothly, so a switch of layer leaves no gap
      const from = i > 0 && trail[i - 1].space === trail[i].space && !far(trail[i - 1], trail[i], off) ? i - 1 : i;
      if (j - from >= 2) ribbon(key, from, j, now, off, used);
      i = j;
    }
    for (const key in ribbons) {
      for (let k = used[key]; k < ribbons[key].length; k++) {
        const r = ribbons[key][k];
        if (r.on) { r.on = false; r.core.setAttribute("d", ""); r.halo.setAttribute("d", ""); }
      }
    }
  }
  function ribbon(key, a, b, now, off, used) {
    const r = ribbons[key][used[key]];
    if (!r) return;
    used[key]++;
    r.on = true;
    const m = b - a, X = [], Y = [], K = [], Wd = [];
    for (let k = 0; k < m; k++) {
      const p = trail[a + k];
      X.push(p.x + p.w * off.tx); Y.push(p.y + p.w * off.ty);
      K.push(Math.max(0, 1 - (now - p.t) / TRAIL_LIFE));
      Wd.push(p.wide * Math.pow(K[k], 1.25) * p.sc);
    }
    let cl = "", cr2 = "", hl = "", hr = "";
    for (let k = 0; k < m; k++) {
      const k0 = Math.max(0, k - 1), k1 = Math.min(m - 1, k + 1);
      const dx = X[k1] - X[k0], dy = Y[k1] - Y[k0], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d, w = Wd[k], hw = w * 2.3 + 1;
      const cmd = k ? "L" : "M";
      cl += cmd + (X[k] + nx * w).toFixed(1) + " " + (Y[k] + ny * w).toFixed(1);
      cr2 = "L" + (X[k] - nx * w).toFixed(1) + " " + (Y[k] - ny * w).toFixed(1) + cr2;
      hl += cmd + (X[k] + nx * hw).toFixed(1) + " " + (Y[k] + ny * hw).toFixed(1);
      hr = "L" + (X[k] - nx * hw).toFixed(1) + " " + (Y[k] - ny * hw).toFixed(1) + hr;
    }
    r.core.setAttribute("d", cl + cr2 + "Z");
    r.halo.setAttribute("d", hl + hr + "Z");
    // colour by age: stretch the gradient so the oldest point gets its age's colour and the newest gets its own
    const span = K[m - 1] - K[0], ex = X[m - 1] - X[0], ey = Y[m - 1] - Y[0];
    let x1 = X[0], y1 = Y[0], x2 = X[m - 1], y2 = Y[m - 1];
    if (span > 0.02) { x1 = X[0] - (ex * K[0]) / span; y1 = Y[0] - (ey * K[0]) / span; x2 = X[0] + (ex * (1 - K[0])) / span; y2 = Y[0] + (ey * (1 - K[0])) / span; }
    r.grad.setAttribute("x1", x1.toFixed(1)); r.grad.setAttribute("y1", y1.toFixed(1));
    r.grad.setAttribute("x2", x2.toFixed(1)); r.grad.setAttribute("y2", y2.toFixed(1));
  }

  /* ---------- particles (explosion, warp) ---------- */
  const parts = [];
  function spawn(group, tag, attrs, life, update, delay) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    el.setAttribute("opacity", 0);
    group.appendChild(el);
    parts.push({ el: el, life: life, age: -(delay || 0), update: update });
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (k >= 1) { p.el.remove(); parts.splice(i, 1); continue; }
      p.update(p.el, k, dt);
    }
  }
  const SPARK = ["#ffffff", "#9ff9ff", "#63f4ff", "#ff42d0", "#ffc861", "#f5f0e6", "#c9b8ff"];
  function boom(x, y) {
    spawn(fxG, "circle", { cx: x, cy: y, r: 4, fill: "url(#rk-flash)" }, 0.42, (el, k) => {
      el.setAttribute("r", (8 + 70 * Math.min(1, k * 3)).toFixed(1));
      el.setAttribute("opacity", (k < 0.22 ? 1 : (1 - k) / 0.78).toFixed(3));
    });
    spawn(fxG, "circle", { cx: x, cy: y, r: 6, fill: "url(#rk-fire)" }, 0.7, (el, k) => {
      el.setAttribute("r", (10 + 38 * (1 - Math.pow(1 - k, 3))).toFixed(1));
      el.setAttribute("opacity", Math.min(1, (1 - k) * (1 - k) * 1.3).toFixed(3));
    });
    // starburst: sharp rays that shoot out and vanish
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5, len = 55 + Math.random() * 60;
      spawn(fxG, "line", { stroke: i % 3 ? "#e6feff" : "#ff8ae6", "stroke-width": i % 2 ? 2.2 : 3.2, "stroke-linecap": "round" }, 0.26, (el, k) => {
        const r1 = 6 + len * (1 - Math.pow(1 - k, 2)), r0 = 6 + len * Math.max(0, k * 1.4 - 0.4);
        el.setAttribute("x1", (x + Math.cos(a) * r0).toFixed(1)); el.setAttribute("y1", (y + Math.sin(a) * r0).toFixed(1));
        el.setAttribute("x2", (x + Math.cos(a) * r1).toFixed(1)); el.setAttribute("y2", (y + Math.sin(a) * r1).toFixed(1));
        el.setAttribute("opacity", (1 - k * k).toFixed(3));
      });
    }
    [["#9ff9ff", 112, 0, 3.6], ["#ff42d0", 78, 0.06, 2.8], ["#ffffff", 150, 0.02, 1.3]].forEach((ring) => {
      spawn(fxG, "circle", { cx: x, cy: y, r: 4, fill: "none", stroke: ring[0] }, 0.62, (el, k) => {
        const e = 1 - Math.pow(1 - k, 3);
        el.setAttribute("r", (4 + (ring[1] - 4) * e).toFixed(1));
        el.setAttribute("stroke-width", (ring[3] * (1 - k) + 0.3).toFixed(2));
        el.setAttribute("opacity", (0.95 * (1 - k)).toFixed(3));
      }, ring[2]);
    });
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = 240 + Math.random() * 480;
      const s = { x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.85 + 40 };
      spawn(fxG, "line", { stroke: SPARK[i % SPARK.length], "stroke-width": i % 3 ? 2 : 2.8, "stroke-linecap": "round" }, 0.5 + Math.random() * 0.55, (el, k, dt) => {
        s.vx *= Math.exp(-2.6 * dt); s.vy = s.vy * Math.exp(-2.6 * dt) + 560 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        el.setAttribute("x1", s.x.toFixed(1)); el.setAttribute("y1", s.y.toFixed(1));
        el.setAttribute("x2", (s.x - s.vx * 0.035).toFixed(1)); el.setAttribute("y2", (s.y - s.vy * 0.035).toFixed(1));
        el.setAttribute("opacity", (1 - k).toFixed(3));
      });
    }
    const HULL = ["#f5f0e6", "#ff42d0", "#a855f7", "#63f4ff", "#f5f0e6", "#6d28d9"];
    HULL.forEach((fill, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8, sp = 150 + Math.random() * 230;
      const s = { x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 1000 };
      const w = 5 + Math.random() * 5, h = 8 + Math.random() * 7;
      spawn(fxG, "rect", { width: w.toFixed(1), height: h.toFixed(1), rx: 1.5, fill: fill, stroke: "#10132e", "stroke-width": 1.2 }, 1.25, (el, k, dt) => {
        s.vx *= Math.exp(-0.8 * dt); s.vy += 720 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        el.setAttribute("transform", "translate(" + s.x.toFixed(1) + " " + s.y.toFixed(1) + ") rotate(" + s.rot.toFixed(0) + ") translate(" + (-w / 2).toFixed(1) + " " + (-h / 2).toFixed(1) + ")");
        el.setAttribute("opacity", Math.min(1, (1 - k) * 2.5).toFixed(3));
      }, i * 0.01);
    });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = { x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * 36, vy: Math.sin(a) * 26 + 12, max: 16 + Math.random() * 14 };
      spawn(fxG, "circle", { fill: "url(#rk-smoke)", r: 4 }, 0.9 + Math.random() * 0.35, (el, k, dt) => {
        s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.exp(-1.5 * dt); s.vy = s.vy * Math.exp(-1.5 * dt) - 14 * dt;
        el.setAttribute("cx", s.x.toFixed(1)); el.setAttribute("cy", s.y.toFixed(1));
        el.setAttribute("r", (6 + s.max * (1 - Math.pow(1 - k, 2))).toFixed(1));
        el.setAttribute("opacity", ((1 - k) * 0.8).toFixed(3));
      }, 0.05 + i * 0.03);
    }
  }
  function warpIn(x, y) {
    const b = L.base;
    spawn(warpG, "ellipse", { cx: x, cy: y, rx: 2, ry: 80 * b, fill: "url(#rk-warp-g)" }, 0.5, (el, k) => {
      el.setAttribute("rx", (2 + 9 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * b).toFixed(1));
      el.setAttribute("ry", ((80 + 50 * k) * b).toFixed(1));
      el.setAttribute("opacity", (1 - k).toFixed(3));
    });
    spawn(warpG, "circle", { cx: x, cy: y, r: 4, fill: "none", stroke: "#9ff9ff" }, 0.62, (el, k) => {
      el.setAttribute("r", (4 + 52 * b * (1 - Math.pow(1 - k, 2))).toFixed(1));
      el.setAttribute("stroke-width", (2.8 * (1 - k) + 0.3).toFixed(2));
      el.setAttribute("opacity", (1 - k).toFixed(3));
    }, 0.12);
    spawn(warpG, "circle", { cx: x, cy: y, r: 2, fill: "url(#rk-warp-g)" }, 0.42, (el, k) => {
      el.setAttribute("r", (34 * b * Math.sin(Math.PI * k)).toFixed(1));
      el.setAttribute("opacity", (1 - k * 0.6).toFixed(3));
    }, 0.1);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3, r0 = (54 + Math.random() * 26) * b;
      spawn(warpG, "line", { stroke: i % 2 ? "#9ff9ff" : "#ffffff", "stroke-width": 1.6, "stroke-linecap": "round" }, 0.36, (el, k) => {
        const r1 = r0 * (1 - k * k), r2 = r0 * (1 - Math.min(1, k * k + 0.25));
        el.setAttribute("x1", (x + Math.cos(a) * r1).toFixed(1)); el.setAttribute("y1", (y + Math.sin(a) * r1).toFixed(1));
        el.setAttribute("x2", (x + Math.cos(a) * Math.max(0, r2)).toFixed(1)); el.setAttribute("y2", (y + Math.sin(a) * Math.max(0, r2)).toFixed(1));
        el.setAttribute("opacity", Math.sin(Math.PI * k).toFixed(3));
      });
    }
  }
  function hit(link) {
    const nav = byId("nav");
    link.classList.remove("nav-hit");
    if (nav) nav.classList.remove("jolt");
    void link.offsetWidth;                                  // restart the animations
    link.classList.add("nav-hit");
    if (nav) nav.classList.add("jolt");
    setTimeout(() => { link.classList.remove("nav-hit"); if (nav) nav.classList.remove("jolt"); }, 800);
  }

  /* ---------- the attack run ---------- */
  let state = "loop";           // loop | escape | strike | boom | warp
  let tLoop = 0, stateT = 0;
  let cur = { x: 0, y: 0, h: PARK, sc: 1, behind: false, shown: false, hero: false };   // where the rocket is (hero: x, y are hero coordinates)
  let atk = null, pending = null;           // pending: where the clicked link goes, once the rocket hits it
  function go(p) {
    if (p.href) { window.location.href = p.href; return; }
    const el = document.getElementById(decodeURIComponent(p.hash.slice(1)));
    if (window.location.hash !== p.hash) window.location.hash = p.hash;   // a real jump to the section (smooth, per the CSS)
    else if (el) el.scrollIntoView({ behavior: "smooth" });
  }
  const bez = (P, t, k) => { const u = 1 - t; return u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]; };
  const bezD = (P, t, k) => { const u = 1 - t; return 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]); };

  function launchAt(link) {
    if (!L) measure();
    const r = link.getBoundingClientRect();
    const T = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const o = origin(), off = artOff(), C = planetAt(off);
    const W = window.innerWidth, H = window.innerHeight;
    const sx = cur.hero ? cur.x + o.x : cur.x, sy = cur.hero ? cur.y + o.y : cur.y;   // on screen right now
    const inView = cur.shown && heroOnScreen() && sy > 60 && sy < H + 30 && sx > -90 && sx < W + 90;
    atk = { T: T, link: link };
    if (inView && cur.behind) {
      // behind the planet: burst out of the nearest edge that's on screen first
      const hx = sx - o.x, hy = sy - o.y;
      const dy = clamp(hy - C.y, -C.r * 0.9, C.r * 0.9);
      const half = Math.sqrt(C.r * C.r - dy * dy) + REACH * cur.sc + 8;
      const rightOk = C.x + half + o.x < W - 24, leftOk = C.x - half + o.x > 24;
      let side = hx >= C.x ? 1 : -1;
      if (side > 0 && !rightOk && leftOk) side = -1;
      if (side < 0 && !leftOk && rightOk) side = 1;
      const ex = C.x + side * half;
      atk.a = { x: hx - off.tx, y: hy - off.ty };
      atk.b = { x: ex - off.tx, y: C.y + dy - off.ty };
      atk.h = side > 0 ? 90 : -90;
      atk.sc = cur.sc;
      atk.dur = clamp(Math.abs(ex - hx) / 1600, 0.12, 0.26);
      state = "escape"; stateT = 0;
    } else if (inView) {
      strike({ x: sx, y: sy }, cur.h, cur.sc);
    } else {
      // no rocket in view (scrolled away, or it just blew up): a fresh one comes up from below
      strike({ x: clamp(T.x - 180, 40, W - 40), y: H + 90 }, 18, L.base * 0.95);
    }
    ensureRunning();
  }
  function strike(P0, h0, sc0) {
    // carry the exhaust over to the top layer so the trail doesn't break
    const last = trail[trail.length - 1];
    if (last && last.space === "hero") {
      const o = origin(), off = artOff();
      trail.push({ x: last.x + last.w * off.tx + o.x, y: last.y + last.w * off.ty + o.y, w: 0, t: last.t, sc: last.sc, behind: false, space: "top", wide: last.wide });
    }
    moveShip("top");
    setBehind(false);
    const T = atk.T, d = Math.hypot(T.x - P0.x, T.y - P0.y);
    const rad = (h0 * Math.PI) / 180;
    const lead = clamp(d * 0.35, 40, 170);
    atk.P = [
      P0,
      { x: P0.x + Math.sin(rad) * lead, y: P0.y - Math.cos(rad) * lead },
      { x: T.x + (P0.x < T.x ? -30 : 30), y: T.y + Math.min(210, d * 0.55) },
      T
    ];
    atk.dur = clamp(0.3 + d / 2600, 0.34, 0.62);
    atk.sc = sc0;
    state = "strike"; stateT = 0;
  }

  /* ---------- the frame loop ---------- */
  let running = false, lastT = 0;
  function frame(ms) {
    if (!running) return;
    const now = ms / 1000;
    const dt = Math.min(0.05, lastT ? now - lastT : 1 / 60);
    lastT = now;
    const off = artOff(), o = origin(), C = planetAt(off), onScreen = heroOnScreen();
    const cx = C.x.toFixed(1), cy = C.y.toFixed(1), r = C.r.toFixed(1), d2 = (2 * C.r).toFixed(1);
    clipPath.setAttribute("d", "M-9999 -9999H19999V19999H-9999ZM" + (C.x - C.r).toFixed(1) + " " + cy + "a" + r + " " + r + " 0 1 0 " + d2 + " 0a" + r + " " + r + " 0 1 0 -" + d2 + " 0Z");
    stateT += dt;

    if (state === "loop") {
      if (!path) path = buildPath();
      if (onScreen) tLoop += dt;
      if (tLoop >= HOVER + path.T) tLoop -= HOVER + path.T;
      let x, y, h, sc, behind = false, thrust;
      if (tLoop < HOVER) {
        const k = tLoop / HOVER, spool = clamp((tLoop - HOVER + 0.45) / 0.45, 0, 1);
        x = L.S.x; y = L.S.y - Math.sin(Math.PI * k) * 5 * L.base;
        h = PARK + Math.sin(2 * Math.PI * k) * 2.5;
        sc = L.base;
        thrust = 0.8 + spool * 0.9;
        if (spool > 0) { x += (Math.random() - 0.5) * spool * 1.4; y += (Math.random() - 0.5) * spool * 1.4; }
      } else {
        const q = sample(tLoop - HOVER);
        x = q.x + q.w * off.tx; y = q.y + q.w * off.ty;
        h = q.h; sc = q.s * L.base; behind = q.b;
        thrust = 1.1 + 0.6 * q.cruise;
        emit(x, y, h, sc, behind, "hero", q.w, off, now, 4.5);
      }
      setBehind(behind);
      placeShip(x, y, h, sc, 1);
      setThrust(thrust);
      cur = { x: x, y: y, h: h, sc: sc, behind: behind, shown: onScreen, hero: true };
    } else if (state === "escape") {
      const t = Math.min(1, stateT / atk.dur), e = t * t;
      const x = lerp(atk.a.x, atk.b.x, e) + off.tx, y = lerp(atk.a.y, atk.b.y, e) + off.ty;
      setBehind(true);
      placeShip(x, y, atk.h, atk.sc, 1);
      setThrust(2);
      emit(x, y, atk.h, atk.sc, true, "hero", 1, off, now, 6);
      cur = { x: x, y: y, h: atk.h, sc: atk.sc, behind: true, shown: true, hero: true };
      if (t >= 1) strike({ x: x + o.x, y: y + o.y }, atk.h, atk.sc);
    } else if (state === "strike") {
      const t = Math.min(1, stateT / atk.dur), e = t * (0.25 + 0.75 * t);   // speeds up into the hit
      const P = atk.P, x = bez(P, e, "x"), y = bez(P, e, "y");
      const h = headingOf(bezD(P, Math.max(e, 0.001), "x"), bezD(P, Math.max(e, 0.001), "y"));
      const sc = lerp(atk.sc, L.base * 1.05, e);
      placeShip(x, y, h, sc, 1);
      setThrust(2.3);
      emit(x, y, h, sc, false, "top", 0, off, now, 6);
      cur = { x: x, y: y, h: h, sc: sc, behind: false, shown: true, hero: false };
      if (t >= 1) {
        placeShip(x, y, h, sc, 0);
        cur.shown = false;
        boom(atk.T.x, atk.T.y);
        hit(atk.link);
        state = "boom"; stateT = 0;
        if (pending) { const p = pending; pending = null; setTimeout(() => go(p), p.hash ? 170 : 260); }
      }
    } else if (state === "boom") {
      if (stateT > 0.85) { state = "warp"; stateT = 0; moveShip("hero"); setBehind(false); warpIn(L.S.x, L.S.y); }
    } else if (state === "warp") {
      const k = clamp(stateT / 0.55, 0, 1);
      const pop = (1 - Math.pow(1 - k, 3)) * (1 + 0.3 * Math.sin(k * Math.PI));
      placeShip(L.S.x, L.S.y, PARK, L.base * pop, clamp(k * 2.2, 0, 1));
      setThrust(0.9);
      cur = { x: L.S.x, y: L.S.y, h: PARK, sc: L.base * pop, behind: false, shown: onScreen && k > 0.3, hero: true };
      if (k >= 1) { state = "loop"; stateT = 0; tLoop = 0; }
    }

    drawTrail(now, off);
    drawParts(dt);
    // rest when there's nothing to see
    if (state === "loop" && !onScreen && !trail.length && !parts.length) { running = false; lastT = 0; return; }
    requestAnimationFrame(frame);
  }
  function ensureRunning() {
    if (running || reduce || document.hidden) return;
    running = true; lastT = 0;
    requestAnimationFrame(frame);
  }

  /* ---------- wiring ---------- */
  measure();
  if (reduce) {
    // no motion: the rocket just sits at home
    const still = () => { measure(); placeShip(L.S.x, L.S.y, PARK, L.base, 1); };
    still();
    window.addEventListener("resize", still);
    window.addEventListener("load", still);
    return;
  }
  const remeasure = () => { measure(); ensureRunning(); };
  window.addEventListener("resize", remeasure);
  window.addEventListener("load", remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  window.addEventListener("scroll", ensureRunning, { passive: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) running = false; else ensureRunning(); });
  // Menu links: the rocket flies into the link and blows up, then the page goes where the link points.
  document.querySelectorAll(".nav-links a").forEach((a) => a.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    if (state === "escape" || state === "strike") { pending = null; return; }   // clicked again mid-flight: just go
    const href = a.getAttribute("href") || "";
    e.preventDefault();
    const to = href.charAt(0) === "#" ? { hash: href } : { href: a.href };
    pending = to;
    launchAt(a);
    setTimeout(() => { if (pending === to) { pending = null; go(to); } }, 1500);   // never hold anyone up for long
  }));
  ensureRunning();
  window.EG_ROCKET = {
    get state() { return state; },
    launchAt: launchAt,
    // for tests: jump the loop to a moment (seconds after lift-off), and read the route
    seek: (t) => { state = "loop"; tLoop = HOVER + t; },
    pause: () => { running = false; lastT = 0; },
    renderAt: (t) => { state = "loop"; tLoop = HOVER + t; running = true; lastT = performance.now() / 1000; frame(performance.now()); running = false; lastT = 0; },
    resume: () => ensureRunning(),
    info: () => { if (!path) path = buildPath(); return { T: path.T, hover: HOVER, cur: cur, clipped: clipped, shipIn: shipIn }; },
    route: () => { if (!path) path = buildPath(); return path.pts.map((p) => [p.x, p.y, p.b ? 1 : 0, p.s, p.w, p.t]); },
    planet: () => planetAt(artOff()),
    origin: () => origin()
  };
})();
