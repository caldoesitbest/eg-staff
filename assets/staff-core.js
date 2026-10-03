/* Envious Gluttony™ Staff Hub: the core. Sign-in gate, sections, drawer, toasts and shared helpers.
   Every permission is checked again in the database; hiding things here is only for tidiness. */
(function () {
  "use strict";

  const C = window.EG_CONFIG || {};
  const EG = window.EG;
  const icon = window.egIcon;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RANK = { helper: 1, mod: 2, admin: 3, owner: 4 };
  const TIER_NAME = { owner: "Owner", admin: "Admin", mod: "Mod", helper: "Helper" };
  const $ = (id) => document.getElementById(id);

  /* ---------- small helpers ---------- */
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(kids === undefined ? [] : kids)) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const ic = (name, cls) => icon(name, cls);
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  function toDate(v) {
    if (v === null || v === undefined || v === "") return null;
    const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v).replace(/(\.\d{3})\d+/, "$1"));
    return isNaN(d) ? null : d;
  }
  const DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  const DATETIME = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const fmtDate = (v) => { const d = toDate(v); return d ? DATE.format(d) : ""; };
  const fmtDateTime = (v) => { const d = toDate(v); return d ? DATETIME.format(d) : ""; };
  function ago(v) {
    const d = toDate(v);
    if (!d) return "";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 90) return "a minute ago";
    const m = Math.round(s / 60);
    if (m < 60) return m + " minutes ago";
    const h = Math.round(m / 60);
    if (h < 36) return h + (h === 1 ? " hour ago" : " hours ago");
    const days = Math.round(h / 24);
    return days < 45 ? days + " days ago" : fmtDate(d);
  }
  const daysSince = (v) => { const d = toDate(v); return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) : null; };
  const plural = (n, one, many) => fmt(n) + " " + (n === 1 ? one : many || one + "s");

  /* Discord name colours, lifted a little when too dark to read (same as the Top 10) */
  function readable(hex) {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "";
    const v = parseInt(hex.slice(1), 16);
    let rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
    const f = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    const lum = (c) => 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    if (lum(rgb) >= 0.22) return hex;
    const [r, g, b] = rgb, max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
    let l = (max + min) / 2;
    const s = dd === 0 ? 0 : dd / (1 - Math.abs(2 * l - 1));
    const h = dd === 0 ? 0 : 60 * (max === r ? ((g - b) / dd + 6) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4);
    const fromHsl = (li) => {
      const c = (1 - Math.abs(2 * li - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = li - c / 2;
      const p = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      return p.map((k) => k + m);
    };
    while (l < 0.92 && lum(rgb) < 0.22) { l += 0.02; rgb = fromHsl(l); }
    return "rgb(" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)).join(",") + ")";
  }
  const CDN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//;
  function avatar(p, size) {
    p = p || {};
    const pics = p.pics || {};
    const name = String(p.name || p.username || "?");
    const wrap = el("span", { class: "av", style: "--s:" + (size || 40) + "px", "aria-hidden": "true" });
    const initial = (Array.from(name.replace(/^[^\p{L}\p{N}]+/u, ""))[0] || "?").toUpperCase();
    if (pics.av && CDN.test(pics.av)) {
      const img = el("img", { class: "pic", src: pics.av, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
      img.addEventListener("error", () => img.replaceWith(el("span", { class: "fb", text: initial })));
      wrap.append(img);
      if (pics.deco && CDN.test(pics.deco)) {
        const deco = el("img", { class: "deco", src: pics.deco, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
        deco.addEventListener("error", () => deco.remove());
        wrap.append(deco);
      }
    } else {
      wrap.append(el("span", { class: "fb", text: initial }));
    }
    return wrap;
  }
  function nameEl(p, tag) {
    const n = el(tag || "b", { text: (p && (p.name || p.username)) || "Unknown" });
    const c = readable(p && p.color);
    if (c) n.style.color = c;
    return n;
  }
  const tierBadge = (t) => el("span", { class: "tier tier-" + (t || "helper"), text: TIER_NAME[t] || "Staff" });

  /* ---------- talking to the database ---------- */
  function friendly(err) {
    const m = String((err && (err.message || err.msg)) || err || "");
    if (/Could not find the function|PGRST202|schema cache/i.test(m)) {
      return new Error("The Staff Hub's database isn't set up yet. An owner needs to run staff-hub.sql in Supabase.");
    }
    if (/JWT expired|invalid JWT|not authenticated/i.test(m)) return new Error("Your sign-in ran out. Refresh the page.");
    return new Error(EG && EG.friendlyError ? EG.friendlyError(err) : m);
  }
  async function rpc(name, args) {
    const { data, error } = await EG.sb.rpc(name, args || {});
    if (error) throw friendly(error);
    return data;
  }

  /* ---------- toasts ---------- */
  function toast(msg, kind) {
    const zone = $("toasts");
    while (zone.children.length >= 3) zone.firstElementChild.remove();
    const t = el("div", { class: "toast" + (kind ? " " + kind : "") }, [
      ic(kind === "bad" ? "circle-x" : kind === "ok" ? "circle-check" : "info"), el("span", { text: msg })
    ]);
    zone.append(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, kind === "bad" ? 6000 : 3600);
  }
  const fail = (e) => toast((e && e.message) || "Something went wrong. Try again.", "bad");

  /* ---------- drawer ---------- */
  const drawer = (() => {
    const box = $("drawer"), scrim = $("drawer-scrim"), title = $("drawer-title"), body = $("drawer-body");
    let back = null, onClose = null;
    function close() {
      if (box.hidden) return;
      box.hidden = true; scrim.hidden = true;
      box.classList.remove("wide");
      document.body.style.overflow = "";
      const cb = onClose; onClose = null;
      if (cb) cb();
      if (back && back.isConnected) back.focus({ preventScroll: true });
    }
    function open(opts) {
      back = document.activeElement;
      title.textContent = opts.title || "";
      body.replaceChildren(...[].concat(opts.body || []));
      box.classList.toggle("wide", !!opts.wide);
      box.hidden = false; scrim.hidden = false;
      document.body.style.overflow = "hidden";
      onClose = opts.onClose || null;
      window.egIcons && window.egIcons(box);
      title.focus({ preventScroll: true });
      body.scrollTop = 0;
    }
    $("drawer-close").addEventListener("click", close);
    scrim.addEventListener("click", close);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const f = Array.from(box.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
        .filter((n) => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    return { open: open, close: close, get isOpen() { return !box.hidden; }, set: (nodes) => { body.replaceChildren(...[].concat(nodes)); window.egIcons && window.egIcons(body); } };
  })();

  /* ---------- confirm ---------- */
  function confirm(opts) {
    const dlg = $("confirm");
    $("confirm-title").textContent = opts.title || "Are you sure?";
    $("confirm-body").replaceChildren(...[].concat(opts.body || []).map((x) => (typeof x === "string" ? el("p", { text: x }) : x)));
    const yes = $("confirm-yes");
    yes.textContent = opts.ok || "OK";
    yes.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
    const no = $("confirm-no");
    return new Promise((resolve) => {
      if (typeof dlg.showModal !== "function") { resolve(window.confirm(opts.title)); return; }
      // resolve on the click itself: some browsers hold back the dialog's close event
      let done = false;
      const off = () => { yes.removeEventListener("click", onYes); no.removeEventListener("click", onNo); dlg.removeEventListener("cancel", onNo); dlg.removeEventListener("close", onClose); };
      const finish = (v) => { if (done) return; done = true; off(); if (dlg.open) dlg.close(); resolve(v); };
      const onYes = (e) => { e.preventDefault(); finish(true); };
      const onNo = (e) => { e.preventDefault(); finish(false); };
      const onClose = () => finish(dlg.returnValue === "yes");
      yes.addEventListener("click", onYes); no.addEventListener("click", onNo);
      dlg.addEventListener("cancel", onNo); dlg.addEventListener("close", onClose);
      dlg.returnValue = "";
      dlg.showModal();
      (opts.danger ? no : yes).focus();
    });
  }

  /* ---------- state + sections ---------- */
  const state = { me: null, tier: null, current: null, sections: [], leaving: null, polls: 0 };
  const can = (min) => (RANK[state.tier] || 0) >= (RANK[min] || 99);
  function register(def) { state.sections.push(def); }
  const visible = () => state.sections.filter((s) => can(s.min || "helper"));

  function renderNav() {
    const nav = $("hub-nav"), bar = $("hub-tabbar");
    const items = [];
    let lastGroup = null;
    for (const s of visible()) {
      if (s.group && s.group !== lastGroup) {
        items.push(el("div", { class: "nav-sep", role: "separator" }), el("span", { class: "nav-label", text: s.group }));
      }
      lastGroup = s.group || lastGroup;
      items.push(el("a", { class: "nav-item", href: "#" + s.id, "data-id": s.id, "aria-current": state.current === s.id ? "page" : null },
        [ic(s.icon), el("span", { text: s.nav || s.title }), s.badge ? el("span", { class: "count", text: String(s.badge) }) : null]));
    }
    nav.replaceChildren(...items);
    // phones: the main few along the bottom, the rest in "More"
    const main = visible().filter((s) => s.tab).slice(0, 4);
    const tabs = main.map((s) => el("a", { class: "tab-item", href: "#" + s.id, "aria-current": state.current === s.id ? "page" : null },
      [ic(s.icon), el("span", { text: s.short || s.title })]));
    const rest = visible().filter((s) => !main.includes(s));
    if (rest.length) {
      const more = el("button", { type: "button", class: "tab-item", "aria-current": rest.some((s) => s.id === state.current) ? "page" : null },
        [ic("menu"), el("span", { text: "More" })]);
      more.addEventListener("click", () => drawer.open({
        title: "Staff Hub",
        body: el("div", { class: "stack-v" }, rest.map((s) => el("a", { class: "nav-item", href: "#" + s.id, onclick: () => drawer.close(),
          "aria-current": state.current === s.id ? "page" : null }, [ic(s.icon), el("span", { text: s.title })])))
      }));
      tabs.push(more);
    }
    bar.replaceChildren(...tabs);
  }

  async function show(id, sub) {
    const list = visible();
    const def = list.find((s) => s.id === id) || list[0];
    if (!def) return;
    if (state.leaving) { try { state.leaving(); } catch (e) { /* ignore */ } state.leaving = null; }
    state.current = def.id;
    renderNav();
    document.title = def.title + " · Staff Hub · Envious Gluttony™";
    const main = $("hub-main");
    main.replaceChildren(el("div", { class: "gate-card", style: "margin:40px auto" }, [el("span", { class: "loader" })]));
    try {
      const leave = await def.render(main, { section: def, sub: sub || "" });
      state.leaving = typeof leave === "function" ? leave : null;
    } catch (e) {
      main.replaceChildren(el("div", { class: "empty" }, [ic("triangle-alert"), el("p", { text: (e && e.message) || "Couldn't load this." }),
        el("button", { type: "button", class: "btn btn-sm", onclick: () => show(def.id) }, [ic("refresh-cw"), "Try again"])]));
    }
    window.egIcons && window.egIcons(main);
  }
  function route() {
    const [id, sub] = (location.hash.replace(/^#/, "") || "overview").split("/");
    if (drawer.isOpen) drawer.close();
    show(id, sub).then(() => { if (!reduce) window.scrollTo(0, 0); });
  }

  /* ---------- gate ---------- */
  function gate(nodes) {
    $("hub-shell").hidden = true; $("hub-tabbar").hidden = true; $("hub-foot").hidden = true;
    const g = $("hub-gate");
    g.hidden = false;
    g.replaceChildren(el("div", { class: "gate-card" }, nodes));
    window.egIcons && window.egIcons(g);
  }
  function staffOnly(text) {
    gate([el("span", { class: "gate-icon" }, ic("lock")), el("h1", { text: "Staff only" }), el("p", { text: text }),
      el("div", { class: "gate-acts" }, [el("a", { class: "btn btn-primary", href: "/" }, ["Back home", ic("arrow-right")]),
        el("button", { type: "button", class: "btn btn-ghost", onclick: async () => { await EG.signOut(); location.href = "/"; } }, [ic("log-out"), "Sign out"])])]);
  }
  function renderMe() {
    const m = state.me;
    $("hub-me").replaceChildren(tierBadge(m.tier), el("span", { class: "me-name" }, nameEl(m)), avatar(m, 34));
  }

  async function boot() {
    if (!EG || !EG.configured) { gate([el("h1", { text: "Not connected" }), el("p", { text: "Add the Supabase keys to assets/config.js." })]); return; }
    const user = await EG.user();
    if (!user) { location.replace("/signin/?next=" + encodeURIComponent("/staff/" + (location.hash || ""))); return; }
    let me;
    try { me = await rpc("hub_me"); }
    catch (e) { gate([el("span", { class: "gate-icon" }, ic("triangle-alert")), el("h1", { text: "Staff Hub offline" }), el("p", { text: e.message })]); return; }
    if (!me || !me.ok) {
      if (me && me.code === "signin") { location.replace("/signin/?next=/staff/"); return; }
      if (me && me.code === "no_discord") {
        gate([el("span", { class: "gate-icon" }, ic("discord")), el("h1", { text: "Sign in with Discord" }),
          el("p", { text: "The Staff Hub knows staff by their Discord account, and this account isn't linked to one. Sign out, then sign back in with Discord." }),
          el("div", { class: "gate-acts" }, el("button", { type: "button", class: "btn btn-primary", onclick: async () => {
            await EG.signOut();
            try { await EG.oauth("discord", "/staff/"); } catch (e) { location.href = "/signin/?next=/staff/"; }
          } }, [ic("discord"), "Sign in with Discord"]))]);
        return;
      }
      staffOnly("This part of the site is for the Envious Gluttony™ staff team. If you were just given a staff role, give it a minute and refresh.");
      return;
    }
    state.me = me; state.tier = me.tier;
    renderMe();
    $("hub-gate").hidden = true;
    $("hub-shell").hidden = false; $("hub-tabbar").hidden = false; $("hub-foot").hidden = false;
    window.addEventListener("hashchange", route);
    const firstTime = !me.launch_seen && !seenHere();
    if (firstTime && window.HUB.launch) {
      await window.HUB.launch.play(me);
      markSeen();
      document.body.classList.add("assemble");
      setTimeout(() => document.body.classList.remove("assemble"), 1400);
    }
    route();
    stars();
    setInterval(poll, 20000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    $("replay-launch").addEventListener("click", () => window.HUB.launch && window.HUB.launch.play(state.me, { replay: true }));
  }
  function seenHere() { try { return localStorage.getItem("eg-hub-launch") === state.me.id; } catch (e) { return false; } }
  function markSeen() {
    try { localStorage.setItem("eg-hub-launch", state.me.id); } catch (e) { /* fine */ }
    rpc("hub_mark_launch").catch(() => { /* the device copy still stops it replaying here */ });
  }

  /* Every 20 seconds: are they still staff (a removed role locks them out), and the open section's live bits. */
  async function poll() {
    if (document.hidden || !state.me) return;
    try {
      const me = await rpc("hub_me");
      if (!me || !me.ok) { drawer.close(); staffOnly("Your staff role was removed, so the Staff Hub closed."); return; }
      if (me.tier !== state.tier) {
        state.tier = me.tier; state.me = me; renderMe();
        toast("Your access changed to " + TIER_NAME[me.tier] + ".");
        route();
        return;
      }
    } catch (e) { return; }
    const def = state.sections.find((s) => s.id === state.current);
    if (def && def.poll) { try { await def.poll(); } catch (e) { /* keep what's on screen */ } }
  }

  /* ---------- starfield (quiet, ~12fps, paused when hidden) ---------- */
  function stars() {
    const cv = $("hub-stars");
    const ctx = cv && cv.getContext ? cv.getContext("2d") : null;
    if (!ctx) return;
    let W, H, list = [], last = 0;
    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      list = Array.from({ length: Math.min(420, Math.round((W * H) / 3200)) }, () => {
        const z = Math.pow(r(), 2.2);
        return { x: r() * W, y: r() * H, s: 0.35 + z * 1.3, a: 0.2 + r() * 0.5 + z * 0.25, tw: 0.4 + r() * 1.4, ph: r() * 6.28 };
      });
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      for (const s of list) {
        ctx.globalAlpha = Math.min(1, s.a * (reduce ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.tw + s.ph)));
        ctx.fillRect(s.x, s.y, s.s * 1.5, s.s * 1.5);
      }
      ctx.globalAlpha = 1;
    }
    function loop(t) {
      if (!document.hidden && t - last > 80) { draw(t); last = t; }
      requestAnimationFrame(loop);
    }
    build();
    if (reduce) draw(0); else requestAnimationFrame(loop);
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); draw(performance.now()); }, 150); });
  }

  window.HUB = {
    C: C, el: el, ic: ic, fmt: fmt, plural: plural, toDate: toDate, fmtDate: fmtDate, fmtDateTime: fmtDateTime, ago: ago,
    daysSince: daysSince, readable: readable, avatar: avatar, nameEl: nameEl, tierBadge: tierBadge, TIER_NAME: TIER_NAME,
    RANK: RANK, rpc: rpc, toast: toast, fail: fail, drawer: drawer, confirm: confirm, register: register, can: can,
    reduce: reduce, boot: boot, show: show, renderNav: renderNav,
    get me() { return state.me; }, get tier() { return state.tier; }, get current() { return state.current; }
  };
})();
