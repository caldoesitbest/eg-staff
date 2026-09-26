/* Envious Gluttony™ ban appeal: the /appeal/ page */
(function () {
  "use strict";

  const C = window.EG_CONFIG;
  const icon = window.egIcon;
  const CARDS = C.appeal;
  const allFields = CARDS.flatMap((card) => card.fields);
  const DRAFT_KEY = "eg-appeal-draft:" + C.APPEAL_FORM_ID;
  const SAVED_KEY = "eg-appeal";                 // the last appeal sent from this device: {id, did, user, at}
  const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const PATTERNS = {
    discord: { re: /^@?[A-Za-z0-9_.]{2,32}(#\d{4})?$/, msg: "Use your Discord username (letters, numbers, _ and . only), not your display name." },
    snowflake: { re: /^\d{17,20}$/, msg: "Your user ID is 17 to 20 digits. Here's how to copy it:" }
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (id) => document.getElementById(id);
  const form = $("appeal");
  const slides = [$("slide-0"), $("slide-1")];
  const stepper = $("stepper");
  const stepItems = Array.from(stepper.children);
  const nav = $("nav");
  const backBtn = $("back");
  const nextBtn = $("next");
  const alertBox = $("alert");
  const hp = $("eg-hp");

  const state = { slide: 0, view: "form", from: "form", startedAt: Date.now(), appealId: makeId(), sending: false };
  const touched = new Set();

  /* ---------- helpers ---------- */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children || [])) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }
  function makeId() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return "AP-" + Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("");
  }
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  const cleanId = (v) => String(v || "").replace(/\s+/g, "");
  const scrollTop = () => window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked: still works */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  /* ---------- the questions ---------- */
  function renderField(f, card, qid) {
    const id = "f-" + f.id;
    const errId = id + "-err";
    const hintId = f.hint ? id + "-hint" : null;
    const pair = card.fields.length > 1;
    const attrs = {
      id: id,
      name: f.id,
      class: "inp",
      "aria-labelledby": pair ? qid + " " + id + "-lbl" : qid,
      "aria-describedby": [errId, hintId].filter(Boolean).join(" "),
      placeholder: f.placeholder || "Your answer...",
      autocomplete: "off"
    };
    const control = f.type === "textarea"
      ? el("textarea", Object.assign(attrs, { rows: f.rows || 3, maxlength: f.maxLength }))
      : el("input", Object.assign(attrs, {
          type: "text", maxlength: f.maxLength, enterkeyhint: "next",
          inputmode: f.numeric ? "numeric" : null,
          autocapitalize: f.pattern ? "none" : null,
          spellcheck: f.pattern ? "false" : null
        }));
    return el("div", { class: "fld", "data-field": f.id }, [
      pair ? el("label", { class: "sub-label", id: id + "-lbl", for: id, text: f.label || f.short }) : null,
      control,
      el("p", { class: "err", id: errId, hidden: true }),
      f.hint ? el("p", { class: "hint", id: hintId, text: f.hint }) : null
    ]);
  }
  function renderCard(card) {
    const qid = "q-" + card.fields[0].id;
    const fields = card.fields.map((f) => renderField(f, card, qid));
    return el("div", { class: "qcard glow-card" }, [
      el("div", { class: "qhead" }, [el("span", { class: "qnum", "aria-hidden": "true", text: card.n }), icon(card.icon), el("p", { class: "qtext", id: qid, text: card.q })]),
      card.fields.length > 1 ? el("div", { class: "pair" }, fields) : fields[0],
      card.rules && rulesReady ? el("button", { type: "button", class: "linkish rules-link", onclick: openRules }, [icon("book-open"), "Read the full rules"]) : null
    ]);
  }

  /* ---------- the full rules (from the homepage), since a banned member can't see the server anymore ---------- */
  const dlg = $("rules-dialog");
  const rules = (window.EG_HOME && Array.isArray(window.EG_HOME.rules)) ? window.EG_HOME.rules : [];
  const rulesReady = !!(dlg && typeof dlg.showModal === "function" && rules.length);
  if (rulesReady) {
    $("rules-full").replaceChildren(...rules.map((r) => el("li", null, [
      el("h3", null, [el("b", { text: r.code }), r.title]),
      ...(r.full || [r.short]).map((t) => el("p", { text: t }))
    ])));
    $("rules-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }
  function openRules() { if (rulesReady) dlg.showModal(); }

  CARDS.forEach((card) => $("cards-appeal").append(renderCard(card)));

  /* ---------- values + validation ---------- */
  const control = (f) => $("f-" + f.id);
  const getValue = (f) => {
    const v = (control(f).value || "").trim();
    return f.pattern === "snowflake" ? cleanId(v) : v;
  };
  const field = (id) => allFields.find((f) => f.id === id);

  function validate(f) {
    const v = getValue(f);
    if (!v) return f.required ? "Answer this to continue." : "";
    const p = f.pattern && PATTERNS[f.pattern];
    if (p && !p.re.test(v)) return p.msg;
    if (f.minLength && v.length < f.minLength) return "Write a bit more: at least " + f.minLength + " characters (you have " + v.length + ").";
    return "";
  }
  function showError(f, msg) {
    const err = $("f-" + f.id + "-err");
    err.textContent = msg;
    err.hidden = !msg;
    if (msg) control(f).setAttribute("aria-invalid", "true");
    else control(f).removeAttribute("aria-invalid");
  }
  function validateAll() {
    let first = null;
    allFields.forEach((f) => {
      const msg = validate(f);
      touched.add(f.id);
      showError(f, msg);
      if (msg && !first) first = f;
    });
    return first;
  }
  function focusField(f) {
    control(f).focus({ preventScroll: true });
    control(f).scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  }
  function showAlert(box, msg) { box.textContent = msg; box.hidden = false; }
  function hideAlert(box) { box.hidden = true; box.textContent = ""; }

  /* ---------- steps + views ---------- */
  function setSteps(current) {           // 0 = Welcome, 1 = Ban Appeal, 2 = Final Review
    stepItems.forEach((li, i) => {
      li.classList.toggle("done", i < current);
      li.classList.toggle("current", i === current);
      if (i === current) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }
  function go(n, opts) {
    state.slide = Math.max(0, Math.min(1, n));
    slides.forEach((s, i) => { s.hidden = i !== state.slide; s.classList.remove("enter"); });
    if (!reducedMotion && opts && opts.animate) { void slides[state.slide].offsetWidth; slides[state.slide].classList.add("enter"); }
    setSteps(state.slide);
    nav.hidden = state.slide === 0;
    hideAlert(alertBox);
    if (opts && opts.focus) {
      const heading = slides[state.slide].querySelector("h1, h2");
      if (heading) heading.focus({ preventScroll: true });
      scrollTop();
    }
  }
  function show(view) {                  // form | done | status | closed
    if (view === "status" && state.view !== "status") state.from = state.view;
    state.view = view;
    form.hidden = view !== "form";
    $("done").hidden = view !== "done";
    $("status").hidden = view !== "status";
    $("closed").hidden = view !== "closed";
    stepper.hidden = view === "status" || view === "closed";
    if (view === "done") setSteps(2);
    if (view === "form") setSteps(state.slide);
  }

  /* ---------- draft (this device only) ---------- */
  function saveDraft() {
    if (state.sent) return;
    const values = {};
    allFields.forEach((f) => { values[f.id] = control(f).value; });
    store.set(DRAFT_KEY, { v: 1, slide: state.slide, startedAt: state.startedAt, appealId: state.appealId, values: values });
  }
  let saveTimer = null;
  function saveDraftSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 400); }

  /* ---------- sending ---------- */
  function setSending(on) {
    state.sending = on;
    nextBtn.disabled = on;
    backBtn.disabled = on;
    nextBtn.replaceChildren(on ? "Sending…" : "Submit appeal", on ? "" : icon("arrow-right"));
  }
  async function send() {
    const EG = window.EG;
    if (!EG || !EG.configured) { showAlert(alertBox, "Appeals aren't connected yet. Owner: add your Supabase keys to assets/config.js."); return; }
    hideAlert(alertBox);
    setSending(true);
    const payload = {
      form: C.APPEAL_FORM_ID,
      appealId: state.appealId,
      elapsedMs: Date.now() - state.startedAt,
      hp: hp.value,
      fields: allFields.map((f) => ({ id: f.id, label: f.short, value: getValue(f) }))
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const { data, error } = await EG.sb.rpc("submit_appeal", { p: payload }).abortSignal(ctrl.signal);
      if (error) throw error;
      if (!data || !data.ok) { showAlert(alertBox, (data && data.error) || "Your appeal couldn't be saved. Try again in a minute."); return; }
      const saved = { id: data.id, did: getValue(field("discord_id")), user: getValue(field("discord_username")).replace(/^@/, ""), at: Date.now() };
      store.set(SAVED_KEY, saved);
      clearTimeout(saveTimer);                   // a draft save still waiting must not bring the answers back
      state.sent = true;
      store.del(DRAFT_KEY);
      showDone(saved);
    } catch (e) {
      showAlert(alertBox, ctrl.signal.aborted
        ? "The server took too long to answer. Check your connection and submit again."
        : "Couldn't reach the server. Check your connection and submit again. Your answers are still here.");
    } finally {
      clearTimeout(timer);
      if (state.sending) setSending(false);
    }
  }
  function showDone(saved) {
    $("done-id").textContent = saved.id;
    $("done-user").textContent = "@" + saved.user;
    $("done-did").textContent = saved.did;
    show("done");
    updateCheckLabel();
    $("done-title").focus({ preventScroll: true });
    scrollTop();
  }

  /* ---------- checking on an appeal ---------- */
  const VERDICT = {
    New: ["hourglass", "Received", "Your appeal is in the queue. Staff will start reviewing it soon."],
    Reviewing: ["search", "In review", "Staff are reading your appeal right now. Hang tight."],
    Accepted: ["sparkles", "Appeal accepted", "Staff lifted your ban. Rejoin with the invite below, and give the rules another read first."],
    Denied: ["circle-x", "Appeal denied", "Staff reviewed your appeal and decided to keep the ban. You can send a new appeal 14 days after your last one."]
  };
  const PILL = { New: "Received", Reviewing: "In review", Accepted: "Unbanned", Denied: "Denied" };
  const statusClass = (s) => "s-" + String(s || "New").toLowerCase();

  function tracker(a) {
    const s = VERDICT[a.status] ? a.status : "New";
    const decided = s === "Accepted" || s === "Denied";
    const steps = [
      { label: "Sent", date: a.created_at, cls: "done", ic: "check" },
      { label: "In review", date: s === "Reviewing" ? a.status_changed_at : null, cls: s === "Reviewing" ? "active" : decided ? "done" : "", ic: decided ? "check" : "hourglass" },
      { label: s === "Accepted" ? "Unbanned" : s === "Denied" ? "Denied" : "Decision", date: decided ? a.status_changed_at : null, cls: s === "Accepted" ? "good" : s === "Denied" ? "bad" : "", ic: s === "Denied" ? "x" : s === "Accepted" ? "check" : "gavel" }
    ];
    const v = VERDICT[s];
    return el("section", { class: "track glow-card", "aria-label": "Appeal " + a.id }, [
      el("div", { class: "track-top" }, [
        el("div", null, [el("h2", { text: "Appeal " + a.id }), el("p", { text: "Sent " + fmtDate(a.created_at) + (a.discord_username ? " as @" + a.discord_username : "") })]),
        el("span", { class: "status " + statusClass(s), text: PILL[s] })
      ]),
      el("ol", { class: "timeline", "aria-label": "Progress" }, steps.map((st) =>
        el("li", { class: "t-step " + st.cls }, [
          el("span", { class: "t-dot" }, [icon(st.ic)]),
          el("span", { class: "t-label", text: st.label }),
          el("span", { class: "t-date", text: st.date ? fmtDate(st.date) : " " })
        ]))),
      el("div", { class: "verdict " + statusClass(s) }, [icon(v[0]), el("div", null, [el("h3", { text: v[1] }), el("p", { text: v[2] })])]),
      a.staff_note ? el("div", { class: "team-note" }, [el("span", null, [icon("message-square-text"), "Message from staff"]), el("p", { text: a.staff_note })]) : null,
      s === "Accepted" && C.DISCORD_INVITE
        ? el("a", { class: "btn btn-primary rejoin", href: C.DISCORD_INVITE, target: "_blank", rel: "noopener" }, [icon("discord"), "Rejoin the server", icon("arrow-right")])
        : null
    ]);
  }

  const lookupAlert = $("lookup-alert");
  const lookupBtn = $("lookup-go");
  async function lookup(id, did) {
    const EG = window.EG;
    hideAlert(lookupAlert);
    if (!/^AP-[A-Z0-9]{4,10}$/.test(id) || !/^\d{17,20}$/.test(did)) {
      showAlert(lookupAlert, "Enter your appeal ID (it starts with AP-) and your 17 to 20 digit user ID.");
      return;
    }
    if (!EG || !EG.configured) { showAlert(lookupAlert, "Appeals aren't connected yet."); return; }
    lookupBtn.disabled = true;
    lookupBtn.textContent = "Checking…";
    try {
      const { data, error } = await EG.sb.rpc("appeal_status", { p_id: id, p_discord_id: did });
      if (error) throw error;
      if (!data || !data.ok) { showAlert(lookupAlert, (data && data.error) || "Couldn't find that appeal."); $("status-result").replaceChildren(); return; }
      const saved = store.get(SAVED_KEY);
      if (!saved || saved.id !== data.id) store.set(SAVED_KEY, { id: data.id, did: did, user: data.discord_username || "", at: Date.now() });
      updateCheckLabel();
      $("status-result").replaceChildren(tracker(data));
      window.egIcons($("status-result"));
    } catch (e) {
      showAlert(lookupAlert, window.EG.friendlyError(e));
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = "Check";
    }
  }
  function openStatus(prefill) {
    const saved = store.get(SAVED_KEY);
    const p = prefill || (saved && saved.id ? saved : null);
    $("lookup-id").value = p && p.id ? p.id : "";
    $("lookup-did").value = p && p.did ? p.did : "";
    $("status-result").replaceChildren();
    hideAlert(lookupAlert);
    show("status");
    $("status-title").focus({ preventScroll: true });
    scrollTop();
    if (p && p.id && p.did) lookup(p.id, p.did);
  }
  function updateCheckLabel() {
    const saved = store.get(SAVED_KEY);
    $("check-open-label").textContent = saved && saved.id ? "Check on my appeal" : "Check on an appeal";
  }

  /* ---------- events ---------- */
  $("start").addEventListener("click", () => { show("form"); go(1, { focus: true, animate: true }); saveDraftSoon(); });
  backBtn.addEventListener("click", () => { go(0, { focus: true, animate: true }); saveDraftSoon(); });
  $("check-open").addEventListener("click", () => openStatus());
  $("closed-check").addEventListener("click", () => openStatus());
  $("done-status").addEventListener("click", () => openStatus(store.get(SAVED_KEY)));
  $("status-back").addEventListener("click", () => {
    const to = state.from && state.from !== "status" ? state.from : "form";
    show(to);
    if (to === "form") go(state.slide, { focus: true });
    else { $(to === "done" ? "done-title" : "closed-title").focus({ preventScroll: true }); scrollTop(); }
  });
  $("done-copy").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText($("done-id").textContent); btn.lastChild.textContent = "Copied"; }
    catch (err) { btn.lastChild.textContent = "Copy failed: select it above"; }
    setTimeout(() => { btn.lastChild.textContent = "Copy appeal ID"; }, 2400);
  });
  $("lookup").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup($("lookup-id").value.trim().toUpperCase(), cleanId($("lookup-did").value));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.sending || state.slide === 0) return;
    const bad = validateAll();
    if (bad) { showAlert(alertBox, "Fill in the highlighted answers to continue."); focusField(bad); return; }
    send();
  });
  function onEdit(e) {
    const wrap = e.target.closest("[data-field]");
    if (!wrap) return;
    const f = field(wrap.dataset.field);
    if (f && touched.has(f.id)) {
      showError(f, validate(f));
      if (!form.querySelector('[aria-invalid="true"]')) hideAlert(alertBox);
    }
    saveDraftSoon();
  }
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);
  // Enter jumps to the next box instead of sending the appeal.
  form.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || e.isComposing || !(t instanceof HTMLInputElement) || t === hp) return;
    e.preventDefault();
    const boxes = Array.from(slides[state.slide].querySelectorAll(".inp"));
    const nextBox = boxes[boxes.indexOf(t) + 1];
    (nextBox || nextBtn).focus();
  });

  let resetArmed = null;
  $("reset").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (!resetArmed) {
      btn.textContent = "Tap again to clear everything";
      btn.classList.add("armed");
      resetArmed = setTimeout(() => { resetArmed = null; btn.textContent = "Start over"; btn.classList.remove("armed"); }, 4000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    btn.textContent = "Start over";
    btn.classList.remove("armed");
    store.del(DRAFT_KEY);
    form.reset();
    touched.clear();
    allFields.forEach((f) => showError(f, ""));
    state.startedAt = Date.now();
    state.appealId = makeId();
    go(0, { focus: true });
  });

  /* ---------- start ---------- */
  updateCheckLabel();
  const params = new URLSearchParams(location.search);
  const linkId = (params.get("id") || "").trim().toUpperCase();
  if (!C.APPEALS_OPEN) {
    show("closed");
    if (/^AP-/.test(linkId)) openStatus({ id: linkId, did: "" });
    return;
  }
  const draft = store.get(DRAFT_KEY);
  if (draft && draft.v === 1) {
    allFields.forEach((f) => { if (draft.values && typeof draft.values[f.id] === "string") control(f).value = draft.values[f.id]; });
    if (typeof draft.startedAt === "number") state.startedAt = draft.startedAt;
    if (typeof draft.appealId === "string" && /^AP-[A-Z0-9]{6}$/.test(draft.appealId)) state.appealId = draft.appealId;
  }
  go(draft && draft.slide === 1 ? 1 : 0);
  show("form");
  if (/^AP-/.test(linkId)) {
    const saved = store.get(SAVED_KEY);
    openStatus({ id: linkId, did: saved && saved.id === linkId ? saved.did : "" });
  }
})();
