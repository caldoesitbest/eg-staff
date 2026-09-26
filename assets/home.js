/* Envious Gluttony™ homepage: renders assets/home-data.js and runs the motion. */
(function () {
  "use strict";

  const D = window.EG_HOME;
  const C = window.EG_CONFIG || {};
  const icon = window.egIcon;
  if (!D) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const S = Object.assign({}, D.stats, { commands: D.stats.commands.map((c) => Object.assign({}, c)) });

  function el(tag, props, kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(kids || [])) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const ic = (name, cls) => icon(name, cls);
  const emojiSrc = (name) => "assets/home/emoji/" + name + ".webp";

  /* ---------- live-able numbers ---------- */
  const state = {
    members: S.members,
    boosts: S.boosts,
    third: S.inVoice,
    thirdLabel: "in voice",
    bot: false,          // numbers came from the Gluttony bot
    botAt: 0,            // when the bot last sent them (ms)
    invite: false        // numbers came from Discord's public invite info
  };
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const word = (n) => (n <= 12 ? WORDS[n] : String(n));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dayMs = 86400000;
  const founded = new Date(D.founded + "T12:00:00");
  const updated = new Date(D.updated + "T12:00:00");
  const FRESH = 10 * 60e3;   // bot data older than this counts as "last seen", not live

  /* counters: count up the first time they're seen, glide to new values after */
  function animateNum(node, to) {
    const from = Number(node.dataset.shown || 0);
    node.dataset.shown = to;
    if (reduce || from === to) { node.textContent = fmt(to); return; }
    const start = performance.now();
    const dur = from === 0 ? 1500 : 700;
    const ease = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    (function step(now) {
      const t = Math.min(1, (now - start) / dur);
      node.textContent = fmt(Math.round(from + (to - from) * ease(t)));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }
  function setStat(key, value) {
    $$('[data-stat="' + key + '"]').forEach((n) => {
      n.dataset.target = value;
      if (n.hasAttribute("data-count") && !n.dataset.counted) n.textContent = fmt(value);
      else if (n.hasAttribute("data-count")) animateNum(n, value);
      else n.textContent = fmt(value);
    });
  }
  let roleCards = [];
  let ladderSteps = [];
  let paintCommands = () => {};
  function bindAll() {
    setStat("members", state.members);
    setStat("boosts", state.boosts);
    setStat("third", state.third);
    $$("[data-stat-label]").forEach((n) => (n.textContent = state.thirdLabel));
    for (const k of ["messages", "voiceHours", "voicePeople", "joins24h", "joins7d", "xpPeople"]) setStat(k, S[k]);
    const cert = $("#cert-no");
    if (cert) cert.textContent = String(state.members + 1).padStart(6, "0");
    const bar = $(".ms-bar");
    if (bar) {
      const pct = Math.min(100, (state.members / D.nextGoal) * 100);
      bar.querySelector(".bar i").style.setProperty("--p", pct.toFixed(1) + "%");
      bar.querySelector(".cur").textContent = fmt(state.members);
    }
    // derived copy
    const asOf = state.bot ? new Date(state.botAt) : updated;
    const days = Math.max(1, (asOf - founded) / dayMs);
    const rate = $("#msg-rate");
    if (rate) rate.textContent = "≈ " + fmt(Math.round(S.messages / days)) + " a day since the doors opened";
    const vd = $("#voice-days");
    if (vd) vd.textContent = "That's about " + fmt(Math.round(S.voiceHours / 24)) + " days of nonstop talking.";
    const pct = Math.min(100, Math.round((S.xpPeople / Math.max(1, state.members)) * 100));
    const xp = $("#xp-pct");
    if (xp) xp.textContent = pct + "%";
    const ring = $("#xp-ring");
    if (ring) {
      ring.dataset.pct = pct;
      const fill = $(".fill", ring);
      if (fill && ring.closest(".in")) fill.style.strokeDashoffset = (327 * (1 - pct / 100)).toFixed(1);
    }
    roleCards.forEach((c) => c.paint());
    ladderSteps.forEach((st) => st.paint());
    paintCommands();
    if (chart) chart.setNow(state.members, state.bot ? state.botAt : Date.now());
    paintStatus();
  }

  /* "Live" badge and the "updated 20s ago" line */
  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return "just now";
    if (s < 90) return "a minute ago";
    const m = Math.round(s / 60);
    if (m < 60) return m + " minutes ago";
    const h = Math.round(m / 60);
    if (h < 36) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.round(h / 24);
    return d + " days ago";
  }
  function paintStatus() {
    const fresh = state.bot && Date.now() - state.botAt < FRESH;
    const badge = $("#live-badge");
    if (badge) badge.hidden = !fresh;
    const up = $("#stock-updated");
    if (up) up.textContent = state.bot ? "Updated " + ago(state.botAt) : "";
    const src = $("#stats-source");
    if (src) {
      if (fresh) src.textContent = "Live from the Gluttony™ bot. Updates by itself, no refresh needed.";
      else if (state.bot) src.textContent = "From the Gluttony™ bot, last updated " + ago(state.botAt) + ".";
    }
  }
  setInterval(paintStatus, 15000);

  /* ---------- derived copy ---------- */
  (function derived() {
    const sd = $("#stats-date");
    if (sd) { sd.dateTime = D.updated; sd.textContent = updated.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    const age = $("#ms-age");
    if (age) {
      const d = Math.max(1, Math.floor((Date.now() - founded) / dayMs));
      let t;
      if (d < 14) t = word(d) + (d === 1 ? " day in." : " days in.");
      else if (d < 63) t = word(Math.floor(d / 7)) + " weeks in.";
      else if (d < 730) t = word(Math.floor(d / 30.4)) + " months in.";
      else t = word(Math.floor(d / 365)) + " years in.";
      age.textContent = cap(t);
    }
    const y = $("#year");
    if (y) y.textContent = new Date().getFullYear();
  })();

  /* ---------- invite links + applications switch ---------- */
  if (C.DISCORD_INVITE) $$("[data-invite]").forEach((a) => (a.href = C.DISCORD_INVITE));
  if (C.APPLICATIONS_OPEN === false) {
    const b = $("#apply-btn");
    if (b) { b.setAttribute("aria-disabled", "true"); b.removeAttribute("href"); b.querySelector("span").textContent = "Applications closed"; }
    const m = $("#apply-meta");
    if (m) m.textContent = "Watch the announcements for the next round.";
  }

  /* =====================================================================
     RENDER
     ===================================================================== */
  /* milestones */
  const track = $("#ms-track");
  if (track) {
    D.milestones.forEach((m, i) => {
      const li = el("li", { class: "ms c-" + (m.color || "cyan"), style: "--i:" + i }, [
        el("span", { class: "ms-date", text: m.date }),
        el("p", { class: "ms-big" }, m.now ? el("span", { "data-stat": "members", text: fmt(state.members) }) : m.big),
        el("h3", { text: m.title }),
        el("p", { text: m.text })
      ]);
      if (m.now) {
        li.append(el("div", { class: "ms-bar" }, [
          el("div", { class: "bar", role: "img", "aria-label": "Progress to " + fmt(D.nextGoal) + " members" }, el("i")),
          el("span", { html: '<b class="cur">' + fmt(state.members) + "</b> / " + fmt(D.nextGoal) + " · next stop" })
        ]));
      }
      track.append(li);
    });
    const [prev, next] = $$(".track-btns .round");
    const step = () => (track.querySelector(".ms") ? track.querySelector(".ms").getBoundingClientRect().width + 18 : 320);
    const sync = () => {
      if (!prev) return;
      prev.disabled = track.scrollLeft < 8;
      next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    };
    $$(".track-btns .round").forEach((b) => b.addEventListener("click", () => {
      track.scrollBy({ left: Number(b.dataset.dir) * step(), behavior: reduce ? "auto" : "smooth" });
    }));
    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  }

  /* what makes EG different */
  const featList = $("#features");
  const orb = $("#orb");
  const orbIcon = $("#orb-icon");
  const chipText = (t) => t.replace(/\{(\w+)\}/g, (_, k) => (S[k] !== undefined ? fmt(S[k]) : ""));
  function activate(li) {
    if (!li || li.classList.contains("active")) return;
    $$(".feature.active", featList).forEach((n) => n.classList.remove("active"));
    li.classList.add("active");
    if (orb) {
      orb.style.setProperty("--oc", li.dataset.color);
      orbIcon.replaceChildren(ic(li.dataset.icon));
    }
  }
  if (featList) {
    D.features.forEach((f, i) => {
      const li = el("li", { class: "feature", style: "--fc:" + f.color, "data-color": f.color, "data-icon": f.icon, "data-reveal": true }, [
        el("span", { class: "f-ico" }, ic(f.icon)),
        el("div", { class: "f-text" }, [
          el("div", { class: "f-top" }, [el("span", { class: "f-num", text: String(i + 1).padStart(2, "0") }), el("h3", { text: f.title })]),
          el("p", { text: f.text }),
          f.chip ? el("span", { class: "chip", text: chipText(f.chip) }) : null
        ])
      ]);
      li.addEventListener("mouseenter", () => activate(li));
      featList.append(li);
    });
    activate(featList.firstElementChild);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) activate(e.target); });
      }, { rootMargin: "-45% 0px -45% 0px" });
      $$(".feature", featList).forEach((n) => io.observe(n));
    }
  }

  /* confession cards */
  const ANIMS = { "garbage-head": "a-wobble", "speed-freak": "a-jitter", psychonaut: "a-trip", "pot-head": "a-sway", freak: "a-beat", sobriety: "a-float" };
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const rolesEl = $("#roles");
  if (rolesEl) {
    D.roles.forEach((r, i) => {
      const foot = el("span", { class: "card-foot" });
      let mine = 0;   // this visitor's pretend confession
      const setFoot = () => {
        foot.replaceChildren();
        if (r.hideCount || r.count === null || r.count === undefined) foot.append(mine ? "Confessed" : "Clean record");
        else foot.append(el("b", { text: fmt(r.count + mine) }), " on record");
      };
      setFoot();
      roleCards.push({ key: r.emoji, role: r, paint: setFoot });
      const btn = el("button", {
        type: "button", class: "card", "aria-pressed": "false",
        style: "--c1:" + r.c1 + ";--c2:" + r.c2 + ";--anim:" + (ANIMS[r.emoji] || "a-float")
      }, [
        el("span", { class: "card-top", "aria-hidden": "true" }, [
          el("span", { text: ROMAN[i] || String(i + 1) }),
          r.adult ? el("span", { class: "adult", text: "18+" }) : el("span", { html: "&#10022;" })
        ]),
        el("span", { class: "card-emoji" }, el("img", { src: emojiSrc(r.emoji), alt: "", width: "88", height: "88", loading: "lazy", decoding: "async" })),
        el("span", { class: "card-name", text: "@" + r.name }),
        el("span", { class: "card-text", text: r.text + (r.adult ? " 18+ only." : "") }),
        foot,
        el("span", { class: "stampmark", "aria-hidden": "true", text: "Confessed" })
      ]);
      btn.addEventListener("click", () => {
        const on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(on));
        mine = on ? 1 : 0;
        setFoot();
        toast(r, on);
      });
      if (finePointer && !reduce) {
        btn.addEventListener("pointermove", (e) => {
          const b = btn.getBoundingClientRect();
          const px = (e.clientX - b.left) / b.width;
          const py = (e.clientY - b.top) / b.height;
          btn.style.setProperty("--ry", ((px - 0.5) * 16).toFixed(2) + "deg");
          btn.style.setProperty("--rx", ((0.5 - py) * 12).toFixed(2) + "deg");
          btn.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
          btn.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        });
        btn.addEventListener("pointerleave", () => { btn.style.setProperty("--rx", "0deg"); btn.style.setProperty("--ry", "0deg"); });
      }
      rolesEl.append(el("li", { "data-reveal": true, style: "--d:" + (i * 0.06).toFixed(2) + "s" }, btn));
    });
  }

  /* toasts, styled like the bot's "only you can see this" replies */
  const toastZone = $("#toasts");
  function toast(role, on) {
    if (!toastZone) return;
    while (toastZone.children.length >= 3) toastZone.firstElementChild.remove();
    const msg = el("p", { class: "toast-msg" });
    if (on) msg.append("You confessed to ", el("b", { text: "@" + role.name }), ".");
    else msg.append("Recanted. ", el("b", { text: "@" + role.name }), " never happened.");
    const x = el("button", { type: "button", class: "toast-x", "aria-label": "Dismiss" }, ic("x"));
    const meta = el("p", { class: "toast-meta" }, [ic("eye"), "Only you can see this"]);
    if (on) meta.append(" · ", el("a", { href: C.DISCORD_INVITE || "https://discord.gg/enviousgluttony", target: "_blank", rel: "noopener", text: "Make it official in the server" }));
    const t = el("div", { class: "toast", style: "--c1:" + role.c1 }, [
      el("img", { src: "assets/home/eg-mark.webp", alt: "" }),
      el("p", { class: "toast-who" }, ["Gluttony™", el("small", { text: "APP" })]),
      x, msg, meta
    ]);
    let timer;
    const close = () => { clearTimeout(timer); t.classList.add("out"); setTimeout(() => t.remove(), 300); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, 5200); };
    x.addEventListener("click", close);
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", arm);
    toastZone.append(t);
    arm();
  }

  /* the ladder */
  const stepsEl = $("#steps");
  if (stepsEl) {
    D.ladder.forEach((s, i) => {
      const earned = s.level !== null && s.level !== undefined;
      const f = earned ? Math.sqrt(s.level / 45) : 1;
      const h = earned ? Math.round(120 + f * 300) : 0;
      const w = earned ? Math.round(42 + f * 58) : 100;
      const lvl = earned
        ? el("span", { class: "lvl" }, [el("small", { text: "Level" }), el("b", { text: String(s.level) })])
        : el("span", { class: "lvl" }, [el("small", { text: "Level" }), el("b", { text: "Cannot be earned" })]);
      const who = el("span", { class: "who" });
      const paintWho = () => {
        who.replaceChildren();
        if (!s.members) who.append("Nobody yet");
        else who.append(el("b", { text: fmt(s.members) }), s.members === 1 ? (earned ? " member" : " holder") : " members");
      };
      paintWho();
      ladderSteps.push({ key: s.emoji, step: s, paint: paintWho });
      stepsEl.append(el("li", {
        class: "step" + (earned ? "" : " envy"),
        style: "--c1:" + s.c1 + ";--c2:" + s.c2 + ";--i:" + i + ";--h:" + h + "px;--w:" + w + "%"
      }, [
        el("span", { class: "emb" }, el("img", { src: emojiSrc(s.emoji), alt: "", width: "52", height: "52", loading: "lazy", decoding: "async" })),
        el("span", { class: "step-name", text: "@" + s.name }),
        el("span", { class: "pillar" }, [lvl, who])
      ]));
    });
  }
  const svgNS = "http://www.w3.org/2000/svg";
  function drawConstellation() {
    const svg = $("#constellation");
    if (!svg || !stepsEl || window.innerWidth < 900) return;
    const box = svg.getBoundingClientRect();
    const pts = $$(".emb", stepsEl).map((e) => {
      const r = e.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
    });
    if (pts.length < 2) return;
    svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
    const d = (arr) => "M" + arr.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    const earnedPts = pts.slice(0, -1);
    svg.innerHTML = '<defs><linearGradient id="cgrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9aa7c7"/><stop offset=".5" stop-color="#63f4ff"/><stop offset="1" stop-color="#a98bff"/></linearGradient></defs>';
    const base = document.createElementNS(svgNS, "path");
    base.setAttribute("d", d(pts));
    const lit = document.createElementNS(svgNS, "path");
    lit.setAttribute("d", d(earnedPts));
    lit.setAttribute("class", "lit");
    svg.append(base, lit);
    const len = lit.getTotalLength();
    lit.style.strokeDasharray = len;
    lit.style.strokeDashoffset = stepsEl.classList.contains("in") || reduce ? 0 : len;
    lit.style.transition = "stroke-dashoffset 1.8s cubic-bezier(.2,.7,.2,1) .5s";
  }

  /* commands */
  const cmdsEl = $("#cmds");
  if (cmdsEl) {
    const colors = ["var(--cyan)", "#a57bff", "var(--magenta)", "var(--mint)", "var(--amber)"];
    const rows = new Map();
    paintCommands = () => {
      const list = S.commands.slice().sort((a, b) => b.uses - a.uses);
      const max = list[0] ? Math.max(1, list[0].uses) : 1;
      list.forEach((c, i) => {
        let row = rows.get(c.cmd);
        if (!row) {
          const bar = el("i");
          const num = el("b");
          row = { li: el("li", { class: "cmd" }, [el("code", { text: c.cmd }), el("span", { class: "bar" }, bar), num]), bar: bar, num: num };
          rows.set(c.cmd, row);
        }
        row.li.style.setProperty("--c", colors[i % colors.length]);
        row.li.style.setProperty("--i", i);
        row.bar.style.setProperty("--p", ((c.uses / max) * 100).toFixed(1) + "%");
        row.num.textContent = fmt(c.uses);
        if (cmdsEl.children[i] !== row.li) cmdsEl.insertBefore(row.li, cmdsEl.children[i] || null);
      });
      const total = $("#cmd-total");
      const sum = list.reduce((a, c) => a + c.uses, 0);
      if (total) {
        total.dataset.target = sum;
        if (total.dataset.counted) animateNum(total, sum); else total.textContent = fmt(sum);
      }
    };
    paintCommands();
  }

  /* voice waveform */
  const wave = $("#wave");
  if (wave) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 46;
    for (let i = 0; i < n; i++) {
      const env = 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / n);
      const s = Math.max(0.12, Math.min(1, env * (0.45 + rnd() * 0.75)));
      wave.append(el("i", { style: "--s:" + s.toFixed(2) + ";--t:" + (0.7 + rnd() * 0.9).toFixed(2) + "s;--d:-" + (rnd() * 1.5).toFixed(2) + "s" }));
    }
  }

  /* rules */
  const r1 = $("#r1");
  const ruleList = $("#rule-list");
  const rd = $("#rd-list");
  D.rules.forEach((r, i) => {
    if (i === 0 && r1) {
      r1.append(
        el("span", { class: "r1-icon", "aria-hidden": "true" }, ic(r.icon)),
        el("span", { class: "r1-code", "aria-hidden": "true", text: r.code }),
        el("h3", {}, [el("span", { class: "sr-only", text: r.code + ": " }), r.title + "."]),
        el("p", { text: r.short }),
        r.warn ? el("p", { class: "r1-warn" }, [ic("triangle-alert"), el("span", { text: r.warn })]) : null
      );
    } else if (ruleList) {
      ruleList.append(el("li", { class: "rule", "data-reveal": true, style: "--d:" + ((i - 1) * 0.05).toFixed(2) + "s" }, [
        el("span", { class: "code", text: r.code }),
        el("h3", {}, [ic(r.icon), el("span", { text: r.title })]),
        el("p", { text: r.short })
      ]));
    }
    if (rd) rd.append(el("li", {}, [el("span", { class: "code", text: r.code }), el("h3", { text: r.title })].concat(r.full.map((p) => el("p", { text: p })))));
  });
  const dlg = $("#rules-dialog");
  const openRules = $("#open-rules");
  if (dlg && openRules) {
    if (typeof dlg.showModal !== "function") {
      openRules.hidden = true;
    } else {
      openRules.addEventListener("click", () => dlg.showModal());
      $("#close-rules").addEventListener("click", () => dlg.close());
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("close", () => openRules.focus());
    }
  }

  /* certificate frame + seal (drawn so they stay crisp at any size) */
  function drawCert() {
    const cert = $("#cert");
    if (!cert) return;
    const frame = $(".cert-frame", cert);
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    frame.setAttribute("viewBox", "0 0 " + w + " " + h);
    const inset = 8;
    const wavePath = (phase, amp) => {
      const pts = [];
      const per = (x0, y0, x1, y1) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(8, Math.round(len / 3));
        const nx = -(y1 - y0) / len;
        const ny = (x1 - x0) / len;
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const off = Math.sin(t * len / 9 + phase) * amp;
          pts.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
        }
      };
      per(inset, inset, w - inset, inset);
      per(w - inset, inset, w - inset, h - inset);
      per(w - inset, h - inset, inset, h - inset);
      per(inset, h - inset, inset, inset);
      return "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + "Z";
    };
    frame.innerHTML =
      '<rect x=".5" y=".5" width="' + (w - 1) + '" height="' + (h - 1) + '" rx="4" fill="none" stroke="rgba(245,240,230,.28)"/>' +
      '<path d="' + wavePath(0, 3) + '" fill="none" stroke="rgba(99,244,255,.45)" stroke-width=".8"/>' +
      '<path d="' + wavePath(Math.PI, 3) + '" fill="none" stroke="rgba(168,85,247,.55)" stroke-width=".8"/>' +
      '<rect x="' + (inset + 8) + '" y="' + (inset + 8) + '" width="' + (w - 2 * inset - 16) + '" height="' + (h - 2 * inset - 16) + '" rx="2" fill="none" stroke="rgba(245,240,230,.14)"/>';
  }
  (function seal() {
    const s = $(".cert-seal");
    if (!s) return;
    let petals = "";
    for (let i = 0; i < 24; i++) petals += '<ellipse cx="60" cy="60" rx="44" ry="15" transform="rotate(' + i * 7.5 + ' 60 60)"/>';
    s.innerHTML =
      '<defs><path id="sealtext" d="M60 60 m-47 0 a47 47 0 1 1 94 0 a47 47 0 1 1 -94 0"/></defs>' +
      '<circle cx="60" cy="60" r="57" fill="rgba(142,68,255,.16)" stroke="rgba(245,240,230,.5)"/>' +
      '<g fill="none" stroke="rgba(99,244,255,.45)" stroke-width=".6">' + petals + "</g>" +
      '<circle cx="60" cy="60" r="27" fill="#0b0f2c" stroke="rgba(245,240,230,.6)"/>' +
      '<text font-family="Rajdhani, sans-serif" font-size="9.5" font-weight="700" letter-spacing="2.2" fill="rgba(245,240,230,.8)"><textPath href="#sealtext">BY THE PEOPLE · FOR THE PEOPLE · WITH THE PEOPLE ·</textPath></text>' +
      '<g transform="translate(46 44) scale(1.15)" fill="none" stroke="#63f4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (window.EG_ICONS.crown || "") + "</g>";
  })();

  /* =====================================================================
     $EG CHART
     ===================================================================== */
  const HOUR = 3600e3;
  const tabs = $$(".stock-tabs [data-range]");
  const chartEl = $("#stock-chart");
  const chart = chartEl && window.EGChart ? window.EGChart.create(chartEl, { range: "7d", onSummary: paintQuote }) : null;
  function paintQuote(q) {
    const set = (id, v) => { const n = $("#" + id); if (n) n.textContent = v; };
    const ch = $("#stock-change");
    if (!q) { ["q-open", "q-high", "q-low", "q-vol"].forEach((k) => set(k, "–")); if (ch) ch.hidden = true; return; }
    set("q-open", fmt(q.open)); set("q-high", fmt(q.high)); set("q-low", fmt(q.low)); set("q-vol", fmt(q.volume));
    if (ch) {
      ch.hidden = false;
      ch.classList.toggle("down", q.change < 0);
      ch.classList.toggle("flat", q.change === 0);
      $(".arrow", ch).textContent = q.change < 0 ? "▼" : q.change > 0 ? "▲" : "■";
      $("b", ch).textContent = (q.change > 0 ? "+" : q.change < 0 ? "−" : "") + fmt(Math.abs(q.change));
      $(".pct", ch).textContent = "(" + (q.change < 0 ? "−" : q.change > 0 ? "+" : "") + Math.abs(q.pct).toFixed(1) + "%)";
      $(".rl", ch).textContent = q.label;
    }
  }
  /* Until the bot has sent history, the chart uses the milestone counts + join log in home-data.js */
  function fallbackPoints(range) {
    const F = D.chartFallback || { anchors: [], joins: [] };
    const bucket = chart ? chart.bucket(range) : HOUR;
    const pts = F.anchors.map((a) => ({ t: Date.parse(a[0]), tm: Date.parse(a[0]), m: a[1], j: 0 }));
    const counts = new Map();
    for (const ts of F.joins) {
      const d = new Date(ts * 1000);
      if (bucket >= 24 * HOUR) d.setHours(0, 0, 0, 0);
      else { const step = Math.round(bucket / HOUR); d.setHours(d.getHours() - (d.getHours() % step), 0, 0, 0); }
      counts.set(d.getTime(), (counts.get(d.getTime()) || 0) + 1);
    }
    counts.forEach((n, t) => pts.push({ t: t, tm: t + bucket, m: null, j: n }));
    return pts;
  }
  let historyLoader = null;
  let loadSeq = 0;
  async function loadChart() {
    if (!chart) return;
    const range = chart.range;
    const seq = ++loadSeq;
    let pts = null;
    if (historyLoader) {
      try { pts = await historyLoader(range); } catch (e) { pts = null; }
    }
    if (seq !== loadSeq) return;               // a newer request won
    chartEl.dataset.source = pts && pts.length ? "bot" : "fallback";
    chart.setPoints(pts && pts.length ? pts : fallbackPoints(range));
  }
  tabs.forEach((b) => b.addEventListener("click", () => {
    if (!chart || b.getAttribute("aria-pressed") === "true") return;
    tabs.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    chart.setRange(b.dataset.range);
    chartEl.classList.add("switching");
    loadChart().finally(() => requestAnimationFrame(() => chartEl.classList.remove("switching")));
  }));
  if (chart) { chart.setNow(state.members); loadChart(); }

  /* =====================================================================
     LIVE DATA (home-live.js calls these)
     ===================================================================== */
  function applyLive(data, at) {
    if (!data || typeof data !== "object") return;
    const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
    state.bot = true;
    state.botAt = at || Date.now();
    if (num(data.members) !== null) state.members = data.members;
    if (num(data.boosts) !== null) state.boosts = data.boosts;
    if (num(data.in_voice) !== null) { state.third = data.in_voice; state.thirdLabel = "in voice"; }
    const map = { messages: "messages", voice_hours: "voiceHours", voice_people: "voicePeople", joins_24h: "joins24h", joins_7d: "joins7d", xp_people: "xpPeople" };
    for (const k in map) if (num(data[k]) !== null) S[map[k]] = data[k];
    if (data.commands && typeof data.commands === "object") {
      for (const name in data.commands) {
        const v = num(data.commands[name]);
        if (v === null) continue;
        const cmd = "!" + name.replace(/^!/, "");
        const row = S.commands.find((c) => c.cmd === cmd);
        if (row) row.uses = v; else S.commands.push({ cmd: cmd, uses: v });
      }
    }
    if (data.vices) roleCards.forEach((c) => { const v = num(data.vices[c.key]); if (v !== null) c.role.count = v; });
    if (data.ladder) ladderSteps.forEach((st) => { const v = num(data.ladder[st.key]); if (v !== null) st.step.members = v; });
    bindAll();
  }
  window.EG_HOME_API = {
    applyLive: applyLive,
    setHistoryLoader: (fn) => { historyLoader = fn; loadChart(); },
    reloadChart: () => loadChart(),
    state: state
  };

  bindAll();

  /* =====================================================================
     MOTION
     ===================================================================== */
  /* reveal on scroll + first-time counters */
  function onReveal(node) {
    node.classList.add("in");
    $$("[data-count]", node).forEach((n) => {
      if (n.dataset.counted) return;
      n.dataset.counted = "1";
      n.dataset.shown = "0";
      animateNum(n, Number(n.dataset.target || String(n.textContent).replace(/[^\d]/g, "")));
    });
    if (node.classList.contains("t-xp")) {
      const ring = $(".ring .fill", node);
      if (ring) ring.style.strokeDashoffset = (327 * (1 - Number($("#xp-ring").dataset.pct || 0) / 100)).toFixed(1);
    }
    if (node.classList.contains("t-stock") && chart) chart.render();
  }
  const revealables = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { onReveal(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealables.forEach((n) => io.observe(n));
    const once = (node, fn, margin) => {
      if (!node) return;
      const o = new IntersectionObserver((es) => { if (es[0].isIntersecting) { fn(); o.disconnect(); } }, { rootMargin: margin || "0px 0px -15% 0px" });
      o.observe(node);
    };
    once(stepsEl, () => { stepsEl.classList.add("in"); const lit = $("#constellation path.lit"); if (lit) lit.style.strokeDashoffset = 0; });
    once($(".ms-bar"), () => $(".ms-bar").classList.add("in"));
  } else {
    revealables.forEach(onReveal);
    if (stepsEl) stepsEl.classList.add("in");
    const bar = $(".ms-bar");
    if (bar) bar.classList.add("in");
  }
  /* waveform only moves while it's on screen */
  if (wave && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => wave.classList.toggle("on", es[0].isIntersecting)).observe(wave);
  }

  /* nav: solid after scrolling, highlight the current section */
  const nav = $("#nav");
  const navLinks = $$(".nav-links a[data-spy]");
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const key = e.target.dataset.spySection;
        navLinks.forEach((a) => (a.dataset.spy === key ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("[data-spy-section]").forEach((s) => spy.observe(s));
  }

  /* ---------- stars, parallax, pointer ---------- */
  const canvas = $("#stars");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  const heroArt = $("#hero-art");
  const hero = $(".hero");
  let W = 0, H = 0, DPR = 1, stars = [];
  let scrollY = window.scrollY, lastDrawScroll = -1, lastDraw = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let seedS = 11;
  const rs = () => ((seedS = (seedS * 16807) % 2147483647) / 2147483647);
  const TINTS = ["255,255,255", "255,255,255", "214,228,255", "190,240,255", "220,200,255", "255,220,245"];

  function buildStars() {
    if (!ctx) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const count = Math.min(760, Math.round((W * H) / (W < 760 ? 2600 : 2100)));
    seedS = 11;
    stars = [];
    for (let i = 0; i < count; i++) {
      const z = Math.pow(rs(), 2.2);                  // most stars are far away
      stars.push({
        x: rs() * W, y: rs() * H, z: z,
        r: 0.35 + z * 1.35,
        a: 0.25 + rs() * 0.55 + z * 0.2,
        tw: 0.4 + rs() * 1.6, ph: rs() * 6.283,
        c: TINTS[Math.floor(rs() * TINTS.length)],
        sparkle: z > 0.8 && rs() > 0.55
      });
    }
    lastDrawScroll = -1;
  }
  function drawStars(t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const sy = scrollY;
    for (const s of stars) {
      let y = (s.y - sy * (0.02 + s.z * 0.1) + ptr.y * s.z * 10) % H;
      if (y < 0) y += H;
      const x = s.x + ptr.x * s.z * 14;
      const tw = reduce ? 1 : 0.62 + 0.38 * Math.sin(t * 0.001 * s.tw + s.ph);
      const a = Math.min(1, s.a * tw);
      ctx.fillStyle = "rgba(" + s.c + "," + a.toFixed(3) + ")";
      if (s.r < 0.9) ctx.fillRect(x, y, s.r * 1.6, s.r * 1.6);
      else { ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill(); }
      if (s.sparkle) {
        const L = 4 + s.r * 3.5 * tw;
        ctx.strokeStyle = "rgba(" + s.c + "," + (a * 0.55).toFixed(3) + ")";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.stroke();
      }
    }
  }
  let artTx = 0, artTy = 0;                          // where the hero art sits right now (home-rocket.js reads it)
  function parallax() {
    if (reduce || !hero) return;
    const hh = hero.offsetHeight;
    if (scrollY > hh * 1.2) return;
    if (!heroArt) return;
    if (window.innerWidth >= 760) { artTx = ptr.x * -12; artTy = scrollY * 0.14 + ptr.y * -10; }
    else { artTx = 0; artTy = scrollY * 0.12; }
    heroArt.style.transform = "translate3d(" + artTx.toFixed(1) + "px," + artTy.toFixed(1) + "px,0)";
  }
  window.EG_HOME_API.art = () => ({ tx: artTx, ty: artTy });
  let running = false;
  function frame(t) {
    if (!running) return;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    const moving = Math.abs(ptr.tx - ptr.x) > 0.001 || Math.abs(ptr.ty - ptr.y) > 0.001;
    if (scrollY !== lastDrawScroll || moving || t - lastDraw > 40) {
      drawStars(t);
      lastDraw = t;
      lastDrawScroll = scrollY;
    }
    parallax();
    requestAnimationFrame(frame);
  }
  function start() { if (!running && !reduce) { running = true; requestAnimationFrame(frame); } }
  function stop() { running = false; }

  buildStars();
  if (reduce) drawStars(0); else start();
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { buildStars(); if (reduce) drawStars(0); drawCert(); drawConstellation(); }, 150);
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  window.addEventListener("scroll", () => {
    scrollY = window.scrollY;
    if (nav) nav.classList.toggle("scrolled", scrollY > 24);
  }, { passive: true });
  if (nav) nav.classList.toggle("scrolled", window.scrollY > 24);
  if (finePointer && !reduce) {
    window.addEventListener("pointermove", (e) => {
      ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* poster light follows the cursor */
  const poster = $("#poster");
  if (poster && finePointer && !reduce) {
    poster.addEventListener("pointermove", (e) => {
      const b = poster.getBoundingClientRect();
      poster.style.setProperty("--mx", (((e.clientX - b.left) / b.width) * 100).toFixed(1) + "%");
      poster.style.setProperty("--my", (((e.clientY - b.top) / b.height) * 100).toFixed(1) + "%");
    });
  }

  /* layout-dependent drawings once fonts and images have settled */
  const settle = () => { drawCert(); drawConstellation(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
  window.addEventListener("load", settle);
  settle();

  /* =====================================================================
     LIVE COUNTS FROM DISCORD (public invite info; falls back quietly)
     ===================================================================== */
  (async function inviteCounts() {
    await new Promise((r) => setTimeout(r, 2500));   // give the bot's numbers a head start
    if (state.bot) return;
    const code = String(C.DISCORD_INVITE || "").split("/").filter(Boolean).pop();
    if (!code || !window.fetch) return;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 6000);
    try {
      const res = await fetch("https://discord.com/api/v10/invites/" + encodeURIComponent(code) + "?with_counts=true", {
        signal: ctrl ? ctrl.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer"
      });
      if (!res.ok) return;
      const j = await res.json();
      if (state.bot) return;                  // the bot's numbers win
      if (j.approximate_member_count) state.members = j.approximate_member_count;
      if (j.guild && typeof j.guild.premium_subscription_count === "number") state.boosts = j.guild.premium_subscription_count;
      if (j.approximate_presence_count) { state.third = j.approximate_presence_count; state.thirdLabel = "online now"; }
      state.invite = true;
      bindAll();
    } catch (e) {
      /* offline, blocked or rate-limited: the numbers in home-data.js stay */
    } finally {
      clearTimeout(timer);
    }
  })();
})();
