/* Envious Gluttony™ staff applications: admin page (admins only, via Supabase) */
(function () {
  "use strict";

  const EG = window.EG;
  const U = window.EGUI;
  const el = U.el;
  const icon = window.egIcon;
  const STATUSES = ["New", "Reviewing", "Accepted", "Denied"];
  const $ = (id) => document.getElementById(id);
  const state = { apps: [], filter: "All", query: "", selected: null, busy: false };

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
        el("h1", { text: "Staff applications" }),
        el("p", { text: "Sign in with your Envious Gluttony™ account to read and review applications." }),
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
  async function load(announce) {
    if (state.busy) return;
    state.busy = true;
    $("refresh").disabled = true;
    try {
      const { data, error } = await EG.sb.from("applications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      state.apps = data || [];
      if (state.selected && !state.apps.some((a) => a.id === state.selected)) state.selected = null;
      render();
      if (announce) toast("Up to date");
    } catch (ex) {
      toast("Couldn't load applications: " + EG.friendlyError(ex));
    } finally {
      state.busy = false;
      $("refresh").disabled = false;
    }
  }

  async function save(id, changes, doneMsg) {
    const { data, error } = await EG.sb.from("applications").update(changes).eq("id", id).select("id, status, staff_note, status_changed_at");
    if (error || !data || !data.length) {
      toast(error ? EG.friendlyError(error) : "That didn't save. Refresh and try again.");
      return false;
    }
    const a = state.apps.find((x) => x.id === id);
    if (a) Object.assign(a, data[0]);
    render();
    toast(doneMsg);
    return true;
  }

  /* ---------- rendering ---------- */
  function visibleApps() {
    const q = state.query.toLowerCase();
    return state.apps.filter((a) => {
      if (state.filter !== "All" && a.status !== state.filter) return false;
      return !q || [a.name, a.discord_username, a.id].join(" ").toLowerCase().includes(q);
    });
  }

  function render() {
    renderStats();
    renderList();
    renderDetail();
  }

  function renderStats() {
    const counts = { All: state.apps.length };
    STATUSES.forEach((s) => { counts[s] = state.apps.filter((a) => a.status === s).length; });
    $("stats").replaceChildren(...["All"].concat(STATUSES).map((s) =>
      el("button", {
        type: "button", class: "stat", "aria-pressed": String(state.filter === s),
        onclick: () => { state.filter = s; render(); }
      }, [el("span", { text: s === "All" ? "Total" : s }), el("strong", { text: String(counts[s]) })])));
  }

  function renderList() {
    const items = visibleApps();
    $("count-note").textContent = items.length === state.apps.length
      ? state.apps.length + (state.apps.length === 1 ? " application" : " applications")
      : "Showing " + items.length + " of " + state.apps.length;
    if (!items.length) {
      $("list").replaceChildren(el("li", { class: "empty", text: state.apps.length ? "No applications match." : "No applications yet. Share the link in your server!" }));
      return;
    }
    $("list").replaceChildren(...items.map((a) => el("li", null, el("button", {
      type: "button", class: "app-row", "aria-current": String(a.id === state.selected),
      onclick: () => { state.selected = a.id; $("grid").classList.add("showing-detail"); render(); $("detail").scrollIntoView({ block: "start" }); }
    }, [
      el("span", { class: "who" }, [
        el("strong", { text: a.name || "No name" }),
        el("span", { text: ["@" + a.discord_username, a.age ? "age " + a.age : ""].filter(Boolean).join(" · ") })
      ]),
      el("span", { class: "status " + statusClass(a.status), text: a.status }),
      el("span", { class: "meta", text: ago(a.created_at) + " · " + a.id + (a.user_id ? " · has account" : "") })
    ]))));
  }

  function renderDetail() {
    const box = $("detail");
    const a = state.apps.find((x) => x.id === state.selected);
    if (!a) {
      $("grid").classList.remove("showing-detail");
      box.replaceChildren(el("p", { class: "empty", text: state.apps.length ? "Pick an application to read it." : "Applications will show up here." }));
      return;
    }

    const note = el("textarea", { class: "inp", id: "staff-note", rows: "3", maxlength: "1000", placeholder: "Optional. The applicant sees this on their account page." });
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
      const { error } = await EG.sb.from("applications").delete().eq("id", a.id);
      del.disabled = false;
      if (error) { toast(EG.friendlyError(error)); return; }
      state.apps = state.apps.filter((x) => x.id !== a.id);
      state.selected = null;
      render();
      toast("Application deleted");
    });

    box.replaceChildren(
      el("button", { type: "button", class: "btn btn-ghost btn-sm back-to-list", onclick: () => { state.selected = null; render(); } }, [icon("arrow-left"), "All applications"]),
      el("div", { class: "detail-top" }, [
        el("div", null, [el("h2", { text: a.name || "No name" }), el("p", { class: "sub", text: "@" + a.discord_username + (a.user_id ? " · has an account" : "") })]),
        el("span", { class: "status " + statusClass(a.status), text: a.status })
      ]),
      el("dl", { class: "facts" }, [
        el("div", null, [el("dt", { text: "Age" }), el("dd", { text: a.age || answer(a, "age") || "—" })]),
        el("div", null, [el("dt", { text: "Submitted" }), el("dd", { text: fmtDate(a.created_at) })]),
        el("div", null, [el("dt", { text: "Application" }), el("dd", { text: a.id })])
      ]),
      el("div", { class: "seg", role: "group", "aria-label": "Status" }, STATUSES.map((s) => el("button", {
        type: "button", class: statusClass(s), "aria-pressed": String(a.status === s),
        onclick: () => { if (a.status !== s) save(a.id, { status: s }, "Marked as " + s); }
      }, s))),
      el("div", { class: "note-edit" }, [
        el("label", { class: "sub-label", for: "staff-note", text: "Message to the applicant" }),
        note,
        el("div", { class: "row" }, [saveNote])
      ]),
      ...U.answersView(a.answers),
      el("div", { class: "detail-foot" }, [el("span", { class: "count-note", text: "Submitted " + ago(a.created_at) }), del])
    );
    window.egIcons(box);
  }

  /* ---------- export ---------- */
  $("export").addEventListener("click", () => {
    if (!state.apps.length) { toast("Nothing to export yet"); return; }
    const ids = [];
    const labels = {};
    state.apps.forEach((a) => (a.answers || []).forEach((x) => { if (!labels[x.id]) { labels[x.id] = x.label || x.id; ids.push(x.id); } }));
    const cell = (v) => {
      let s = String(v === null || v === undefined ? "" : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // keep spreadsheets from running it as a formula
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = [["Application", "Submitted", "Status", "Message to applicant", "Has account"].concat(ids.map((i) => labels[i]))]
      .concat(state.apps.map((a) => [a.id, a.created_at, a.status, a.staff_note || "", a.user_id ? "yes" : "no"].concat(ids.map((i) => answer(a, i)))));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = el("a", { href: URL.createObjectURL(blob), download: "eg-staff-applications.csv" });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  $("refresh").addEventListener("click", () => load(true));
  $("search").addEventListener("input", (e) => { state.query = e.target.value.trim(); renderList(); });

  start();
})();
