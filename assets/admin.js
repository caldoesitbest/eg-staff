/* Envious Gluttony™ admin page: staff applications + ban appeals (admins only, via Supabase) */
(function () {
  "use strict";

  const EG = window.EG;
  const U = window.EGUI;
  const C = window.EG_CONFIG;
  const el = U.el;
  const icon = window.egIcon;
  const STATUSES = ["New", "Reviewing", "Accepted", "Denied"];
  const $ = (id) => document.getElementById(id);

  // The two kinds of submissions this page reviews.
  const VIEWS = {
    applications: {
      table: "applications", title: "Staff applications", tab: "Staff applications", one: "application", many: "applications",
      labels: { New: "New", Reviewing: "Reviewing", Accepted: "Accepted", Denied: "Denied" },
      search: "Search name, username or ID",
      empty: "No applications yet. Share the link in your server!",
      pick: "Pick an application to read it.", nothing: "Applications will show up here.",
      csv: "eg-staff-applications.csv",
      rowTitle: (a) => a.name || "No name",
      rowSub: (a) => ["@" + a.discord_username, a.age ? "age " + a.age : ""].filter(Boolean).join(" · "),
      haystack: (a) => [a.name, a.discord_username, a.id],
      noteHelp: "Optional. The applicant sees this on their account page.",
      sections: null
    },
    appeals: {
      table: "appeals", title: "Ban appeals", tab: "Ban appeals", one: "appeal", many: "appeals",
      labels: { New: "New", Reviewing: "Reviewing", Accepted: "Unbanned", Denied: "Denied" },
      search: "Search username, user ID or appeal ID",
      empty: "No appeals yet. When you ban someone, point them to enviousgluttony.com/appeal.",
      pick: "Pick an appeal to read it.", nothing: "Appeals will show up here.",
      csv: "eg-ban-appeals.csv",
      rowTitle: (a) => "@" + a.discord_username,
      rowSub: (a) => "User ID " + a.discord_id,
      haystack: (a) => [a.discord_username, a.discord_id, a.id],
      noteHelp: "Optional. They see this when they check on their appeal.",
      sections: [{ title: "Ban appeal", cards: C.appeal || [] }]
    }
  };
  const params = new URLSearchParams(location.search);
  const state = {
    view: params.get("view") === "appeals" ? "appeals" : "applications",
    data: { applications: [], appeals: [] },
    missing: { applications: false, appeals: false },
    filter: "All", query: "", selected: null, busy: false
  };
  const V = () => VIEWS[state.view];
  const rows = () => state.data[state.view];

  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const statusClass = (s) => "s-" + String(s || "New").toLowerCase();
  const answer = (a, id) => {
    const hit = (Array.isArray(a.answers) ? a.answers : []).find((x) => x && x.id === id);
    return hit ? hit.value : "";
  };
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };
  function ago(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? " hour ago" : " hours ago");
    const days = Math.round(hrs / 24);
    return days < 8 ? days + (days === 1 ? " day ago" : " days ago") : fmtDate(iso);
  }

  /* ---------- access ---------- */
  function gate(nodes) {
    $("dash").hidden = true;
    $("gate").hidden = false;
    $("gate").replaceChildren(...nodes.filter(Boolean));
    window.egIcons($("gate"));
  }

  async function start() {
    if (!EG.configured) {
      gate([el("h1", { text: "Not connected yet" }), el("p", { text: "Add your Supabase keys to assets/config.js to use the admin page." })]);
      return;
    }
    const user = await EG.user();
    if (!user) {
      gate([
        el("span", { class: "pill" }, [icon("lock"), "Staff only"]),
        el("h1", { text: "Staff admin" }),
        el("p", { text: "Sign in with your Envious Gluttony™ account to review staff applications and ban appeals." }),
        el("a", { class: "btn btn-primary", href: "/signin/?next=/admin/" }, ["Sign in", icon("arrow-right")])
      ]);
      return;
    }
    if (!(await EG.isAdmin())) {
      const p = await EG.profile();
      const out = el("button", { type: "button", class: "btn btn-ghost" }, [icon("log-out"), "Sign out"]);
      out.addEventListener("click", async () => { await EG.signOut(); location.reload(); });
      gate([
        el("span", { class: "pill" }, [icon("lock"), "Staff only"]),
        el("h1", { text: "No admin access" }),
        el("p", { text: "You're signed in as " + (p && p.username ? "@" + p.username : user.email) + ", but this account isn't an admin. Ask an owner to add you." }),
        out
      ]);
      return;
    }
    $("gate").hidden = true;
    $("dash").hidden = false;
    await load();
  }

  /* ---------- data ---------- */
  async function fetchView(name) {
    const { data, error } = await EG.sb.from(VIEWS[name].table).select("*").order("created_at", { ascending: false });
    if (error) {
      // appeals.sql not run yet: the table doesn't exist. Everything else still works.
      if (name === "appeals" && /does not exist|schema cache|not found|42P01|PGRST20/i.test(String(error.message || "") + " " + String(error.code || ""))) {
        state.missing.appeals = true;
        state.data.appeals = [];
        return;
      }
      throw error;
    }
    state.missing[name] = false;
    state.data[name] = data || [];
  }
  async function load(announce) {
    if (state.busy) return;
    state.busy = true;
    $("refresh").disabled = true;
    try {
      await Promise.all(["applications", "appeals"].map(fetchView));
      if (state.selected && !rows().some((a) => a.id === state.selected)) state.selected = null;
      render();
      if (announce) toast("Up to date");
    } catch (ex) {
      render();
      toast("Couldn't load everything: " + EG.friendlyError(ex));
    } finally {
      state.busy = false;
      $("refresh").disabled = false;
    }
  }

  async function save(id, changes, doneMsg) {
    const { data, error } = await EG.sb.from(V().table).update(changes).eq("id", id).select("id, status, staff_note, status_changed_at");
    if (error || !data || !data.length) {
      toast(error ? EG.friendlyError(error) : "That didn't save. Refresh and try again.");
      return false;
    }
    const a = rows().find((x) => x.id === id);
    if (a) Object.assign(a, data[0]);
    render();
    toast(doneMsg);
    return true;
  }

  /* ---------- rendering ---------- */
  function visible() {
    const q = state.query.toLowerCase();
    return rows().filter((a) => {
      if (state.filter !== "All" && a.status !== state.filter) return false;
      return !q || V().haystack(a).join(" ").toLowerCase().includes(q);
    });
  }

  function render() {
    renderTabs();
    $("dash-title").textContent = V().title;
    $("search").placeholder = V().search;
    $("search").setAttribute("aria-label", V().search);
    renderStats();
    renderList();
    renderDetail();
  }

  function switchView(name) {
    if (state.view === name) return;
    state.view = name;
    state.filter = "All";
    state.selected = null;
    state.query = "";
    $("search").value = "";
    $("grid").classList.remove("showing-detail");
    const url = new URL(location.href);
    if (name === "appeals") url.searchParams.set("view", "appeals"); else url.searchParams.delete("view");
    history.replaceState(null, "", url);
    render();
  }

  function renderTabs() {
    $("views").replaceChildren(...Object.keys(VIEWS).map((name) => {
      const fresh = state.data[name].filter((a) => a.status === "New").length;
      return el("button", {
        type: "button", class: "view-tab", "aria-pressed": String(state.view === name),
        onclick: () => switchView(name)
      }, [icon(name === "appeals" ? "gavel" : "clipboard-list"), el("span", { text: VIEWS[name].tab }),
        fresh ? el("b", { class: "badge", text: fresh + " new" }) : null]);
    }));
  }

  function renderStats() {
    const list = rows();
    const counts = { All: list.length };
    STATUSES.forEach((s) => { counts[s] = list.filter((a) => a.status === s).length; });
    $("stats").replaceChildren(...["All"].concat(STATUSES).map((s) =>
      el("button", {
        type: "button", class: "stat", "aria-pressed": String(state.filter === s),
        onclick: () => { state.filter = s; render(); }
      }, [el("span", { text: s === "All" ? "Total" : V().labels[s] }), el("strong", { text: String(counts[s]) })])));
  }

  function renderList() {
    const v = V();
    const list = rows();
    const items = visible();
    if (state.missing[state.view]) {
      $("count-note").textContent = "";
      $("list").replaceChildren(el("li", { class: "empty" }, [
        el("strong", { text: "Ban appeals aren't switched on yet." }),
        el("br"),
        "Run appeals.sql in Supabase → SQL Editor, then refresh."
      ]));
      return;
    }
    $("count-note").textContent = items.length === list.length
      ? list.length + " " + (list.length === 1 ? v.one : v.many)
      : "Showing " + items.length + " of " + list.length;
    if (!items.length) {
      $("list").replaceChildren(el("li", { class: "empty", text: list.length ? "No " + v.many + " match." : v.empty }));
      return;
    }
    $("list").replaceChildren(...items.map((a) => el("li", null, el("button", {
      type: "button", class: "app-row", "aria-current": String(a.id === state.selected),
      onclick: () => { state.selected = a.id; $("grid").classList.add("showing-detail"); render(); $("detail").scrollIntoView({ block: "start" }); }
    }, [
      el("span", { class: "who" }, [el("strong", { text: v.rowTitle(a) }), el("span", { text: v.rowSub(a) })]),
      el("span", { class: "status " + statusClass(a.status), text: v.labels[a.status] || a.status }),
      el("span", { class: "meta", text: ago(a.created_at) + " · " + a.id + (a.user_id ? " · has account" : "") })
    ]))));
  }

  function copyButton(label, value) {
    const b = el("button", { type: "button", class: "btn btn-ghost btn-sm" }, [icon("copy"), el("span", { text: label })]);
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(value); toast("Copied " + value); }
      catch (e) { toast("Couldn't copy. It's " + value); }
    });
    return b;
  }

  function renderDetail() {
    const box = $("detail");
    const v = V();
    const a = rows().find((x) => x.id === state.selected);
    if (!a) {
      $("grid").classList.remove("showing-detail");
      box.replaceChildren(el("p", { class: "empty", text: rows().length ? v.pick : v.nothing }));
      return;
    }
    const appeal = state.view === "appeals";

    const note = el("textarea", { class: "inp", id: "staff-note", rows: "3", maxlength: "1000", placeholder: v.noteHelp });
    note.value = a.staff_note || "";
    const saveNote = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: "Save message" });
    saveNote.addEventListener("click", async () => {
      U.busy(saveNote, true, "Saving…");
      await save(a.id, { staff_note: note.value.trim() || null }, note.value.trim() ? "Message saved" : "Message removed");
      U.busy(saveNote, false);
    });

    const del = el("button", { type: "button", class: "btn btn-danger btn-sm" }, [icon("trash-2"), "Delete"]);
    let armed = null;
    del.addEventListener("click", async () => {
      if (!armed) {
        del.classList.add("armed");
        del.lastChild.textContent = "Tap again to delete";
        armed = setTimeout(() => { armed = null; del.classList.remove("armed"); del.lastChild.textContent = "Delete"; }, 4000);
        return;
      }
      clearTimeout(armed);
      del.disabled = true;
      const { error } = await EG.sb.from(v.table).delete().eq("id", a.id);
      del.disabled = false;
      if (error) { toast(EG.friendlyError(error)); return; }
      state.data[state.view] = rows().filter((x) => x.id !== a.id);
      state.selected = null;
      render();
      toast((appeal ? "Appeal" : "Application") + " deleted");
    });

    const facts = appeal
      ? [
          el("div", null, [el("dt", { text: "User ID" }), el("dd", { text: a.discord_id })]),
          el("div", null, [el("dt", { text: "Submitted" }), el("dd", { text: fmtDate(a.created_at) })]),
          el("div", null, [el("dt", { text: "Appeal" }), el("dd", { text: a.id })])
        ]
      : [
          el("div", null, [el("dt", { text: "Age" }), el("dd", { text: a.age || answer(a, "age") || "—" })]),
          el("div", null, [el("dt", { text: "Submitted" }), el("dd", { text: fmtDate(a.created_at) })]),
          el("div", null, [el("dt", { text: "Application" }), el("dd", { text: a.id })])
        ];

    box.replaceChildren(
      el("button", { type: "button", class: "btn btn-ghost btn-sm back-to-list", onclick: () => { state.selected = null; render(); } }, [icon("arrow-left"), "All " + v.many]),
      el("div", { class: "detail-top" }, [
        el("div", null, appeal
          ? [el("h2", { text: "@" + a.discord_username }), el("p", { class: "sub", text: "Ban appeal" + (a.user_id ? " · has an account" : "") })]
          : [el("h2", { text: a.name || "No name" }), el("p", { class: "sub", text: "@" + a.discord_username + (a.user_id ? " · has an account" : "") })]),
        el("span", { class: "status " + statusClass(a.status), text: v.labels[a.status] || a.status })
      ]),
      el("dl", { class: "facts" }, facts),
      appeal ? el("div", { class: "detail-tools" }, [copyButton("Copy user ID", a.discord_id), copyButton("Copy appeal ID", a.id)]) : null,
      el("div", { class: "seg", role: "group", "aria-label": "Status" }, STATUSES.map((s) => el("button", {
        type: "button", class: statusClass(s), "aria-pressed": String(a.status === s),
        onclick: () => { if (a.status !== s) save(a.id, { status: s }, "Marked as " + v.labels[s]); }
      }, v.labels[s]))),
      appeal ? el("p", { class: "muted-note" }, [
        el("strong", { text: "Unbanned doesn't lift the ban in Discord. " }),
        "Unban them in Discord first (Server Settings → Bans, or your bot's unban command with the user ID), then mark it here so they see the result."
      ]) : null,
      el("div", { class: "note-edit" }, [
        el("label", { class: "sub-label", for: "staff-note", text: appeal ? "Message to the member" : "Message to the applicant" }),
        note,
        el("div", { class: "row" }, [saveNote])
      ]),
      ...U.answersView(a.answers, v.sections),
      el("div", { class: "detail-foot" }, [el("span", { class: "count-note", text: "Submitted " + ago(a.created_at) }), del])
    );
    window.egIcons(box);
  }

  /* ---------- export ---------- */
  $("export").addEventListener("click", () => {
    const v = V();
    const list = rows();
    if (!list.length) { toast("Nothing to export yet"); return; }
    const ids = [];
    const labels = {};
    list.forEach((a) => (a.answers || []).forEach((x) => { if (!labels[x.id]) { labels[x.id] = x.label || x.id; ids.push(x.id); } }));
    const cell = (val) => {
      let s = String(val === null || val === undefined ? "" : val);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // keep spreadsheets from running it as a formula
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const head = [state.view === "appeals" ? "Appeal" : "Application", "Submitted", "Status", "Message", "Has account"];
    const out = [head.concat(ids.map((i) => labels[i]))]
      .concat(list.map((a) => [a.id, a.created_at, v.labels[a.status] || a.status, a.staff_note || "", a.user_id ? "yes" : "no"].concat(ids.map((i) => answer(a, i)))));
    const blob = new Blob(["﻿" + out.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = el("a", { href: URL.createObjectURL(blob), download: v.csv });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  $("refresh").addEventListener("click", () => load(true));
  $("search").addEventListener("input", (e) => { state.query = e.target.value.trim(); renderList(); });

  start();
})();
