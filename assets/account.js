/* Envious Gluttony™: My account + staff application tracker */
(function () {
  "use strict";

  const EG = window.EG;
  const U = window.EGUI;
  const el = U.el;
  const icon = window.egIcon;
  const main = document.getElementById("acct");
  const params = new URLSearchParams(location.search);
  const next = EG.nextPath("/account/");

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  const statusClass = (s) => "s-" + String(s || "New").toLowerCase();

  function card(children, cls) {
    return el("section", { class: (cls || "auth-card") + " glow-card" }, children);
  }
  function page(nodes) {
    main.replaceChildren(...nodes.filter(Boolean));
    window.egIcons(main);
    const h = main.querySelector("h1");
    if (h) h.focus({ preventScroll: true });
  }

  if (!EG.configured) {
    main.classList.add("auth-wrap", "single");
    main.replaceChildren(card([]));
    U.notConnected(main.firstChild);
    return;
  }

  /* ---------- first sign-in with Discord/Google: pick a username ---------- */
  function suggestName(user) {
    const m = (user && user.user_metadata) || {};
    const raw = String(m.full_name || m.name || m.user_name || (user.email || "").split("@")[0] || "")
      .toLowerCase().replace(/#\d+$/, "").replace(/[^a-z0-9_.]/g, "").slice(0, 20);
    return raw.length >= 3 ? raw : "";
  }

  function usernameSetup(user) {
    const err = U.alertBox();
    const uname = U.usernameField(suggestName(user));
    const go = el("button", { type: "submit", class: "btn btn-primary btn-block", text: "Save and continue" });
    const form = el("form", { class: "form", novalidate: true }, [uname.node, err, go]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = uname.check();
      if (u.error) { U.say(err, u.error); u.focus.focus(); return; }
      U.busy(go, true, "Saving…");
      try {
        await U.saveUsername(u.value);
        if (window.EG_NAV) window.EG_NAV.refresh();
        if (next !== "/account/") { location.replace(next); return; }
        await renderAccount(user, await EG.profile(), true);
      } catch (ex) {
        U.say(err, EG.friendlyError(ex));
        U.busy(go, false);
      }
    });
    main.classList.add("auth-wrap", "single");
    page([card([el("div", { class: "form" }, [
      el("p", { class: "eyebrow", text: "Welcome to Envious Gluttony™" }),
      el("h1", { class: "auth-title", tabindex: "-1", text: "Pick your username" }),
      el("p", { class: "auth-sub", text: "One last step. This is the name you'll go by on the site." }),
      form
    ])])]);
  }

  /* ---------- the tracker ---------- */
  const VERDICT = {
    New: ["hourglass", "Received", "Your application is in the queue. The owners will start reviewing it soon."],
    Reviewing: ["search", "In review", "The owners are reading your answers right now. Hang tight."],
    Accepted: ["sparkles", "You're in!", "Welcome to the staff team. Keep an eye on your Discord DMs for next steps."],
    Denied: ["circle-x", "Not this time", "Thanks for applying. Stay active in the server and try again in a future round."]
  };

  function tracker(a) {
    const s = VERDICT[a.status] ? a.status : "New";
    const decided = s === "Accepted" || s === "Denied";
    const steps = [
      { label: "Submitted", date: a.created_at, cls: "done", ic: "check" },
      { label: "In review", date: s === "Reviewing" ? a.status_changed_at : null, cls: s === "Reviewing" ? "active" : decided ? "done" : "", ic: decided ? "check" : "hourglass" },
      { label: s === "Accepted" ? "Accepted" : s === "Denied" ? "Not selected" : "Decision", date: decided ? a.status_changed_at : null, cls: s === "Accepted" ? "good" : s === "Denied" ? "bad" : "", ic: s === "Denied" ? "x" : s === "Accepted" ? "check" : "sparkles" }
    ];
    const v = VERDICT[s];
    return el("section", { class: "track glow-card", "aria-label": "Application " + a.id }, [
      el("div", { class: "track-top" }, [
        el("div", null, [el("h2", { text: "Application " + a.id }), el("p", { text: "Sent " + fmtDate(a.created_at) + " as @" + a.discord_username })]),
        el("span", { class: "status " + statusClass(s), text: s === "Denied" ? "Not selected" : s })
      ]),
      el("ol", { class: "timeline", "aria-label": "Progress" }, steps.map((st) =>
        el("li", { class: "t-step " + st.cls }, [
          el("span", { class: "t-dot" }, [icon(st.ic)]),
          el("span", { class: "t-label", text: st.label }),
          el("span", { class: "t-date", text: st.date ? fmtDate(st.date) : " " })
        ]))),
      el("div", { class: "verdict " + statusClass(s) }, [icon(v[0]), el("div", null, [el("h3", { text: v[1] }), el("p", { text: v[2] })])]),
      a.staff_note ? el("div", { class: "team-note" }, [el("span", null, [icon("message-square-text"), "Message from the team"]), el("p", { text: a.staff_note })]) : null,
      el("details", { class: "answers" }, [el("summary", { text: "Your answers" })].concat(U.answersView(a.answers)))
    ]);
  }

  function claimBox(onDone) {
    const err = U.alertBox();
    const id = el("input", { class: "inp", id: "claim-id", placeholder: "EG-XXXXXX", autocapitalize: "characters", spellcheck: "false", maxlength: "13" });
    const user = el("input", { class: "inp", id: "claim-user", placeholder: "Discord username you applied with", autocapitalize: "none", spellcheck: "false" });
    const go = el("button", { type: "submit", class: "btn btn-ghost", text: "Add it" });
    const form = el("form", { class: "claim", novalidate: true }, [
      el("h3", { text: "Applied before you had an account?" }),
      el("p", { text: "Add it with the application ID from your confirmation screen and the Discord username you used." }),
      el("div", { class: "claim-row" }, [
        U.field("claim-id", "Application ID", id),
        U.field("claim-user", "Discord username", user),
        go
      ]),
      err
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!id.value.trim() || !user.value.trim()) { U.say(err, "Enter the application ID and the Discord username."); return; }
      U.busy(go, true, "Adding…");
      const { data, error } = await EG.sb.rpc("claim_application", { p_id: id.value.trim().toUpperCase(), p_discord_username: user.value.trim() });
      U.busy(go, false);
      if (error || !data || !data.ok) { U.say(err, (data && data.error) || EG.friendlyError(error)); return; }
      onDone();
    });
    return form;
  }

  /* ---------- the account page ---------- */
  async function renderAccount(user, profile, fresh) {
    main.classList.remove("auth-wrap", "single");
    const [admin, res] = await Promise.all([
      EG.isAdmin(),
      EG.sb.from("applications")
        .select("id, discord_username, status, staff_note, created_at, status_changed_at, answers")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    ]);
    const apps = res.data || [];
    const pic = EG.avatar(user);
    const names = { email: "Email", discord: "Discord", google: "Google" };
    const out = el("button", { type: "button", class: "btn btn-ghost btn-sm" }, [icon("log-out"), "Sign out"]);
    out.addEventListener("click", async () => { await EG.signOut(); location.href = "/"; });

    page([
      el("section", { class: "acct-head glow-card" }, [
        el("div", { class: "avatar", "aria-hidden": "true" }, pic
          ? [el("img", { src: pic, alt: "", referrerpolicy: "no-referrer" })]
          : [profile.username.charAt(0).toUpperCase()]),
        el("div", { class: "acct-who" }, [
          el("h1", { tabindex: "-1", text: "@" + profile.username }),
          el("p", { text: user.email || "" }),
          el("div", { class: "chips" }, EG.providers(user).map((p) => el("span", { class: "chip", text: names[p] || p })))
        ]),
        el("div", { class: "acct-actions" }, [
          admin ? el("a", { class: "btn btn-ghost btn-sm", href: "/admin/" }, [icon("shield-check"), "Admin"]) : null,
          out
        ])
      ]),
      params.get("welcome") || fresh ? el("p", { class: "ok-note", text: "Your account is ready. Welcome to Envious Gluttony™!" }) : null,
      res.error ? el("div", { class: "alert", role: "alert", text: "Couldn't load your application: " + EG.friendlyError(res.error) }) : null,
      el("h2", { class: "section-title", text: apps.length > 1 ? "Your staff applications" : "Your staff application" })
    ].concat(
      apps.length ? apps.map(tracker) : [el("section", { class: "empty-track glow-card" }, [
        el("h2", { text: "No application yet" }),
        el("p", { text: "When you apply for staff, you can follow it here, from submitted to decision." }),
        el("a", { class: "btn btn-primary", href: "/apply/" }, ["Apply for staff", icon("arrow-right")])
      ])],
      [claimBox(async () => renderAccount(user, profile))]
    ));
  }

  /* ---------- start ---------- */
  (async () => {
    const user = await EG.user();
    if (!user) {
      const problem = params.get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");
      if (problem) {
        main.classList.add("auth-wrap", "single");
        page([card([el("div", { class: "form" }, [
          el("p", { class: "eyebrow", text: "Sign in" }),
          el("h1", { class: "auth-title", tabindex: "-1", text: "That didn't work" }),
          el("p", { class: "auth-sub", text: problem }),
          el("a", { class: "btn btn-primary btn-block", href: "/signin/" }, ["Try again"])
        ])])]);
        return;
      }
      location.replace("/signin/?next=" + encodeURIComponent(next));
      return;
    }
    try { await EG.sb.rpc("link_discord_applications"); } catch (e) { /* optional */ }
    try { await EG.claimReceipts(); } catch (e) { /* optional */ }
    const profile = await EG.profile(true);
    if (!profile || !profile.username) { usernameSetup(user); return; }
    if (next !== "/account/") { location.replace(next); return; }
    await renderAccount(user, profile);
  })();
})();
