/* Envious Gluttony™: shared pieces for sign in, create account and my account */
(function () {
  "use strict";

  const icon = window.egIcon;
  const EG = window.EG;
  const C = window.EG_CONFIG;

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

  function busy(btn, on, text) {
    if (on) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = text || "One sec…";
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  const alertBox = () => el("div", { class: "alert", role: "alert", hidden: true });
  function say(box, msg) { box.textContent = msg || ""; box.hidden = !msg; }

  function field(id, label, control, extra) {
    return el("div", { class: "field" }, [el("label", { class: "sub-label", for: id, text: label }), control].concat(extra || []));
  }

  function passwordInput(id, autocomplete) {
    const input = el("input", { class: "inp", id: id, type: "password", autocomplete: autocomplete, spellcheck: "false" });
    const toggle = el("button", { type: "button", class: "pw-toggle", "aria-label": "Show password", "aria-pressed": "false" }, [icon("eye")]);
    toggle.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
      toggle.setAttribute("aria-pressed", String(show));
      toggle.replaceChildren(icon(show ? "eye-off" : "eye"));
      input.focus();
    });
    return { input: input, wrap: el("div", { class: "pw-wrap" }, [input, toggle]) };
  }

  function strength(pw) {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
    return Math.max(1, s);
  }
  function passwordProblem(pw) {
    if (pw.length < 8) return "Use at least 8 characters.";
    if (!/[\d\W_]/.test(pw)) return "Add at least one number or symbol.";
    return "";
  }

  /* New password + confirm, with a strength meter. */
  function newPasswordBlock(labelText) {
    const pw = passwordInput("new-password", "new-password");
    const confirm = passwordInput("confirm-password", "new-password");
    const meter = el("div", { class: "strength", "data-score": "0", "aria-hidden": "true" }, [el("span"), el("span"), el("span"), el("span")]);
    const hint = el("p", { class: "hint", id: "pw-hint", text: "At least 8 characters, with a number or symbol." });
    pw.input.setAttribute("aria-describedby", "pw-hint");
    pw.input.addEventListener("input", () => {
      const v = pw.input.value;
      meter.dataset.score = String(strength(v));
      const problem = v ? passwordProblem(v) : "";
      hint.textContent = !v ? "At least 8 characters, with a number or symbol." : problem || (strength(v) >= 3 ? "Strong password." : "Good. Longer is even better.");
      hint.className = "hint" + (v ? (problem ? " bad" : " good") : "");
    });
    return {
      node: el("div", { class: "form" }, [
        field("new-password", labelText || "Password", pw.wrap, [meter, hint]),
        field("confirm-password", "Confirm password", confirm.wrap)
      ]),
      input: pw.input,
      check() {
        const v = pw.input.value;
        const problem = passwordProblem(v);
        if (problem) return { error: problem, focus: pw.input };
        if (confirm.input.value !== v) return { error: "The two passwords don't match.", focus: confirm.input };
        return { value: v };
      }
    };
  }

  /* Username box with a live "is it taken?" check. */
  function usernameField(initial) {
    const input = el("input", {
      class: "inp", id: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false",
      maxlength: "20", placeholder: "e.g. nightowl", "aria-describedby": "username-hint", value: initial || ""
    });
    const hint = el("p", { class: "hint", id: "username-hint", text: "3–20 characters: letters, numbers, _ and ." });
    let timer = null;
    let available = null;
    const run = () => {
      const v = input.value.toLowerCase().replace(/[^a-z0-9_.]/g, "");
      if (v !== input.value) input.value = v;
      available = null;
      clearTimeout(timer);
      if (v.length < 3) { hint.textContent = "3–20 characters: letters, numbers, _ and ."; hint.className = "hint"; return; }
      hint.textContent = "Checking…";
      hint.className = "hint";
      timer = setTimeout(async () => {
        const asked = v;
        const { data } = await EG.sb.rpc("username_available", { p_username: asked });
        if (input.value !== asked) return;
        available = data === true;
        hint.textContent = available ? "@" + asked + " is available." : "@" + asked + " is taken. Try another.";
        hint.className = "hint " + (available ? "good" : "bad");
      }, 350);
    };
    input.addEventListener("input", run);
    if (initial) run();
    return {
      node: field("username", "Username", input, [hint]),
      input: input,
      check() {
        const v = input.value.trim();
        if (!/^[a-z0-9_.]{3,20}$/.test(v)) return { error: "Pick a username: 3–20 characters, letters, numbers, _ and .", focus: input };
        if (available === false) return { error: "That username is taken. Try another.", focus: input };
        return { value: v };
      }
    };
  }

  async function saveUsername(name) {
    const user = await EG.user();
    const { error } = await EG.sb.from("profiles").update({ username: name }).eq("id", user.id);
    if (error) {
      if (error.code === "23505") throw new Error("That username was just taken. Try another.");
      throw error;
    }
    await EG.profile(true);
  }

  /* "Continue with Discord / Google" buttons. */
  function socialButtons(next, errBox) {
    const box = el("div", { class: "social" });
    const add = (provider, label) => {
      const b = el("button", { type: "button", class: "btn btn-social btn-" + provider, text: label });
      b.addEventListener("click", async () => {
        busy(b, true, "Opening " + (provider === "discord" ? "Discord" : "Google") + "…");
        try { await EG.oauth(provider, next); } catch (e) { busy(b, false); if (errBox) say(errBox, EG.friendlyError(e)); }
      });
      box.append(b);
    };
    if (C.DISCORD_LOGIN) add("discord", "Continue with Discord");
    if (C.GOOGLE_LOGIN) add("google", "Continue with Google");
    return box.children.length ? box : null;
  }

  /* "Check your email" step: code box, resend timer, change email. */
  function codeStep(opts) {
    const code = el("input", {
      class: "inp code-input", id: "code", inputmode: "numeric", autocomplete: "one-time-code",
      maxlength: "10", placeholder: "••••••", "aria-label": "Code from your email"
    });
    const err = alertBox();
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: opts.button || "Confirm" });
    const resend = el("button", { type: "button", class: "linkish" });
    let left = 60;
    let timer = null;
    const tick = () => {
      if (left > 0) { resend.disabled = true; resend.textContent = "Resend code in " + left + "s"; left--; }
      else { clearInterval(timer); resend.disabled = false; resend.textContent = "Send a new code"; }
    };
    const startTimer = () => { left = 60; clearInterval(timer); tick(); timer = setInterval(tick, 1000); };
    startTimer();
    resend.addEventListener("click", async () => {
      say(err, "");
      resend.disabled = true;
      const problem = await opts.onResend();
      if (problem) { say(err, problem); resend.disabled = false; return; }
      startTimer();
    });
    code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, "").slice(0, 10); });
    const form = el("form", { class: "form", novalidate: true }, [
      field("code", "Code", code), err, go,
      el("div", { class: "auth-row" }, [resend, opts.onBack ? el("button", { type: "button", class: "linkish", text: "Use a different email", onclick: () => { clearInterval(timer); opts.onBack(); } }) : null])
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = code.value.trim();
      if (v.length < 6) { say(err, "Enter the code from your email."); code.focus(); return; }
      say(err, "");
      busy(go, true, "Checking…");
      const problem = await opts.onVerify(v);
      busy(go, false);
      if (problem) { say(err, problem); code.select(); } else clearInterval(timer);
    });
    setTimeout(() => code.focus(), 30);
    return el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: opts.eyebrow || "Check your email" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: opts.title || "Enter your code" }),
      el("p", { class: "auth-sub" }, [opts.lead || "We sent a code to ", el("strong", { text: opts.email }), opts.tail || ". It can take a minute to arrive, and it's good for an hour."]),
      form
    ]);
  }

  /* An application's answers, grouped like the quiz. answers = [{id, label, value}] */
  function answersView(answers) {
    const byId = {};
    (Array.isArray(answers) ? answers : []).forEach((a) => { if (a && a.id) byId[a.id] = a; });
    const used = new Set();
    const groups = [
      { title: "Staff Recruitment", cards: C.recruitment },
      { title: "Rules & Judgment Check", cards: C.judgment }
    ].map((g) => el("div", { class: "qa-group" }, [el("h3", { text: g.title })].concat(g.cards.map((card) => {
      const rows = card.fields.map((f) => {
        used.add(f.id);
        const v = byId[f.id] ? byId[f.id].value : "";
        const text = card.fields.length > 1 ? (f.label || f.short) + ": " + (v || "no answer") : (v || "No answer");
        return el("p", { class: "a" + (v ? "" : " blank"), text: text });
      });
      return el("div", { class: "qa" }, [el("p", { class: "q" }, [el("b", { text: card.n }), card.q])].concat(rows));
    }))));
    const extras = Object.values(byId).filter((a) => !used.has(a.id) && a.value);
    if (extras.length) {
      groups.push(el("div", { class: "qa-group" }, [el("h3", { text: "Other answers" })].concat(
        extras.map((a) => el("div", { class: "qa" }, [el("p", { class: "q", text: a.label || a.id }), el("p", { class: "a", text: a.value })])))));
    }
    return groups;
  }

  function notConnected(host) {
    host.replaceChildren(el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Almost there" }),
      el("h1", { class: "auth-title", text: "Accounts aren't switched on yet" }),
      el("p", { class: "auth-sub", text: "The owner still needs to connect Supabase in assets/config.js." })
    ]));
  }

  function show(host, view) {
    host.replaceChildren(view);
    if (window.egIcons) window.egIcons(host);
    const h = host.querySelector("h1, h2");
    if (h && document.activeElement !== host.querySelector("input")) h.focus({ preventScroll: true });
  }

  window.EGUI = { el, busy, say, alertBox, field, passwordInput, passwordProblem, strength, newPasswordBlock, usernameField, saveUsername, socialButtons, codeStep, answersView, notConnected, show };
})();
