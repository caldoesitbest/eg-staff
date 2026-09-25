/* Envious Gluttony™: create an account (email → code → username + password, or Discord/Google) */
(function () {
  "use strict";

  const EG = window.EG;
  const U = window.EGUI;
  const el = U.el;
  const card = document.getElementById("card");
  const stepsNav = document.getElementById("steps");
  const next = EG.nextPath("/account/");

  if (!EG.configured) { U.notConnected(card); stepsNav.hidden = true; return; }

  function mark(step) {
    Array.from(stepsNav.children).forEach((li, i) => {
      li.classList.toggle("on", i === step);
      li.classList.toggle("done", i < step);
      if (i === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }

  /* ---------- 1. email (or Discord/Google) ---------- */
  function emailView(prefill) {
    mark(0);
    const err = U.alertBox();
    const email = el("input", { class: "inp", id: "email", type: "email", autocomplete: "email", value: prefill || "" });
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: "Send my code" });
    const form = el("form", { class: "form", novalidate: true }, [U.field("email", "Email", email), err, go]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { U.say(err, "Enter a valid email address."); email.focus(); return; }
      U.busy(go, true, "Sending your code…");
      const problem = await sendCode(v);
      U.busy(go, false);
      if (problem) { U.say(err, problem); return; }
      U.show(card, codeView(v));
    });
    const social = U.socialButtons(next, err);
    setTimeout(() => email.focus(), 30);
    return el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Create your account" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: "Join Envious Gluttony™" }),
      el("p", { class: "auth-sub", text: "One account to track your staff application and everything we add next." }),
      social, social ? el("div", { class: "or", text: "or use your email" }) : null,
      form,
      el("p", { class: "auth-foot" }, ["Already have an account? ", el("a", { href: "../signin/" + location.search, text: "Sign in" })])
    ]);
  }

  async function sendCode(email) {
    const { error } = await EG.sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
    return error ? EG.friendlyError(error) : "";
  }

  /* ---------- 2. confirm the email ---------- */
  function codeView(email) {
    mark(1);
    return U.codeStep({
      email: email,
      eyebrow: "Confirm your email",
      title: "Check your inbox",
      button: "Confirm my email",
      onVerify: async (code) => {
        const { error } = await EG.sb.auth.verifyOtp({ email: email, token: code, type: "email" });
        if (error) return EG.friendlyError(error);
        await afterSignedIn();
        return "";
      },
      onResend: () => sendCode(email),
      onBack: () => U.show(card, emailView(email))
    });
  }

  async function afterSignedIn() {
    const profile = await EG.profile(true);
    if (profile && profile.username) {
      // They already had a full account: this just signed them in.
      try { await EG.claimReceipts(); } catch (e) { /* retried on the account page */ }
      location.replace(next);
      return;
    }
    const user = await EG.user();
    U.show(card, detailsView(EG.providers(user).includes("email")));
  }

  /* ---------- 3. username + password ---------- */
  function detailsView(needsPassword) {
    mark(2);
    const err = U.alertBox();
    const uname = U.usernameField();
    const pw = needsPassword ? U.newPasswordBlock("Password") : null;
    const agree = el("input", { type: "checkbox", id: "agree" });
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: "Create my account" });

    const form = el("form", { class: "form", novalidate: true }, [
      uname.node,
      pw ? pw.node : null,
      el("label", { class: "tick-row", for: "agree" }, [agree, el("span", { text: "I'll follow the Envious Gluttony™ rules." })]),
      err, go
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = uname.check();
      if (u.error) { U.say(err, u.error); u.focus.focus(); return; }
      const name = u.value;
      let password = null;
      if (pw) {
        const r = pw.check();
        if (r.error) { U.say(err, r.error); r.focus.focus(); return; }
        password = r.value;
      }
      if (!agree.checked) { U.say(err, "Tick the box to agree to the rules."); agree.focus(); return; }
      U.say(err, "");
      U.busy(go, true, "Creating your account…");
      try {
        if (password) {
          const { error } = await EG.sb.auth.updateUser({ password: password });
          if (error && !/should be different/i.test(error.message || "")) throw error;
        }
        await U.saveUsername(name);
        try { await EG.claimReceipts(); } catch (ex) { /* retried on the account page */ }
        location.replace(next + (next.includes("?") ? "&" : "?") + "welcome=1");
      } catch (ex) {
        U.say(err, EG.friendlyError(ex));
        U.busy(go, false);
      }
    });

    setTimeout(() => uname.input.focus(), 30);
    return el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Almost done" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: "Set up your account" }),
      el("p", { class: "auth-sub", text: needsPassword
        ? "Your email is confirmed. Pick a username and password; you can sign in with either your email or username."
        : "Pick the username you'll go by on Envious Gluttony™." }),
      form
    ]);
  }

  /* ---------- start ---------- */
  (async () => {
    const user = await EG.user();
    if (!user) { U.show(card, emailView()); return; }
    await afterSignedIn(); // signed in but unfinished (or already done → forwarded)
  })();
})();
