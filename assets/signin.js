/* Envious Gluttony™: sign in + password reset */
(function () {
  "use strict";

  const EG = window.EG;
  const U = window.EGUI;
  const el = U.el;
  const card = document.getElementById("card");
  const next = EG.nextPath("/account/");

  if (!EG.configured) { U.notConnected(card); return; }

  async function done() {
    try { await EG.claimReceipts(); } catch (e) { /* the account page tries again */ }
    location.replace(next);
  }

  /* ---------- sign in ---------- */
  function signInView(prefill) {
    const err = U.alertBox();
    const id = el("input", { class: "inp", id: "identifier", autocomplete: "username", autocapitalize: "none", spellcheck: "false", value: prefill || "" });
    const pw = U.passwordInput("password", "current-password");
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: "Sign in" });
    const form = el("form", { class: "form", novalidate: true }, [
      U.field("identifier", "Email or username", id),
      U.field("password", "Password", pw.wrap),
      el("div", { class: "auth-row" }, [el("button", { type: "button", class: "linkish", text: "Forgot your password?", onclick: () => U.show(card, resetEmailView(id.value.includes("@") ? id.value.trim() : "")) })]),
      err, go
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const who = id.value.trim();
      const pass = pw.input.value;
      if (!who || !pass) { U.say(err, "Enter your email or username and your password."); (who ? pw.input : id).focus(); return; }
      U.say(err, "");
      U.busy(go, true, "Signing in…");
      try {
        let email = who;
        if (!who.includes("@")) {
          const r = await EG.sb.rpc("email_for_login", { p_username: who.toLowerCase().replace(/^@/, ""), p_password: pass });
          if (r.error) throw r.error;
          if (!r.data) throw new Error("Invalid login credentials");
          email = r.data;
        }
        const { error } = await EG.sb.auth.signInWithPassword({ email: email, password: pass });
        if (error) throw error;
        await done();
      } catch (ex) {
        U.say(err, EG.friendlyError(ex));
        U.busy(go, false);
      }
    });
    const social = U.socialButtons(next, err);
    setTimeout(() => (prefill ? pw.input : id).focus(), 30);
    return el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Envious Gluttony™ account" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: "Sign in" }),
      el("p", { class: "auth-sub", text: "Members, applicants and staff all sign in here." }),
      social, social ? el("div", { class: "or", text: "or" }) : null,
      form
    ]);
  }

  /* ---------- reset: email → code → new password ---------- */
  function resetEmailView(prefill) {
    const err = U.alertBox();
    const email = el("input", { class: "inp", id: "reset-email", type: "email", autocomplete: "email", value: prefill || "" });
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: "Send me a code" });
    const form = el("form", { class: "form", novalidate: true }, [U.field("reset-email", "Email", email), err, go]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { U.say(err, "Enter the email on your account."); email.focus(); return; }
      U.busy(go, true, "Sending…");
      const problem = await sendResetCode(v);
      U.busy(go, false);
      if (problem) { U.say(err, problem); return; }
      U.show(card, resetCodeView(v));
    });
    setTimeout(() => email.focus(), 30);
    return el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Password reset" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: "Reset your password" }),
      el("p", { class: "auth-sub", text: "Enter your account email and we'll send you a code." }),
      form,
      el("button", { type: "button", class: "linkish", text: "Back to sign in", onclick: () => U.show(card, signInView()) })
    ]);
  }

  async function sendResetCode(email) {
    const { error } = await EG.sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } });
    // Don't reveal whether an account exists: only surface limits and connection problems.
    if (error && !/signups not allowed|user not found/i.test(error.message || "")) return EG.friendlyError(error);
    return "";
  }

  function resetCodeView(email) {
    return U.codeStep({
      email: email,
      eyebrow: "Password reset",
      title: "Enter your code",
      lead: "If ",
      tail: " has an account, we just sent it a code. It's good for an hour.",
      button: "Continue",
      onVerify: async (code) => {
        const { error } = await EG.sb.auth.verifyOtp({ email: email, token: code, type: "email" });
        if (error) return EG.friendlyError(error);
        U.show(card, newPasswordView());
        return "";
      },
      onResend: () => sendResetCode(email),
      onBack: () => U.show(card, resetEmailView(email))
    });
  }

  function newPasswordView() {
    const err = U.alertBox();
    const block = U.newPasswordBlock("New password");
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: "Save my new password" });
    const form = el("form", { class: "form", novalidate: true }, [block.node, err, go]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = block.check();
      if (r.error) { U.say(err, r.error); r.focus.focus(); return; }
      U.busy(go, true, "Saving…");
      const { error } = await EG.sb.auth.updateUser({ password: r.value });
      if (error) { U.say(err, EG.friendlyError(error)); U.busy(go, false); return; }
      await done();
    });
    setTimeout(() => block.input.focus(), 30);
    return el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Password reset" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: "Choose a new password" }),
      el("p", { class: "auth-sub", text: "You're signed in. Pick a new password to finish." }),
      form
    ]);
  }

  /* ---------- start ---------- */
  const C = window.EG_CONFIG || {};
  const ways = document.getElementById("perk-ways");
  if (ways) {
    const list = [C.DISCORD_LOGIN && "Discord", C.GOOGLE_LOGIN && "Google"].filter(Boolean);
    ways.textContent = "Sign in with " + (list.length ? list.join(", ") + (list.length > 1 ? "," : "") + " or your email" : "your email");
  }
  const createLink = document.querySelector(".create-panel a.btn");
  if (createLink && location.search) createLink.href = "../signup/" + location.search;
  (async () => {
    if (await EG.user()) { location.replace(next); return; }
    U.show(card, signInView());
  })();
})();
