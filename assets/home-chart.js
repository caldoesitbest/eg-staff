/* $EG: members drawn like a stock price, joins as the trading volume underneath. No libraries. */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const RANGES = {
    "24h": { span: DAY, bucket: HOUR, bar: HOUR, label: "past 24 hours" },
    "7d": { span: 7 * DAY, bucket: HOUR, bar: 6 * HOUR, label: "past 7 days" },
    "30d": { span: 30 * DAY, bucket: 6 * HOUR, bar: DAY, label: "past 30 days" },
    "all": { span: 0, bucket: DAY, bar: DAY, label: "since launch" }
  };
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let uid = 0;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* start of the local hour-group or day containing t */
  function localStart(t, size) {
    const d = new Date(t);
    if (size >= DAY) { d.setHours(0, 0, 0, 0); return d.getTime(); }
    const step = Math.max(1, Math.round(size / HOUR));
    const h = d.getHours();
    d.setHours(h - (h % step), 0, 0, 0);
    return d.getTime();
  }
  function nextStart(t, size) {
    const d = new Date(t);
    if (size >= DAY) { d.setDate(d.getDate() + Math.round(size / DAY)); return d.getTime(); }
    d.setHours(d.getHours() + Math.round(size / HOUR));
    return d.getTime();
  }
  /* the smallest round step (1, 2, 5, 10, 20, 25, 50, ...) that gives at most maxTicks labels between lo and hi */
  function niceStep(lo, hi, maxTicks) {
    for (let mag = 1; mag < 1e9; mag *= 10) {
      for (const m of [1, 2, 2.5, 5]) {
        const step = m * mag;
        if (step < 1 || (m === 2.5 && mag < 10)) continue;
        const count = Math.floor(hi / step) - Math.ceil(lo / step) + 1;
        if (count <= maxTicks) return step;
      }
    }
    return 1e9;
  }

  const F = {
    hour: new Intl.DateTimeFormat(undefined, { hour: "numeric" }),
    day: new Intl.DateTimeFormat(undefined, { weekday: "short" }),
    date: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }),
    long: new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }),
    longHour: new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric" })
  };

  function create(root, opts) {
    opts = opts || {};
    const id = "sc" + ++uid;
    root.classList.add("sc");
    root.tabIndex = 0;
    root.setAttribute("aria-describedby", id + "-hint");

    const svg = el("svg", { class: "sc-svg", role: "img", "aria-label": "Members chart" });
    const defs = el("defs", {}, svg);
    const ga = el("linearGradient", { id: id + "-area", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    el("stop", { offset: "0", style: "stop-color: var(--sc-c1); stop-opacity: .34" }, ga);
    el("stop", { offset: "1", style: "stop-color: var(--sc-c1); stop-opacity: 0" }, ga);
    const gl = el("linearGradient", { id: id + "-line", x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
    el("stop", { offset: "0", style: "stop-color: var(--sc-c2)" }, gl);
    el("stop", { offset: "1", style: "stop-color: var(--sc-c1)" }, gl);

    const gGrid = el("g", { class: "sc-grid" }, svg);
    const gVol = el("g", { class: "sc-vol" }, svg);
    const area = el("path", { class: "sc-area", fill: "url(#" + id + "-area)" }, svg);
    const base = el("line", { class: "sc-base" }, svg);
    const line = el("path", { class: "sc-line", stroke: "url(#" + id + "-line)" }, svg);
    const gAxis = el("g", { class: "sc-axis" }, svg);
    const nowDot = el("g", { class: "sc-now" }, svg);
    el("circle", { class: "sc-now-ring", r: "10" }, nowDot);
    el("circle", { class: "sc-now-dot", r: "4" }, nowDot);
    const cross = el("g", { class: "sc-cross" }, svg);
    const vline = el("line", { class: "sc-vline" }, cross);
    const hdot = el("circle", { class: "sc-hdot", r: "5" }, cross);
    const hbar = el("rect", { class: "sc-hbar" }, cross);
    const empty = el("text", { class: "sc-empty", "text-anchor": "middle" }, svg);

    const tip = document.createElement("div");
    tip.className = "sc-tip";
    tip.hidden = true;
    const hint = document.createElement("p");
    hint.id = id + "-hint";
    hint.className = "sr-only";
    hint.textContent = "Use the left and right arrow keys to read the chart.";
    root.append(svg, tip, hint);

    const state = { range: opts.range || "7d", points: [], now: null, view: null, hover: -1, drawn: false };

    /* ---------- data ---------- */
    function visible() {
      const R = RANGES[state.range];
      const now = Date.now();
      const pts = state.points
        .map((p) => ({ t: p.t, tm: p.tm !== undefined ? p.tm : Math.min(p.t + R.bucket, now), m: p.m, j: p.j || 0 }))
        .sort((a, b) => a.tm - b.tm);
      let line = pts.filter((p) => p.m !== null && p.m !== undefined);
      if (state.now && state.now.m !== null) {
        const last = line[line.length - 1];
        if (last && state.now.t - last.tm < R.bucket && state.now.t >= last.tm - R.bucket) last.m = state.now.m;
        if (!last || state.now.t > last.tm) line.push({ t: state.now.t, tm: state.now.t, m: state.now.m, j: 0, now: true });
        else line[line.length - 1].now = true;
      }
      const t1 = Math.max(now, line.length ? line[line.length - 1].tm : now);
      const first = Math.min.apply(null, pts.map((p) => p.t).concat(line.map((p) => p.tm)).concat([t1]));
      let t0 = R.span ? t1 - R.span : Math.min(first, t1 - DAY);
      // a range longer than the server's history starts where the history starts (like a new stock)
      if (R.span && first > t0 && first < t1 - R.bucket) t0 = first;
      // clip the line to the window, starting exactly at t0
      const before = line.filter((p) => p.tm < t0);
      const inside = line.filter((p) => p.tm >= t0);
      if (before.length && inside.length) {
        const a = before[before.length - 1];
        const b = inside[0];
        const k = (t0 - a.tm) / Math.max(1, b.tm - a.tm);
        inside.unshift({ t: t0, tm: t0, m: a.m + (b.m - a.m) * k, j: 0, edge: true });
      } else if (before.length && !inside.length) {
        inside.push({ t: t0, tm: t0, m: before[before.length - 1].m, j: 0, edge: true });
      }
      // volume buckets in local time
      const bars = new Map();
      for (const p of pts) {
        if (!p.j || p.t < t0 - R.bar || p.t > t1) continue;
        const s = localStart(p.t, R.bar);
        bars.set(s, (bars.get(s) || 0) + p.j);
      }
      const barList = Array.from(bars, ([s, n]) => ({ s: s, e: nextStart(s, R.bar), n: n })).filter((b) => b.e > t0).sort((a, b) => a.s - b.s);
      return { t0: t0, t1: t1, line: inside, bars: barList };
    }

    function summarize(v) {
      if (!v.line.length) return null;
      const ms = v.line.map((p) => p.m);
      const open = v.line[0].m;
      const close = v.line[v.line.length - 1].m;
      const volume = v.bars.reduce((a, b) => a + (b.s >= v.t0 - 1 ? b.n : Math.round(b.n * (b.e - v.t0) / (b.e - b.s))), 0);
      return {
        range: state.range, label: RANGES[state.range].label,
        open: Math.round(open), close: Math.round(close),
        high: Math.round(Math.max.apply(null, ms)), low: Math.round(Math.min.apply(null, ms)),
        change: Math.round(close - open), pct: open ? ((close - open) / open) * 100 : 0,
        volume: volume
      };
    }

    /* ---------- drawing ---------- */
    function render() {
      const W = Math.max(200, Math.round(root.clientWidth));
      const H = Math.max(160, Math.round(root.clientHeight));
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      const v = visible();
      state.view = v;
      const padL = 2, padR = W < 520 ? 38 : 48, padT = 14, padB = 26;
      const volH = Math.round((H - padT - padB) * 0.2);
      const pTop = padT, pBot = H - padB - volH - 12;
      const vTop = H - padB - volH, vBot = H - padB;
      const plotW = W - padL - padR;
      const x = (t) => padL + ((t - v.t0) / Math.max(1, v.t1 - v.t0)) * plotW;

      gGrid.replaceChildren(); gAxis.replaceChildren(); gVol.replaceChildren();
      const sum = summarize(v);
      root.classList.toggle("down", !!sum && sum.change < 0);
      root.classList.toggle("empty", !sum);
      empty.textContent = sum ? "" : "Waiting for data";
      empty.setAttribute("x", W / 2); empty.setAttribute("y", H / 2);
      if (!sum) {
        line.setAttribute("d", ""); area.setAttribute("d", ""); nowDot.style.display = "none"; base.style.display = "none";
        if (opts.onSummary) opts.onSummary(null);
        return;
      }

      // price scale
      let lo = sum.low, hi = sum.high;
      const padV = Math.max(2, (hi - lo) * 0.14);
      lo = Math.max(0, lo - padV); hi = hi + padV;
      const step = niceStep(lo, hi, H < 260 ? 3 : 4);
      const y = (m) => pBot - ((m - lo) / Math.max(1e-9, hi - lo)) * (pBot - pTop);
      for (let m = Math.ceil(lo / step) * step; m <= hi + 1e-9; m += step) {
        const yy = Math.round(y(m)) + 0.5;
        el("line", { x1: padL, x2: W - padR + 6, y1: yy, y2: yy }, gGrid);
        const tx = el("text", { x: W - 2, y: yy + 4, "text-anchor": "end" }, gAxis);
        tx.textContent = fmt(Math.round(m));
      }

      // time ticks
      const R = RANGES[state.range];
      const maxTicks = Math.max(2, Math.floor(plotW / (state.range === "24h" ? 64 : 76)));
      const unit = state.range === "24h" ? HOUR : DAY;
      const steps = state.range === "24h" ? [3, 6, 12] : state.range === "7d" ? [1, 2] : [1, 2, 7, 14, 28, 56];
      let chosen = [];
      for (const s of steps) {
        const size = s * unit;
        const ticks = [];
        let t = localStart(v.t0, unit === HOUR ? size : DAY);
        if (t < v.t0) t = nextStart(t, unit === HOUR ? size : DAY);
        let guard = 0;
        while (t <= v.t1 && guard++ < 400) {
          if (unit === HOUR || Math.round((localStart(t, DAY) - localStart(v.t0, DAY)) / DAY) % s === 0) ticks.push(t);
          t = nextStart(t, unit === HOUR ? size : DAY);
        }
        chosen = ticks;
        if (ticks.length <= maxTicks) break;
      }
      for (const t of chosen) {
        const xx = Math.round(x(t)) + 0.5;
        if (xx < padL + 14 || xx > W - padR - 14) continue;
        el("line", { class: "sc-vgrid", x1: xx, x2: xx, y1: pTop, y2: vBot }, gGrid);
        const tx = el("text", { x: xx, y: H - 6, "text-anchor": "middle" }, gAxis);
        tx.textContent = state.range === "24h" ? F.hour.format(t) : state.range === "7d" ? F.day.format(t) : F.date.format(t);
      }

      // volume
      const maxN = Math.max(1, ...v.bars.map((b) => b.n));
      const barGap = v.bars.length > 60 ? 1 : 2;
      for (const b of v.bars) {
        const x0 = Math.max(padL, x(b.s)), x1 = Math.min(W - padR, x(b.e));
        const w = Math.max(1.5, x1 - x0 - barGap);
        const h = Math.max(2, (b.n / maxN) * (vBot - vTop));
        el("rect", { x: (x0 + barGap / 2).toFixed(1), y: (vBot - h).toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: Math.min(2, w / 2) }, gVol);
      }
      el("line", { class: "sc-volbase", x1: padL, x2: W - padR, y1: vBot + 0.5, y2: vBot + 0.5 }, gGrid);

      // price line + area
      const pts = v.line.map((p) => [x(p.tm), y(p.m)]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
      line.setAttribute("d", d);
      area.setAttribute("d", d + "L" + pts[pts.length - 1][0].toFixed(1) + " " + pBot + "L" + pts[0][0].toFixed(1) + " " + pBot + "Z");
      base.style.display = "";
      const by = Math.round(y(sum.open)) + 0.5;
      base.setAttribute("x1", padL); base.setAttribute("x2", W - padR); base.setAttribute("y1", by); base.setAttribute("y2", by);
      const last = pts[pts.length - 1];
      nowDot.style.display = v.line[v.line.length - 1].now ? "" : "none";
      nowDot.setAttribute("transform", "translate(" + last[0].toFixed(1) + " " + last[1].toFixed(1) + ")");

      // first appearance: draw the line in
      if (!state.drawn && !reduce && root.closest(".in")) {
        state.drawn = true;
        const len = line.getTotalLength ? line.getTotalLength() : 0;
        if (len) {
          line.style.transition = "none";
          line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
          area.style.opacity = "0";
          requestAnimationFrame(() => requestAnimationFrame(() => {
            line.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)";
            area.style.transition = "opacity 1.2s ease .5s";
            line.style.strokeDashoffset = "0"; area.style.opacity = "";
            setTimeout(() => { line.style.strokeDasharray = ""; line.style.strokeDashoffset = ""; }, 1700);
          }));
        }
      }

      state.geom = { x: x, y: y, pts: pts, padL: padL, padR: padR, W: W, pTop: pTop, vBot: vBot, vTop: vTop };
      svg.setAttribute("aria-label", "Members, " + sum.label + ": " + fmt(sum.open) + " to " + fmt(sum.close) +
        (sum.change ? (sum.change > 0 ? ", up " : ", down ") + fmt(Math.abs(sum.change)) : ", no change") + ". " + fmt(sum.volume) + " joins.");
      if (state.hover >= 0) showHover(Math.min(state.hover, pts.length - 1));
      if (opts.onSummary) opts.onSummary(sum);
    }

    /* ---------- hover / touch / keys ---------- */
    function showHover(i) {
      const g = state.geom;
      if (!g || !g.pts.length) return;
      state.hover = i;
      const p = state.view.line[i];
      const [px, py] = g.pts[i];
      root.classList.add("hovering");
      vline.setAttribute("x1", px); vline.setAttribute("x2", px);
      vline.setAttribute("y1", g.pTop); vline.setAttribute("y2", g.vBot);
      hdot.setAttribute("cx", px); hdot.setAttribute("cy", py);
      const R = RANGES[state.range];
      const bucket = state.view.bars.find((b) => p.tm > b.s && p.tm <= b.e) || state.view.bars.find((b) => p.tm >= b.s && p.tm < b.e);
      if (bucket) {
        const x0 = Math.max(g.padL, g.x(bucket.s)), x1 = Math.min(g.W - g.padR, g.x(bucket.e));
        hbar.setAttribute("x", x0); hbar.setAttribute("width", Math.max(2, x1 - x0));
        hbar.setAttribute("y", g.vTop); hbar.setAttribute("height", g.vBot - g.vTop);
        hbar.style.display = "";
      } else hbar.style.display = "none";
      const when = p.now ? "Right now" : p.edge ? (state.range === "all" ? "Launch" : "Start of range")
        : (state.range === "24h" || state.range === "7d") ? F.longHour.format(p.tm) : F.long.format(p.tm);
      const joined = bucket ? bucket.n : 0;
      const span = R.bar >= DAY ? "that day" : R.bar === HOUR ? "that hour" : "in those 6 hours";
      tip.replaceChildren();
      const b = document.createElement("b"); b.textContent = when;
      const m = document.createElement("span"); m.className = "sc-tip-m"; m.textContent = fmt(Math.round(p.m)) + " members";
      const j = document.createElement("span"); j.className = "sc-tip-j"; j.textContent = joined ? "+" + fmt(joined) + " joined " + span : "No joins " + span;
      tip.append(b, m, j);
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const left = px + 14 + tw > g.W - g.padR ? px - 14 - tw : px + 14;
      tip.style.transform = "translate(" + Math.max(0, left) + "px, " + Math.max(0, Math.min(py - 30, root.clientHeight - tip.offsetHeight - 30)) + "px)";
    }
    function hideHover() {
      state.hover = -1;
      root.classList.remove("hovering");
      tip.hidden = true;
    }
    function nearest(clientX) {
      const g = state.geom;
      if (!g || !g.pts.length) return -1;
      const box = svg.getBoundingClientRect();
      const px = ((clientX - box.left) / box.width) * g.W;
      let best = 0, bd = Infinity;
      g.pts.forEach((p, i) => { const d = Math.abs(p[0] - px); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    let touchTimer;
    svg.addEventListener("pointermove", (e) => { const i = nearest(e.clientX); if (i >= 0) showHover(i); });
    svg.addEventListener("pointerdown", (e) => { clearTimeout(touchTimer); const i = nearest(e.clientX); if (i >= 0) showHover(i); });
    svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideHover(); });
    svg.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") touchTimer = setTimeout(hideHover, 2200); });
    root.addEventListener("keydown", (e) => {
      const n = state.geom ? state.geom.pts.length : 0;
      if (!n) return;
      let i = state.hover;
      if (e.key === "ArrowLeft") i = i < 0 ? n - 1 : Math.max(0, i - 1);
      else if (e.key === "ArrowRight") i = i < 0 ? n - 1 : Math.min(n - 1, i + 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { hideHover(); return; }
      else return;
      e.preventDefault();
      showHover(i);
    });
    root.addEventListener("blur", hideHover);

    if ("ResizeObserver" in window) {
      let raf;
      new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }).observe(root);
    } else {
      window.addEventListener("resize", render);
    }

    return {
      get range() { return state.range; },
      setRange(r) { if (RANGES[r]) { state.range = r; state.hover = -1; hideHover(); } },
      setPoints(points) { state.points = points || []; render(); },
      setNow(m, t) { state.now = { m: m, t: t || Date.now() }; render(); },
      render: render,
      bucket: (r) => RANGES[r || state.range].bucket
    };
  }

  window.EGChart = { create: create, RANGES: RANGES };
})();
