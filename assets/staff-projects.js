/* Staff Hub: projects (the to-do list). Admins and owners create and archive; any staff member joins, works and uploads. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, C } = H;
  const EG = window.EG;
  const BUCKET = "project-files";
  const MAX = 25 * 1024 * 1024;
  const STATUS = { open: ["Open", "p-new"], progress: ["In progress", "p-review"], done: ["Done", "p-ok"] };
  const COLORS = [["#8e44ff", "Violet"], ["#36dfff", "Cyan"], ["#ff42d0", "Magenta"], ["#73ffce", "Mint"], ["#ffc861", "Gold"], ["#ff6b8b", "Red"]];
  const TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|markdown|csv)|application\/(zip|x-zip-compressed|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[a-z.]+)|audio\/(mpeg|mp4|wav|x-wav|ogg)|video\/(mp4|webm|quicktime))$/;
  const EXT_TYPES = { md: "text/markdown", csv: "text/csv", txt: "text/plain", zip: "application/zip", pdf: "application/pdf" };

  let archived = false, list = [], mainNode = null, openId = null;
  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const mimeOf = (f) => f.type || EXT_TYPES[(f.name.split(".").pop() || "").toLowerCase()] || "";

  function stack(members, max) {
    const s = el("span", { class: "stack" });
    (members || []).slice(0, max || 5).forEach((m) => s.append(H.avatar(m, 28)));
    if ((members || []).length > (max || 5)) s.append(el("span", { class: "more", text: "+" + (members.length - (max || 5)) }));
    return s;
  }

  function pcard(p) {
    const [label, cls] = STATUS[p.status] || STATUS.open;
    const pct = p.tasks ? Math.round((p.tasks_done / p.tasks) * 100) : 0;
    const c = el("button", { type: "button", class: "pcard", style: "--pc:" + (p.color || "#8e44ff"), "aria-label": p.title + ", " + label }, [
      el("span", { class: "pcover" }, [el("span", { text: p.cover || "📁", "aria-hidden": "true" }), el("span", { class: "pill " + cls, text: p.archived ? "Archived" : label })]),
      el("span", { class: "pbody" }, [
        el("b", { text: p.title }),
        p.body ? el("p", { text: p.body }) : null,
        (p.tags || []).length ? el("span", { class: "tags" }, p.tags.map((t) => el("span", { class: "tagc", text: t }))) : null,
        p.tasks ? el("span", null, [el("span", { class: "prog", "aria-hidden": "true" }, el("i", { style: "--p:" + pct + "%" })),
          el("span", { class: "faint", style: "font-size:.78rem", text: p.tasks_done + " of " + H.plural(p.tasks, "task") + " done" })]) : null
      ]),
      el("span", { class: "pfoot" }, [stack(p.members), el("span", null, [
        p.files ? el("span", null, [ic("paperclip"), " " + p.files + "  "]) : null,
        p.due_date ? el("span", { text: "Due " + H.fmtDate(p.due_date + "T12:00:00") }) : null,
        p.joined ? el("span", { class: "pill p-ok", style: "margin-left:6px", text: "Joined" }) : null])])
    ]);
    c.addEventListener("click", () => openProject(p.id));
    return c;
  }

  async function loadList() { list = await H.rpc("hub_projects", { p_archived: archived }); }
  function paint(main) {
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Show" }, [["Active", false], ["Archived", true]].map(([l, v]) =>
      el("button", { type: "button", "aria-pressed": String(archived === v), onclick: async () => { archived = v; await loadList(); paint(main); } }, l)));
    main.replaceChildren(
      el("div", { class: "sec-head" }, [el("div", null, [el("h1", { text: "Projects" }),
        el("p", { text: "The team's to-do list. Join anything you want to help with; members add tasks and files." })]),
        el("div", { class: "sec-acts" }, [seg, H.can("admin") ? el("button", { type: "button", class: "btn btn-primary", onclick: () => form(null) }, [ic("plus"), "New project"]) : null])]),
      list.length ? el("div", { class: "board" }, list.map(pcard))
        : el("div", { class: "empty" }, [ic("folder"), el("p", { text: archived ? "No archived projects." : H.can("admin") ? "No projects yet. Start the first one." : "No projects yet." })])
    );
    window.egIcons && window.egIcons(main);
  }

  /* ---------- one project ---------- */
  async function openProject(id) {
    openId = id;
    H.drawer.open({ title: "Project", body: el("span", { class: "loader" }), wide: true, onClose: () => { openId = null; if (location.hash.indexOf("#projects/") === 0) history.replaceState(null, "", "#projects"); } });
    await paintProject(id);
  }
  async function paintProject(id, flyFrom) {
    let d;
    try { d = await H.rpc("hub_project", { p_id: id }); }
    catch (e) { H.drawer.set(el("div", { class: "empty" }, [ic("triangle-alert"), el("p", { text: e.message })])); return; }
    if (openId !== id) return;
    const p = d.project, can = d.can || {};
    const [label, cls] = STATUS[p.status] || STATUS.open;
    const membersRow = stack(d.members, 12);
    const join = d.joined
      ? el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => leave(id) }, [ic("log-out"), "Leave"])
      : el("button", { type: "button", class: "btn btn-sm btn-primary", disabled: p.archived || (p.member_cap && d.members.length >= p.member_cap),
        onclick: (e) => joinProject(id, e.currentTarget) }, [ic("user-plus"), p.member_cap && d.members.length >= p.member_cap ? "Full" : "Join"]);
    const nodes = [
      el("div", { class: "pcover", style: "--pc:" + (p.color || "#8e44ff") + ";border-radius:16px;height:auto;padding:16px" }, [
        el("div", null, [el("div", { style: "font-size:2.2rem", text: p.cover || "📁" }), el("h2", { style: "margin:6px 0 0;font-size:1.4rem", text: p.title })]),
        el("span", { class: "pill " + cls, text: p.archived ? "Archived" : label })]),
      el("div", { class: "who", style: "justify-content:space-between;flex-wrap:wrap" }, [
        el("div", { class: "who" }, [membersRow, el("span", { class: "muted", text: H.plural(d.members.length, "member") + (p.member_cap ? " of " + p.member_cap : "") })]),
        el("div", { class: "rv-acts" }, [join,
          can.manage ? el("button", { type: "button", class: "btn btn-sm", onclick: () => form(p) }, [ic("pencil"), "Edit"]) : null,
          can.manage ? el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => archive(p) }, [ic("archive"), p.archived ? "Restore" : "Archive"]) : null])]),
      el("dl", { class: "kv" }, [
        p.due_date ? el("dt", { text: "Due" }) : null, p.due_date ? el("dd", { text: H.fmtDate(p.due_date + "T12:00:00") }) : null,
        (p.tags || []).length ? el("dt", { text: "Tags" }) : null, (p.tags || []).length ? el("dd", null, el("span", { class: "tags" }, p.tags.map((t) => el("span", { class: "tagc", text: t })))) : null,
        el("dt", { text: "Started" }), el("dd", { text: H.fmtDate(p.created_at) })
      ]),
      p.body ? el("p", { style: "white-space:pre-wrap;margin:0", text: p.body }) : null,
      tasksBox(d, can),
      filesBox(d, can),
      el("div", null, [el("h3", { text: "Activity" }), (d.activity || []).length ? el("ul", { class: "feed" }, d.activity.map((a) =>
        el("li", null, [el("b", { text: a.who || "Someone" }), " " + a.action + (a.detail ? ": " + a.detail : "") + " · ", el("time", { text: H.ago(a.at) })])))
        : el("p", { class: "muted", text: "Nothing yet." })])
    ];
    H.drawer.set(nodes);
    document.getElementById("drawer-title").textContent = p.title;
    if (flyFrom) fly(flyFrom, membersRow);
  }

  /* the avatar flies from the Join button into the member stack */
  function fly(from, stackNode) {
    if (H.reduce || !Element.prototype.animate) return;
    const target = stackNode.lastElementChild && stackNode.lastElementChild.classList.contains("more") ? stackNode : stackNode.lastElementChild || stackNode;
    const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
    const av = H.avatar(H.me, 34);
    av.classList.add("fly-av");
    av.style.left = (a.left + a.width / 2 - 17) + "px";
    av.style.top = (a.top + a.height / 2 - 17) + "px";
    document.body.append(av);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    av.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: "translate(" + dx * 0.5 + "px," + (dy * 0.5 - 60) + "px) scale(1.35)", opacity: 1, offset: 0.55 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.82)", opacity: 0.2 }],
    { duration: 720, easing: "cubic-bezier(.3,.7,.2,1)" }).finished.then(() => av.remove(), () => av.remove());
  }

  async function joinProject(id, btn) {
    const rect = btn.getBoundingClientRect();
    const ghost = { getBoundingClientRect: () => rect };
    try { await H.rpc("hub_project_join", { p_id: id }); H.toast("You're in.", "ok"); await paintProject(id, ghost); refreshBoard(); }
    catch (e) { H.fail(e); }
  }
  async function leave(id) {
    try { await H.rpc("hub_project_leave", { p_id: id }); H.toast("You left the project."); await paintProject(id); refreshBoard(); }
    catch (e) { H.fail(e); }
  }
  async function archive(p) {
    const ok = await H.confirm({ title: (p.archived ? "Restore" : "Archive") + " \"" + p.title + "\"?",
      body: [p.archived ? "It goes back on the board." : "It leaves the board but nothing is deleted. You can restore it from Archived."], ok: p.archived ? "Restore" : "Archive" });
    if (!ok) return;
    try { await H.rpc("hub_project_archive", { p_id: p.id, p_archived: !p.archived }); H.toast(p.archived ? "Restored." : "Archived.", "ok"); H.drawer.close(); refreshBoard(); }
    catch (e) { H.fail(e); }
  }

  function memberOptions(d, selected) {
    return [el("option", { value: "", text: "Nobody" })].concat(d.members.map((m) => el("option", { value: m.id, text: m.name || m.id, selected: selected === m.id })));
  }
  function tasksBox(d, can) {
    const box = el("div", null, el("h3", { text: "Tasks" }));
    const done = d.tasks.filter((t) => t.done).length;
    if (d.tasks.length) box.append(el("div", { class: "prog", style: "margin-bottom:10px" }, el("i", { style: "--p:" + Math.round((done / d.tasks.length) * 100) + "%" })));
    const ul = el("ul", { class: "tasks" });
    for (const t of d.tasks) {
      const tick = el("button", { type: "button", class: "tick", disabled: !can.work, "aria-pressed": String(t.done), "aria-label": (t.done ? "Reopen: " : "Tick off: ") + t.title }, ic(t.done ? "square-check" : "square"));
      tick.addEventListener("click", () => task(d.project.id, "hub_task_update", { p_task: t.id, p_done: !t.done }));
      const row = el("li", { class: "task" + (t.done ? " done" : "") }, [tick, el("span", { class: "title", text: t.title })]);
      if (can.work) {
        const sel = el("select", { class: "sel", "aria-label": "Assigned to" }, memberOptions(d, t.assignee));
        sel.addEventListener("change", () => task(d.project.id, "hub_task_update", sel.value ? { p_task: t.id, p_assignee: sel.value } : { p_task: t.id, p_unassign: true }));
        row.append(sel);
        if (t.created_by === H.me.id || H.can("admin")) {
          row.append(el("button", { type: "button", class: "icon-btn", "aria-label": "Delete task", onclick: () => task(d.project.id, "hub_task_delete", { p_task: t.id }) }, ic("trash-2")));
        }
      } else if (t.assignee) {
        row.append(el("span", { class: "faint", text: t.assignee_name }));
      }
      ul.append(row);
    }
    box.append(d.tasks.length ? ul : el("p", { class: "muted", text: "No tasks yet." }));
    if (can.work) {
      const inp = el("input", { class: "inp", maxlength: 200, placeholder: "Add a task…", "aria-label": "New task" });
      const who = el("select", { class: "sel", "aria-label": "Assign to", style: "flex:0 1 160px" }, memberOptions(d, null));
      const add = el("button", { type: "submit", class: "btn btn-sm" }, [ic("plus"), "Add"]);
      const f = el("form", { class: "addrow", style: "margin-top:10px" }, [inp, who, add]);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!inp.value.trim()) return;
        task(d.project.id, "hub_task_add", { p_project: d.project.id, p_title: inp.value, p_assignee: who.value || null });
      });
      box.append(f);
    } else {
      box.append(el("p", { class: "faint", text: "Join the project to add and tick off tasks." }));
    }
    return box;
  }
  async function task(pid, fn, args) {
    try { await H.rpc(fn, args); await paintProject(pid); refreshBoard(); }
    catch (e) { H.fail(e); }
  }

  /* ---------- files ---------- */
  function filesBox(d, can) {
    const box = el("div", null, el("h3", { text: "Files" }));
    const files = el("div", { class: "files" });
    const uploads = el("div", { class: "files" });
    if (can.work) {
      const pick = el("input", { type: "file", multiple: true, hidden: true });
      const drop = el("div", { class: "drop", role: "button", tabindex: "0", "aria-label": "Upload files" }, [ic("upload"),
        el("b", { text: "Drop files here or tap to choose" }), el("span", { class: "faint", text: "Up to 25 MB: images, PDFs, text, zip, office files, short audio or video" })]);
      drop.addEventListener("click", () => pick.click());
      drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick.click(); } });
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload(d.project.id, e.dataTransfer.files, uploads); });
      pick.addEventListener("change", () => { upload(d.project.id, pick.files, uploads); pick.value = ""; });
      box.append(drop, pick, uploads);
    }
    box.append(files);
    if (!d.files.length) { files.append(el("p", { class: "muted", text: can.work ? "No files yet." : "No files yet. Join to upload." })); return box; }
    const images = d.files.filter((f) => /^image\//.test(f.mime));
    const thumbs = {};
    if (images.length) {
      EG.sb.storage.from(BUCKET).createSignedUrls(images.map((f) => f.path), 300).then(({ data }) => {
        (data || []).forEach((x) => { if (x.signedUrl && thumbs[x.path]) thumbs[x.path].replaceWith(el("img", { class: "thumb", src: x.signedUrl, alt: "" })); });
      }, () => { /* the icon stays */ });
    }
    for (const f of d.files) {
      const th = el("span", { class: "thumb" }, ic(/^image\//.test(f.mime) ? "image" : "file"));
      thumbs[f.path] = th;
      const acts = el("span", { class: "acts" });
      if (/^image\/|^application\/pdf$/.test(f.mime)) acts.append(el("button", { type: "button", class: "icon-btn", "aria-label": "Preview " + f.name, onclick: () => preview(f) }, ic("eye")));
      acts.append(el("button", { type: "button", class: "icon-btn", "aria-label": "Download " + f.name, onclick: () => download(f) }, ic("download")));
      if (f.mine || H.can("admin")) acts.append(el("button", { type: "button", class: "icon-btn", "aria-label": "Delete " + f.name, onclick: () => removeFile(d.project.id, f) }, ic("trash-2")));
      files.append(el("div", { class: "file" }, [th, el("span", { class: "nm" }, [el("b", { text: f.name }), el("span", { text: size(f.size) + " · " + (f.by_name || "someone") + " · " + H.ago(f.at) })]), acts]));
    }
    return box;
  }

  async function signed(f, download) {
    const { data, error } = await EG.sb.storage.from(BUCKET).createSignedUrl(f.path, 60, download ? { download: f.name } : undefined);
    if (error || !data) throw new Error("Couldn't open that file. Try again.");
    return data.signedUrl;                                   // good for 60 seconds
  }
  async function download(f) {
    try { const url = await signed(f, true); const a = el("a", { href: url, download: f.name }); document.body.append(a); a.click(); a.remove(); }
    catch (e) { H.fail(e); }
  }
  async function preview(f) {
    try {
      const url = await signed(f, false);
      if (/pdf$/.test(f.mime)) { window.open(url, "_blank", "noopener"); return; }
      const ok = await H.confirm({ title: f.name, body: [el("img", { class: "preview-img", src: url, alt: f.name })], ok: "Download" });
      if (ok) download(f);
    } catch (e) { H.fail(e); }
  }
  async function removeFile(pid, f) {
    const ok = await H.confirm({ title: "Delete " + f.name + "?", body: ["It's gone for everyone. This can't be undone."], ok: "Delete", danger: true });
    if (!ok) return;
    try {
      const { error } = await EG.sb.storage.from(BUCKET).remove([f.path]);
      if (error) throw new Error("Couldn't delete the file from storage.");
      await H.rpc("hub_file_delete", { p_file: f.id });
      H.toast("Deleted.", "ok"); await paintProject(pid); refreshBoard();
    } catch (e) { H.fail(e); }
  }

  /* uploads go straight to the private bucket, with a progress bar */
  async function upload(pid, fileList, into) {
    const { data } = await EG.sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { H.fail(new Error("Your sign-in ran out. Refresh the page.")); return; }
    for (const file of Array.from(fileList || [])) {
      const mime = mimeOf(file);
      if (file.size > MAX) { H.toast(file.name + " is over 25 MB.", "bad"); continue; }
      if (!TYPES.test(mime)) { H.toast(file.name + ": that file type isn't allowed.", "bad"); continue; }
      const bar = el("i", { style: "--p:0%" });
      const row = el("div", { class: "upl" }, [el("span", { class: "faint", text: "Uploading " + file.name }), el("span", { class: "prog" }, bar)]);
      into.append(row);
      try {
        const begun = await H.rpc("hub_file_begin", { p_project: pid, p_name: file.name, p_size: file.size, p_mime: mime });
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", C.SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1/object/" + BUCKET + "/" + begun.path.split("/").map(encodeURIComponent).join("/"));
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("apikey", C.SUPABASE_KEY);
          xhr.setRequestHeader("x-upsert", "false");
          xhr.setRequestHeader("Content-Type", mime);
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.style.setProperty("--p", Math.round((e.loaded / e.total) * 100) + "%"); };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The upload was refused (" + xhr.status + ").")));
          xhr.onerror = () => reject(new Error("The upload stopped. Check your connection."));
          xhr.send(file);
        });
        await H.rpc("hub_file_done", { p_file: begun.id });
        row.remove();
        H.toast(file.name + " uploaded.", "ok");
      } catch (e) {
        row.remove();
        H.fail(e);
      }
    }
    if (openId === pid) await paintProject(pid);
    refreshBoard();
  }

  /* ---------- create / edit ---------- */
  function form(p) {
    p = p || {};
    const title = el("input", { class: "inp", maxlength: 80, required: true, value: p.title || "" });
    const body = el("textarea", { class: "ta", rows: 5, maxlength: 4000 });
    body.value = p.body || "";
    const status = el("select", { class: "sel" }, Object.entries(STATUS).map(([k, [l]]) => el("option", { value: k, text: l, selected: (p.status || "open") === k })));
    const cover = el("input", { class: "inp", maxlength: 16, value: p.cover || "", placeholder: "One emoji, e.g. 🎃" });
    const color = el("select", { class: "sel" }, COLORS.map(([v, l]) => el("option", { value: v, text: l, selected: (p.color || "#8e44ff") === v })));
    const due = el("input", { class: "inp", type: "date", value: p.due_date || "" });
    const cap = el("input", { class: "inp", type: "number", min: 1, max: 50, value: p.member_cap || "", placeholder: "No limit" });
    const tags = el("input", { class: "inp", value: (p.tags || []).join(", "), placeholder: "event, art, bot" });
    const save = el("button", { type: "submit", class: "btn btn-primary" }, p.id ? "Save" : "Create project");
    const f = el("form", { class: "form-grid" }, [
      el("label", { class: "field" }, [el("span", { text: "Title" }), title]),
      el("label", { class: "field" }, [el("span", { text: "Description" }), body]),
      el("div", { class: "form-row" }, [el("label", { class: "field" }, [el("span", { text: "Status" }), status]),
        el("label", { class: "field" }, [el("span", { text: "Cover" }), cover]), el("label", { class: "field" }, [el("span", { text: "Colour" }), color])]),
      el("div", { class: "form-row" }, [el("label", { class: "field" }, [el("span", { text: "Due date (optional)" }), due]),
        el("label", { class: "field" }, [el("span", { text: "Member limit (optional)" }), cap])]),
      el("label", { class: "field" }, [el("span", { text: "Tags (comma separated, up to 8)" }), tags]),
      save
    ]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        const r = await H.rpc("hub_project_save", { p_project: { id: p.id || null, title: title.value, body: body.value, status: status.value, cover: cover.value,
          color: color.value, due_date: due.value || null, member_cap: cap.value || null, tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean) } });
        H.toast(p.id ? "Saved." : "Project created.", "ok");
        await refreshBoard();
        openProject(r.id);
      } catch (err) { H.fail(err); save.disabled = false; }
    });
    openId = null;
    H.drawer.open({ title: p.id ? "Edit project" : "New project", body: f });
  }

  async function refreshBoard() {
    try { await loadList(); if (mainNode && mainNode.isConnected) paint(mainNode); } catch (e) { /* keep what's there */ }
  }

  H.register({
    id: "projects", title: "Projects", short: "Projects", icon: "folder", min: "helper", tab: true,
    async render(main, ctx) {
      mainNode = main;
      await loadList();
      paint(main);
      if (ctx && ctx.sub) openProject(ctx.sub);
      return () => { mainNode = null; };
    },
    poll: async () => { if (!H.drawer.isOpen) await refreshBoard(); }
  });
})();
