/* Envious Gluttony™ Code of Conduct test (/staff/test/).
   1. Who's taking it  2. Get ready  3. The test (full screen)  4. Submitted.
   Leaving the tab, switching apps, leaving full screen or reloading resets it straight away. The database
   does the rest: it drops an attempt with no heartbeat for 30 seconds, refuses late answers, and grades
   at the deadline. The answer key never comes to this page, and neither does a score. */
(function () {
  "use strict";

  const C = window.EG_CONFIG || {};
  const EG = window.EG;
  const icon = window.egIcon;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const main = $("test-main");
  const TIER = { owner: "Owner", admin: "Admin", mod: "Mod", helper: "Helper" };

  function el(tag, props, kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(kids === undefined ? [] : kids)) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const ic = (n, c) => icon(n, c);
  async function rpc(name, args) {
    const { data, error } = await EG.sb.rpc(name, args || {});
    if (error) {
      const m = String(error.message || "");
      throw new Error(/Could not find the function|PGRST202/.test(m) ? "The test isn't set up yet. Ask an owner." : (EG.friendlyError ? EG.friendlyError(error) : m));
    }
    return data;
  }
  function show(nodes) {
    main.replaceChildren(...[].concat(nodes));
    window.egIcons && window.egIcons(main);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  const fsApi = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const inFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  // Full screen where the browser allows it. Some refuse or never answer; the test starts anyway after 1.5s
  // (leaving the tab or the window still resets it).
  async function enterFs() {
    const d = document.documentElement;
    let req = null;
    try { req = d.requestFullscreen ? d.requestFullscreen({ navigationUI: "hide" }) : (d.webkitRequestFullscreen && d.webkitRequestFullscreen(), null); } catch (e) { req = null; }
    if (req && typeof req.then === "function") await Promise.race([req.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  }
  function exitFs() { try { if (document.exitFullscreen && inFs()) document.exitFullscreen(); else if (document.webkitExitFullscreen && inFs()) document.webkitExitFullscreen(); } catch (e) { /* fine */ } }

  let me = null, status = null, identity = null, token = null;
  const test = { attempt: null, deadline: 0, skew: 0, questions: [], answers: {}, i: 0, live: false, blurTimer: null, beat: null, tick: null, wasFs: false, grace: 1500 };

  /* ---------- start-up ---------- */
  async function boot() {
    if (!EG || !EG.configured) { show(el("div", { class: "gate-card" }, el("p", { text: "Not connected." }))); return; }
    const user = await EG.user();
    if (!user) { location.replace("/signin/?next=/staff/test/"); return; }
    identity = (user.identities || []).find((i) => i.provider === "discord") || null;
    try {
      me = await rpc("hub_me");
      if (!me || !me.ok) { gate("lock", "Staff only", "The Code of Conduct test is for the Envious Gluttony™ staff team, signed in with Discord."); return; }
      status = await rpc("coc_status", { p_page_load: true });   // a test still running from before is reset as "reloaded the page"
    } catch (e) { gate("triangle-alert", "Can't load the test", e.message); return; }
    step1();
  }
  function gate(iconName, title, text, extra) {
    show(el("div", { class: "gate-card" }, [el("span", { class: "gate-icon" }, ic(iconName)), el("h1", { text: title }), el("p", { text: text }),
      el("div", { class: "gate-acts" }, extra || el("a", { class: "btn btn-primary", href: "/staff/#code" }, ["Back to the Staff Hub", ic("arrow-right")]))]));
  }

  /* ---------- 1. who's taking it ---------- */
  function step1() {
    if (!status.can_start) {
      gate(status.state === "submitted" ? "circle-check" : "lock", status.state === "submitted" ? "You've taken this one" : "Not right now",
        status.why || "You can't start the test right now.");
      return;
    }
    const d = (identity && identity.identity_data) || {};
    const pics = me.pics || {};
    const pic = pics.av ? el("img", { class: "pic", src: pics.av, alt: "", width: "96", height: "96", referrerpolicy: "no-referrer" })
      : el("span", { class: "fb", text: (me.name || "?").slice(0, 1).toUpperCase() });
    const btn = el("button", { type: "button", class: "confirm-me" }, [
      el("span", { class: "fill", "aria-hidden": "true" }), el("span", { class: "sheen", "aria-hidden": "true" }),
      el("span", { class: "label" }, ["Confirm, that's me"]), el("span", { class: "check", "aria-hidden": "true" }, ic("check"))]);
    btn.addEventListener("click", () => {
      if (btn.classList.contains("done")) return;
      btn.classList.add("done");
      btn.setAttribute("aria-label", "Confirmed");
      if (!reduce) pop(btn);
      setTimeout(step2, reduce ? 150 : 800);
    });
    show(el("section", { class: "test-card id-card", "aria-labelledby": "s1" }, [
      el("p", { class: "step-tag", text: "Step 1 of 3" }),
      el("h1", { id: "s1", text: "Who's taking it" }),
      el("div", { class: "id-who" }, [el("span", { class: "av", style: "--s:96px" }, pic),
        el("div", null, [el("b", { class: "id-name", text: me.name || d.full_name || "You" }),
          el("div", { class: "muted", text: "@" + (me.username || String(d.name || d.user_name || "").replace(/#0$/, "")) }),
          el("div", { class: "faint tab", text: "User ID " + me.id }),
          el("span", { class: "tier tier-" + me.tier, text: TIER[me.tier] || "Staff" })])]),
      el("p", { class: "muted", text: "Code of Conduct v" + status.version + " · " + status.question_count + " questions · " + status.minutes + " minutes · " +
        status.starts_left + (status.starts_left === 1 ? " start" : " starts") + " left today" }),
      btn
    ]));
    btn.focus({ preventScroll: true });
  }
  function pop(btn) {
    const r = btn.getBoundingClientRect();
    const colors = ["#73ffce", "#63f4ff", "#ffffff", "#ffc861"];
    for (let i = 0; i < 18; i++) {
      const p = el("span", { class: "pop-dot", style: "left:" + (r.left + r.width / 2) + "px;top:" + (r.top + r.height / 2) + "px;background:" + colors[i % 4] });
      document.body.append(p);
      const a = (i / 18) * Math.PI * 2, dist = 60 + Math.random() * 60;
      p.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: "translate(calc(-50% + " + Math.cos(a) * dist + "px), calc(-50% + " + Math.sin(a) * dist + "px)) scale(.3)", opacity: 0 }],
      { duration: 650 + Math.random() * 250, easing: "cubic-bezier(.2,.7,.2,1)" }).finished.then(() => p.remove(), () => p.remove());
    }
  }

  /* ---------- 2. get ready ---------- */
  function step2() {
    const ios = !fsApi();
    const ok = el("input", { type: "checkbox", id: "understand" });
    const start = el("button", { type: "button", class: "btn btn-primary btn-big", disabled: true }, ["Start test", ic("arrow-right")]);
    ok.addEventListener("change", () => { start.disabled = !ok.checked; });
    start.addEventListener("click", async () => {
      start.disabled = true;
      start.replaceChildren(el("span", { class: "loader", style: "width:20px;height:20px;border-width:2px" }), "Starting…");
      if (!ios) await enterFs();
      try { await begin(); }
      catch (e) { exitFs(); gate("triangle-alert", "Couldn't start", e.message); }
    });
    show(el("section", { class: "test-card", "aria-labelledby": "s2" }, [
      el("p", { class: "step-tag", text: "Step 2 of 3" }),
      el("h1", { id: "s2", text: "Get ready" }),
      el("ul", { class: "ready-list" }, [
        el("li", null, [ic("x"), "Close other tabs and apps, and put other devices away."]),
        el("li", null, [ic("clock"), "Find a spot where you won't be disturbed for " + status.minutes + " minutes."]),
        el("li", null, [ic("triangle-alert"), "Leaving this tab, switching apps, exiting full screen or reloading resets the test. Your progress is lost and the reset is logged."]),
        el("li", null, [ic("lock"), "Your score goes to the admins. You won't see it."]),
        ios ? el("li", null, [ic("info"), "On iPhone: turn on Do Not Disturb first. A notification that pulls you out of the page resets the test."]) : null
      ]),
      el("p", { class: "faint", text: "Honest note: this page can tell when you leave it. It can't tell whether you have another device nearby, so that part's on you." }),
      el("label", { class: "check-row", for: "understand" }, [ok, el("span", { text: "I understand" })]),
      start
    ]));
  }

  /* ---------- 3. the test ---------- */
  async function begin() {
    const t = await rpc("coc_start");
    const s = await EG.sb.auth.getSession();
    token = s.data && s.data.session ? s.data.session.access_token : null;
    test.attempt = t.attempt;
    test.deadline = t.deadline;
    test.skew = t.server_now - Date.now();
    test.questions = t.questions;
    test.answers = {};
    test.i = 0;
    test.grace = typeof t.blur_grace_ms === "number" ? t.blur_grace_ms : 1500;
    test.wasFs = inFs();
    test.live = true;
    watermark(t.name || me.name);
    document.body.classList.add("testing");
    $("test-clock").hidden = false;
    arm();
    test.tick = setInterval(clock, 250);
    test.beat = setInterval(heartbeat, 10000);
    clock();
    render();
  }
  function watermark(name) {
    const text = String(name || "") + " · " + me.id;
    const esc = text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='10' y='120' fill='white' font-family='sans-serif' font-size='18' transform='rotate(-24 210 110)'>" + esc + "</text></svg>";
    const w = $("test-watermark");
    w.style.backgroundImage = "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
    w.hidden = false;
  }
  function remaining() { return test.deadline - (Date.now() + test.skew); }
  function clock() {
    const ms = Math.max(0, remaining());
    const s = Math.ceil(ms / 1000);
    $("test-time").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    $("test-clock").classList.toggle("low", s <= 120);
    if (ms <= 0 && test.live) { submit(true); }
  }
  async function heartbeat() {
    if (!test.live) return;
    try {
      const r = await rpc("coc_heartbeat", { p_attempt: test.attempt });
      if (r && r.ok === false) {
        if (r.code === "voided") stopped("The server reset your test: " + (r.reason || "it stopped hearing from this page") + ".");
        else if (r.code === "submitted") finished();
      }
      const s = await EG.sb.auth.getSession();
      if (s.data && s.data.session) token = s.data.session.access_token;
    } catch (e) { /* one missed beat is fine; three in a row and the server resets it */ }
  }

  const answered = (q) => test.answers[q.n] !== undefined;
  function render() {
    const q = test.questions[test.i];
    const total = test.questions.length;
    const body = el("fieldset", { class: "q-body" }, [el("legend", { class: "sr-only", text: "Question " + q.n })]);
    const cur = test.answers[q.n];
    if (q.kind === "order") {
      const order = Array.isArray(cur) ? cur.slice() : q.options.map((o) => o.id);
      const textOf = (id) => (q.options.find((o) => o.id === id) || {}).text;
      const list = el("ol", { class: "order-list" });
      order.forEach((id, k) => {
        list.append(el("li", null, [el("span", { class: "ord-n tab", text: String(k + 1) }), el("span", { class: "ord-t", text: textOf(id) }),
          el("span", { class: "ord-btns" }, [
            el("button", { type: "button", class: "icon-btn", disabled: k === 0, "aria-label": "Move \"" + textOf(id) + "\" up", onclick: () => moveOrder(q, order, k, -1) }, ic("arrow-up")),
            el("button", { type: "button", class: "icon-btn", disabled: k === order.length - 1, "aria-label": "Move \"" + textOf(id) + "\" down", onclick: () => moveOrder(q, order, k, 1) }, ic("arrow-down"))])]));
      });
      body.append(list);
      if (cur === undefined) body.append(el("button", { type: "button", class: "btn btn-sm", style: "margin-top:10px", onclick: () => save(q, order) }, "This order is right"));
    } else {
      const multi = q.kind === "multi";
      for (const o of q.options) {
        const checked = multi ? Array.isArray(cur) && cur.includes(o.id) : cur === o.id;
        const inp = el("input", { type: multi ? "checkbox" : "radio", name: "q" + q.n, value: o.id, checked: checked });
        inp.addEventListener("change", () => {
          if (multi) {
            const picked = Array.from(body.querySelectorAll("input:checked")).map((x) => x.value);
            if (picked.length) save(q, picked); else { delete test.answers[q.n]; paintMap(); }
          } else save(q, o.id);
        });
        body.append(el("label", { class: "opt" }, [inp, el("span", { text: o.text })]));
      }
    }
    const back = el("button", { type: "button", class: "btn", disabled: test.i === 0, onclick: () => { test.i--; render(); } }, [ic("arrow-left"), "Back"]);
    const next = test.i < total - 1
      ? el("button", { type: "button", class: "btn btn-primary", onclick: () => { test.i++; render(); } }, ["Next", ic("arrow-right")])
      : el("button", { type: "button", class: "btn btn-primary", onclick: () => submit(false) }, ["Submit", ic("send")]);
    const map = el("nav", { class: "q-map", id: "q-map", "aria-label": "Questions" });
    show([
      el("div", { class: "q-top" }, [el("span", { class: "q-count tab", text: "Question " + (test.i + 1) + " of " + total }),
        el("span", { class: "q-sec", text: q.section }), el("span", { class: "q-saved", id: "q-saved", "aria-live": "polite" })]),
      el("div", { class: "q-progress", "aria-hidden": "true" }, el("i", { style: "--p:" + (Object.keys(test.answers).length / total * 100).toFixed(1) + "%" })),
      el("section", { class: "test-card q-card", "aria-labelledby": "q-text" }, [
        el("h1", { id: "q-text", class: "q-text", text: q.prompt }),
        el("p", { class: "faint", text: q.kind === "multi" ? "Select all that apply." : q.kind === "order" ? "Put them in order with the arrows." : q.kind === "tf" ? "True or false." : "Pick one." }),
        body]),
      el("div", { class: "q-nav" }, [back, next]),
      map
    ]);
    paintMap();
  }
  function paintMap() {
    const map = $("q-map");
    if (!map) return;
    map.replaceChildren(...test.questions.map((q, k) => el("button", { type: "button", class: "qm" + (answered(q) ? " done" : "") + (k === test.i ? " here" : ""),
      "aria-label": "Question " + (k + 1) + (answered(q) ? ", answered" : ", not answered"), "aria-current": k === test.i ? "step" : null,
      onclick: () => { test.i = k; render(); } }, String(k + 1))));
    const bar = document.querySelector(".q-progress i");
    if (bar) bar.style.setProperty("--p", (Object.keys(test.answers).length / test.questions.length * 100).toFixed(1) + "%");
  }
  function moveOrder(q, order, k, dir) {
    const j = k + dir;
    [order[k], order[j]] = [order[j], order[k]];
    test.answers[q.n] = order.slice();
    render();
    save(q, order.slice());
  }
  let saving = Promise.resolve();
  function save(q, answer) {
    test.answers[q.n] = answer;
    paintMap();
    const tag = $("q-saved");
    if (tag) tag.textContent = "Saving…";
    saving = saving.then(async () => {
      if (!test.live) return;
      try {
        const r = await rpc("coc_save_answer", { p_attempt: test.attempt, p_n: q.n, p_answer: answer });
        if (r && r.ok === false) {
          if (r.code === "voided") stopped("The server reset your test: " + (r.reason || "it stopped hearing from this page") + ".");
          else finished();
          return;
        }
        const t2 = $("q-saved");
        if (t2) t2.textContent = "Saved";
      } catch (e) {
        const t2 = $("q-saved");
        if (t2) t2.textContent = "Not saved: " + e.message;
      }
    });
  }

  async function submit(timeUp) {
    if (!test.live) return;
    if (!timeUp) {
      const left = test.questions.filter((q) => !answered(q)).length;
      $("confirm-title").textContent = "Submit your test?";
      $("confirm-body").replaceChildren(...[el("p", { text: "You can't change answers after this." }),
        left ? el("p", { text: left + (left === 1 ? " question isn't" : " questions aren't") + " answered yet." }) : null].filter(Boolean));
      const yes = await ask();
      if (!yes || !test.live) return;
    }
    test.live = false;
    disarm();
    try { await saving; await rpc("coc_submit", { p_attempt: test.attempt }); } catch (e) { /* the server grades at the deadline anyway */ }
    finished(timeUp);
  }
  // Resolves on the button click itself (not only the dialog's close event, which some browsers hold back).
  function ask() {
    const dlg = $("confirm"), yesBtn = $("confirm-yes"), noBtn = $("confirm-no");
    return new Promise((resolve) => {
      let done = false;
      const off = () => { yesBtn.removeEventListener("click", onYes); noBtn.removeEventListener("click", onNo); dlg.removeEventListener("cancel", onNo); dlg.removeEventListener("close", onClose); };
      const finish = (v) => { if (done) return; done = true; off(); if (dlg.open) dlg.close(); resolve(v); };
      const onYes = (e) => { e.preventDefault(); finish(true); };
      const onNo = (e) => { e.preventDefault(); finish(false); };
      const onClose = () => finish(dlg.returnValue === "yes");
      yesBtn.addEventListener("click", onYes); noBtn.addEventListener("click", onNo);
      dlg.addEventListener("cancel", onNo); dlg.addEventListener("close", onClose);
      dlg.returnValue = "";
      dlg.showModal();
      noBtn.focus();
    });
  }
  function finished(timeUp) {
    test.live = false;
    disarm();
    exitFs();
    show(el("section", { class: "test-card done-card", "aria-labelledby": "s4" }, [
      el("span", { class: "gate-icon" }, ic("circle-check")),
      el("h1", { id: "s4", text: timeUp ? "Time's up. Submitted." : "Submitted." }),
      el("p", { text: "Your results go to the admins. Nice work getting it done." }),
      el("a", { class: "btn btn-primary", href: "/staff/" }, ["Back to the Staff Hub", ic("arrow-right")])
    ]));
  }

  /* ---------- the lock ---------- */
  function sendVoid(reason) {
    if (!test.attempt || !token) return;
    try {
      fetch(C.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/coc_void", {
        method: "POST", keepalive: true,
        headers: { apikey: C.SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ p_attempt: test.attempt, p_reason: reason })
      }).catch(() => { /* the heartbeat backstop catches it */ });
    } catch (e) { /* same */ }
  }
  function reset(reason) {
    if (!test.live) return;
    test.live = false;
    sendVoid(reason);
    disarm();
    exitFs();
    stopped("You " + reason + ", so the test reset.");
  }
  function stopped(text) {
    test.live = false;
    disarm();
    exitFs();
    show(el("section", { class: "test-card reset-card", role: "alert", "aria-labelledby": "rs" }, [
      el("span", { class: "gate-icon" }, ic("triangle-alert")),
      el("h1", { id: "rs", text: "Test reset" }),
      el("p", { text: text }),
      el("p", { class: "muted", text: "Your progress is lost and the reset is logged. You can start again while you have starts left today." }),
      el("button", { type: "button", class: "btn btn-primary", onclick: async () => {
        try { status = await rpc("coc_status", { p_page_load: false }); step1(); } catch (e) { gate("triangle-alert", "Can't load the test", e.message); }
      } }, ["Back to the start", ic("arrow-right")])
    ]));
  }
  const onVis = () => { if (document.visibilityState === "hidden") reset("left the test tab"); };
  const onHide = () => reset("closed or reloaded the page");
  const onFs = () => { if (test.wasFs && !inFs()) reset("left full screen"); else if (inFs()) test.wasFs = true; };
  const onBlur = () => { clearTimeout(test.blurTimer); test.blurTimer = setTimeout(() => { if (!document.hasFocus()) reset("switched to another window or app"); }, test.grace); };
  const onFocus = () => clearTimeout(test.blurTimer);
  const block = (e) => { if (test.live) e.preventDefault(); };
  const keys = (e) => {
    if (!test.live) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["c", "x", "p", "s", "a", "u"].includes(k)) e.preventDefault();
    if (k === "f5" || ((e.ctrlKey || e.metaKey) && k === "r")) e.preventDefault();
  };
  function arm() {
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"].forEach((t) => document.addEventListener(t, block));
    window.addEventListener("beforeprint", onPrint);
    document.addEventListener("keydown", keys, true);
  }
  function disarm() {
    clearInterval(test.tick); clearInterval(test.beat); clearTimeout(test.blurTimer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("fullscreenchange", onFs);
    document.removeEventListener("webkitfullscreenchange", onFs);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart"].forEach((t) => document.removeEventListener(t, block));
    window.removeEventListener("beforeprint", onPrint);
    document.removeEventListener("keydown", keys, true);
    document.body.classList.remove("testing");
    $("test-clock").hidden = true;
    $("test-watermark").hidden = true;
  }
  function onPrint() { /* the print stylesheet blanks the page while the test is on */ }

  boot();
})();
