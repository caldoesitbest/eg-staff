/* Staff Hub: the road map, drawn as a flight path. Shipped, then in progress (where the rocket is), then planned. Owners edit. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic } = H;
  const NS = "http://www.w3.org/2000/svg";
  const STATUS = { shipped: ["Shipped", "p-ok"], progress: ["In progress", "p-review"], planned: ["Planned", "p-muted"] };
  const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const monthText = (d) => (d ? MONTH.format(new Date(d + "T00:00:00Z")) : "");

  let items = [], mainNode = null, ro = null;

  function svg(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* the route: a gentle S through every waypoint's middle, lit up to where we are */
  function drawPath(flight, svgEl, cards) {
    const box = flight.getBoundingClientRect();
    const h = flight.scrollHeight;
    svgEl.setAttribute("viewBox", "0 0 70 " + h);
    svgEl.setAttribute("height", h);
    svgEl.replaceChildren();
    if (!cards.length) return;
    const pts = cards.map((c, i) => {
      const r = c.getBoundingClientRect();
      return [i % 2 ? 50 : 22, r.top - box.top + r.height / 2];
    });
    const start = [36, 0], end = [36, h];
    const all = [start].concat(pts, [end]);
    const seg = (a, b) => "C" + a[0] + " " + (a[1] + (b[1] - a[1]) * 0.5) + " " + b[0] + " " + (b[1] - (b[1] - a[1]) * 0.5) + " " + b[0] + " " + b[1];
    let d = "M" + start[0] + " " + start[1];
    for (let i = 1; i < all.length; i++) d += seg(all[i - 1], all[i]);
    const defs = svg("defs", {}, svgEl);
    const g = svg("linearGradient", { id: "fp-lit", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    svg("stop", { offset: "0", "stop-color": "#73ffce" }, g);
    svg("stop", { offset: "1", "stop-color": "#63f4ff" }, g);
    svg("path", { d: d, fill: "none", stroke: "rgba(150,170,255,.28)", "stroke-width": "2", "stroke-dasharray": "4 7", "stroke-linecap": "round" }, svgEl);
    // lit up to "now": the first in-progress waypoint, or the last shipped one
    let nowIdx = items.findIndex((x) => x.status === "progress");
    if (nowIdx < 0) nowIdx = items.map((x) => x.status).lastIndexOf("shipped");
    if (nowIdx >= 0) {
      let lit = "M" + start[0] + " " + start[1];
      for (let i = 1; i <= nowIdx + 1; i++) lit += seg(all[i - 1], all[i]);
      svg("path", { d: lit, fill: "none", stroke: "url(#fp-lit)", "stroke-width": "3", "stroke-linecap": "round", style: "filter:drop-shadow(0 0 6px rgba(115,255,206,.6))" }, svgEl);
    }
    pts.forEach((p, i) => {
      const s = items[i].status;
      svg("circle", { cx: p[0], cy: p[1], r: s === "progress" ? 7 : 5.5,
        fill: s === "shipped" ? "#73ffce" : s === "progress" ? "#ffc861" : "#0b1029",
        stroke: s === "planned" ? "rgba(150,170,255,.5)" : "none", "stroke-width": "2" }, svgEl);
    });
    // the rocket, at "now", nose pointing down the route
    if (nowIdx >= 0) {
      const p = pts[nowIdx];
      const ship = svg("g", { transform: "translate(" + (p[0] + (nowIdx % 2 ? -26 : 26)) + " " + (p[1] - 2) + ") rotate(180) scale(.42)" }, svgEl);
      svg("ellipse", { cx: "0", cy: "34", rx: "9", ry: "16", fill: "#ff42d0", opacity: ".55" }, ship);
      svg("path", { d: "M0 -36 C10 -26 14 -8 13 12 L11 30 H-11 L-13 12 C-14 -8 -10 -26 0 -36 Z", fill: "#f5f0e6", stroke: "#10132e", "stroke-width": "3" }, ship);
      svg("path", { d: "M-12 10 L-22 30 L-11 24 Z M12 10 L22 30 L11 24 Z", fill: "#a855f7", stroke: "#10132e", "stroke-width": "2.5" }, ship);
      svg("circle", { cx: "0", cy: "-6", r: "6", fill: "#36dfff", stroke: "#10132e", "stroke-width": "2.5" }, ship);
    }
  }

  function card(item, i) {
    const [label, cls] = STATUS[item.status] || STATUS.planned;
    const c = el("button", { type: "button", class: "wp " + item.status, "aria-label": item.title + ", " + label }, [
      el("span", { class: "t" }, [el("b", { text: item.title }), el("span", { class: "pill " + cls, text: label })]),
      item.body ? el("p", { text: item.body }) : null,
      el("span", { class: "meta" }, [item.target_month ? el("span", null, [ic("calendar"), " " + monthText(item.target_month)]) : null,
        item.project ? el("span", null, [ic("folder"), " " + item.project]) : null])
    ]);
    c.addEventListener("click", () => open(item, i));
    return c;
  }

  function open(item, i) {
    const [label, cls] = STATUS[item.status] || STATUS.planned;
    const body = [
      el("div", { class: "who" }, [el("span", { class: "pill " + cls, text: label }), item.target_month ? el("span", { class: "muted", text: "Target: " + monthText(item.target_month) }) : null]),
      item.body ? el("p", { text: item.body }) : el("p", { class: "muted", text: "No description." }),
      item.project_id ? el("a", { class: "btn btn-sm", href: "#projects/" + item.project_id, onclick: () => H.drawer.close() }, [ic("folder"), "Open the project: " + item.project]) : null
    ];
    if (H.can("owner")) {
      const same = items.filter((x) => x.status === item.status);
      const k = same.indexOf(item);
      body.push(el("div", { class: "rv-acts" }, [
        el("button", { type: "button", class: "btn btn-sm", onclick: () => form(item) }, [ic("pencil"), "Edit"]),
        el("button", { type: "button", class: "btn btn-sm", disabled: k <= 0, onclick: () => move(item, -1) }, [ic("arrow-up"), "Earlier"]),
        el("button", { type: "button", class: "btn btn-sm", disabled: k >= same.length - 1, onclick: () => move(item, 1) }, [ic("arrow-down"), "Later"]),
        el("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => remove(item) }, [ic("trash-2"), "Delete"])
      ]));
    }
    H.drawer.open({ title: item.title, body: body });
  }

  async function move(item, dir) {
    const same = items.filter((x) => x.status === item.status);
    const k = same.indexOf(item);
    const j = k + dir;
    if (j < 0 || j >= same.length) return;
    [same[k], same[j]] = [same[j], same[k]];
    try { await H.rpc("hub_roadmap_order", { p_ids: same.map((x) => x.id) }); H.drawer.close(); await reload(); }
    catch (e) { H.fail(e); }
  }
  async function remove(item) {
    const ok = await H.confirm({ title: "Delete \"" + item.title + "\"?", body: ["It comes off the road map for everyone. This can't be undone."], ok: "Delete", danger: true });
    if (!ok) return;
    try { await H.rpc("hub_roadmap_delete", { p_id: item.id }); H.toast("Deleted.", "ok"); H.drawer.close(); await reload(); }
    catch (e) { H.fail(e); }
  }

  async function form(item) {
    item = item || {};
    let projects = [];
    try { projects = await H.rpc("hub_projects", { p_archived: false }); } catch (e) { /* the list just stays empty */ }
    const title = el("input", { class: "inp", maxlength: 80, required: true, value: item.title || "" });
    const bodyTa = el("textarea", { class: "ta", rows: 3, maxlength: 400 });
    bodyTa.value = item.body || "";
    const status = el("select", { class: "sel" }, Object.entries(STATUS).map(([k, [l]]) => el("option", { value: k, text: l, selected: (item.status || "planned") === k })));
    const month = el("input", { class: "inp", type: "month", value: item.target_month ? item.target_month.slice(0, 7) : "" });
    const proj = el("select", { class: "sel" }, [el("option", { value: "", text: "None" })]
      .concat(projects.map((p) => el("option", { value: p.id, text: p.title, selected: item.project_id === p.id }))));
    const save = el("button", { type: "submit", class: "btn btn-primary" }, item.id ? "Save" : "Add to the road map");
    const f = el("form", { class: "form-grid" }, [
      el("label", { class: "field" }, [el("span", { text: "Title" }), title]),
      el("label", { class: "field" }, [el("span", { text: "Short description" }), bodyTa]),
      el("div", { class: "form-row" }, [el("label", { class: "field" }, [el("span", { text: "Status" }), status]),
        el("label", { class: "field" }, [el("span", { text: "Target month" }), month])]),
      el("label", { class: "field" }, [el("span", { text: "Linked project" }), proj]),
      save
    ]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await H.rpc("hub_roadmap_save", { p_item: { id: item.id || null, title: title.value, body: bodyTa.value, status: status.value,
          target_month: month.value ? month.value + "-01" : null, project_id: proj.value || null } });
        H.toast("Saved.", "ok"); H.drawer.close(); await reload();
      } catch (err) { H.fail(err); save.disabled = false; }
    });
    H.drawer.open({ title: item.id ? "Edit waypoint" : "New waypoint", body: f });
  }

  async function reload() {
    items = await H.rpc("hub_roadmap");
    if (mainNode && mainNode.isConnected) paint(mainNode);
  }

  function paint(main) {
    const flight = el("div", { class: "flight" });
    const svgEl = svg("svg", { class: "flight-svg", "aria-hidden": "true", width: "70" });
    const cards = items.map(card);
    flight.append(svgEl, ...cards);
    main.replaceChildren(
      el("div", { class: "sec-head" }, [el("div", null, [el("h1", { text: "Road map" }),
        el("p", { text: H.can("owner") ? "Where the server's heading. Tap a waypoint to edit it." : "Where the server's heading. Owners steer." })]),
        H.can("owner") ? el("div", { class: "sec-acts" }, el("button", { type: "button", class: "btn btn-primary", onclick: () => form(null) }, [ic("plus"), "Add a waypoint"])) : null]),
      el("div", { class: "flight-legend" }, [el("span", { class: "pill p-ok", text: "Shipped" }), el("span", { class: "pill p-review", text: "In progress" }),
        el("span", { class: "pill p-muted", text: "Planned" })]),
      items.length ? flight : el("div", { class: "empty" }, [ic("map"), el("p", { text: H.can("owner") ? "Nothing on the road map yet. Add the first waypoint." : "Nothing on the road map yet." })])
    );
    window.egIcons && window.egIcons(main);
    const redraw = () => drawPath(flight, svgEl, cards);
    requestAnimationFrame(redraw);
    if (ro) ro.disconnect();
    if ("ResizeObserver" in window) { ro = new ResizeObserver(() => requestAnimationFrame(redraw)); ro.observe(flight); }
  }

  H.register({
    id: "roadmap", title: "Road map", short: "Road map", icon: "map", min: "helper",
    async render(main) {
      mainNode = main;
      items = await H.rpc("hub_roadmap");
      paint(main);
      return () => { mainNode = null; if (ro) ro.disconnect(); };
    },
    poll: async () => { if (!H.drawer.isOpen) await reload(); }
  });
})();
