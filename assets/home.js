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
    worldChips.forEach((c) => (c.node.textContent = chipText(c.text)));
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

  /* what makes EG different: five worlds. Desktop: the planet on the left follows the chapter
     you're reading. Phones: a swipeable row of cards. The rail jumps to any world. */
  const chipText = (t) => t.replace(/\{(\w+)\}/g, (_, k) => (S[k] !== undefined ? fmt(S[k]) : ""));
  const worldChips = [];
  const worlds = $("#worlds");
  const featList = $("#features");
  if (worlds && featList && D.features && D.features.length) {
    const planetsEl = $("#w-planets"), rail = $("#w-rail"), numEl = $("#w-num"), tagEl = $("#w-tag"), waveEl = $("#w-wave"), stage = $("#w-stage");
    const art = (f, w) => "assets/home/worlds/" + f.art + (w < 1200 ? "-" + w : "") + ".webp";
    const set = (f) => art(f, 600) + " 600w, " + art(f, 900) + " 900w, " + art(f, 1200) + " 1200w";
    const n = D.features.length;
    const pad = (i) => String(i + 1).padStart(2, "0");
    const planets = [], chapters = [], dots = [];
    D.features.forEach((f, i) => {
      planets.push(el("span", { class: "w-planet " + (i ? "after" : "on") }, el("span", { class: "w-float" },
        el("img", { src: art(f, 1200), srcset: set(f), sizes: "(min-width: 960px) 46vw, 80vw", alt: "", width: "1200", height: "900", decoding: "async", loading: i ? "lazy" : null, draggable: "false" }))));
      const chip = f.chip ? el("span", { class: "chip", text: chipText(f.chip) }) : null;
      if (chip && /\{/.test(f.chip)) worldChips.push({ node: chip, text: f.chip });
      chapters.push(el("li", { class: "world" + (i ? "" : " active"), style: "--wc:" + f.color }, [
        el("span", { class: "world-art", "aria-hidden": "true" }, [
          el("img", { src: art(f, 600), srcset: set(f), sizes: "80vw", alt: "", width: "600", height: "450", decoding: "async", loading: "lazy", draggable: "false" }),
          el("span", { class: "world-tag", text: f.tag })
        ]),
        el("p", { class: "world-idx" }, [el("b", { text: pad(i) }), el("span", { text: "/ " + pad(n - 1) })]),
        el("h3", { text: f.title }),
        el("p", { class: "world-text", text: f.text }),
        chip
      ]));
      const dot = el("button", { type: "button", class: "w-dot" + (i ? "" : " on"), style: "--wc:" + f.color, "aria-label": pad(i) + " " + f.title, "aria-current": i ? "false" : "true" }, [
        el("span", { class: "w-dot-pic" }, el("img", { src: art(f, 300), alt: "", width: "300", height: "225", decoding: "async", loading: "lazy", draggable: "false" })),
        el("span", { class: "w-dot-num", text: pad(i) })
      ]);
      dot.addEventListener("click", () => go(i));
      dots.push(dot);
    });
    planetsEl.append(...planets);
    featList.append(...chapters);
    rail.append(...dots);

    let active = 0;
    const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
    function paintStage(i, animate) {
      const f = D.features[i];
      worlds.style.setProperty("--pc", f.color);
      rail.style.setProperty("--p", n > 1 ? (i / (n - 1)).toFixed(3) : "0");
      numEl.textContent = pad(i);
      tagEl.textContent = f.tag;
      if (animate && !reduce) { restart(numEl, "in"); restart(tagEl, "in"); restart(waveEl, "in"); }
    }
    function setActive(i) {
      if (i === active || i < 0 || i >= n) return;
      active = i;
      planets.forEach((p, k) => { p.classList.toggle("on", k === i); p.classList.toggle("before", k < i); p.classList.toggle("after", k > i); });
      chapters.forEach((c, k) => c.classList.toggle("active", k === i));
      dots.forEach((d, k) => { d.classList.toggle("on", k === i); d.classList.toggle("done", k < i); d.setAttribute("aria-current", String(k === i)); });
      paintStage(i, true);
    }
    paintStage(0, false);

    const wide = window.matchMedia("(min-width: 960px)");
    function go(i) {
      const c = chapters[i];
      if (wide.matches) {
        const r = c.getBoundingClientRect();
        window.scrollBy({ top: r.top + r.height / 2 - window.innerHeight / 2, behavior: reduce ? "auto" : "smooth" });
      } else {
        featList.scrollTo({ left: c.offsetLeft - (featList.clientWidth - c.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
      }
      setActive(i);
    }
    // which world you're on: the chapter crossing the middle of the screen, or the card in the middle of the row
    let io = null;
    function watch() {
      if (io) io.disconnect();
      if (!("IntersectionObserver" in window)) return;
      io = wide.matches
        ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(chapters.indexOf(e.target)); }), { rootMargin: "-46% 0px -46% 0px" })
        : new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(chapters.indexOf(e.target)); }), { root: featList, threshold: 0.6 });
      chapters.forEach((c) => io.observe(c));
    }
    watch();
    if (wide.addEventListener) wide.addEventListener("change", watch);

    // the planet leans toward the pointer
    if (finePointer && !reduce && stage) {
      let raf = 0, px = 0, py = 0;
      stage.addEventListener("pointermove", (e) => {
        const b = stage.getBoundingClientRect();
        px = (e.clientX - b.left) / b.width - 0.5; py = (e.clientY - b.top) / b.height - 0.5;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; planetsEl.style.transform = "translate3d(" + (px * 18).toFixed(1) + "px," + (py * 12).toFixed(1) + "px,0) rotateY(" + (px * 10).toFixed(1) + "deg) rotateX(" + (-py * 8).toFixed(1) + "deg)"; });
      });
      stage.addEventListener("pointerleave", () => { planetsEl.style.transform = ""; });
    }
  }

  /* confession cards. For visitors they're a preview. Signed in with Discord (and with the bot up),
     a tap is the real thing: the Gluttony™ bot gives or takes the role in the server, same rules as its panel. */
  const ANIMS = { "garbage-head": "a-wobble", "speed-freak": "a-jitter", psychonaut: "a-trip", "pot-head": "a-sway", freak: "a-beat", sobriety: "a-float" };
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const INVITE = C.DISCORD_INVITE || "https://discord.gg/enviousgluttony";
  const rolesEl = $("#roles");
  const linkEl = $("#conf-link");
  // user: signed in with Discord. bot: the bot takes website confessions. member: in the server (null = not checked yet)
  const link = { user: null, name: "", bot: false, member: null, locked: false, held: null, heldId: 0, asking: false, asked: 0 };
  const linked = () => !!(link.user && link.bot && link.member !== false);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const roleNamed = (key) => { const c = roleCards.find((x) => x.key === key); return c ? c.role : null; };
  const clicks = (node, fn) => { node.addEventListener("click", fn); return node; };
  if (rolesEl) {
    D.roles.forEach((r, i) => {
      const foot = el("span", { class: "card-foot" });
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
      const c = { key: r.emoji, role: r, btn: btn, mine: 0, adj: null, busy: 0, gate: null };
      c.on = () => btn.getAttribute("aria-pressed") === "true";
      c.set = (on) => btn.setAttribute("aria-pressed", String(!!on));
      c.paint = () => {
        foot.replaceChildren();
        if (c.busy) { foot.append(ic("loader-circle", "spin"), Date.now() - c.busy > 12000 ? "Still sending" : "Sending"); return; }
        const extra = linked() ? (c.adj ? c.adj.d : 0) : c.mine;
        if (r.hideCount || r.count === null || r.count === undefined) foot.append(c.on() ? "Confessed" : "Clean record");
        else foot.append(el("b", { text: fmt(Math.max(0, r.count + extra)) }), " on record");
      };
      c.paint();
      roleCards.push(c);
      btn.addEventListener("click", () => (linked() ? confessReal(c) : confessPretend(c)));
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

  /* the preview: nothing leaves the page */
  function confessPretend(c) {
    const on = !c.on();
    c.set(on);
    c.mine = on ? 1 : 0;
    c.paint();
    const meta = [];
    if (on && link.bot && !link.user) meta.push(clicks(el("button", { type: "button", class: "toast-link", text: "Sign in with Discord to make it official" }), signIn));
    else if (on) meta.push(el("a", { href: INVITE, target: "_blank", rel: "noopener", text: link.member === false ? "Join the server to make it official" : "Make it official in the server" }));
    toast(c.role.c1, on ? ["You confessed to ", el("b", { text: "@" + c.role.name }), "."] : ["Recanted. ", el("b", { text: "@" + c.role.name }), " never happened."], meta);
  }

  /* the real thing: ask the bot, wait for its answer */
  async function ask(vice, action, adult, c) {
    const sb = window.EG && window.EG.sb;
    if (!sb) throw new Error("not connected");
    const r = await sb.rpc("confess", { p_vice: vice, p_action: action, p_adult: !!adult });
    if (r.error) throw r.error;
    if (!r.data || !r.data.ok) return r.data || { ok: false };
    const id = Number(r.data.id) || 0;
    const started = Date.now();
    const late = { ok: false, code: "timeout", error: "The bot didn't get to it, so nothing changed. Try again in a minute." };
    let misses = 0;
    for (let n = 0; ; n++) {
      await sleep(n < 20 ? 500 : 1500);
      if (c) c.paint();                                   // "Still sending" after a while
      const q = await sb.from("confession_requests").select("status,result").eq("id", r.data.id).maybeSingle();
      if (q.error || !q.data) { if (++misses > 6) throw q.error || new Error("lost"); continue; }
      const st = q.data.status;
      if (st === "done" || st === "failed") return Object.assign({ ok: false }, q.data.result, { id: id });
      if (st === "expired") return late;
      const waited = Date.now() - started;
      if (st === "pending" && waited > 36000) return late;   // the database drops it at 30s, so it can't happen later
      if (waited > 75000) return { ok: false, code: "slow", error: "Still going through. Check your roles in the server in a minute." };
    }
  }
  function setHeld(list, at, id) {
    if (id && id < link.heldId) return;                  // an older answer than the one on screen
    if (id) link.heldId = id;
    const now = new Set(Array.isArray(list) ? list : []);
    roleCards.forEach((c) => {
      const was = link.held ? link.held.has(c.key) : c.on();
      const on = now.has(c.key);
      if (at && was !== on) c.adj = { d: (c.adj ? c.adj.d : 0) + (on ? 1 : -1), at: at };   // until the bot's next count
      c.mine = 0;
      c.set(on);
      c.paint();
    });
    link.held = now;
  }
  async function checkRecord() {
    if (!link.user || !link.bot || link.asking) return;
    link.asking = true;
    link.asked = Date.now();
    paintLink();
    let res = null;
    try { res = await ask(null, "status", false); } catch (e) { res = null; }
    link.asking = false;
    if (res && res.ok) { link.member = true; link.locked = !!res.locked; setHeld(res.held, 0, res.id); }
    else if (res && res.code === "not_member") { link.member = false; setHeld([], 0, res.id); }
    else if (res && res.code === "offline") link.bot = false;
    else setTimeout(() => { if (!link.held) checkRecord(); }, 30000);   // couldn't check just now: taps still work
    linkChanged();
  }
  async function confessReal(c, adult) {
    if (c.busy) return;
    const add = !c.on();
    if (add && c.role.adult && !adult) { gate(c); return; }
    c.busy = Date.now();
    c.btn.setAttribute("aria-busy", "true");
    c.paint();
    let res;
    try { res = await ask(c.key, add ? "add" : "remove", adult, c); }
    catch (e) {
      const expired = /permission denied|jwt/i.test(String((e && e.message) || e));
      res = { ok: false, error: expired ? "Your sign-in ran out. Sign in with Discord again." : window.EG ? window.EG.friendlyError(e) : "Couldn't reach the server. Try again." };
      if (expired) setTimeout(findUser, 0);
    }
    c.busy = 0;
    c.btn.removeAttribute("aria-busy");
    if (res.code === "not_member") link.member = false;
    if (res.code === "offline") link.bot = false;
    if (typeof res.locked === "boolean" || res.code === "locked") link.locked = !!res.locked || res.code === "locked";
    if (Array.isArray(res.held)) setHeld(res.held, res.ok && !res.same ? Number(res.at) || 1 : 0, res.id);
    else c.paint();
    paintLink();
    const name = el("b", { text: "@" + c.role.name });
    if (!res.ok) {
      c.btn.classList.remove("nope"); void c.btn.offsetWidth; c.btn.classList.add("nope");
      const meta = res.code === "not_member" ? [el("a", { href: INVITE, target: "_blank", rel: "noopener", text: "Join the server" })] : [];
      toast(c.role.c1, ["That didn't take. ", res.error || "Try again in a moment."], meta);
      return;
    }
    if (res.same) { toast(c.role.c1, add ? [name, " is already on your record."] : [name, " wasn't on your record."]); return; }
    if (add) { c.btn.classList.remove("hit"); void c.btn.offsetWidth; c.btn.classList.add("hit"); }
    const msg = add ? ["You confessed to ", name, ". "] : ["You recanted ", name, ". "];
    if (res.line) msg.push(res.line);
    const extra = [];
    const cleared = (res.cleared || []).map(roleNamed).filter(Boolean);
    if (cleared.length) {
      extra.push(el("p", { class: "toast-also" }, ["Also cleared: "].concat(cleared.map((r, k) => [k ? ", " : "", el("s", { text: "@" + r.name })]).flat())));
    }
    toast(c.role.c1, msg, [el("span", { class: "toast-done" }, [ic("check"), "Done in the server"])], { extra: extra });
  }

  /* 18+ on the way in, like the bot's own confirm */
  function gate(c) {
    if (c.gate && c.gate.open()) return;
    const yes = el("button", { type: "button", class: "toast-btn danger", text: "I'm 18 or older" });
    const no = el("button", { type: "button", class: "toast-btn", text: "Never mind" });
    const t = toast(c.role.c1, [el("b", { text: "@" + c.role.name }), " The back room is 18+. That's Discord's rule, not ours."], [], { actions: [yes, no], stay: 60000 });
    c.gate = t;
    if (!t) return;
    yes.addEventListener("click", () => { t.close(); c.gate = null; confessReal(c, true); });
    no.addEventListener("click", () => {
      c.gate = null;
      t.update(["Left as it was. Nothing went on your record."]);
    });
    setTimeout(() => yes.focus({ preventScroll: true }), 50);
  }

  /* who's here (supa.js loads after this file) */
  async function signIn() {
    const next = "/#confession";
    const EG = window.EG;
    try {
      if (EG && EG.configured && C.DISCORD_LOGIN) { await EG.oauth("discord", next); return; }
    } catch (e) { /* use the sign-in page instead */ }
    location.href = "/signin/?next=" + encodeURIComponent(next);
  }
  function paintLink() {
    if (!linkEl) return;
    linkEl.replaceChildren();
    linkEl.className = "conf-link";
    linkEl.hidden = !link.bot;
    if (!link.bot) return;
    if (!link.user) {
      linkEl.append(clicks(el("button", { type: "button", class: "conf-signin" }, [ic("discord"), el("span", { text: "Sign in with Discord" }), ic("arrow-right", "arrow")]), signIn),
        el("span", { class: "conf-why", text: "to make it official." }));
      return;
    }
    const who = el("b", { text: "@" + (link.name || "you") });
    if (link.member === false) {
      linkEl.classList.add("warn");
      linkEl.append(el("span", { class: "dot" }), el("span", {}, ["Signed in as ", who, ", but you're not in the server yet. ",
        el("a", { href: INVITE, target: "_blank", rel: "noopener", text: "Join it" }), " and your taps count."]));
      return;
    }
    linkEl.classList.add(link.locked ? "warn" : "on");
    linkEl.append(el("span", { class: "dot" }), el("span", {}, ["Linked to Discord as ", who, ". ",
      link.locked ? "Your record's locked right now." : link.asking && !link.held ? "Checking your record…" : "Your taps are the real thing."]));
  }
  function linkChanged() {
    paintLink();
    roleCards.forEach((c) => c.paint());
    if (linked() && !link.asked) checkRecord();
  }
  async function findUser() {
    const EG = window.EG;
    if (!EG || !EG.configured) return;
    let user = null;
    try { user = await EG.user(); } catch (e) { user = null; }
    const idn = ((user && user.identities) || []).find((i) => i.provider === "discord");
    const d = (idn && idn.identity_data) || {};
    const was = link.user ? link.user.id : null;
    link.user = idn ? user : null;
    link.name = idn ? String(d.full_name || d.name || d.user_name || "").replace(/#0$/, "") : "";
    if ((link.user ? link.user.id : null) !== was) {
      Object.assign(link, { member: null, locked: false, held: null, heldId: 0, asked: 0 });
      if (was) roleCards.forEach((c) => { c.set(false); c.mine = 0; c.adj = null; });   // signed out: their record leaves the screen too
    }
    linkChanged();
  }
  function watchUser() {
    findUser();
    try {
      window.EG.sb.auth.onAuthStateChange((ev) => {
        if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") setTimeout(findUser, 0);
      });
    } catch (e) { /* no accounts on this site */ }
    // check the record again when the cards come back into view or the tab comes back (roles change in Discord too)
    const recheck = () => { if (link.user && link.bot && Date.now() - link.asked > (link.member === false ? 15000 : 90000)) checkRecord(); };
    const sec = $("#confession");
    if (sec && "IntersectionObserver" in window) {
      new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) recheck(); }).observe(sec);
    }
    document.addEventListener("visibilitychange", () => { if (!document.hidden) recheck(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchUser);
  else setTimeout(watchUser, 0);

  /* toasts, styled like the bot's "only you can see this" replies */
  const toastZone = $("#toasts");
  function toast(color, msgParts, metaParts, opts) {
    if (!toastZone) return null;
    opts = opts || {};
    while (toastZone.children.length >= 3) toastZone.firstElementChild.remove();
    const msg = el("p", { class: "toast-msg" }, msgParts);
    const x = el("button", { type: "button", class: "toast-x", "aria-label": "Dismiss" }, ic("x"));
    const meta = el("p", { class: "toast-meta" }, [ic("eye"), "Only you can see this"]);
    (metaParts || []).forEach((m) => meta.append(" · ", m));
    const acts = opts.actions ? el("div", { class: "toast-acts" }, opts.actions) : null;
    const t = el("div", { class: "toast", style: "--c1:" + color }, [
      el("img", { src: "assets/home/eg-mark.webp", alt: "" }),
      el("p", { class: "toast-who" }, ["Gluttony™", el("small", { text: "APP" })]),
      x, msg
    ].concat(opts.extra || [], acts ? [acts] : [], [meta]));
    let timer;
    let gone = false;
    const close = () => { if (gone) return; gone = true; clearTimeout(timer); t.classList.add("out"); setTimeout(() => t.remove(), 300); };
    let life = opts.stay || 5200;
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, life); };
    x.addEventListener("click", close);
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", arm);
    toastZone.append(t);
    arm();
    return {
      close: close,
      open: () => !gone && t.isConnected,
      update(parts) { msg.replaceChildren(...parts); if (acts) acts.remove(); life = 5200; arm(); }
    };
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
    if (data.vices) roleCards.forEach((c) => {
      const v = num(data.vices[c.key]);
      if (v !== null) c.role.count = v;
      if (c.adj && num(data.at) !== null && data.at > c.adj.at) c.adj = null;   // the bot's count now includes the tap
    });
    const bot = data.confess === 1 && Date.now() - state.botAt < FRESH;
    if (bot !== link.bot) { link.bot = bot; linkChanged(); }
    if (data.ladder) ladderSteps.forEach((st) => { const v = num(data.ladder[st.key]); if (v !== null) st.step.members = v; });
    bindAll();
    if (window.EG_TOP) window.EG_TOP.update(data.top, state.botAt);
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
    W = window.innerWidth;
    H = window.innerHeight;
    // big screens don't need a 2x canvas for pinpoint stars; it keeps every redraw cheap
    DPR = Math.min(window.devicePixelRatio || 1, W * H > 1.6e6 ? 1.5 : 2);
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
        c: "rgb(" + TINTS[Math.floor(rs() * TINTS.length)] + ")",
        sparkle: z > 0.8 && rs() > 0.55
      });
    }
    lastDrawScroll = -1;
  }
  function drawStars(t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const sy = scrollY;
    ctx.lineWidth = 0.7;
    for (const s of stars) {
      let y = (s.y - sy * (0.02 + s.z * 0.1) + ptr.y * s.z * 10) % H;
      if (y < 0) y += H;
      const x = s.x + ptr.x * s.z * 14;
      const tw = reduce ? 1 : 0.62 + 0.38 * Math.sin(t * 0.001 * s.tw + s.ph);
      const a = Math.min(1, s.a * tw);
      ctx.globalAlpha = a;                            // no new colour strings every frame (less garbage to collect)
      ctx.fillStyle = s.c;
      if (s.r < 0.9) ctx.fillRect(x, y, s.r * 1.6, s.r * 1.6);
      else { ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill(); }
      if (s.sparkle) {
        const L = 4 + s.r * 3.5 * tw;
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = s.c;
        ctx.beginPath();
        ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  let artTx = 0, artTy = 0;                          // where the hero art sits right now (home-rocket.js reads it)
  let heroH = hero ? hero.offsetHeight : 0, lastArt = "";
  function parallax() {
    if (reduce || !hero || !heroArt) return;
    if (scrollY > heroH * 1.2) return;
    if (window.innerWidth >= 760) { artTx = ptr.x * -12; artTy = scrollY * 0.14 + ptr.y * -10; }
    else { artTx = 0; artTy = scrollY * 0.12; }
    const tf = "translate3d(" + artTx.toFixed(1) + "px," + artTy.toFixed(1) + "px,0)";
    if (tf !== lastArt) { heroArt.style.transform = tf; lastArt = tf; }   // only touch the style when it moved
  }
  window.EG_HOME_API.art = () => ({ tx: artTx, ty: artTy });
  let running = false;
  function frame(t) {
    if (!running) return;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    const moving = Math.abs(ptr.tx - ptr.x) > 0.001 || Math.abs(ptr.ty - ptr.y) > 0.001;
    if (scrollY !== lastDrawScroll || moving || t - lastDraw > 66) {     // twinkling alone only needs ~15 fps
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
    rt = setTimeout(() => { heroH = hero ? hero.offsetHeight : 0; buildStars(); if (reduce) drawStars(0); drawCert(); drawConstellation(); }, 150);
  });
  /* sections that are off screen stop their CSS animations (see .off in home.css) */
  if ("IntersectionObserver" in window) {
    const offIO = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("off", !e.isIntersecting)), { rootMargin: "120px 0px" });
    $$(".hero, .ticker, main > section, .foot").forEach((n) => offIO.observe(n));
  }
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
  const settle = () => { heroH = hero ? hero.offsetHeight : 0; drawCert(); drawConstellation(); };
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
