/* Staff Hub: Overview. Bump timers, Clanker Relay, the moderation panel, what members say, and the team. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, fmt, C } = H;

  const WINDOWS = [["d1", "24h"], ["d7", "7 days"], ["d30", "30 days"], ["all", "Lifetime"]];
  const SPAN = { d1: 86400, d7: 7 * 86400, d30: 30 * 86400, all: Infinity };
  const STALE = 10 * 60 * 1000;
  const KINDS = [["bans", "Bans", "ban", "var(--danger)"], ["mutes", "Mutes", "volume-x", "var(--amber)"], ["warns", "Warns", "triangle-alert", "var(--violet-2)"],
    ["kicks", "Kicks", "door-open", "var(--magenta)"], ["quarantines", "Quarantines", "shield-check", "#8b93ff"], ["joins", "Invite joins", "user-plus", "var(--mint)"]];
  // Sent to the team by members. The whole team's, not one person's.
  const REVIEWS = [  // word for word, as members sent them
    "I don't talk much in this server, usually because I'm too fucked up to speak, but I have found appreciation for it. someones always on when I'm alone\n\nfw the server",
    "I love yall, yall have been good to me and everyone I’ve seen join. I like that yall care for every individual person. It don’t have to be anonymous btw. This is a welcoming place for those whom will try and be the way the server asks of them, and I think that’s why it’s addictive. Because it’s a good place for all those whom need others around them.",
    "i’m so happy to have a safe and vibrant space with so many cool individuals! Bc of the owners/staff, i always know it’ll be a pretty good time with good vibes. The bottom line is that we all been vetted to some degree and all wanna chill instead of being wrapped up in bullshit"
  ];

  let data = null, win = "d7", skew = 0, key = "";
  try { win = localStorage.getItem("eg-hub-win") || "d7"; } catch (e) { /* default */ }
  if (!SPAN[win]) win = "d7";

  async function load() {
    const d = await H.rpc("hub_overview");
    const now = H.toDate(d.server_now);
    if (now) skew = now.getTime() - Date.now();
    return d;
  }
  const fresh = (at) => !!at && Date.now() - H.toDate(at).getTime() < STALE;

  /* ---------- bump timers ---------- */
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const two = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + two(m) + ":" + two(sec) : two(m) + ":" + two(sec);
  }
  function bumpCard(svc, stale) {
    const card = el("section", { class: "panel inst", "aria-label": svc.name + " bump timer" });
    const time = el("p", { class: "bump-clock", role: "timer", "aria-live": "off" });
    const bar = el("i");
    const left = el("span"), right = el("span");
    const btn = el("a", { class: "btn btn-ok", href: C.BUMP_CHANNEL_URL || "#", target: "_blank", rel: "noopener" }, [ic("rocket"), "Bump in Discord"]);
    const every = svc.cooldown >= 60 ? "every " + (svc.cooldown / 60) + "h" : "every " + svc.cooldown + "m";
    card.append(el("span", { class: "radar", "aria-hidden": "true" }), ic("chevrons-up", "rise-wm"),
      el("div", { class: "inst-top" }, [el("span", { class: "inst-name" }, [ic("timer"), svc.name]),
        stale ? el("span", { class: "pill p-review" }, [ic("triangle-alert"), "Bot offline"]) : el("span", { class: "tag", text: every })]),
      time, el("div", { class: "bump-bar", "aria-hidden": "true" }, bar), el("div", { class: "bump-meta" }, [left, right]), btn);
    H.tilt(card, 2.5);
    let wasReady = null;
    function tick() {
      const now = Date.now() + skew;
      const due = (svc.due || 0) * 1000;
      const remain = due - now;
      const ready = !due || remain <= 0;
      if (ready !== wasReady) {
        card.classList.toggle("ready", ready);
        btn.hidden = !ready;
        wasReady = ready;
      }
      if (ready) {
        if (time.textContent !== "Bump ready") time.textContent = "Bump ready";
        bar.style.setProperty("--p", "100%");
      } else {
        time.textContent = clock(remain);
        const total = (svc.cooldown || 1) * 60000;
        bar.style.setProperty("--p", Math.min(100, Math.max(0, (1 - remain / total) * 100)).toFixed(1) + "%");
      }
      const last = due ? due - (svc.cooldown || 0) * 60000 : 0;
      const lt = last ? "Last bumped " + H.ago(last) : "No bump seen yet";
      if (left.textContent !== lt) left.replaceChildren(ic("clock"), lt);
      const rt = stale ? "Bot offline, timer may be stale" : ready ? "Go go go" : "Ready at " + H.fmtDateTime(due);
      if (right.textContent !== rt) { right.textContent = rt; right.className = stale ? "stale" : ""; }
    }
    tick();
    return { node: card, tick: tick };
  }
  function relayCard() {
    const card = el("section", { class: "panel inst relay", "aria-label": "Clanker Relay" }, [
      el("span", { class: "relay-bg", "aria-hidden": "true" }),
      H.art.relay ? H.art.relay() : null,
      el("div", { class: "relay-copy" }, [
        el("div", { class: "inst-top" }, el("span", { class: "inst-name" }, [ic("radio"), "Clanker Relay"])),
        el("h3", { text: "Clanker Relay" }),
        el("p", { text: "The team's relay tool. Opens in a new tab." }),
        el("a", { class: "btn btn-primary", href: C.CLANKER_RELAY_URL || "#", target: "_blank", rel: "noopener" }, ["Open Clanker Relay", ic("external-link")]),
        el("p", { class: "credit" }, [el("img", { src: "/assets/staff/heavinly-64.webp", srcset: "/assets/staff/heavinly-128.webp 2x", alt: "", width: "26", height: "26" }),
          "Made by Heavinly"])
      ])
    ]);
    return card;
  }

  /* ---------- the moderation panel ---------- */
  function trackFrom(stats) {
    const t = (stats && stats.tracking) || {};
    return t.history_from || t.actions || null;
  }
  function since(stats, w) {
    const from = trackFrom(stats);
    if (!from) return null;
    const start = Date.now() / 1000 - SPAN[w];
    return from > start ? from : null;          // the window reaches back before tracking began
  }
  function notesFor(stats) {
    const t = (stats && stats.tracking) || {};
    const notes = [];
    if (!stats) notes.push("Mod numbers show up once the bot update is running.");
    else {
      if (t.history_from) notes.push("Counting from " + H.fmtDate(t.history_from) + ".");
      else if (t.actions) notes.push("Tracking since " + H.fmtDate(t.actions) + ". Owners can run /modbackfill in Discord to load older actions.");
      if (t.invites) notes.push("Invite joins before " + H.fmtDate(t.invites) + " are approximate.");
      notes.push("Bans include tempbans. Mutes are timeouts.");
    }
    return notes.join(" ");
  }

  /* ---------- team ---------- */
  function sinceLines(p, stats) {
    if (p.since) return ["Staff since " + H.fmtDate(p.since), H.plural(H.daysSince(p.since), "day")];
    const floor = stats && stats.tracking && stats.tracking.since_floor;
    return [floor ? "Staff before " + H.fmtDate(floor) : "Staff since: not known yet", null];
  }
  function countsFor(stats, id, w) {
    return (stats && stats.staff && stats.staff[id] && stats.staff[id][w]) || null;
  }
  function mateCard(p, stats, slots) {
    const num = (k) => { const b = el("b", { text: "–" }); slots[k] = b; return b; };
    const [l1, l2] = sinceLines(p, stats);
    const box = (k, label, iconName, color) => el("div", { style: "--nc:" + color }, [el("div", { class: "top" }, [ic(iconName), num(k)]), el("small", { text: label })]);
    const card = el("button", { type: "button", class: "mate tier-" + p.tier, style: "--tc:" + H.TIER_COLOR[p.tier], "aria-label": (p.name || "Staff") + ", " + H.TIER_NAME[p.tier] + ". Open profile" }, [
      el("span", { class: "mate-art", "aria-hidden": "true" }),
      el("div", { class: "mate-head" }, [H.ring(H.avatar(p, 58)), el("div", { class: "mate-name" }, [H.nameEl(p), el("span", { text: "@" + (p.username || "") })])]),
      el("div", { class: "mate-meta" }, [H.tierBadge(p.tier), el("div", { class: "mate-since" }, [el("span", null, [ic("calendar"), l1]), l2 ? el("span", null, [ic("calendar-days"), l2]) : null])]),
      el("div", { class: "mate-nums" }, [box("bans", "Bans", "ban", "var(--danger)"), box("mutes", "Mutes", "volume-x", "var(--amber)"), box("warns", "Warns", "triangle-alert", "var(--violet-2)")]),
      el("div", { class: "mate-sec" }, [el("span", null, [num("kicks"), "kicks"]), el("span", null, [num("quarantines"), "quarantines"]), el("span", null, [num("joins"), "invite joins"])]),
      el("div", { class: "mate-foot" }, [
        el("span", { class: "proj" }, [ic("folder"), el("b", { text: fmt(p.projects || 0) }), (p.projects === 1 ? "project" : "projects")]),
        el("span", { class: "reviews-soon", title: "Reviews are coming soon" }, [
          el("span", { class: "rb", "aria-hidden": "true" }, ic("thumbs-up")), el("span", { class: "rb", "aria-hidden": "true" }, ic("thumbs-down")), "Coming soon"])
      ])
    ]);
    card.addEventListener("click", () => profile(p));
    return H.tilt(card, 5);
  }

  async function profile(p) {
    const stats = data && data.stats;
    const [l1, l2] = sinceLines(p, stats);
    const table = el("table", { class: "wtable" }, [
      el("thead", null, el("tr", null, [el("th", { text: "" })].concat(WINDOWS.map(([, l]) => el("th", { text: l }))))),
      el("tbody", null, KINDS.map(([k, label]) => el("tr", null, [el("td", { text: label })].concat(WINDOWS.map(([w]) => {
        const c = countsFor(stats, p.id, w);
        return el("td", { text: c ? fmt(c[k]) : "–" });
      })))))
    ]);
    const projectsBox = el("div", { class: "stack-v" }, el("p", { class: "muted", text: "Loading projects…" }));
    const body = [
      el("div", { class: "prof-head tier-" + p.tier, style: "--tc:" + H.TIER_COLOR[p.tier] + ";--art:url(/assets/staff/art/tier-" + p.tier + ".webp)" }, [
        el("span", { class: "mate-art", "aria-hidden": "true" }),
        H.ring(H.avatar(p, 72), H.TIER_COLOR[p.tier]),
        el("div", { style: "display:grid;gap:6px;justify-items:start" }, [H.nameEl(p), el("span", { class: "muted", text: "@" + (p.username || "") }), H.tierBadge(p.tier)])]),
      el("dl", { class: "kv" }, [
        el("dt", { text: "Tenure" }), el("dd", { text: [l1, l2].filter(Boolean).join(", ") + (p.since_src === "set" ? " (set by an owner)" : "") }),
        p.joined ? el("dt", { text: "In the server" }) : null, p.joined ? el("dd", { text: "since " + H.fmtDate(p.joined) }) : null
      ]),
      el("div", null, [el("h3", { text: "Moderation" }), table, el("p", { class: "faint", text: "Counts only. Staff aren't ranked by these: the Code asks for proportionate enforcement." })]),
      el("div", null, [el("h3", { text: "Projects" }), projectsBox])
    ];
    if (H.can("owner")) body.push(sinceForm(p));
    H.drawer.open({ title: p.name || "Staff", body: body });
    try {
      const [active, archived] = await Promise.all([H.rpc("hub_projects", { p_archived: false }), H.rpc("hub_projects", { p_archived: true })]);
      const mine = active.concat(archived).filter((x) => (x.members || []).some((m) => m.id === p.id));
      projectsBox.replaceChildren(...(mine.length ? mine.map((x) => el("a", { class: "nav-item", href: "#projects/" + x.id, onclick: () => H.drawer.close() },
        [el("span", { text: x.cover || "📁" }), el("span", { text: x.title }), x.archived ? el("span", { class: "pill p-muted", text: "Archived" }) : null]))
        : [el("p", { class: "muted", text: "Not in any projects yet." })]));
    } catch (e) { projectsBox.replaceChildren(el("p", { class: "muted", text: e.message })); }
  }
  function sinceForm(p) {
    const inp = el("input", { class: "inp", type: "date", max: new Date().toISOString().slice(0, 10), value: p.since ? new Date(p.since * 1000).toISOString().slice(0, 10) : "" });
    const save = el("button", { type: "submit", class: "btn btn-sm btn-ice" }, [ic("check"), "Save"]);
    const clear = el("button", { type: "button", class: "btn btn-sm btn-ghost" }, [ic("refresh-cw"), "Use the bot's date"]);
    const form = el("form", { class: "form-grid" }, [
      el("h3", { text: "Staff since (owners)" }),
      el("p", { class: "faint", style: "margin:0", text: "For anyone who was staff before the bot started tracking. Their tenure uses this date." }),
      el("label", { class: "field" }, [el("span", { text: "Date" }), inp]),
      el("div", { class: "rv-acts", style: "display:flex;gap:8px;flex-wrap:wrap" }, [save, clear])
    ]);
    async function set(v) {
      try { await H.rpc("hub_set_staff_since", { p_discord_id: p.id, p_since: v }); H.toast("Saved.", "ok"); H.drawer.close(); refresh(true); }
      catch (e) { H.fail(e); }
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); if (inp.value) set(inp.value); });
    clear.addEventListener("click", () => set(null));
    return form;
  }

  /* ---------- render ---------- */
  let mainNode = null, bumps = [], timer = null, refs = null;
  function paint(main) {
    const d = data;
    const stale = !fresh(d.bump_at);
    const services = (d.bump && d.bump.services) || [];
    bumps = services.map((s) => bumpCard(s, stale));
    refs = { tiles: {}, mates: new Map() };

    const status = el("span", { class: "status-pill" }, [el("span", { class: "dot" }), el("span")]);
    refs.status = status;
    const segWin = H.seg(WINDOWS.map(([v, label]) => ({ value: v, label: label })), win, (w) => {
      win = w;
      try { localStorage.setItem("eg-hub-win", w); } catch (e) { /* fine */ }
      update();
    }, { label: "Time window" });

    const tiles = KINDS.map(([k, label, iconName, color]) => {
      const v = el("span", { class: "v", text: "–" }), sub = el("span", { class: "sub" });
      refs.tiles[k] = { v: v, sub: sub };
      return el("div", { class: "tile", style: "--tc:" + color }, [el("span", { class: "k" }, [ic(iconName), label]), v, sub, ic(iconName, "wm")]);
    });
    refs.foot = el("span");
    refs.teamNote = el("span", { class: "p-note" });

    main.replaceChildren(
      H.secHead({ title: "Mission control", sub: "Welcome back, " + (H.me.name || "you") + ". Everything live, in one place.", right: [status] }),
      el("div", { class: "instruments" }, bumps.map((b) => b.node).concat(services.length ? [] : [
        el("section", { class: "panel inst" }, [el("div", { class: "inst-top" }, el("span", { class: "inst-name" }, [ic("timer"), "Bump timer"])),
          el("p", { class: "muted", style: "margin-top:16px", text: "Waiting for the bot to send the bump times." })])
      ]).concat([relayCard()])),
      el("section", { class: "panel modpanel", "aria-labelledby": "mod-title" }, [
        H.pHead({ icon: "shield-half", title: "Moderation", id: "mod-title", sub: "Keep the community safe, clean, and thriving.", right: segWin }),
        el("div", { class: "tiles" }, tiles),
        el("p", { class: "modpanel-foot" }, [ic("info"), refs.foot])
      ]),
      el("section", { class: "panel quotes-panel", "aria-labelledby": "rv-title" }, [
        H.pHead({ icon: "message-circle", title: "What members say", id: "rv-title", sub: "Real words from real people. This is why we do it.", right: el("span", { class: "p-note", text: "Sent to the whole team" }) }),
        el("div", { class: "quotes" }, REVIEWS.map((q) => el("blockquote", { class: "quote" }, [ic("quote", "qmark"), el("p", { text: "“" + q + "”" }),
          el("footer", null, [el("img", { src: "/assets/home/eg-mark.webp", alt: "", width: "28", height: "28" }), "A member"])])))
      ]),
      el("section", { class: "team-block", "aria-labelledby": "team-title" }, [
        el("div", { class: "team-head" }, [H.art.mark ? H.art.mark() : null, el("h2", { id: "team-title" }, ["The ", el("span", { class: "grad-pink", text: "team" })]),
          el("span", { class: "rule", "aria-hidden": "true" }), refs.teamNote]),
        (d.roster || []).length ? el("div", { class: "team" }, d.roster.map((p) => { const slots = {}; refs.mates.set(p.id, slots); return mateCard(p, d.stats, slots); }))
          : H.empty({ icon: "users", title: "No crew yet", text: "The bot hasn't sent the staff list yet." })
      ])
    );
    window.egIcons && window.egIcons(main);
    update(true);
  }

  /* numbers change in place, gliding to their new values */
  function update() {
    if (!refs) return;
    const d = data, stats = d.stats;
    const team = (stats && stats.team && stats.team[win]) || null;
    const from = since(stats, win);
    for (const [k] of KINDS) {
      const t = refs.tiles[k];
      if (team) H.countTo(t.v, team[k]); else t.v.textContent = "–";
      t.sub.textContent = from ? "since " + H.fmtDate(from) : "";
    }
    refs.foot.textContent = notesFor(stats);
    for (const [id, slots] of refs.mates) {
      const c = countsFor(stats, id, win);
      for (const k in slots) { if (c) H.countTo(slots[k], c[k]); else slots[k].textContent = "–"; }
    }
    refs.teamNote.textContent = "By tier, then time on staff · " + WINDOWS.find((w) => w[0] === win)[1];
    const live = fresh(d.stats_at) && fresh(d.bump_at);
    refs.status.classList.toggle("warn", !live);
    refs.status.lastChild.textContent = live ? "All systems nominal" : "Waiting for the bot";
  }
  async function refresh(force) {
    const d = await load();
    const k = JSON.stringify([d.roster, d.bump, d.bump_at && fresh(d.bump_at)]);
    data = d;
    if (!mainNode || !mainNode.isConnected) return;
    if (force || k !== key) { key = k; paint(mainNode); }
    else update();
  }

  H.register({
    id: "overview", title: "Overview", short: "Overview", icon: "layout-dashboard", min: "helper", tab: true,
    async render(main) {
      mainNode = main;
      data = await load();
      key = JSON.stringify([data.roster, data.bump, data.bump_at && fresh(data.bump_at)]);
      paint(main);
      clearInterval(timer);
      timer = setInterval(() => bumps.forEach((b) => b.tick()), 1000);
      return () => { clearInterval(timer); mainNode = null; refs = null; };
    },
    poll: () => refresh(false)
  });
})();
