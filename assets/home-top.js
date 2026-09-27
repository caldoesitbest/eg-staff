/* Envious Gluttony™ homepage: the Top 10, live from the Gluttony™ bot (the same list as /top).
   home.js passes the bot's list in through EG_TOP.update(list, at). */
(function () {
  "use strict";

  const root = document.getElementById("top10");
  const podium = document.getElementById("podium");
  const board = document.getElementById("board");
  if (!root || !podium || !board) return;

  const D = window.EG_HOME || {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const canAnimate = typeof Element.prototype.animate === "function" && !reduce;
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const short = (n) => (n >= 10000 ? ((n % 1000 === 250 ? n - 50 : n) / 1000).toFixed(1).replace(/\.0$/, "") + "k" : fmt(n));   // same as /top (Python rounds x.25 down)
  const CDN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/[\w\-./?=&%]+$/;
  const FRESH = 10 * 60e3;
  const PLACE = ["1st", "2nd", "3rd"];
  const METAL = ["m-gold", "m-silver", "m-bronze"];
  const SINS = Object.create(null);
  (D.ladder || []).forEach((s) => { if (typeof s.level === "number") SINS[s.emoji] = s; });

  function el(tag, props, kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(kids || [])) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }

  /* ---------- the bot's list, checked ---------- */
  function clean(e) {
    if (!e || typeof e !== "object") return null;
    const id = String(e.id || "");
    if (!/^\d{1,22}$/.test(id)) return null;
    const n = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const url = (v) => (typeof v === "string" && CDN.test(v) ? v : null);
    return {
      id: id,
      name: Array.from(String(e.name == null ? "" : e.name).trim()).slice(0, 40).join("") || "Member",
      xp: n(e.xp), lvl: n(e.lvl), into: n(e.into), need: Math.max(1, n(e.need)),
      msgs: n(e.msgs), voice: n(e.voice),
      av: url(e.av), ava: url(e.ava), deco: url(e.deco), decoa: url(e.decoa),
      sin: typeof e.sin === "string" && SINS[e.sin] ? e.sin : null,
      color: typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : null,
      vc: e.vc === true
    };
  }
  function defaultAvatar(id) {
    let k = 0;
    try { k = Number((BigInt(id) >> BigInt(22)) % BigInt(6)); } catch (err) { k = 0; }
    return "https://cdn.discordapp.com/embed/avatars/" + k + ".png";
  }
  /* role colours as Discord shows them, lifted a little when they're too dark to read on the night sky */
  function readable(hex) {
    if (!hex) return "";
    const v = parseInt(hex.slice(1), 16);
    let rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
    const f = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    const lum = (c) => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    if (lum(rgb) >= 0.22) return hex;                    // already easy to read on the dark cards
    const [r, g, b] = rgb, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const h = d === 0 ? 0 : 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    const fromHsl = (li) => {
      const c = (1 - Math.abs(2 * li - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = li - c / 2;
      const p = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      return p.map((k) => k + m);
    };
    while (l < 0.92 && lum(rgb) < 0.22) { l += 0.02; rgb = fromHsl(l); }   // same hue, just lighter
    return "rgb(" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)).join(",") + ")";
  }
  let LEAD = /^\W+/;
  try { LEAD = new RegExp("^[^\\p{L}\\p{N}]+", "u"); } catch (err) { /* older browsers: plain version */ }
  const initial = (name) => (Array.from(name.replace(LEAD, ""))[0] || Array.from(name)[0] || "?").toUpperCase();

  /* numbers glide to new values (and count up the first time they're seen) */
  function tween(node, to, format, dur) {
    const from = node._v === undefined ? to : node._v;
    node._v = to;
    cancelAnimationFrame(node._raf);
    if (reduce || !dur || from === to) { node.textContent = format(to); return; }
    const t0 = performance.now();
    (function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      node.textContent = format(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) node._raf = requestAnimationFrame(step);
    })(t0);
  }
  function pop(host, text, cls) {
    if (reduce) return;
    const p = el("span", { class: "pop" + (cls ? " " + cls : ""), text: text, "aria-hidden": "true" });
    host.append(p);
    setTimeout(() => p.remove(), 2100);
  }
  function moved(host, prevRank, rank) {
    const old = host.querySelector(".mv");
    if (old) old.remove();
    if (prevRank === rank) return;
    const up = !prevRank || prevRank > rank;
    const chip = el("span", {
      class: "mv " + (prevRank ? (up ? "up" : "down") : "new"),
      text: prevRank ? (up ? "▲" : "▼") + Math.abs(prevRank - rank) : "New",
      title: prevRank ? "Was #" + prevRank : "New in the Top 10"
    });
    host.append(chip);
    setTimeout(() => chip.remove(), 9000);
  }

  /* ---------- a Discord-style avatar: picture, decoration, "in voice" bars ---------- */
  function Avatar(px) {
    const fb = el("span", { class: "av-fb", "aria-hidden": "true", text: "?" });
    const img = el("img", { class: "av-img", alt: "", width: px, height: px, decoding: "async", referrerpolicy: "no-referrer", hidden: true });
    const deco = el("img", { class: "av-deco", alt: "", decoding: "async", referrerpolicy: "no-referrer", hidden: true });
    const vc = el("span", { class: "av-vc", role: "img", "aria-label": "In voice right now", title: "In voice right now", hidden: true }, [el("i"), el("i"), el("i")]);
    const node = el("span", { class: "av" }, [el("span", { class: "av-ring", "aria-hidden": "true" }), fb, img, deco, vc]);
    let e = null;
    let playing = false;
    img.addEventListener("load", () => { img.hidden = false; });
    img.addEventListener("error", () => {
      if (!e) return;
      const cur = img.getAttribute("src");
      if (cur === e.ava && e.av) { img.src = e.av; return; }            // animated one didn't load: the still one
      const def = defaultAvatar(e.id);
      if (cur !== def) { img.src = def; return; }                        // picture changed since the bot looked
      img.hidden = true;                                                 // offline: the initial stays
    });
    deco.addEventListener("load", () => { deco.hidden = false; });
    deco.addEventListener("error", () => { deco.hidden = true; });
    function paint() {
      if (!e) { img.hidden = true; img.removeAttribute("src"); deco.hidden = true; deco.removeAttribute("src"); return; }
      const pic = (playing && e.ava) || e.av || defaultAvatar(e.id);
      if (img.getAttribute("src") !== pic) img.src = pic;
      const d = (playing && e.decoa) || e.deco;
      if (!d) { deco.hidden = true; deco.removeAttribute("src"); }
      else if (deco.getAttribute("src") !== d) deco.src = d;
    }
    return {
      node: node,
      set(next) {
        e = next;
        fb.textContent = e ? initial(e.name) : "?";
        node.classList.toggle("has-deco", !!(e && e.deco));
        node.classList.toggle("moving", !!(e && e.ava));
        vc.hidden = !(e && e.vc);
        paint();
      },
      play(on) { if (playing !== on) { playing = on; paint(); } }
    };
  }

  function SinChip() {
    const img = el("img", { alt: "", width: "20", height: "20", decoding: "async", loading: "lazy" });
    const label = el("span");
    const node = el("span", { class: "sin", hidden: true }, [img, label]);
    return {
      node: node,
      set(key) {
        const s = key && SINS[key];
        node.hidden = !s;
        if (!s) return;
        if (node.dataset.sin === key) return;
        node.dataset.sin = key;
        node.style.cssText = "--c1:" + s.c1 + ";--c2:" + s.c2;
        img.src = "assets/home/emoji/" + key + ".webp";
        label.textContent = s.name;
      }
    };
  }

  /* ---------- the podium: 1st, 2nd, 3rd ---------- */
  function makePod(i) {
    const av = Avatar(i === 0 ? 136 : 112);
    const medal = el("img", { class: "medal", src: "assets/home/top/medal-" + (i + 1) + ".webp", alt: "", width: "128", height: "128", decoding: "async", loading: "lazy" });
    const name = el("span", { class: "nm" });
    const you = el("span", { class: "you", text: "You", hidden: true });
    const sin = SinChip();
    const lv = el("b", { text: "–" });
    const lvWrap = el("p", { class: "pod-lv" }, [el("small", { text: "Level" }), lv]);
    const fill = el("i");
    const next = el("p", { class: "xp-next" });
    const sXp = el("dd", { text: "–" }), sMsg = el("dd", { text: "–" }), sVc = el("dd", { text: "–" });
    const card = el("div", { class: "pod-card" }, [
      el("span", { class: "medal-wrap", "aria-hidden": "true" }, el("span", { class: "medal-float" }, medal)),
      av.node,
      el("h3", { class: "pod-name" }, [el("span", { class: "sr-only", text: PLACE[i] + " place: " }), name, you]),
      sin.node,
      lvWrap,
      el("span", { class: "bar", "aria-hidden": "true" }, fill),
      next,
      el("dl", { class: "pod-stats" }, [
        el("div", {}, [el("dt", { text: "XP" }), sXp]),
        el("div", {}, [el("dt", { text: "Messages" }), sMsg]),
        el("div", {}, [el("dt", { text: "Voice" }), sVc])
      ]),
      el("span", { class: "shine", "aria-hidden": "true" }, el("i")),
      el("span", { class: "foil", "aria-hidden": "true" })
    ]);
    if (i === 0) {
      [[8, 22], [91, 15], [13, 55], [88, 46], [7, 86], [94, 80], [74, 31]].forEach(([x, y], k) =>
        card.append(el("span", { class: "spark", "aria-hidden": "true", style: "--k:" + k + ";left:" + x + "%;top:" + y + "%" })));
    }
    const li = el("li", { class: "pod pod-" + (i + 1) + " " + METAL[i] }, [
      card,
      el("div", { class: "plinth", "aria-hidden": "true" }, el("span", { text: String(i + 1) }))
    ]);
    podium.append(li);
    tilt(card);

    let cur = null;
    const slot = {
      li: li, card: card, av: av, rank: i + 1,
      get id() { return cur ? cur.id : null; },
      set(e, old, live) {
        const prev = e ? old.get(e.id) : null;
        const swapped = live && (e ? e.id : null) !== (cur ? cur.id : null);
        cur = e;
        li.classList.toggle("vacant", !e);
        av.set(e);
        sin.set(e && e.sin);
        if (!e) {
          name.textContent = hasData ? "Up for grabs" : "";
          name.style.color = "";
          lv.textContent = "–"; lv._v = undefined;
          fill.style.setProperty("--p", "0%");
          next.textContent = "";
          [sXp, sMsg, sVc].forEach((n) => { n.textContent = "–"; n._v = undefined; });
          return;
        }
        name.textContent = e.name;
        name.style.color = readable(e.color);
        const dur = live ? 700 : 0;
        tween(lv, e.lvl, String, dur);
        tween(sXp, e.xp, short, dur);
        tween(sMsg, e.msgs, fmt, dur);
        tween(sVc, e.voice, (n) => fmt(n) + "h", dur);
        fill.style.setProperty("--p", (Math.min(1, e.into / e.need) * 100).toFixed(1) + "%");
        next.replaceChildren(fmt(e.into) + " / " + fmt(e.need) + " XP", el("span", { class: "xp-to", text: " to level " + (e.lvl + 1) }));
        if (swapped && canAnimate) {
          card.animate([{ transform: "perspective(900px) rotateY(-75deg)", opacity: 0.1 }, { transform: "none", opacity: 1 }],
            { duration: 750, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
        if (live) {
          if (prev && e.xp > prev.e.xp) pop(lvWrap, "+" + fmt(e.xp - prev.e.xp) + " XP");
          if (prev && e.lvl > prev.e.lvl) { pop(lvWrap, "Level up", "up"); flash(card); }
          if (swapped) moved(card, prev ? prev.rank : 0, i + 1);
        }
      },
      countUp() {
        if (!cur) return;
        [[lv, cur.lvl, String], [sXp, cur.xp, short], [sMsg, cur.msgs, fmt], [sVc, cur.voice, (n) => fmt(n) + "h"]].forEach(([n, v, f]) => {
          n._v = 0;
          tween(n, v, f, 1500 + i * 150);
        });
      },
      setYou(on) { you.hidden = !on; li.classList.toggle("is-you", on); }
    };
    return slot;
  }

  /* ---------- ranks 4 to 10 ---------- */
  function makeRow() {
    const rank = el("span", { class: "rk", "aria-hidden": "true" });
    const place = el("span", { class: "sr-only" });
    const av = Avatar(52);
    const name = el("span", { class: "nm" });
    const you = el("span", { class: "you", text: "You", hidden: true });
    const sin = SinChip();
    const xp = el("span", { class: "row-xp" });
    const sXp = el("dd"), sMsg = el("dd"), sVc = el("dd");
    const fill = el("i");
    const next = el("span", { class: "row-next" });
    const lv = el("b");
    const lvWrap = el("p", { class: "row-lv" }, [el("small", { text: "Level" }), lv]);
    const li = el("li", { class: "row" }, [
      el("span", { class: "rk-wrap" }, rank),
      av.node,
      el("div", { class: "row-who" }, [
        el("p", { class: "row-name" }, [place, name, you]),
        el("p", { class: "row-meta" }, [sin.node, xp])
      ]),
      el("dl", { class: "row-stats" }, [
        el("div", {}, [el("dt", { text: "XP" }), sXp]),
        el("div", {}, [el("dt", { text: "Messages" }), sMsg]),
        el("div", {}, [el("dt", { text: "Voice" }), sVc])
      ]),
      el("div", { class: "prog", "aria-hidden": "true" }, [el("span", { class: "bar" }, fill), next]),
      lvWrap
    ]);
    if (finePointer && !reduce) {
      li.addEventListener("pointerenter", () => av.play(true));
      li.addEventListener("pointerleave", () => av.play(false));
    }
    let cur = null;
    return {
      li: li, av: av,
      set(e, r, old, live) {
        const prev = old.get(e.id);
        const dur = live ? 700 : 0;
        cur = e;
        rank.textContent = String(r).padStart(2, "0");
        place.textContent = "Rank " + r + ": ";
        li.style.setProperty("--k", r - 4);
        av.set(e);
        name.textContent = e.name;
        name.style.color = readable(e.color);
        sin.set(e.sin);
        const s = e.sin && SINS[e.sin];
        li.style.setProperty("--c1", s ? s.c1 : "#63f4ff");
        li.style.setProperty("--c2", s ? s.c2 : "#8e44ff");
        tween(lv, e.lvl, String, dur);
        tween(xp, e.xp, (n) => short(n) + " XP", dur);
        tween(sXp, e.xp, short, dur);
        tween(sMsg, e.msgs, fmt, dur);
        tween(sVc, e.voice, (n) => fmt(n) + "h", dur);
        fill.style.setProperty("--p", (Math.min(1, e.into / e.need) * 100).toFixed(1) + "%");
        next.textContent = fmt(e.into) + " / " + fmt(e.need) + " XP";
        if (live) {
          if (prev && e.xp > prev.e.xp) pop(lvWrap, "+" + fmt(e.xp - prev.e.xp) + " XP");
          if (prev && e.lvl > prev.e.lvl) { pop(lvWrap, "Level up", "up"); flash(li); }
          if (!prev || prev.rank !== r) moved(li.firstElementChild, prev ? prev.rank : 0, r);
        }
      },
      countUp() {
        if (!cur) return;
        [[lv, cur.lvl, String], [xp, cur.xp, (n) => short(n) + " XP"], [sXp, cur.xp, short], [sMsg, cur.msgs, fmt], [sVc, cur.voice, (n) => fmt(n) + "h"]].forEach(([n, v, f]) => {
          n._v = 0;
          tween(n, v, f, 1200);
        });
      },
      setYou(on) { you.hidden = !on; li.classList.toggle("is-you", on); }
    };
  }
  function skeletonRow(k) {
    return el("li", { class: "row sk", style: "--k:" + k, "aria-hidden": "true" }, [
      el("span", { class: "rk-wrap" }, el("span", { class: "rk", text: String(k + 4).padStart(2, "0") })),
      el("span", { class: "av" }, el("span", { class: "av-fb" })),
      el("div", { class: "row-who" }, [el("i", { class: "line" }), el("i", { class: "line short" })]),
      el("div", { class: "row-stats" }, el("i", { class: "line" })),
      el("div", { class: "prog" }, el("i", { class: "line" })),
      el("p", { class: "row-lv" }, el("i", { class: "line tiny" }))
    ]);
  }

  function flash(node) {
    if (!canAnimate) return;
    node.animate([{ boxShadow: "0 0 0 0 rgba(255, 213, 79, 0)" }, { boxShadow: "0 0 0 3px rgba(255, 213, 79, .9), 0 0 60px 6px rgba(255, 213, 79, .55)" }, { boxShadow: "0 0 0 0 rgba(255, 213, 79, 0)" }],
      { duration: 1400, easing: "ease-out" });
  }
  function tilt(card) {
    if (!finePointer || reduce) return;
    card.addEventListener("pointermove", (ev) => {
      const b = card.getBoundingClientRect();
      const px = (ev.clientX - b.left) / b.width;
      const py = (ev.clientY - b.top) / b.height;
      card.style.setProperty("--ry", ((px - 0.5) * 14).toFixed(2) + "deg");
      card.style.setProperty("--rx", ((0.5 - py) * 10).toFixed(2) + "deg");
      card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    });
    card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  }
  /* confetti from behind #1 the first time the podium is seen */
  function burst() {
    const host = slots[0].av.node;
    if (!hasData || !slots[0].id || reduce) return;
    const wrap = el("span", { class: "burst", "aria-hidden": "true" });
    const colors = ["#ffd54f", "#fff4c7", "#63f4ff", "#ff42d0", "#a98bff", "#ffffff"];
    wrap.append(el("b", { class: "shock" }), el("b", { class: "shock late" }));
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2 + Math.random() * 0.3;
      const d = 110 + Math.random() * 150;
      wrap.append(el("i", {
        style: "--x:" + (Math.cos(a) * d).toFixed(0) + "px;--y:" + (Math.sin(a) * d * 0.85 - 20).toFixed(0) + "px;--c:" + colors[k % colors.length] +
          ";--r:" + Math.floor(Math.random() * 720) + "deg;--t:" + (1 + Math.random() * 0.8).toFixed(2) + "s;--w:" + (k % 3 ? 8 : 12) + "px"
      }));
    }
    host.append(wrap);
    setTimeout(() => wrap.remove(), 2200);
  }

  /* ---------- state ---------- */
  const slots = [0, 1, 2].map(makePod);
  const rows = new Map();
  let skeleton = [];
  for (let k = 0; k < 7; k++) { const s = skeletonRow(k); skeleton.push(s); board.append(s); }
  let current = [];
  let hasData = false, seen = false, counted = false, lastAt = 0;
  let myIds = null, told = false;

  function update(raw, at) {
    if (!Array.isArray(raw)) return;                   // the bot's add-on doesn't send a Top 10 yet: keep the placeholder
    const ids = new Set();
    const list = [];
    for (const r of raw) {
      const e = clean(r);
      if (e && !ids.has(e.id)) { ids.add(e.id); list.push(e); }
      if (list.length === 10) break;
    }
    lastAt = at || Date.now();
    const live = hasData;                              // pops and arrows only for changes after the first paint
    hasData = true;
    root.classList.remove("empty");
    skeleton.forEach((s) => s.remove());
    skeleton = [];
    const old = new Map(current.map((e, k) => [e.id, { e: e, rank: k + 1 }]));
    current = list;

    slots.forEach((s, k) => s.set(list[k] || null, old, live));

    const want = list.slice(3);
    const tops = new Map();
    if (live && canAnimate) rows.forEach((r, id) => tops.set(id, r.li.getBoundingClientRect().top));
    const keep = new Set(want.map((e) => e.id));
    rows.forEach((r, id) => { if (!keep.has(id)) { r.li.remove(); rows.delete(id); } });
    want.forEach((e, k) => {
      let r = rows.get(e.id);
      if (!r) { r = makeRow(); rows.set(e.id, r); }
      r.set(e, k + 4, old, live);
      if (board.children[k] !== r.li) board.insertBefore(r.li, board.children[k] || null);
    });
    if (live && canAnimate) {
      rows.forEach((r, id) => {                        // slide rows to their new places
        const y0 = tops.get(id);
        if (y0 === undefined) { r.li.animate([{ opacity: 0, transform: "translateX(-14px)" }, { opacity: 1, transform: "none" }], { duration: 550, easing: "cubic-bezier(.2,.7,.2,1)" }); return; }
        const dy = y0 - r.li.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) r.li.animate([{ transform: "translateY(" + dy.toFixed(1) + "px)" }, { transform: "none" }], { duration: 800, easing: "cubic-bezier(.2,.7,.2,1)" });
      });
    }
    paintLive();
    if (seen && !counted) intro();
    markYou();
  }

  function intro() {
    counted = true;
    slots.forEach((s) => s.countUp());
    rows.forEach((r) => r.countUp());
    setTimeout(burst, 1050);
  }

  /* "Live · updated just now" */
  const liveEl = document.getElementById("top-live");
  const agoEl = document.getElementById("top-ago");
  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return "just now";
    if (s < 90) return "a minute ago";
    const m = Math.round(s / 60);
    if (m < 60) return m + " minutes ago";
    const h = Math.round(m / 60);
    if (h < 36) return h + (h === 1 ? " hour ago" : " hours ago");
    return Math.round(h / 24) + " days ago";
  }
  function paintLive() {
    if (!liveEl || !agoEl) return;
    liveEl.hidden = !lastAt;
    if (!lastAt) return;
    const fresh = Date.now() - lastAt < FRESH;
    liveEl.classList.toggle("stale", !fresh);
    agoEl.textContent = fresh ? "Updated " + ago(lastAt) : "Last updated " + ago(lastAt);
  }
  setInterval(paintLive, 15000);

  /* ---------- "that's you": signed in with Discord and on the board ---------- */
  function markYou() {
    if (!myIds || !myIds.size) return;
    slots.forEach((s) => s.setYou(!!s.id && myIds.has(s.id)));
    rows.forEach((r, id) => r.setYou(myIds.has(id)));
    const k = current.findIndex((e) => myIds.has(e.id));
    if (k >= 0 && !told) { told = true; youToast(k + 1); }
  }
  function youToast(rank) {
    const zone = document.getElementById("toasts");
    if (!zone) return;
    try {
      if (sessionStorage.getItem("eg-top-you") === String(rank)) return;
      sessionStorage.setItem("eg-top-you", String(rank));
    } catch (err) { /* private browsing: show it anyway */ }
    const me = current[rank - 1];
    const above = current[rank - 2];
    const msg = el("p", { class: "toast-msg" });
    if (rank === 1) msg.append("That's you at ", el("b", { text: "#1" }), ". The whole server is chasing you.");
    else msg.append("That's you at ", el("b", { text: "#" + rank }), " on the Top 10. ", el("b", { text: fmt(above.xp - me.xp + 1) + " XP" }), " more and you pass " + above.name + ".");
    const x = el("button", { type: "button", class: "toast-x", "aria-label": "Dismiss" }, window.egIcon ? window.egIcon("x") : "×");
    const see = el("a", { href: "#top10", text: "See it" });
    const meta = el("p", { class: "toast-meta" }, [window.egIcon ? window.egIcon("eye") : null, "Only you can see this", " · ", see]);
    const t = el("div", { class: "toast", style: "--c1:#ffd54f" }, [
      el("img", { src: "assets/home/eg-mark.webp", alt: "" }),
      el("p", { class: "toast-who" }, ["Gluttony™", el("small", { text: "APP" })]),
      x, msg, meta
    ]);
    let timer;
    const close = () => { clearTimeout(timer); t.classList.add("out"); setTimeout(() => t.remove(), 300); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, 9000); };
    x.addEventListener("click", close);
    see.addEventListener("click", close);
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", arm);
    while (zone.children.length >= 3) zone.firstElementChild.remove();
    zone.append(t);
    arm();
  }
  async function findMe() {
    const EG = window.EG;
    if (!EG || !EG.configured || typeof EG.user !== "function") return;
    try {
      const u = await EG.user();
      if (!u) return;
      const ids = new Set();
      (u.identities || []).forEach((i) => {
        if (i.provider !== "discord") return;
        const d = i.identity_data || {};
        [d.provider_id, d.sub, i.id].forEach((v) => { if (/^\d{15,22}$/.test(String(v || ""))) ids.add(String(v)); });
      });
      if (ids.size) { myIds = ids; markYou(); }
    } catch (err) { /* not signed in or offline */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", findMe);
  else setTimeout(findMe, 0);

  /* ---------- motion ---------- */
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect();
      seen = true;
      root.classList.add("go");
      if (hasData && !counted) intro();
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    io.observe(podium);
    // animated pictures and decorations play while the podium is on screen, like a profile does in Discord
    new IntersectionObserver((es) => {
      const on = es[es.length - 1].isIntersecting;
      slots.forEach((s) => s.av.play(on));
    }, { threshold: 0.15 }).observe(podium);
    // nothing in here animates while the section is off screen
    new IntersectionObserver((es) => root.classList.toggle("idle", !es[es.length - 1].isIntersecting)).observe(root);
  } else {
    seen = true;
    root.classList.add("go");
  }

  window.EG_TOP = {
    update: update,
    get list() { return current.slice(); },
    setMe(ids) { myIds = new Set([].concat(ids || []).map(String)); told = false; markYou(); }   // for testing the highlight without signing in
  };
})();
