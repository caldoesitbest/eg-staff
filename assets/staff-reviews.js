/* Staff Hub: ban appeals (Mods and up decide) and staff applications (Admins and up decide). Helpers read both. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, fmt, C } = H;

  const RULE_CITE = { R1ad: "§R.1 (advertising)", R1: "§R.1", R2: "§R.2", R3: "§R.3", R4: "§R.4", R5: "§R.5", R6: "§R.6", R7: "§R.7", NC: "Not covered by the Code" };
  const NON_APPEALABLE = ["§R.1 (advertising)", "§R.5", "§R.7"];
  const PILL = { New: "p-new", Reviewing: "p-review", Accepted: "p-ok", Denied: "p-bad" };

  const KINDS = {
    appeal: {
      id: "appeals", title: "Ban appeals", short: "Appeals", icon: "gavel", tab: true, edit: "mod",
      labels: { New: "Open", Reviewing: "Under review", Accepted: "Approved", Denied: "Denied" },
      sub: "From the /appeal page. Mods and up decide; helpers can read everything. Decisions are final.",
      title1: (a) => "@" + (a.username || a.discord_username || "unknown"),
      search: (a) => [a.username, a.discord_id, a.id].join(" ").toLowerCase(),
      cards: () => C.appeal || []
    },
    application: {
      id: "applications", title: "Staff applications", short: "Applications", nav: "Applications", icon: "clipboard-list", tab: false, edit: "admin",
      labels: { New: "New", Reviewing: "Interview", Accepted: "Accepted", Denied: "Denied" },
      sub: "From the /apply page. Admins and up decide; helpers and mods can read.",
      title1: (a) => a.name || "@" + (a.username || a.discord_username || "unknown"),
      search: (a) => [a.name, a.username, a.id].join(" ").toLowerCase(),
      cards: () => (C.recruitment || []).concat(C.judgment || [])
    }
  };

  function pill(kind, status) {
    return el("span", { class: "pill " + (PILL[status] || "p-muted"), text: KINDS[kind].labels[status] || status || "New" });
  }
  function waiting(a) {
    if (a.status !== "New" && a.status !== "Reviewing") return null;
    const d = H.daysSince(a.created_at);
    if (d === null) return null;
    return el("span", { class: "age" + (d >= 7 ? " old" : ""), text: d === 0 ? "New today" : H.plural(d, "day") + " waiting" });
  }
  const rosterById = () => {
    const m = new Map();
    (H.__roster || []).forEach((p) => m.set(p.id, p));
    return m;
  };
  async function roster() {
    if (!H.__roster) {
      try { H.__roster = (await H.rpc("hub_overview")).roster || []; } catch (e) { H.__roster = []; }
    }
    return H.__roster;
  }

  function section(kind) {
    const K = KINDS[kind];
    const st = { list: [], filter: kind === "appeal" ? "open" : "active", query: "", selected: null };
    let mainNode = null, listNode = null, detailNode = null, countsNode = null;
    const narrow = () => window.matchMedia("(max-width: 1099px)").matches;

    const FILTERS = kind === "appeal"
      ? [["open", "Open", (a) => a.status === "New"], ["review", "Under review", (a) => a.status === "Reviewing"],
         ["approved", "Approved", (a) => a.status === "Accepted"], ["denied", "Denied", (a) => a.status === "Denied"], ["all", "All", () => true]]
      : [["active", "New + interview", (a) => a.status === "New" || a.status === "Reviewing"], ["accepted", "Accepted", (a) => a.status === "Accepted"],
         ["denied", "Denied", (a) => a.status === "Denied"], ["all", "All", () => true]];

    async function loadList() {
      st.list = await H.rpc("hub_reviews", { p_kind: kind });
      const open = st.list.filter((a) => a.status === "New").length;
      const def = H.__sections && H.__sections[K.id];
      if (def && def.badge !== (open || null)) { def.badge = open || null; H.renderNav(); }
    }
    function rows() {
      const f = FILTERS.find((x) => x[0] === st.filter) || FILTERS[0];
      const q = st.query.trim().toLowerCase();
      return st.list.filter(f[2]).filter((a) => !q || K.search(a).includes(q));   // oldest first (the server sorts)
    }
    function paintCounts() {
      countsNode.replaceChildren(...FILTERS.map(([k, label, fn]) => el("button", {
        type: "button", class: "chip", "aria-pressed": String(st.filter === k),
        onclick: () => { st.filter = k; paintCounts(); paintList(); }
      }, [label, el("b", { text: String(st.list.filter(fn).length) })])));
    }
    function paintList() {
      const list = rows();
      if (!list.length) {
        listNode.replaceChildren(el("div", { class: "empty" }, [ic(K.icon), el("p", { text: st.list.length ? "Nothing matches." : "Nothing here yet." })]));
        return;
      }
      listNode.replaceChildren(...list.map((a) => {
        const flags = [];
        if (a.non_appealable) flags.push(el("span", { class: "pill p-bad" }, [ic("ban"), "Not appealable"]));
        if (a.duplicate_of) flags.push(el("span", { class: "pill p-muted", text: "Duplicate" }));
        if (a.mine) flags.push(el("span", { class: "pill p-violet", text: "Your action" }));
        const who = a.assignee ? rosterById().get(a.assignee) : null;
        const row = el("button", { type: "button", class: "rv-row", "data-id": a.id, "aria-current": String(st.selected === a.id) }, [
          el("span", { class: "l1" }, [el("b", { text: K.title1(a) }), pill(kind, a.status)]),
          el("span", { class: "l2" }, [el("span", { text: a.id }), waiting(a) || el("span", { text: H.fmtDate(a.created_at) }),
            kind === "application" && a.level !== null && a.level !== undefined ? el("span", { text: "Level " + a.level }) : null,
            who ? el("span", { class: "who" }, [H.avatar(who, 18), who.name]) : null,
            a.notes ? el("span", null, [ic("message-square-text"), " " + a.notes]) : null].concat(flags))
        ]);
        row.addEventListener("click", () => select(a.id));
        return row;
      }));
      window.egIcons && window.egIcons(listNode);
    }

    async function select(id) {
      st.selected = id;
      if (listNode) listNode.querySelectorAll(".rv-row").forEach((r) => r.setAttribute("aria-current", String(r.dataset.id === id)));
      if (narrow()) {
        H.drawer.open({ title: K.short, body: el("p", { class: "muted", text: "Loading…" }), wide: true });
        const nodes = await detail(id, true);
        if (H.drawer.isOpen) H.drawer.set(nodes);
      } else {
        detailNode.replaceChildren(el("span", { class: "loader" }));
        detailNode.replaceChildren(...(await detail(id, false)));
        window.egIcons && window.egIcons(detailNode);
      }
    }

    async function act(fn, args, okMsg) {
      try {
        const r = await H.rpc(fn, args);
        if (okMsg) H.toast(okMsg, "ok");
        await loadList(); paintCounts(); paintList();
        await select(st.selected);
        return r;
      } catch (e) { H.fail(e); return null; }
    }

    async function detail(id, inDrawer) {
      let r;
      try { r = await H.rpc("hub_review", { p_kind: kind, p_id: id }); }
      catch (e) { return [el("div", { class: "empty" }, [ic("triangle-alert"), el("p", { text: e.message })])]; }
      await roster();
      const a = r.item, m = r.meta || {}, can = r.can || {};
      const people = rosterById();
      const decided = kind === "appeal" && (a.status === "Accepted" || a.status === "Denied");
      const out = [];

      out.push(el("div", { class: "who", style: "justify-content:space-between;flex-wrap:wrap" }, [
        el("div", null, [el("h2", { text: K.title1(a) }), el("p", { class: "faint", style: "margin:4px 0 0",
          text: a.id + " · sent " + H.fmtDateTime(a.created_at) + (a.discord_id ? " · user ID " + a.discord_id : "") })]),
        pill(kind, a.status)
      ]));

      // banners
      if (decided) out.push(banner("b-info", "lock", "Decided " + (a.status_changed_at ? H.fmtDate(a.status_changed_at) : "") + ". Appeal decisions are final."));
      if (can.why === "recused") out.push(banner("b-warn", "user-check", "You issued this action. Another staff member needs to decide it."));
      if (m.non_appealable) out.push(banner("b-bad", "ban", "This ban was for " + (m.rule || "a non-appealable rule") + ", which the Code says can't be appealed. It can only be denied."));
      if (m.duplicate_of) out.push(banner("b-warn", "copy", "One appeal per ban: this ban was already appealed in " + m.duplicate_of + "."));
      if (kind === "appeal" && m.unban) out.push(unbanBanner(m.unban, a.id));
      if (!can.edit) out.push(banner("b-info", "eye", kind === "appeal" ? "Read only: mods and up decide appeals." : "Read only: admins and up decide applications."));

      // what happened / who they are
      if (kind === "appeal") out.push(actionCard(m, people, can.edit, id));
      else out.push(profileCard(m, can.edit, id));

      // controls
      if (can.edit) out.push(controls(a, m, can, people, decided));

      // the submission
      out.push(el("div", null, [el("h3", { text: kind === "appeal" ? "Their appeal" : "Their answers" }), answers(a)]));

      // notes + history
      out.push(notesBox(r.notes || [], can.edit, id));
      if ((r.history || []).length) {
        out.push(el("div", null, [el("h3", { text: "History" }), el("ul", { class: "history" }, r.history.map((h) =>
          el("li", null, [el("b", { text: h.who || "Someone" }), " " + historyLine(h) + " · ", el("time", { text: H.fmtDateTime(h.at) })])))]));
      }
      return out;
    }

    function historyLine(h) {
      if (h.what === "status") return "moved it from " + (K.labels[h.from] || h.from) + " to " + (K.labels[h.to] || h.to);
      if (h.what === "assigned") return h.to ? "assigned it to " + h.to : "unassigned it";
      if (h.what === "message") return h.to === "removed" ? "removed the message to the member" : "updated the message to the member";
      if (h.what === "flag" || h.what === "unban") return h.to;
      return h.what;
    }
    function banner(cls, iconName, text) { return el("div", { class: "banner " + cls }, [ic(iconName), el("span", { text: text })]); }
    function unbanBanner(u, id) {
      const map = { queued: ["b-info", "loader-circle", "Unban queued: the bot unbans them in a few seconds."],
        retrying: ["b-warn", "refresh-cw", "The bot couldn't unban them yet and will try again" + (u.result && u.result.error ? ": " + u.result.error : ".")],
        done: ["b-ok", "circle-check", (u.result && u.result.unbanned === false ? "They were already unbanned in Discord." : "Unbanned in Discord.")
          + (u.result && u.result.dm ? " Welcome-back DM sent." : " They get the welcome-back message when they rejoin.")],
        failed: ["b-bad", "circle-x", "The unban didn't go through" + (u.result && u.result.error ? ": " + u.result.error : ".")] };
      const [cls, ico, text] = map[u.status] || map.queued;
      const b = banner(cls, ico, text);
      if (u.status === "failed" && H.can("mod")) {
        b.append(el("button", { type: "button", class: "btn btn-sm", style: "margin-left:auto", onclick: () => act("hub_appeal_retry_unban", { p_id: id }, "Unban queued again.") }, "Try again"));
      }
      return b;
    }

    function actionCard(m, people, canEdit, id) {
      const box = el("div", { class: "action-card" }, el("h3", { text: "The ban being appealed" }));
      const x = m.action;
      if (!x) {
        box.append(el("p", { class: "muted", text: m.looking_up ? "The bot is looking up the ban quietly. Nothing is posted or sent." : "Not looked up yet." }));
      } else if (!x.found) {
        box.append(el("p", { class: "muted", text: x.banned_now === false
          ? "No ban on record, and Discord says this user ID isn't banned. Check the ID they gave."
          : "No ban on record for this user ID (it may be from before tracking began)." }));
      } else {
        const mod = x.mod_id ? people.get(x.mod_id) : null;
        box.append(el("dl", { class: "kv" }, [
          el("dt", { text: "Action" }), el("dd", { text: (x.action === "tempban" ? "Temporary ban" : "Ban") + (x.banned_now === false ? " (no longer banned in Discord)" : "") }),
          el("dt", { text: "When" }), el("dd", { text: x.ts ? H.fmtDateTime(x.ts) : "Before tracking began" }),
          el("dt", { text: "By" }), el("dd", null, mod ? el("span", { class: "who" }, [H.avatar(mod, 22), H.nameEl(mod)]) : (x.mod_name || "Unknown")),
          el("dt", { text: "Rule" }), el("dd", { text: [RULE_CITE[x.rule] || "Not cited", x.level ? "Level " + x.level : ""].filter(Boolean).join(", ") }),
          el("dt", { text: "Reason" }), el("dd", { text: x.reason || "No reason given" })
        ]));
      }
      if (canEdit && !m.looking_up) {
        box.append(el("button", { type: "button", class: "btn btn-sm btn-ghost", style: "margin-top:10px",
          onclick: () => act("hub_review_refresh", { p_kind: kind, p_id: id }, "The bot will look it up again.") }, [ic("refresh-cw"), "Look it up again"]));
      }
      return box;
    }
    function profileCard(m, canEdit, id) {
      const box = el("div", { class: "action-card" }, el("h3", { text: "In the server" }));
      const p = m.profile;
      if (!p) box.append(el("p", { class: "muted", text: m.looking_up ? "The bot is looking them up…" : "Not looked up yet." }));
      else if (!p.found) box.append(el("p", { class: "muted", text: "No member with that username right now (they may have changed it, or left)." }));
      else {
        box.append(el("div", { class: "who", style: "margin-bottom:10px" }, [H.avatar({ name: p.name, pics: p.pics }, 44), el("div", null, [el("b", { text: p.name }), el("div", { class: "faint", text: "@" + p.username + " · " + p.id })])]));
        box.append(el("dl", { class: "kv" }, [
          el("dt", { text: "Level" }), el("dd", { text: "Level " + p.level + " · " + fmt(p.xp) + " XP" + (p.sin ? " · " + p.sin.charAt(0).toUpperCase() + p.sin.slice(1) : "") }),
          el("dt", { text: "Joined" }), el("dd", { text: p.joined ? H.fmtDate(p.joined) + " (" + H.plural(H.daysSince(p.joined), "day") + ")" : "–" }),
          el("dt", { text: "Account made" }), el("dd", { text: p.created ? H.fmtDate(p.created) : "–" }),
          el("dt", { text: "Activity" }), el("dd", { text: fmt(p.msgs) + " messages · " + fmt(p.voice_h) + "h in voice" })
        ]));
      }
      if (canEdit && !m.looking_up) box.append(el("button", { type: "button", class: "btn btn-sm btn-ghost", style: "margin-top:10px",
        onclick: () => act("hub_review_refresh", { p_kind: kind, p_id: id }, "The bot will look them up again.") }, [ic("refresh-cw"), "Look again"]));
      return box;
    }

    function controls(a, m, can, people, decided) {
      const box = el("div", { class: "stack-v" });
      // status
      const acts = el("div", { class: "rv-acts" });
      if (kind === "appeal") {
        acts.append(
          el("button", { type: "button", class: "btn btn-sm", disabled: decided || a.status === "Reviewing", onclick: () => setStatus(a, "Reviewing") }, [ic("search"), "Under review"]),
          el("button", { type: "button", class: "btn btn-sm btn-ok", disabled: !can.decide || m.non_appealable || !!m.duplicate_of, onclick: () => setStatus(a, "Accepted") }, [ic("circle-check"), "Approve and unban"]),
          el("button", { type: "button", class: "btn btn-sm btn-danger", disabled: !can.decide, onclick: () => setStatus(a, "Denied") }, [ic("circle-x"), "Deny"]));
      } else {
        ["New", "Reviewing", "Accepted", "Denied"].forEach((s) => acts.append(el("button", {
          type: "button", class: "btn btn-sm" + (s === "Accepted" ? " btn-ok" : s === "Denied" ? " btn-danger" : ""),
          "aria-pressed": String(a.status === s), disabled: a.status === s, onclick: () => setStatus(a, s)
        }, K.labels[s])));
      }
      box.append(el("h3", { text: "Decision" }), acts);

      // assign
      const sel = el("select", { class: "sel", "aria-label": "Assigned to" }, [el("option", { value: "", text: "Unassigned" })]
        .concat(Array.from(people.values()).filter((p) => H.RANK[p.tier] >= H.RANK[K.edit])
          .map((p) => el("option", { value: p.id, text: p.name + " (" + H.TIER_NAME[p.tier] + ")", selected: m.assignee === p.id }))));
      sel.addEventListener("change", () => act("hub_review_assign", { p_kind: kind, p_id: a.id, p_discord_id: sel.value || null }, sel.value ? "Assigned." : "Unassigned."));
      box.append(el("label", { class: "field" }, [el("span", { text: "Assigned to" }), sel]));

      // flag (appeals)
      if (kind === "appeal" && !decided) {
        const rule = el("select", { class: "sel", "aria-label": "Rule" }, NON_APPEALABLE.map((r) => el("option", { value: r, text: r, selected: m.rule === r })));
        box.append(el("div", { class: "field" }, [el("span", { text: "Non-appealable rule" }), el("div", { class: "addrow" }, m.non_appealable
          ? [el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => act("hub_appeal_flag", { p_id: a.id, p_non_appealable: false, p_rule: null }, "Marked appealable.") }, "Mark appealable again")]
          : [rule, el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => act("hub_appeal_flag", { p_id: a.id, p_non_appealable: true, p_rule: rule.value }, "Marked not appealable.") }, "Mark not appealable")])]));
      }

      // message to the member
      const msg = el("textarea", { class: "ta", rows: 3, maxlength: 1500, placeholder: "Optional." });
      msg.value = a.staff_note || "";
      const save = el("button", { type: "button", class: "btn btn-sm" }, "Save message");
      save.addEventListener("click", () => act("hub_review_message", { p_kind: kind, p_id: a.id, p_text: msg.value }, msg.value.trim() ? "Message saved." : "Message removed."));
      box.append(el("label", { class: "field" }, [el("span", { text: kind === "appeal" ? "Message they see when they check their appeal" : "Message they see on their account page" }), msg]), save);
      return box;
    }

    async function setStatus(a, status) {
      if (kind === "appeal" && status === "Accepted") {
        const ok = await H.confirm({ title: "Approve " + a.id + " and unban them?", ok: "Approve and unban",
          body: ["The bot unbans @" + (a.discord_username || "them") + " in Discord straight away, quietly.",
            "They get a welcome-back message (read the rules, you're on thin ice): by DM now if Discord allows it, otherwise the moment they rejoin.",
            "Appeal decisions are final."] });
        if (!ok) return;
      } else if (kind === "appeal" && status === "Denied") {
        const ok = await H.confirm({ title: "Deny " + a.id + "?", ok: "Deny the appeal", danger: true,
          body: ["Appeal decisions are final: they can't appeal this ban again.", "Add a message they'll see when they check on it, if you like."] });
        if (!ok) return;
      }
      await act("hub_review_status", { p_kind: kind, p_id: a.id, p_status: status }, kind === "appeal" && status === "Accepted"
        ? "Approved. The bot is unbanning them." : "Moved to " + (K.labels[status] || status) + ".");
    }

    function answers(a) {
      const byId = new Map((Array.isArray(a.answers) ? a.answers : []).map((x) => [x && x.id, x]));
      const items = [];
      const seen = new Set();
      for (const card of K.cards()) {
        for (const f of card.fields || []) {
          const x = byId.get(f.id);
          seen.add(f.id);
          if (!x || x.value === "" || x.value === null || x.value === undefined) continue;
          items.push(el("dt", { text: card.fields.length > 1 ? card.q + " (" + (f.label || f.short) + ")" : card.q }), el("dd", { text: String(x.value) }));
        }
      }
      for (const [fid, x] of byId) {
        if (!fid || seen.has(fid) || !x || x.value === "" || x.value == null) continue;
        items.push(el("dt", { text: x.label || fid }), el("dd", { text: String(x.value) }));
      }
      return items.length ? el("dl", { class: "answers" }, items) : el("p", { class: "muted", text: "No answers saved." });
    }

    function notesBox(notes, canEdit, id) {
      const box = el("div", null, el("h3", { text: "Internal notes (staff only, never shown to them)" }));
      box.append(notes.length ? el("div", { class: "notes" }, notes.map((n) => el("div", { class: "note-item" }, [
        el("div", { class: "meta", text: (n.author || "Staff") + " · " + H.fmtDateTime(n.at) }), el("p", { text: n.body })])))
        : el("p", { class: "muted", text: "No notes yet." }));
      if (canEdit) {
        const ta = el("textarea", { class: "ta", rows: 2, maxlength: 2000, placeholder: "Add a note for the team…", "aria-label": "New note" });
        const add = el("button", { type: "button", class: "btn btn-sm", style: "margin-top:8px" }, [ic("plus"), "Add note"]);
        add.addEventListener("click", async () => {
          if (!ta.value.trim()) return;
          add.disabled = true;
          await act("hub_review_note", { p_kind: kind, p_id: id, p_body: ta.value }, "Note added.");
          add.disabled = false;
        });
        box.append(el("div", { style: "margin-top:10px" }, [ta, add]));
      }
      return box;
    }

    return {
      id: K.id, title: K.title, short: K.short, nav: K.nav, icon: K.icon, min: "helper", tab: K.tab,
      async render(main, ctx) {
        mainNode = main;
        await Promise.all([loadList(), roster()]);
        const search = el("input", { class: "inp", type: "search", placeholder: kind === "appeal" ? "Search username or ID" : "Search name or username", "aria-label": "Search" });
        search.value = st.query;
        search.addEventListener("input", () => { st.query = search.value; paintList(); });
        countsNode = el("div", { class: "chips", role: "group", "aria-label": "Filter" });
        listNode = el("div", { class: "rv-list" });
        detailNode = el("div", { class: "rv-detail", "aria-live": "polite" }, el("div", { class: "empty" }, [ic(K.icon), el("p", { text: "Pick one to read it." })]));
        main.replaceChildren(
          el("div", { class: "sec-head" }, el("div", null, [el("h1", { text: K.title }), el("p", { text: K.sub })])),
          el("div", { class: "rv-tools" }, [countsNode, el("div", { class: "search" }, [ic("search"), search])]),
          el("div", { class: "rv-layout" }, [listNode, el("div", { class: "rv-detail-wrap" }, detailNode)]));
        paintCounts(); paintList();
        const want = ctx && ctx.sub ? ctx.sub : (!narrow() && rows()[0] ? rows()[0].id : null);
        if (want) await select(want);
        return () => { mainNode = null; };
      },
      async poll() {
        await loadList();
        if (mainNode && mainNode.isConnected) { paintCounts(); paintList(); }
      }
    };
  }

  H.__sections = H.__sections || {};
  for (const kind of ["appeal", "application"]) {
    const def = section(kind);
    H.__sections[def.id] = def;
    H.register(def);
  }
})();
