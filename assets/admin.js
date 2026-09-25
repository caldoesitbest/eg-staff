/* Envious Gluttony™ staff applications: admin page */
(function () {
  "use strict";

  const C = window.EG_CONFIG;
  const icon = window.egIcon;
  const STATUSES = ["New", "Reviewing", "Accepted", "Denied"];
  const TOKEN_KEY = "eg-admin-token";
  const GROUPS = [
    { title: "Staff Recruitment", cards: C.recruitment, style: "num" },
    { title: "Rules & Judgment Check", cards: C.judgment, style: "circle" }
  ];
  const labelFor = (id) => {
    for (const card of C.recruitment.concat(C.judgment)) for (const f of card.fields) if (f.id === id) return f.short;
    return id;
  };
  const NAME = labelFor("name");
  const USER = labelFor("discord_username");
  const AGE = labelFor("age");

  const $ = (id) => document.getElementById(id);
  const state = { token: readToken(), apps: [], filter: "All", query: "", selected: null, sheetUrl: "", busy: false };

  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children || [])) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }

  function readToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function saveToken(t) { state.token = t; try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { /* stays in memory */ } }
  function clearToken() { state.token = ""; try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }

  async function api(body) {
    if (!/^https?:\/\//.test(C.API_URL)) throw new Error("API_URL in assets/config.js isn't set yet.");
    const res = await fetch(C.API_URL, { method: "POST", body: JSON.stringify(body), redirect: "follow" });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error("The server sent back something unreadable. Check API_URL and your deployment.");
    return data;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const statusClass = (s) => "s-" + String(s || "New").toLowerCase();
  const who = (a) => ({ name: a.answers[NAME] || "No name", user: a.answers[USER] ? "@" + String(a.answers[USER]).replace(/^@/, "") : "" });
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? String(iso || "") : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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

  /* ---------- login ---------- */
  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("login-error");
    err.hidden = true;
    const user = $("user").value.trim();
    const pass = $("pass").value;
    if (!user || !pass) { err.textContent = "Enter your username and password."; err.hidden = false; return; }
    const btn = $("login-btn");
    btn.disabled = true;
    btn.textContent = "Checking…";
    try {
      const r = await api({ action: "login", user: user, pass: pass });
      if (!r.ok) { err.textContent = r.error || "Wrong username or password."; err.hidden = false; return; }
      saveToken(r.token);
      $("pass").value = "";
      await load();
    } catch (ex) {
      err.textContent = ex.message && ex.message.includes("API_URL") ? ex.message : "Couldn't reach the server. Check your connection and try again.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });

  function showLogin(msg) {
    clearToken();
    $("dash").hidden = true;
    $("login").hidden = false;
    if (msg) { $("login-error").textContent = msg; $("login-error").hidden = false; }
    $("user").focus();
  }

  $("logout").addEventListener("click", () => { state.apps = []; state.selected = null; showLogin(); toast("Logged out"); });
  $("refresh").addEventListener("click", () => load(true));

  /* ---------- data ---------- */
  async function load(announce) {
    if (state.busy) return;
    state.busy = true;
    $("refresh").disabled = true;
    try {
      const r = await api({ action: "list", token: state.token });
      if (!r.ok) {
        if (r.auth === false) return showLogin(r.error);
        toast(r.error || "Couldn't load applications.");
        return;
      }
      state.apps = r.apps || [];
      state.sheetUrl = r.sheetUrl || "";
      $("login").hidden = true;
      $("dash").hidden = false;
      $("sheet-link").hidden = !state.sheetUrl;
      if (state.sheetUrl) $("sheet-link").href = state.sheetUrl;
      if (state.selected && !state.apps.some((a) => a.id === state.selected)) state.selected = null;
      render();
      if (announce) toast("Up to date");
    } catch (ex) {
      if (!$("dash").hidden) toast("Couldn't reach the server.");
      else showLogin(ex.message);
    } finally {
      state.busy = false;
      $("refresh").disabled = false;
    }
  }

  /* ---------- rendering ---------- */
  function visibleApps() {
    const q = state.query.toLowerCase();
    return state.apps.filter((a) => {
      if (state.filter !== "All" && a.status !== state.filter) return false;
      if (!q) return true;
      const w = who(a);
      return (w.name + " " + w.user + " " + a.id).toLowerCase().includes(q);
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
      }, [el("span", { text: s === "All" ? "Total" : s }), el("strong", { text: String(counts[s]) })])
    ));
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
    $("list").replaceChildren(...items.map((a) => {
      const w = who(a);
      return el("li", null, el("button", {
        type: "button", class: "app-row", "aria-current": String(a.id === state.selected),
        onclick: () => { state.selected = a.id; $("grid").classList.add("showing-detail"); render(); $("detail").scrollIntoView({ block: "start" }); }
      }, [
        el("span", { class: "who" }, [el("strong", { text: w.name }), el("span", { text: [w.user, a.answers[AGE] ? "age " + a.answers[AGE] : ""].filter(Boolean).join(" · ") })]),
        el("span", { class: "status " + statusClass(a.status), text: a.status }),
        el("span", { class: "meta", text: ago(a.submitted) + " · " + a.id })
      ]));
    }));
  }

  function renderDetail() {
    const box = $("detail");
    const a = state.apps.find((x) => x.id === state.selected);
    if (!a) {
      $("grid").classList.remove("showing-detail");
      box.replaceChildren(el("p", { class: "empty", text: state.apps.length ? "Pick an application to read it." : "Applications will show up here." }));
      return;
    }
    const w = who(a);
    const used = new Set([NAME, USER, AGE]);

    const groups = GROUPS.map((g) => el("div", { class: "qa-group" }, [
      el("h3", { text: g.title }),
      ...g.cards.map((card) => {
        const answers = card.fields.map((f) => { used.add(f.short); return { f: f, v: a.answers[f.short] || "" }; });
        const body = card.fields.length > 1
          ? answers.map((x) => el("p", { class: "a" + (x.v ? "" : " blank"), text: (x.f.label || x.f.short) + ": " + (x.v || "no answer") }))
          : [el("p", { class: "a" + (answers[0].v ? "" : " blank"), text: answers[0].v || "No answer" })];
        return el("div", { class: "qa" }, [el("p", { class: "q" }, [el("b", { text: card.n }), card.q]), ...body]);
      })
    ]));

    const extras = Object.keys(a.answers).filter((k) => !used.has(k) && a.answers[k] !== "");
    if (extras.length) {
      groups.push(el("div", { class: "qa-group" }, [
        el("h3", { text: "Other answers" }),
        ...extras.map((k) => el("div", { class: "qa" }, [el("p", { class: "q", text: k }), el("p", { class: "a", text: a.answers[k] })]))
      ]));
    }

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
      await mutate({ action: "delete", id: a.id }, () => {
        state.apps = state.apps.filter((x) => x.id !== a.id);
        state.selected = null;
      }, "Application deleted");
      del.disabled = false;
    });

    box.replaceChildren(
      el("button", { type: "button", class: "btn btn-ghost btn-sm back-to-list", onclick: () => { state.selected = null; render(); } }, [icon("arrow-left"), "All applications"]),
      el("div", { class: "detail-top" }, [
        el("div", null, [el("h2", { text: w.name }), el("p", { class: "sub", text: w.user })]),
        el("span", { class: "status " + statusClass(a.status), text: a.status })
      ]),
      el("dl", { class: "facts" }, [
        el("div", null, [el("dt", { text: "Age" }), el("dd", { text: a.answers[AGE] || "—" })]),
        el("div", null, [el("dt", { text: "Submitted" }), el("dd", { text: fmtDate(a.submitted) })]),
        el("div", null, [el("dt", { text: "Application" }), el("dd", { text: a.id })])
      ]),
      el("div", { class: "seg", role: "group", "aria-label": "Status" }, STATUSES.map((s) =>
        el("button", {
          type: "button", class: statusClass(s), "aria-pressed": String(a.status === s),
          onclick: () => {
            if (a.status === s) return;
            mutate({ action: "status", id: a.id, status: s }, () => { a.status = s; }, "Marked as " + s);
          }
        }, s)
      )),
      ...groups,
      el("div", { class: "detail-foot" }, [el("span", { class: "count-note", text: "Submitted " + ago(a.submitted) }), del])
    );
  }

  async function mutate(body, apply, doneMsg) {
    try {
      const r = await api(Object.assign({ token: state.token }, body));
      if (!r.ok) {
        if (r.auth === false) return showLogin(r.error);
        toast(r.error || "That didn't save. Try again.");
        return;
      }
      apply();
      render();
      toast(doneMsg);
    } catch (ex) {
      toast("Couldn't reach the server. Try again.");
    }
  }

  $("search").addEventListener("input", (e) => { state.query = e.target.value.trim(); renderList(); });

  /* ---------- start ---------- */
  if (state.token) load(); else showLogin();
})();
