/* Staff Hub: the Code of Conduct + test status (everyone), test results (Admins and owners), activity log (owners). */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, fmt } = H;
  const COC = window.EG_COC || { version: "", sections: [] };

  /* ---------- Code & test ---------- */
  function codeDoc() {
    const doc = el("article", { class: "code-doc" });
    for (const s of COC.sections) {
      doc.append(el("h2", { text: s.h }));
      (s.p || []).forEach((t) => doc.append(el("p", { text: t })));
      if (s.list) doc.append(el("ul", null, s.list.map((t) => el("li", { html: t }))));   // our own text, with a little markup
      (s.after || []).forEach((t) => doc.append(el("p", { text: t })));
      (s.sub || []).forEach((r) => { doc.append(el("h3", { text: r.h })); (r.p || []).forEach((t) => doc.append(el("p", { text: t }))); });
    }
    return doc;
  }
  function testCard(st) {
    let title, text, iconName = "scroll-text";
    if (st.state === "submitted" && !st.retake) { title = "Test taken"; text = "Submitted " + H.fmtDate(st.submitted_at) + ". Your results went to the admins."; iconName = "circle-check"; }
    else if (st.retake) { title = "Retake available"; text = "An admin reset your test. Take it again when you're ready."; }
    else if (st.state === "retest") { title = "Retest needed"; text = "The Code changed to v" + st.version + ". Take the test on the new version."; }
    else { title = "Not taken yet"; text = H.plural(st.question_count, "question") + ", " + st.minutes + " minutes, one sitting. Read the Code below first."; }
    if (!st.can_start && st.why && !(st.state === "submitted" && !st.retake)) text = st.why;
    return el("div", { class: "panel testcard" }, [
      el("span", { class: "gate-icon" }, ic(iconName)),
      el("div", null, [el("h2", { text: title }), el("p", { text: text })]),
      st.can_start ? el("a", { class: "btn btn-primary", href: "/staff/test/" }, ["Take the test", ic("arrow-right")]) : null
    ]);
  }
  H.register({
    id: "code", title: "Code & test", short: "Code", icon: "scroll-text", min: "helper", tab: true,
    async render(main) {
      let st = null;
      try { st = await H.rpc("coc_status", { p_page_load: false }); } catch (e) { st = null; }
      main.replaceChildren(
        H.secHead({ title: "Code of", accent: "Conduct", sub: "Version " + COC.version + ", effective " + COC.effective + ". Every enforcement action cites a rule and a level from here." }),
        st ? testCard(st) : el("div", { class: "banner b-warn" }, [ic("triangle-alert"), el("span", { text: "The test isn't set up yet." })]),
        el("section", { class: "panel code-wrap" }, codeDoc())
      );
    }
  });

  /* ---------- results (Admins and owners) ---------- */
  const mmss = (s) => (s === null || s === undefined ? "" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"));
  function xpBar(score, pass) {
    return el("div", { class: "xp" }, [
      el("div", { class: "xp-top" }, [el("b", { text: score + "%" }), el("span", { text: "pass mark " + pass + "%" })]),
      el("div", { class: "xp-bar" + (score >= pass ? "" : " fail"), role: "img", "aria-label": score + "% (pass mark " + pass + "%)" }, [
        el("i", { style: "--p:" + Math.max(2, score) + "%" }), el("span", { class: "mark", style: "--m:" + pass + "%" })])
    ]);
  }
  async function detail(id, name) {
    H.drawer.open({ title: name + "'s test", body: el("span", { class: "loader" }) });
    let d;
    try { d = await H.rpc("coc_attempt_detail", { p_attempt: id }); } catch (e) { H.drawer.set(el("p", { text: e.message })); return; }
    const a = d.attempt;
    const secs = Object.entries(a.by_section || {}).sort((x, y) => x[0].localeCompare(y[0]));
    const missed = d.questions.filter((q) => q.correct === false);
    H.drawer.set([
      el("dl", { class: "kv" }, [el("dt", { text: "Score" }), el("dd", { text: a.score + "% (" + a.points + " of " + a.total + ")" + (a.passed ? ", passed" : ", didn't pass") }),
        el("dt", { text: "Version" }), el("dd", { text: "v" + a.version }),
        el("dt", { text: "Taken" }), el("dd", { text: H.fmtDateTime(a.started_at) + " · " + mmss(Math.round((H.toDate(a.ended_at) - H.toDate(a.started_at)) / 1000)) })]),
      el("div", null, [el("h3", { text: "By section" }), el("div", { class: "secbars" }, secs.map(([name, v]) => {
        const pct = v.total ? Math.round((v.points / v.total) * 100) : 0;
        return el("div", { class: "secbar" }, [el("span", { text: name }), el("div", { class: "xp-bar" + (pct >= (a.pass_mark || 80) ? "" : " fail") }, el("i", { style: "--p:" + Math.max(2, pct) + "%" })),
          el("span", { class: "tab", text: v.points + "/" + v.total })]);
      }))]),
      el("div", null, [el("h3", { text: missed.length ? "Missed (" + missed.length + ")" : "Missed" }),
        missed.length ? el("div", { class: "stack-v" }, missed.map((q) => el("div", { class: "qmiss" }, [
          el("span", { class: "meta", text: q.section }), el("p", { text: q.prompt }),
          el("p", { class: "muted", text: !q.answered ? "Not answered." : "Their answer: " + [].concat(q.answer).join(q.kind === "order" ? " → " : ", ") })])))
          : el("p", { class: "muted", text: "None. A clean run." }),
        el("p", { class: "faint", text: "The right answers aren't shown here (admins take the test too). Coach from the Code itself." })])
    ]);
  }
  function settingsBox(cfg, questions) {
    const n = (v, min, max) => el("input", { class: "inp", type: "number", min: min, max: max, value: v });
    const pass = n(cfg.pass_mark, 1, 100), mins = n(cfg.minutes, 5, 60), count = n(cfg.question_count, 5, Math.min(60, questions)),
      starts = n(cfg.max_starts, 1, 10), blur = n(cfg.blur_grace_ms, 0, 5000);
    const save = el("button", { type: "submit", class: "btn btn-sm btn-ice" }, [ic("check"), "Save settings"]);
    const f = el("form", { class: "form-grid" }, [
      el("div", { class: "form-row" }, [
        el("label", { class: "field" }, [el("span", { text: "Pass mark (%)" }), pass]),
        el("label", { class: "field" }, [el("span", { text: "Time limit (minutes)" }), mins]),
        el("label", { class: "field" }, [el("span", { text: "Questions per test (bank: " + questions + ")" }), count]),
        el("label", { class: "field" }, [el("span", { text: "Starts per 24 hours" }), starts]),
        el("label", { class: "field" }, [el("span", { text: "Focus grace (ms)" }), blur])]),
      save]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await H.rpc("coc_set_config", { p_pass_mark: +pass.value, p_minutes: +mins.value, p_question_count: +count.value, p_max_starts: +starts.value, p_blur_grace_ms: +blur.value }); H.toast("Saved.", "ok"); }
      catch (err) { H.fail(err); }
    });
    const ver = el("input", { class: "inp", placeholder: "e.g. 1.3", style: "max-width:140px" });
    const pub = el("form", { class: "addrow" }, [ver, el("button", { type: "submit", class: "btn btn-sm btn-danger" }, [ic("megaphone"), "Publish new version"])]);
    pub.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = ver.value.trim();
      if (!v) return;
      const ok = await H.confirm({ title: "Publish Code v" + v + "?", danger: true, ok: "Publish",
        body: ["Everyone shows \"Retest needed\" until they take the test again.", "Update the questions first (staff-test-questions.sql) if the Code's content changed."] });
      if (!ok) return;
      try { await H.rpc("coc_publish_version", { p_version: v }); H.toast("Published v" + v + ".", "ok"); H.show("results"); }
      catch (err) { H.fail(err); }
    });
    return el("details", { class: "panel settings-box" }, [el("summary", null, [ic("chevron-right"), ic("settings"), "Test settings (owners)"]),
      el("div", { class: "stack-v", style: "margin-top:12px" }, [f, el("h3", { text: "New Code version" }), pub])]);
  }
  H.register({
    id: "results", title: "Test results", short: "Results", icon: "trophy", min: "admin", group: "Admins",
    async render(main) {
      const r = await H.rpc("coc_results");
      const cfg = r.config;
      const rows = r.people.map((p) => {
        const L = p.latest;
        let status;
        if (L) status = el("span", { class: "pill " + (L.passed ? "p-ok" : "p-bad"), text: L.passed ? "Passed" : "Didn't pass" });
        else if (p.active) status = el("span", { class: "pill p-review", text: "Taking it now" });
        else if (p.previous) status = el("span", { class: "pill p-review", text: "Retest needed" });
        else status = el("span", { class: "pill p-muted", text: "Not taken" });
        const voided = (p.voided || []).length;
        return el("div", { class: "res" }, [
          el("div", { class: "who" }, [H.avatar(p, 38), el("div", { style: "min-width:0" }, [H.nameEl(p), el("div", { class: "meta" }, [H.tierBadge(p.tier)])])]),
          L ? xpBar(L.score, L.pass_mark || cfg.pass_mark) : el("div", { class: "meta", text: p.previous ? "Last took v" + p.previous.version + " (" + p.previous.score + "%)" : "No score for v" + cfg.version }),
          el("div", { class: "stack-v", style: "justify-items:end" }, [
            el("div", { class: "res-acts" }, [status, p.retake ? el("span", { class: "pill p-violet", text: "Retake granted" }) : null]),
            el("div", { class: "meta", text: [L ? H.fmtDate(L.at) + " · " + mmss(L.secs) : "", voided ? H.plural(voided, "reset") : ""].filter(Boolean).join(" · ") }),
            el("div", { class: "res-acts" }, [
              L ? el("button", { type: "button", class: "btn btn-sm btn-ice", onclick: () => detail(L.id, p.name) }, [ic("eye"), "Details"]) : null,
              voided ? el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => H.drawer.open({ title: "Resets: " + p.name,
                body: el("ul", { class: "history" }, p.voided.map((v) => el("li", null, [el("b", { text: H.fmtDateTime(v.at) }), " · " + (v.reason || "reset")]))) }) }, "Resets") : null,
              (L || voided) && !p.retake ? el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: async () => {
                const ok = await H.confirm({ title: "Give " + p.name + " a retake?", body: ["They can take the test again, and their 3-starts limit resets."], ok: "Grant retake" });
                if (!ok) return;
                try { await H.rpc("coc_grant_retake", { p_discord_id: p.id }); H.toast("Retake granted.", "ok"); H.show("results"); } catch (e) { H.fail(e); }
              } }, "Grant retake") : null])
          ])
        ]);
      });
      const passed = r.people.filter((p) => p.latest && p.latest.passed).length;
      main.replaceChildren(
        H.secHead({ title: "Test", accent: "results", sub: "Code v" + cfg.version + " · " + H.plural(cfg.question_count, "question") + " · " + cfg.minutes + " minutes · pass mark " + cfg.pass_mark + "%. Only admins and owners see scores." }),
        el("div", { class: "res-sum" }, [el("span", { class: "pill p-ok" }, [ic("trophy"), fmt(passed) + " of " + fmt(r.people.length) + " passed"]), el("span", { text: "Staff who've passed v" + cfg.version + "." })]),
        H.can("owner") ? settingsBox(cfg, r.questions) : null,
        rows.length ? el("div", { class: "results" }, rows) : H.empty({ icon: "trophy", title: "No staff yet", panel: true })
      );
      window.egIcons && window.egIcons(main);
    }
  });

  /* ---------- activity (owners) ---------- */
  const T = { owner: "Owner", admin: "Admin", mod: "Mod", helper: "Helper" };
  function sentence(a) {
    const d = a.detail || {};
    const who = a.actor_name || "Someone";
    switch (a.area + ":" + a.action) {
      case "roster:added": return (d.name || a.target) + " joined the staff roster as " + (T[d.tier] || d.tier);
      case "roster:removed": return (d.name || a.target) + " left the staff roster";
      case "roster:tier": return (d.name || a.target) + " moved from " + (T[d.was] || d.was) + " to " + (T[d.tier] || d.tier);
      case "roster:staff_since": return who + " set " + (d.name || a.target) + "'s staff-since date to " + (d.since || "the bot's date");
      case "appeals:status": case "applications:status": return who + " moved " + a.target + " from " + d.from + " to " + d.to;
      case "appeals:assigned": case "applications:assigned": return who + " assigned " + a.target;
      case "appeals:note": case "applications:note": return who + " added a note to " + a.target;
      case "appeals:message": case "applications:message": return who + " changed the member message on " + a.target;
      case "appeals:flag": return who + (d.non_appealable ? " marked " + a.target + " not appealable (" + d.rule + ")" : " marked " + a.target + " appealable");
      case "appeals:retry_unban": return who + " retried the unban for " + a.target;
      case "test:started": return who + " started the test (v" + (d.version || "?") + ")";
      case "test:reset": return who + "'s test reset: " + (d.reason || "reset");
      case "test:submitted": return who + " submitted the test (v" + (d.version || "?") + ")";
      case "test:retake granted": return who + " granted " + (d.name || a.target) + " a retake";
      case "test:settings": return who + " changed the test settings";
      case "test:published": return who + " published Code v" + a.target;
      default: return who + " " + a.action + " " + (d.title ? "\"" + d.title + "\"" : a.target || "");
    }
  }
  H.register({
    id: "activity", title: "Activity", short: "Activity", icon: "activity", min: "owner", group: "Owners",
    async render(main) {
      const list = el("ol", { class: "activity" });
      const more = el("button", { type: "button", class: "btn btn-sm", style: "margin-top:14px" }, [ic("arrow-down"), "Load more"]);
      let last = null;
      async function page() {
        more.disabled = true;
        const rows = await H.rpc("hub_activity_list", { p_before: last, p_limit: 100 });
        rows.forEach((a) => list.append(el("li", null, [el("time", { text: H.fmtDateTime(a.at) }),
          el("span", null, [el("span", { class: "area", text: a.area }), sentence(a)])])));
        if (rows.length) last = rows[rows.length - 1].id;
        more.hidden = rows.length < 100;
        more.disabled = false;
      }
      more.addEventListener("click", page);
      const box = el("section", { class: "panel" }, list);
      main.replaceChildren(H.secHead({ title: "Hub", accent: "activity", sub: "Every change made in the hub, and who made it. Only owners see this." }), box, more);
      await page();
      if (!list.children.length) box.replaceWith(H.empty({ icon: "activity", title: "Nothing yet", text: "Changes made in the hub show up here.", panel: true }));
    }
  });
})();
