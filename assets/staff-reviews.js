/* Staff Hub: ban appeals (Mods and up decide) and staff applications (Admins and up decide). Helpers read both.
   Both use the same layout: tabs and search, the list, then the case, the decision, their answers, notes and history. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, fmt, C } = H;

  const RULE_CITE = { R1ad: "§R.1 (advertising)", R1: "§R.1", R2: "§R.2", R3: "§R.3", R4: "§R.4", R5: "§R.5", R6: "§R.6", R7: "§R.7", NC: "Not covered by the Code" };
  const NON_APPEALABLE = ["§R.1 (advertising)", "§R.5", "§R.7"];
  const PILL = { New: "p-new", Reviewing: "p-review", Accepted: "p-ok", Denied: "p-bad" };
  const RING = { New: "var(--cyan)", Reviewing: "var(--amber)", Accepted: "var(--ok)", Denied: "var(--danger)" };

  const KINDS = {
    appeal: {
      id: "appeals", title: "Ban appeals", head: ["Ban", "appeals"], short: "Appeals", icon: "gavel", tab: true, edit: "mod", noun: "appeal",
      labels: { New: "Open", Reviewing: "Under review", Accepted: "Approved", Denied: "Denied" },
      sub: "From the /appeal page. Mods and up decide; helpers can read everything. Decisions are final.",
      title1: (a) => "@" + (a.username || a.discord_username || "unknown"),
      search: (a) => [a.username, a.discord_id, a.id].join(" ").toLowerCase(),
      cards: () => C.appeal || []
    },
    application: {
      id: "applications", title: "Staff applications", head: ["Staff", "applications"], short: "Applications", nav: "Applications", icon: "clipboard-list", tab: false, edit: "admin", noun: "application",
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
    if (a.status !== "New" && a.status !== "Reviewing") return el("span", { class: "age calm" }, [ic("calendar"), H.fmtDate(a.status_changed_at || a.created_at)]);
    const d = H.daysSince(a.created_at);
    if (d === null) return null;
    return el("span", { class: "age" + (d >= 7 ? " old" : "") }, [ic("clock"), d === 0 ? "New today" : H.plural(d, "day") + " waiting"]);
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
    const st = { list: [], filter: "open", query: "", selected: null, picked: false };
    let mainNode = null, listNode = null, detailNode = null, tabs = null;
    const narrow = () => (mainNode && mainNode.isConnected ? mainNode.clientWidth < 900 : window.innerWidth < 1100);

    // the same five tabs for both
    const FILTERS = [
      ["open", K.labels.New, "inbox", (a) => a.status === "New"],
      ["review", K.labels.Reviewing, kind === "appeal" ? "clock-3" : "message-square", (a) => a.status === "Reviewing"],
      ["accepted", K.labels.Accepted, "circle-check", (a) => a.status === "Accepted"],
      ["denied", K.labels.Denied, "circle-x", (a) => a.status === "Denied"],
      ["all", "All", "layers", () => true]
    ];
    const EMPTY = {
      open: ["No open " + K.noun + "s", "There are no new " + K.noun + "s right now."],
      review: ["Nothing " + (kind === "appeal" ? "under review" : "in interview"), "Nothing is waiting on a decision."],
      accepted: ["None " + K.labels.Accepted.toLowerCase() + " yet", "Decided ones land here."],
      denied: ["None denied", "Decided ones land here."],
      all: ["No " + K.noun + "s yet", "When someone sends one, it shows up here."]
    };

    async function loadList() {
      st.list = await H.rpc("hub_reviews", { p_kind: kind });
      const open = st.list.filter((a) => a.status === "New").length;
      const def = H.__sections && H.__sections[K.id];
      if (def && def.badge !== (open || null)) { def.badge = open || null; H.renderNav(); }
    }
    function rows() {
      const f = FILTERS.find((x) => x[0] === st.filter) || FILTERS[0];
      const q = st.query.trim().toLowerCase();
      return st.list.filter(f[3]).filter((a) => !q || K.search(a).includes(q));   // oldest first (the server sorts)
    }
    function counts() {
      const m = {};
      FILTERS.forEach(([k, , , fn]) => { m[k] = st.list.filter(fn).length; });
      return m;
    }
    function paintCounts() { tabs.counts(counts()); }
    function paintList(animate) {
      const list = rows();
      if (!list.length) {
        const [t, x] = st.query.trim() ? ["Nothing matches", "Try a different name or ID."] : EMPTY[st.filter] || EMPTY.all;
        listNode.replaceChildren(H.empty({ art: "inbox", title: t, text: x, panel: true }));
        return;
      }
      const people = rosterById();
      listNode.replaceChildren(...list.map((a) => {
        const flags = [];
        if (a.non_appealable) flags.push(el("span", { class: "pill p-bad" }, [ic("ban"), "Not appealable"]));
        if (a.duplicate_of) flags.push(el("span", { class: "pill p-muted" }, [ic("copy"), "Duplicate"]));
        if (a.mine) flags.push(el("span", { class: "pill p-violet" }, [ic("user-check"), "Your action"]));
        if (kind === "application" && a.level !== null && a.level !== undefined) flags.push(el("span", { class: "pill p-new" }, [ic("zap"), "Level " + a.level]));
        const who = a.assignee ? people.get(a.assignee) : null;
        if (who) flags.push(el("span", { class: "who" }, [H.avatar(who, 20), who.name]));
        if (a.notes) flags.push(el("span", { class: "meta" }, [ic("message-square-text"), String(a.notes)]));
        const row = el("button", { type: "button", class: "rv-row", "data-id": a.id, "aria-current": String(st.selected === a.id), style: "--sc:" + (RING[a.status] || "var(--cyan)") }, [
          H.ring(H.avatar({ id: a.discord_id || a.id, name: a.name || a.username || a.discord_username }, 46)),
          el("span", { class: "rv-main" }, [el("b", { text: K.title1(a) }), el("span", { class: "id", text: a.id }), waiting(a)]),
          el("span", { class: "rv-side" }, [pill(kind, a.status)]),
          flags.length ? el("span", { class: "rv-flags" }, flags) : null
        ]);
        row.addEventListener("click", () => { st.picked = true; select(a.id); });
        return row;
      }));
      window.egIcons && window.egIcons(listNode);
      if (animate) H.reveal(listNode.children);
    }

    async function select(id, quiet) {
      st.selected = id;
      if (detailNode) detailNode.classList.toggle("quiet", !!quiet);
      if (listNode) listNode.querySelectorAll(".rv-row").forEach((r) => r.setAttribute("aria-current", String(r.dataset.id === id)));
      if (narrow()) {
        H.drawer.open({ title: K.short, body: el("div", { class: "sec-loading" }, el("span", { class: "loader" })), wide: true });
        const nodes = await detail(id);
        if (H.drawer.isOpen) H.drawer.set(nodes);
      } else {
        const keep = detailNode.offsetHeight;
        detailNode.style.minHeight = keep ? keep + "px" : "";
        const nodes = await detail(id);
        if (st.selected !== id) return;
        detailNode.replaceChildren(...nodes);
        detailNode.style.minHeight = "";
        window.egIcons && window.egIcons(detailNode);
      }
    }
    function blank() {
      return H.empty({ art: "pick", title: "No " + K.noun + " selected", text: "Pick one from the list to read it.", panel: true });
    }

    async function act(fn, args, okMsg, btn) {
      if (btn) btn.classList.add("busy");
      try {
        const r = await H.rpc(fn, args);
        if (okMsg) H.toast(okMsg, "ok");
        await loadList(); paintCounts(); paintList();
        await select(st.selected, true);
        return r;
      } catch (e) { H.fail(e); return null; }
      finally { if (btn) btn.classList.remove("busy"); }
    }

    async function detail(id) {
      let r;
      try { r = await H.rpc("hub_review", { p_kind: kind, p_id: id }); }
      catch (e) { return [H.empty({ icon: "triangle-alert", title: "Couldn't open this", text: e.message, panel: true })]; }
      await roster();
      const a = r.item, m = r.meta || {}, can = r.can || {};
      const people = rosterById();
      const decided = kind === "appeal" && (a.status === "Accepted" || a.status === "Denied");
      const out = [];

      // who
      const pics = kind === "application" ? m.profile && m.profile.pics : m.action && m.action.pics;
      out.push(el("section", { class: "panel rv-head" }, [
        H.ring(H.avatar({ id: a.discord_id || a.id, name: a.name || a.discord_username, pics: pics }, 64), RING[a.status]),
        el("div", { class: "t" }, [el("h2", { text: K.title1(a) }), el("p", { class: "meta",
          text: a.id + " · sent " + H.fmtDateTime(a.created_at) + (a.discord_id ? " · user ID " + a.discord_id : "") + (kind === "application" && a.age ? " · age " + a.age : "") })]),
        pill(kind, a.status)
      ]));

      // banners
      if (decided) out.push(banner("b-info", "lock", "Decided " + (a.status_changed_at ? H.fmtDate(a.status_changed_at) : "") + ". Appeal decisions are final."));
      if (can.why === "recused") out.push(banner("b-warn", "user-check", "You issued this action. Another staff member needs to decide it."));
      if (m.non_appealable) out.push(banner("b-bad", "ban", "This ban was for " + (m.rule || "a non-appealable rule") + ", which the Code says can't be appealed. It can only be denied."));
      if (m.duplicate_of) out.push(banner("b-warn", "copy", "One appeal per ban: this ban was already appealed in " + m.duplicate_of + "."));
      if (kind === "appeal" && m.unban) out.push(unbanBanner(m.unban, a.id));
      if (!can.edit) out.push(banner("b-info", "eye", kind === "appeal" ? "Read only: mods and up decide appeals." : "Read only: admins and up decide applications."));

      // the case: the ban, or who they are in the server
      out.push(kind === "appeal" ? actionCard(m, people, can.edit, id) : profileCard(m, can.edit, id));

      // the decision
      if (can.edit) out.push(controls(a, m, can, people, decided));

      // their answers
      out.push(el("section", { class: "panel rv-card" }, [H.h3(kind === "appeal" ? "Their appeal" : "Their answers", { icon: "file-text" }), answers(a)]));

      // notes + history
      out.push(notesBox(r.notes || [], can.edit, id));
      if ((r.history || []).length) {
        out.push(el("section", { class: "panel rv-card" }, [H.h3("History", { icon: "history" }), el("ul", { class: "history" }, r.history.map((h) =>
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
      if (u.status === "queued") { const s = b.querySelector(".i"); if (s) s.classList.add("spin"); }
      if (u.status === "failed" && H.can("mod")) {
        b.append(el("button", { type: "button", class: "btn btn-sm", style: "margin-left:auto", onclick: (e) => act("hub_appeal_retry_unban", { p_id: id }, "Unban queued again.", e.currentTarget) }, [ic("refresh-cw"), "Try again"]));
      }
      return b;
    }

    function caseCard(title, accent, kids) {
      return el("section", { class: "panel rv-card rv-case" }, [
        el("span", { class: "case-bg", "aria-hidden": "true" }), H.art.astronaut ? H.art.astronaut() : null,
        H.h3(title, { accent: accent })].concat(kids));
    }
    function actionCard(m, people, canEdit, id) {
      const kids = [];
      const x = m.action;
      if (!x) {
        kids.push(el("p", { class: "muted", text: m.looking_up ? "The bot is looking up the ban quietly. Nothing is posted or sent." : "Not looked up yet." }));
        if (m.looking_up) kids.push(el("span", { class: "loader", style: "width:26px;height:26px;border-width:2px" }));
      } else if (!x.found) {
        kids.push(el("p", { class: "muted", text: x.banned_now === false
          ? "No ban on record, and Discord says this user ID isn't banned. Check the ID they gave."
          : "No ban on record for this user ID (it may be from before tracking began)." }));
      } else {
        const mod = x.mod_id ? people.get(x.mod_id) : null;
        kids.push(el("dl", { class: "kv" }, [
          el("dt", { text: "Action" }), el("dd", { text: (x.action === "tempban" ? "Temporary ban" : "Ban") + (x.banned_now === false ? " (no longer banned in Discord)" : "") }),
          el("dt", { text: "When" }), el("dd", { text: x.ts ? H.fmtDateTime(x.ts) : "Before tracking began" }),
          el("dt", { text: "By" }), el("dd", null, mod ? el("span", { class: "who" }, [H.avatar(mod, 24), H.nameEl(mod)]) : (x.mod_name || "Unknown")),
          el("dt", { text: "Rule" }), el("dd", { text: [RULE_CITE[x.rule] || "Not cited", x.level ? "Level " + x.level : ""].filter(Boolean).join(", ") }),
          el("dt", { text: "Reason" }), el("dd", { text: x.reason || "No reason given" })
        ]));
      }
      if (canEdit && !m.looking_up) {
        kids.push(el("button", { type: "button", class: "btn btn-sm btn-ice", style: "margin-top:16px",
          onclick: (e) => act("hub_review_refresh", { p_kind: kind, p_id: id }, "The bot will look it up again.", e.currentTarget) }, [ic("refresh-cw"), "Look it up again"]));
      }
      return caseCard("The ban", "being appealed", kids);
    }
    function profileCard(m, canEdit, id) {
      const kids = [];
      const p = m.profile;
      if (!p) {
        kids.push(el("p", { class: "muted", text: m.looking_up ? "The bot is looking them up…" : "Not looked up yet." }));
        if (m.looking_up) kids.push(el("span", { class: "loader", style: "width:26px;height:26px;border-width:2px" }));
      } else if (!p.found) kids.push(el("p", { class: "muted", text: "No member with that username right now (they may have changed it, or left)." }));
      else {
        kids.push(el("dl", { class: "kv" }, [
          el("dt", { text: "Member" }), el("dd", null, el("span", { class: "who" }, [H.avatar({ id: p.id, name: p.name, pics: p.pics }, 24), el("b", { text: p.name }), el("span", { class: "faint", text: "@" + p.username })])),
          el("dt", { text: "Level" }), el("dd", { text: "Level " + p.level + " · " + fmt(p.xp) + " XP" + (p.sin ? " · " + p.sin.charAt(0).toUpperCase() + p.sin.slice(1) : "") }),
          el("dt", { text: "Joined" }), el("dd", { text: p.joined ? H.fmtDate(p.joined) + " (" + H.plural(H.daysSince(p.joined), "day") + ")" : "–" }),
          el("dt", { text: "Account made" }), el("dd", { text: p.created ? H.fmtDate(p.created) : "–" }),
          el("dt", { text: "Activity" }), el("dd", { text: fmt(p.msgs) + " messages · " + fmt(p.voice_h) + "h in voice" }),
          el("dt", { text: "User ID" }), el("dd", { text: p.id })
        ]));
      }
      if (canEdit && !m.looking_up) kids.push(el("button", { type: "button", class: "btn btn-sm btn-ice", style: "margin-top:16px",
        onclick: (e) => act("hub_review_refresh", { p_kind: kind, p_id: id }, "The bot will look them up again.", e.currentTarget) }, [ic("refresh-cw"), "Look again"]));
      return caseCard("In the", "server", kids);
    }

    function controls(a, m, can, people, decided) {
      const acts = el("div", { class: "dec-acts" });
      if (kind === "appeal") {
        acts.append(
          el("button", { type: "button", class: "btn", "aria-pressed": String(a.status === "Reviewing"), disabled: decided || a.status === "Reviewing", onclick: (e) => setStatus(a, "Reviewing", e.currentTarget) }, [ic("search"), "Under review"]),
          el("button", { type: "button", class: "btn btn-ok", disabled: !can.decide || m.non_appealable || !!m.duplicate_of, onclick: (e) => setStatus(a, "Accepted", e.currentTarget) }, [ic("circle-check"), "Approve and unban"]),
          el("button", { type: "button", class: "btn btn-danger", disabled: !can.decide, onclick: (e) => setStatus(a, "Denied", e.currentTarget) }, [ic("circle-x"), "Deny"]));
      } else {
        const look = { New: ["btn", "inbox"], Reviewing: ["btn", "message-square"], Accepted: ["btn btn-ok", "circle-check"], Denied: ["btn btn-danger", "circle-x"] };
        ["New", "Reviewing", "Accepted", "Denied"].forEach((s) => acts.append(el("button", {
          type: "button", class: look[s][0], "aria-pressed": String(a.status === s), disabled: a.status === s, onclick: (e) => setStatus(a, s, e.currentTarget)
        }, [ic(look[s][1]), K.labels[s]])));
      }

      // assign
      const sel = el("select", { class: "sel", "aria-label": "Assigned to" }, [el("option", { value: "", text: "Unassigned" })]
        .concat(Array.from(people.values()).filter((p) => H.RANK[p.tier] >= H.RANK[K.edit])
          .map((p) => el("option", { value: p.id, text: p.name + " (" + H.TIER_NAME[p.tier] + ")", selected: m.assignee === p.id }))));
      sel.addEventListener("change", () => act("hub_review_assign", { p_kind: kind, p_id: a.id, p_discord_id: sel.value || null }, sel.value ? "Assigned." : "Unassigned."));
      const grid = el("div", { class: "dec-grid" }, el("label", { class: "field" }, [el("span", { text: "Assigned to" }), sel]));

      // flag (appeals)
      if (kind === "appeal" && !decided) {
        const rule = el("select", { class: "sel", "aria-label": "Rule" }, NON_APPEALABLE.map((r) => el("option", { value: r, text: r, selected: m.rule === r })));
        grid.append(el("div", { class: "field" }, [el("span", { text: "Non-appealable rule" }), el("div", { class: "addrow" }, m.non_appealable
          ? [el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: (e) => act("hub_appeal_flag", { p_id: a.id, p_non_appealable: false, p_rule: null }, "Marked appealable.", e.currentTarget) }, [ic("refresh-cw"), "Mark appealable again"])]
          : [rule, el("button", { type: "button", class: "btn btn-sm btn-danger", onclick: (e) => act("hub_appeal_flag", { p_id: a.id, p_non_appealable: true, p_rule: rule.value }, "Marked not appealable.", e.currentTarget) }, [ic("ban"), "Mark not appealable"])])]));
      } else if (kind === "application") {
        grid.append(el("div", { class: "field" }, [el("span", { text: "Who decides" }), el("p", { class: "muted", style: "margin:6px 0 0", text: "Admins and owners. Accepted applicants still need their role in Discord." })]));
      }

      // message to the member
      const msg = el("textarea", { class: "ta", rows: 3, maxlength: 1500, placeholder: "Optional." });
      msg.value = a.staff_note || "";
      const save = el("button", { type: "button", class: "btn btn-sm btn-ice" }, [ic("send"), "Save message"]);
      save.addEventListener("click", () => act("hub_review_message", { p_kind: kind, p_id: a.id, p_text: msg.value }, msg.value.trim() ? "Message saved." : "Message removed.", save));
      return el("section", { class: "panel rv-card rv-decide" }, [H.h3("Decision"), acts, grid,
        el("label", { class: "field dec-msg" }, [el("span", { text: kind === "appeal" ? "Message they see when they check their appeal" : "Message they see on their account page" }), msg]), save]);
    }

    async function setStatus(a, status, btn) {
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
        ? "Approved. The bot is unbanning them." : "Moved to " + (K.labels[status] || status) + ".", btn);
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
      const box = el("section", { class: "panel rv-card rv-notes" }, H.h3("Internal notes (staff only, never shown to them)", { icon: "lock", color: "var(--pink)" }));
      box.append(notes.length ? el("div", { class: "notes" }, notes.map((n) => el("div", { class: "note-item" }, [
        H.avatar({ name: n.author || "Staff" }, 30),
        el("div", null, [el("div", { class: "meta" }, [el("b", { text: n.author || "Staff" }), " · " + H.fmtDateTime(n.at)]), el("p", { text: n.body })])])))
        : el("p", { class: "muted", style: "margin:0", text: "No notes yet." }));
      if (canEdit) {
        const ta = el("textarea", { class: "ta", rows: 2, maxlength: 2000, placeholder: "Add a note for the team…", "aria-label": "New note" });
        const add = el("button", { type: "button", class: "btn btn-sm btn-pink" }, [ic("plus"), "Add note"]);
        add.addEventListener("click", async () => {
          if (!ta.value.trim()) { ta.focus(); return; }
          add.disabled = true;
          await act("hub_review_note", { p_kind: kind, p_id: id, p_body: ta.value }, "Note added.", add);
          add.disabled = false;
        });
        box.append(el("div", { class: "note-add" }, [ta, add]));
      }
      return box;
    }

    return {
      id: K.id, title: K.title, short: K.short, nav: K.nav, icon: K.icon, min: "helper", tab: K.tab,
      async render(main, ctx) {
        mainNode = main;
        await Promise.all([loadList(), roster()]);
        // land on something with work in it
        if (!st.picked) {
          const c = counts();
          st.filter = c.open ? "open" : c.review ? "review" : "open";
        }
        const search = el("input", { class: "inp", type: "search", placeholder: kind === "appeal" ? "Search appeals by username or ID…" : "Search applications by name or username…", "aria-label": "Search" });
        search.value = st.query;
        search.addEventListener("input", () => { st.query = search.value; paintList(); });
        tabs = H.seg(FILTERS.map(([k, label, iconName]) => ({ value: k, label: label, icon: iconName, count: 0 })), st.filter,
          (v) => { st.filter = v; paintList(true); }, { cls: "tabs", label: "Filter" });
        listNode = el("div", { class: "rv-list" });
        detailNode = el("div", { class: "rv-detail rv-detail-wrap", "aria-live": "polite" }, blank());
        main.replaceChildren(
          H.secHead({ title: K.head[0], accent: K.head[1], sub: K.sub }),
          el("div", { class: "rv-tools" }, [tabs, el("div", { class: "search" }, [ic("search"), search])]),
          el("div", { class: "rv-layout" }, [listNode, detailNode]));
        paintCounts(); paintList(true);
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
