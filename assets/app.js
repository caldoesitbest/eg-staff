/* Envious Gluttony™ staff recruitment quiz */
(function () {
  "use strict";

  const C = window.EG_CONFIG;
  const icon = window.egIcon;
  const PARTS = { 1: C.recruitment, 2: C.judgment };
  const allFields = C.recruitment.concat(C.judgment).flatMap((card) => card.fields);
  const DRAFT_KEY = "eg-staff-draft:" + C.FORM_ID;
  const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const PATTERNS = {
    discord: { re: /^@?[A-Za-z0-9_.]{2,32}(#\d{4})?$/, msg: "Use your Discord username (letters, numbers, _ and . only), not your display name." }
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (id) => document.getElementById(id);
  const form = $("quiz");
  const slides = [$("slide-0"), $("slide-1"), $("slide-2")];
  const stepItems = Array.from($("stepper").children);
  const nav = $("nav");
  const backBtn = $("back");
  const nextBtn = $("next");
  const alertBox = $("alert");
  const hp = $("eg-hp");

  const state = { slide: 0, startedAt: Date.now(), appId: makeId(), sending: false };
  const touched = new Set();

  /* ---------- helpers ---------- */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children || [])) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  function makeId() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return "EG-" + Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("");
  }

  /* ---------- render questions ---------- */
  function renderField(f, card, kind, qid) {
    const id = "f-" + f.id;
    const errId = id + "-err";
    const pair = card.fields.length > 1;
    const attrs = {
      id: id,
      name: f.id,
      class: "inp",
      "aria-labelledby": pair ? qid + " " + id + "-lbl" : qid,
      "aria-describedby": errId,
      placeholder: f.placeholder || (kind === "rec" ? "Your answer..." : "Applicant response"),
      autocomplete: "off"
    };
    let control;
    if (f.type === "textarea") {
      control = el("textarea", Object.assign(attrs, { rows: f.rows || 3, maxlength: f.maxLength }));
    } else if (f.type === "number") {
      control = el("input", Object.assign(attrs, { type: "number", inputmode: "numeric", min: f.min, max: f.max, step: 1, enterkeyhint: "next" }));
    } else {
      control = el("input", Object.assign(attrs, {
        type: "text", maxlength: f.maxLength, enterkeyhint: "next",
        autocapitalize: f.pattern === "discord" ? "none" : null,
        spellcheck: f.pattern === "discord" ? "false" : null
      }));
    }
    const parts = [];
    if (pair) parts.push(el("label", { class: "sub-label", id: id + "-lbl", for: id, text: f.label || f.short }));
    parts.push(kind === "jud" ? el("div", { class: "pencil-wrap" }, [icon("pencil"), control]) : control);
    parts.push(el("p", { class: "err", id: errId, hidden: true }));
    return el("div", { class: "fld", "data-field": f.id }, parts);
  }

  function renderCard(card, kind) {
    const qid = "q-" + card.fields[0].id;
    const head = kind === "rec"
      ? el("div", { class: "qhead" }, [el("span", { class: "qnum", "aria-hidden": "true", text: card.n }), icon(card.icon), el("p", { class: "qtext", id: qid, text: card.q })])
      : el("div", { class: "qhead" }, [el("span", { class: "qcircle", "aria-hidden": "true", text: card.n }), el("p", { class: "qtext", id: qid, text: card.q })]);
    const fields = card.fields.map((f) => renderField(f, card, kind, qid));
    return el("div", { class: "qcard glow-card" }, [head, card.fields.length > 1 ? el("div", { class: "pair" }, fields) : fields[0]]);
  }

  C.recruitment.forEach((card) => $("cards-recruitment").append(renderCard(card, "rec")));
  C.judgment.forEach((card) => $("cards-judgment").append(renderCard(card, "jud")));
  C.rules.forEach((r) => $("rules-list").append(el("li", null, [icon(r.icon), el("span", null, [el("b", { text: r.code }), r.text])])));

  /* ---------- values + validation ---------- */
  const control = (f) => $("f-" + f.id);
  const getValue = (f) => (control(f).value || "").trim();

  function validate(f) {
    const v = getValue(f);
    if (!v) return f.required ? (f.type === "number" ? "Enter your age." : "Answer this to continue.") : "";
    const p = f.pattern && PATTERNS[f.pattern];
    if (p && !p.re.test(v)) return p.msg;
    if (f.type === "number") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) return "Enter a whole number from " + f.min + " to " + f.max + ".";
    }
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

  function validatePart(n) {
    let first = null;
    PARTS[n].flatMap((c) => c.fields).forEach((f) => {
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

  function showAlert(msg) { alertBox.textContent = msg; alertBox.hidden = false; }
  function hideAlert() { alertBox.hidden = true; alertBox.textContent = ""; }

  /* ---------- slides ---------- */
  function go(n, opts) {
    state.slide = Math.max(0, Math.min(2, n));
    slides.forEach((s, i) => { s.hidden = i !== state.slide; s.classList.remove("enter"); });
    if (!reducedMotion && opts && opts.animate) { void slides[state.slide].offsetWidth; slides[state.slide].classList.add("enter"); }
    stepItems.forEach((li, i) => {
      li.classList.toggle("done", i < state.slide);
      li.classList.toggle("current", i === state.slide);
      if (i === state.slide) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    nav.hidden = state.slide === 0;
    nextBtn.replaceChildren(state.slide === 2 ? "Submit application" : "Next: Rules & Judgment", icon("arrow-right"));
    hideAlert();
    if (opts && opts.focus) {
      const heading = slides[state.slide].querySelector("h1, h2");
      if (heading) heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }

  /* ---------- draft (this device only) ---------- */
  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return d && d.v === 1 ? d : null;
    } catch (e) { return null; }
  }
  function saveDraft() {
    const values = {};
    allFields.forEach((f) => { values[f.id] = getValue(f); });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, slide: state.slide, startedAt: state.startedAt, appId: state.appId, values: values }));
    } catch (e) { /* storage blocked: the quiz still works */ }
  }
  let saveTimer = null;
  function clearDraft() { clearTimeout(saveTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }
  function saveDraftSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 400); }

  /* ---------- sending ---------- */
  function setSending(on) {
    state.sending = on;
    nextBtn.disabled = on;
    backBtn.disabled = on;
    nextBtn.replaceChildren(on ? "Sending…" : "Submit application", on ? "" : icon("arrow-right"));
  }

  async function send() {
    const EG = window.EG;
    if (!EG || !EG.configured) {
      showAlert("This quiz isn't connected yet. Owner: add your Supabase keys to assets/config.js.");
      return;
    }
    hideAlert();
    setSending(true);
    const payload = {
      form: C.FORM_ID,
      applicationId: state.appId,
      elapsedMs: Date.now() - state.startedAt,
      hp: hp.value,
      fields: allFields.map((f) => ({ id: f.id, label: f.short, value: getValue(f) }))
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const signedIn = !!(await EG.user());
      const { data, error } = await EG.sb.rpc("submit_application", { p: payload }).abortSignal(ctrl.signal);
      if (error) throw error;
      if (!data || !data.ok) { showAlert((data && data.error) || "Your application couldn't be saved. Try again in a minute."); return; }
      const discordUser = getValue(allFields.find((f) => f.id === "discord_username") || allFields[0]).replace(/^@/, "");
      if (!signedIn) EG.addReceipt(data.id, discordUser);
      clearDraft();
      showDone(data.id, signedIn);
    } catch (e) {
      showAlert(ctrl.signal.aborted
        ? "The server took too long to answer. Check your connection and submit again."
        : "Couldn't reach the server. Check your connection and submit again. Your answers are still here.");
    } finally {
      clearTimeout(timer);
      if (state.sending) setSending(false);
    }
  }

  function showDone(id, signedIn) {
    const user = getValue(allFields.find((f) => f.id === "discord_username") || allFields[0]);
    form.hidden = true;
    stepItems.forEach((li) => { li.classList.add("done"); li.classList.remove("current"); li.removeAttribute("aria-current"); });
    $("done-id").textContent = id;
    $("done-user").textContent = user ? "@" + user.replace(/^@/, "") : "—";
    $("done-tracked").hidden = !signedIn;
    $("done-track").hidden = !!signedIn;
    if (C.DISCORD_INVITE) { $("done-invite").href = C.DISCORD_INVITE; $("done-invite").hidden = false; }
    $("done").hidden = false;
    $("done-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  /* ---------- events ---------- */
  $("start").addEventListener("click", () => { go(1, { focus: true, animate: true }); saveDraftSoon(); });
  backBtn.addEventListener("click", () => { go(state.slide - 1, { focus: true, animate: true }); saveDraftSoon(); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.sending || state.slide === 0) return;
    const bad = validatePart(state.slide);
    if (bad) { showAlert("Fill in the highlighted answers to continue."); focusField(bad); return; }
    if (state.slide === 1) { go(2, { focus: true, animate: true }); saveDraftSoon(); return; }
    const missed = validatePart(1); // a restored draft can skip ahead
    if (missed) { go(1); showAlert("One of your answers in part 1 needs fixing before you can submit."); focusField(missed); return; }
    send();
  });

  function onEdit(e) {
    const wrap = e.target.closest("[data-field]");
    if (!wrap) return;
    const f = allFields.find((x) => x.id === wrap.dataset.field);
    if (f && touched.has(f.id)) {
      showError(f, validate(f));
      if (!form.querySelector('[aria-invalid="true"]')) hideAlert();
    }
    saveDraftSoon();
  }
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);

  // Enter jumps to the next box instead of submitting the whole part.
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
    clearDraft();
    form.reset();
    touched.clear();
    allFields.forEach((f) => showError(f, ""));
    state.startedAt = Date.now();
    state.appId = makeId();
    go(0, { focus: true });
  });

  /* ---------- start ---------- */
  if (!C.APPLICATIONS_OPEN) {
    form.hidden = true;
    $("stepper").hidden = true;
    $("closed").hidden = false;
    return;
  }
  const draft = readDraft();
  if (draft) {
    allFields.forEach((f) => { if (draft.values && typeof draft.values[f.id] === "string") control(f).value = draft.values[f.id]; });
    if (typeof draft.startedAt === "number") state.startedAt = draft.startedAt;
    if (typeof draft.appId === "string" && /^EG-[A-Z0-9]{6}$/.test(draft.appId)) state.appId = draft.appId;
  }
  go(draft && Number.isInteger(draft.slide) ? draft.slide : 0);
})();
