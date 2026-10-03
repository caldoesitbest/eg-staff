/* Staff Hub: Overview. Bump timers, Clanker Relay, the moderation panel, what members say, and the team. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic, fmt, C } = H;

  const WINDOWS = [["d1", "24h"], ["d7", "7 days"], ["d30", "30 days"], ["all", "Lifetime"]];
  const SPAN = { d1: 86400, d7: 7 * 86400, d30: 30 * 86400, all: Infinity };
  const STALE = 10 * 60 * 1000;
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

  /* ---------- bump timers ---------- */
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const two = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + two(m) + ":" + two(sec) : two(m) + ":" + two(sec);
  }
  function bumpCard(svc, stale) {
    const card = el("section", { class: "inst", "aria-label": svc.name + " bump timer" });
    const time = el("p", { class: "bump-clock", role: "timer", "aria-live": "off" });
    const bar = el("i");
    const meta = el("div", { class: "bump-meta" });
    const btn = el("a", { class: "btn btn-ok", href: C.BUMP_CHANNEL_URL || "#", target: "_blank", rel: "noopener" }, [ic("rocket"), "Bump in Discord"]);
    card.append(el("div", { class: "inst-top" }, [el("span", { class: "inst-name" }, [ic("timer"), svc.name]),
      stale ? el("span", { class: "pill p-review" }, [ic("triangle-alert"), "Bot offline"]) : el("span", { class: "pill p-muted", text: "every " + (svc.cooldown >= 60 ? (svc.cooldown / 60) + "h" : svc.cooldown + "m") })]),
    time, el("div", { class: "bump-bar", "aria-hidden": "true" }, bar), meta, btn);
    let wasReady = null;
    function tick() {
      const now = Date.now() + skew;
      const due = (svc.due || 0) * 1000;
      const left = due - now;
      const ready = !due || left <= 0;
      if (ready !== wasReady) {
        card.classList.toggle("ready", ready);
        btn.hidden = !ready;
        wasReady = ready;
      }
      if (ready) {
        time.replaceChildren("Bump ready");
        bar.style.setProperty("--p", "100%");
      } else {
        time.replaceChildren(clock(left));
        const total = (svc.cooldown || 1) * 60000;
        bar.style.setProperty("--p", Math.min(100, Math.max(0, (1 - left / total) * 100)).toFixed(1) + "%");
      }
      const last = due ? due - (svc.cooldown || 0) * 60000 : 0;
      meta.replaceChildren(
        el("span", { text: last ? "Last bumped " + H.ago(last) : "No bump seen yet" }),
        stale ? el("span", { class: "stale", text: "Bot offline, timer may be stale" }) : el("span", { text: ready ? "Go go go" : "Ready at " + H.fmtDateTime(due) }));
    }
    tick();
    return { node: card, tick: tick };
  }
  function relayCard() {
    return el("section", { class: "inst relay", "aria-label": "Clanker Relay" }, [
      el("div", null, [
        el("div", { class: "inst-top" }, el("span", { class: "inst-name" }, [ic("radio"), "Clanker Relay"])),
        el("h3", { text: "Clanker Relay" }),
        el("p", { text: "The team's relay tool. Opens in a new tab." })
      ]),
      el("div", null, [
        el("a", { class: "btn btn-primary", href: C.CLANKER_RELAY_URL || "#", target: "_blank", rel: "noopener", style: "width:100%;margin-top:14px" },
          ["Open Clanker Relay", ic("external-link")]),
        el("p", { class: "credit" }, [el("img", { src: "/assets/staff/heavinly-64.webp", srcset: "/assets/staff/heavinly-128.webp 2x", alt: "", width: "24", height: "24" }),
          "Made by Heavinly"])
      ])
    ]);
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
  function segToggle(onPick) {
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Time window" });
    for (const [k, label] of WINDOWS) {
      seg.append(el("button", { type: "button", "aria-pressed": String(k === win), "data-win": k, onclick: () => onPick(k) }, label));
    }
    return seg;
  }
  function modPanel(stats, statsAt, onPick) {
    const team = (stats && stats.team && stats.team[win]) || null;
    const live = statsAt && Date.now() - H.toDate(statsAt).getTime() < STALE;
    const from = since(stats, win);
    const sub = from ? "since " + H.fmtDate(from) : "";
    const tile = (k, label, iconName, color, small) => el("div", { class: "tile" + (small ? " small" : ""), style: "--tc:" + color }, [
      el("span", { class: "k" }, [ic(iconName), label]),
      el("span", { class: "v", text: team ? fmt(team[k]) : "–" }),
      el("span", { class: "sub", text: sub || " " })
    ]);
    const t = (stats && stats.tracking) || {};
    const notes = [];
    if (!stats) notes.push("Mod numbers show up once the bot update is running.");
    else {
      if (t.history_from) notes.push("Counting from " + H.fmtDate(t.history_from) + ".");
      else if (t.actions) notes.push("Tracking since " + H.fmtDate(t.actions) + ". Owners can run /modbackfill in Discord to load older actions.");
      if (t.invites) notes.push("Invite joins before " + H.fmtDate(t.invites) + " are approximate.");
      notes.push("Bans include tempbans. Mutes are timeouts.");
    }
    return el("section", { class: "modpanel", "aria-labelledby": "mod-title" }, [
      el("div", { class: "modpanel-head" }, [
        el("h2", { id: "mod-title" }, [el("span", { class: "live-dot" + (live ? "" : " off"), title: live ? "Live" : "Waiting for the bot" }), "Moderation"]),
        segToggle(onPick)
      ]),
      el("div", { class: "tiles" }, [
        tile("bans", "Bans", "ban", "var(--danger)"), tile("mutes", "Mutes", "clock", "var(--amber)"), tile("warns", "Warns", "triangle-alert", "var(--violet-2)"),
        tile("kicks", "Kicks", "door-open", "var(--magenta)", true), tile("quarantines", "Quarantines", "shield-check", "var(--lilac)", true),
        tile("joins", "Invite joins", "user-plus", "var(--mint)", true)
      ]),
      el("p", { class: "modpanel-foot", text: notes.join(" ") })
    ]);
  }

  /* ---------- team ---------- */
  function sinceLine(p, stats) {
    if (p.since) {
      const n = H.daysSince(p.since);
      return "Staff since " + H.fmtDate(p.since) + ", " + H.plural(n, "day");
    }
    const floor = stats && stats.tracking && stats.tracking.since_floor;
    return floor ? "Staff since before " + H.fmtDate(floor) : "Staff since: not known yet";
  }
  function countsFor(stats, id, w) {
    return (stats && stats.staff && stats.staff[id] && stats.staff[id][w]) || null;
  }
  function mateCard(p, stats) {
    const c = countsFor(stats, p.id, win);
    const n = (k) => (c ? fmt(c[k]) : "–");
    const card = el("button", { type: "button", class: "mate", style: "--tc:var(--t-" + p.tier + ")", "aria-label": (p.name || "Staff") + ", " + H.TIER_NAME[p.tier] + ". Open profile" }, [
      el("div", { class: "mate-head" }, [H.avatar(p, 52), el("div", { class: "mate-name" }, [H.nameEl(p), el("span", { text: "@" + (p.username || "") })])]),
      el("div", { class: "who" }, [H.tierBadge(p.tier), el("span", { class: "mate-since", text: sinceLine(p, stats) })]),
      el("div", { class: "mate-nums" }, [
        el("div", null, [el("b", { text: n("bans") }), el("span", { text: "Bans" })]),
        el("div", null, [el("b", { text: n("mutes") }), el("span", { text: "Mutes" })]),
        el("div", null, [el("b", { text: n("warns") }), el("span", { text: "Warns" })])
      ]),
      el("div", { class: "mate-foot" }, [
        el("span", { class: "sec" }, [el("span", { text: n("kicks") + " kicks" }), el("span", { text: n("quarantines") + " quarantines" })]),
        el("span", { text: n("joins") + " invite joins" })
      ]),
      el("div", { class: "mate-foot" }, [
        el("span", { text: H.plural(p.projects || 0, "project") }),
        el("span", { class: "reviews-soon", title: "Reviews are coming soon" }, [
          el("button", { type: "button", disabled: true, "aria-label": "Thumbs up (coming soon)", tabindex: "-1" }, ic("thumbs-up")),
          el("button", { type: "button", disabled: true, "aria-label": "Thumbs down (coming soon)", tabindex: "-1" }, ic("thumbs-down")),
          "Coming soon"])
      ])
    ]);
    card.addEventListener("click", () => profile(p));
    return card;
  }

  async function profile(p) {
    const stats = data && data.stats;
    const table = el("table", { class: "wtable" }, [
      el("thead", null, el("tr", null, [el("th", { text: "" })].concat(WINDOWS.map(([, l]) => el("th", { text: l }))))),
      el("tbody", null, [["bans", "Bans"], ["mutes", "Mutes"], ["warns", "Warns"], ["kicks", "Kicks"], ["quarantines", "Quarantines"], ["joins", "Invite joins"]]
        .map(([k, label]) => el("tr", null, [el("td", { text: label })].concat(WINDOWS.map(([w]) => {
          const c = countsFor(stats, p.id, w);
          return el("td", { text: c ? fmt(c[k]) : "–" });
        })))))
    ]);
    const projectsBox = el("div", { class: "stack-v" }, el("p", { class: "muted", text: "Loading projects…" }));
    const body = [
      el("div", { class: "who" }, [H.avatar(p, 64), el("div", null, [H.nameEl(p), el("div", { class: "faint", text: "@" + (p.username || "") })])]),
      el("dl", { class: "kv" }, [
        el("dt", { text: "Tier" }), el("dd", null, H.tierBadge(p.tier)),
        el("dt", { text: "Tenure" }), el("dd", { text: sinceLine(p, stats) + (p.since_src === "set" ? " (set by an owner)" : "") }),
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
    const save = el("button", { type: "submit", class: "btn btn-sm" }, "Save");
    const clear = el("button", { type: "button", class: "btn btn-sm btn-ghost" }, "Use the bot's date");
    const form = el("form", { class: "form-grid" }, [
      el("h3", { text: "Staff since (owners)" }),
      el("p", { class: "faint", text: "For anyone who was staff before the bot started tracking. Their tenure uses this date." }),
      el("label", { class: "field" }, [el("span", { text: "Date" }), inp]),
      el("div", { class: "rv-acts" }, [save, clear])
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
  let mainNode = null, bumps = [], timer = null;
  function paint(main) {
    const d = data;
    const stale = !d.bump_at || Date.now() - H.toDate(d.bump_at).getTime() > STALE;
    const services = (d.bump && d.bump.services) || [];
    bumps = services.map((s) => bumpCard(s, stale));
    const pick = (w) => { win = w; try { localStorage.setItem("eg-hub-win", w); } catch (e) { /* fine */ } paint(main); };
    const focusWin = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.win;
    main.replaceChildren(
      el("div", { class: "sec-head" }, [el("div", null, [
        el("h1", { text: "Mission control" }),
        el("p", { text: "Welcome back, " + (H.me.name || "you") + ". Everything live, in one place." })])]),
      el("div", { class: "instruments" }, bumps.map((b) => b.node).concat(services.length ? [] : [
        el("section", { class: "inst" }, [el("span", { class: "inst-name" }, [ic("timer"), "Bump timer"]), el("p", { class: "muted", text: "Waiting for the bot to send the bump times." })])
      ]).concat([relayCard()])),
      el("div", { class: "block" }, modPanel(d.stats, d.stats_at, pick)),
      el("section", { class: "block", "aria-labelledby": "rv-title" }, [
        el("div", { class: "block-head" }, [el("h2", { id: "rv-title", text: "What members say" }), el("span", { class: "note", text: "Sent to the whole team" })]),
        el("div", { class: "quotes" }, REVIEWS.map((q) => el("blockquote", { class: "quote" }, [el("p", { text: "“" + q + "”" }), el("footer", { text: "A member" })])))
      ]),
      el("section", { class: "block", "aria-labelledby": "team-title" }, [
        el("div", { class: "block-head" }, [el("h2", { id: "team-title", text: "The team" }),
          el("span", { class: "note", text: "By tier, then time on staff · " + WINDOWS.find((w) => w[0] === win)[1] })]),
        (d.roster || []).length ? el("div", { class: "team" }, d.roster.map((p) => mateCard(p, d.stats)))
          : el("div", { class: "empty" }, [ic("users"), el("p", { text: "The bot hasn't sent the staff list yet." })])
      ])
    );
    window.egIcons && window.egIcons(main);
    if (focusWin) { const b = main.querySelector('[data-win="' + focusWin + '"]'); if (b) b.focus(); }
  }
  async function refresh(force) {
    const d = await load();
    const k = JSON.stringify([d.roster, d.stats, d.bump, d.stats_at && d.stats_at.slice(0, 15), d.bump_at && d.bump_at.slice(0, 15)]);
    data = d;
    if (force || k !== key) { key = k; if (mainNode && mainNode.isConnected) paint(mainNode); }
  }

  H.register({
    id: "overview", title: "Overview", short: "Overview", icon: "layout-dashboard", min: "helper", tab: true,
    async render(main) {
      mainNode = main;
      data = await load();
      key = "";
      paint(main);
      clearInterval(timer);
      timer = setInterval(() => bumps.forEach((b) => b.tick()), 1000);
      return () => { clearInterval(timer); mainNode = null; };
    },
    poll: () => refresh(false)
  });
})();
