/* Staff Hub: the shop (Envious Supply). Dashboard, products, drops and categories, orders, settings.
   Who sees and does what comes from the shop's own permissions (Settings -> Access), checked again in the database. */
(function () {
  "use strict";
  const H = window.HUB;
  if (!H) return;
  const { el, ic } = H;
  const EG = window.EG;
  const SHOP = (H.shop = H.shop || {});
  const ICONS = ["shopping-bag", "crown", "shirt", "sticker", "frame", "gem", "package", "box", "sparkles", "star", "flame", "rocket", "planet", "skull", "heart", "tag", "gift", "layers"];
  const PERMS = [["view", "Open the Shop tab", "See products, drops, settings and the dashboard"], ["edit", "Create and edit products", "Also duplicate, reorder and upload pictures"],
    ["publish", "Publish", "Publish, unpublish, archive and feature products"], ["inventory", "Manage stock", "Stock counts and marking things sold out"],
    ["catalog", "Categories and drops", "Create, edit and delete them"], ["delete", "Delete products", "Gone for good (archiving is under Publish)"],
    ["orders", "Orders", "See orders and support, update shipping"], ["revenue", "Revenue", "See money totals on the dashboard"], ["settings", "Shop settings", "Everything on the Settings tab"]];
  const TIERS = [["helper", "Helpers and up"], ["mod", "Mods and up"], ["admin", "Admins and up"], ["owner", "Owners only"]];
  const ORDER_ST = { paid: ["To ship", "p-review"], fulfilled: ["Shipped", "p-ok"], refunded: ["Refunded", "p-muted"], canceled: ["Canceled", "p-muted"] };

  let access = null, ov = null, products = [], catalog = { categories: [], collections: [] }, settings = null;
  let mainNode = null, tab = "dashboard", filter = "all", query = "", orders = [], orderFilter = "all";
  const money = (c) => SHOP.money(c, (ov && ov.currency) || (settings && settings.currency) || "USD");

  /* ---------- the tab shows only for people who can view the shop ---------- */
  const def = { id: "shop", title: "Shop", short: "Shop", icon: "shopping-bag", min: "helper", hidden: true, render: render, poll: poll };
  H.register(def);
  if (EG && EG.sb) {
    H.rpc("shop_my_access").then((a) => {
      access = a || {};
      def.hidden = !access.view;
      if (!H.me) return;                       // the hub's still booting; it draws the nav itself
      H.renderNav();
      const [id, sub] = location.hash.replace(/^#/, "").split("/");
      if (id === "shop" && !def.hidden && H.current !== "shop") H.show("shop", sub);
    }, () => { /* shop.sql not run yet: no tab */ });
  }

  function tabs() {
    const t = [{ value: "dashboard", label: "Dashboard", icon: "layout-dashboard" }, { value: "products", label: "Products", icon: "package" },
      { value: "catalog", label: "Drops & categories", icon: "layers" }];
    if (access.orders) t.push({ value: "orders", label: "Orders", icon: "receipt" });
    t.push({ value: "settings", label: "Settings", icon: "settings" });
    return t;
  }

  async function render(main, ctx) {
    mainNode = main;
    if (!access) access = await H.rpc("shop_my_access");
    if (!access.view) throw new Error("You don't have access to the shop.");
    const want = (ctx && ctx.sub) || "dashboard";
    tab = tabs().some((t) => t.value === want) ? want : "dashboard";
    await load(tab);
    paint();
    return () => { mainNode = null; };
  }
  async function load(which) {
    if (which === "dashboard") ov = await H.rpc("shop_admin_overview");
    if (which === "products" || which === "catalog") {
      const [p, c] = await Promise.all([which === "products" ? H.rpc("shop_admin_products") : Promise.resolve(products), H.rpc("shop_admin_catalog")]);
      products = p; catalog = c;
    }
    if (which === "orders") orders = await H.rpc("shop_admin_orders", {});
    if (which === "settings") { const [s, c] = await Promise.all([H.rpc("shop_admin_settings"), H.rpc("shop_admin_catalog")]); settings = s; catalog = c; }
    if (!ov && which !== "dashboard") H.rpc("shop_admin_overview").then((o) => { ov = o; }, () => { /* only the currency comes from here */ });
  }
  async function switchTab(v) {
    tab = v;
    history.replaceState(null, "", "#shop" + (v === "dashboard" ? "" : "/" + v));
    const body = mainNode && mainNode.querySelector(".ss-body");
    if (body) body.replaceChildren(el("div", { class: "sec-loading" }, el("span", { class: "loader" })));
    try { await load(v); } catch (e) { H.fail(e); }
    if (tab === v) paintBody();
  }

  function paint() {
    if (!mainNode) return;
    const seg = H.seg(tabs(), tab, switchTab, { label: "Shop sections", cls: "tabs" });
    mainNode.replaceChildren(
      H.secHead({ title: "Envious", accent: "Supply", sub: "The shop at /shop/: products, drops, stock and settings. Changes go live the moment you publish or save.",
        right: [el("a", { class: "btn btn-ghost", href: "/shop/", target: "_blank", rel: "noopener" }, [ic("store"), "Open the shop", ic("arrow-up-right")]),
          access.edit ? el("button", { type: "button", class: "btn btn-primary", onclick: () => newProduct() }, [ic("plus"), "New product"]) : null] }),
      el("div", { class: "ss-tabs" }, seg),
      el("div", { class: "ss-body" })
    );
    paintBody();
  }
  function paintBody() {
    const body = mainNode && mainNode.querySelector(".ss-body");
    if (!body) return;
    const view = { dashboard: dashboard, products: productsView, catalog: catalogView, orders: ordersView, settings: settingsView }[tab] || dashboard;
    body.replaceChildren(...[].concat(view()).filter(Boolean));
    window.egIcons && window.egIcons(body);
    H.reveal(body.children);
  }

  /* ---------- dashboard: only numbers the database actually has ---------- */
  function tile(label, iconName, color, value, sub, onClick) {
    const v = el("span", { class: "v", text: "–" });
    const t = el(onClick ? "button" : "div", { class: "tile" + (onClick ? " ss-tile-btn" : ""), type: onClick ? "button" : null, style: "--tc:" + color, onclick: onClick || null },
      [el("span", { class: "k" }, [ic(iconName), label]), v, el("span", { class: "sub", text: sub || "" }), ic(iconName, "wm")]);
    if (typeof value === "number") H.countTo(v, value); else v.textContent = value;
    return t;
  }
  function dashboard() {
    const o = ov, c = o.counts || {};
    const goList = (f) => () => { filter = f; switchTab("products"); };
    const pill = (on, yes, no, warn) => el("span", { class: "status-pill" + (on ? "" : " warn") }, [el("span", { class: "dot" }), el("span", { text: on ? yes : no })]);
    const out = [
      el("div", { class: "ss-status" }, [pill(o.mode === "open", "Storefront open", "Storefront sealed"), pill(o.checkout, "Checkout on", "Checkout off"), pill(o.support, "Support on", "Support off")]),
      el("section", { class: "panel modpanel" }, [
        H.pHead({ icon: "package", title: "Inventory", sub: "What's in the vault right now.", right: access.edit ? el("button", { type: "button", class: "btn btn-sm btn-ice", onclick: () => newProduct() }, [ic("plus"), "New product"]) : null }),
        el("div", { class: "tiles" }, [
          tile("Products", "package", "var(--cyan)", c.total || 0, (c.archived ? c.archived + " archived" : "not counting archived"), goList("all")),
          tile("Live", "radar", "var(--ok)", c.published || 0, "in the shop", goList("published")),
          tile("Drafts", "pencil", "var(--amber)", c.draft || 0, "not published", goList("draft")),
          tile("Sold out", "lock", "var(--danger)", c.out || 0, "live but sold out", goList("published")),
          tile("Low stock", "triangle-alert", "var(--pink)", c.low || 0, "5 or fewer left", goList("published")),
          tile("Featured", "star", "var(--lilac)", c.featured || 0, "in the spotlight", goList("published"))
        ]),
        el("p", { class: "modpanel-foot" }, [ic("layers"), el("span", { text: H.plural(o.categories || 0, "category", "categories") + " · " + H.plural(o.collections || 0, "drop") + ". " }),
          el("button", { type: "button", class: "linkish", onclick: () => switchTab("catalog") }, "Manage them")])
      ])
    ];
    if (o.orders || o.revenue) {
      const r = o.revenue, d = o.orders;
      const ts = [];
      if (d) ts.push(tile("Orders", "receipt", "var(--cyan)", d.orders || 0, d.last ? "last " + H.ago(d.last) : "none yet", access.orders ? () => switchTab("orders") : null),
        tile("To ship", "truck", "var(--amber)", d.to_ship || 0, "paid, not shipped", access.orders ? () => { orderFilter = "paid"; switchTab("orders"); } : null),
        tile("Support", "flame", "var(--pink)", d.support || 0, "contributions"));
      if (r) ts.push(tile("Sales · 30 days", "circle-dollar-sign", "var(--ok)", money(r.orders_30), money(r.orders_all) + " all time"),
        tile("Support · 30 days", "heart", "var(--pink)", money(r.support_30), money(r.support_all) + " all time"));
      out.push(el("section", { class: "panel modpanel" }, [
        H.pHead({ icon: "receipt", title: "Orders and support", sub: o.checkout ? "Paid through Stripe. Refunds come off when Stripe reports them." : "Checkout is off, so nothing can be paid for yet." }),
        el("div", { class: "tiles" }, ts)
      ]));
    }
    if (!o.checkout) {
      out.push(el("section", { class: "panel panel-pad ss-note" }, [ic("info"), el("div", null, [el("b", { text: "Checkout is off" }),
        el("p", { text: "Visitors can browse and fill a cart, and the shop tells them checkout opens soon. Taking payments needs Stripe connected (SHOP-SETUP.md, part 2); then an owner turns checkout on in Settings." })])]));
    }
    out.push(el("section", { class: "panel panel-pad" }, [H.h3("Recent changes", { icon: "history" }),
      (o.recent || []).length ? el("ol", { class: "activity ss-recent" }, o.recent.map((a) => el("li", null, [el("time", { text: H.ago(a.at) }),
        el("span", null, [el("b", { text: a.who || "Someone" }), " " + a.action + (a.title ? " “" + a.title + "”" : "")])])))
        : el("p", { class: "muted", text: "Nothing yet. Every change to the shop shows up here." })]));
    return out;
  }

  /* ---------- products ---------- */
  function stockText(p) {
    if (p.sold_out) return ["Sold out (by hand)", "out"];
    if (!p.in_stock) return ["Sold out", "out"];
    if (!p.track_stock) return ["Not counted", ""];
    return [p.left + " left", p.left <= 5 ? "low" : ""];
  }
  function productsView() {
    const counts = { all: products.length, published: 0, draft: 0, archived: 0 };
    products.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    const seg = H.seg([{ value: "all", label: "All", count: counts.all }, { value: "published", label: "Live", count: counts.published },
      { value: "draft", label: "Drafts", count: counts.draft }, { value: "archived", label: "Archived", count: counts.archived }], filter,
    (v) => { filter = v; paintList(); }, { label: "Show" });
    const search = el("input", { class: "inp", type: "search", placeholder: "Search by name, SKU, tag…", value: query, "aria-label": "Search products" });
    const list = el("div", { class: "ss-list", role: "list" });
    const note = el("p", { class: "ss-hint ss-order-note" });
    search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); paintList(); });
    function shown() {
      return products.filter((p) => filter === "all" || p.status === filter)
        .filter((p) => !query || (p.name + " " + p.slug + " " + (p.category || "") + " " + (p.collection || "")).toLowerCase().includes(query));
    }
    function paintList() {
      const rows = shown();
      const canOrder = access.edit && !query && filter === "all";
      note.textContent = products.length < 2 ? "" : canOrder ? "Drag the handle (or focus it and use the arrow keys) to set the order of the shop's Featured sort." : access.edit ? "Show All with no search to change the order." : "";
      if (!products.length) {
        list.replaceChildren(H.empty({ art: "inbox", title: "The vault is empty", text: access.edit ? "Add your first product: a name, a price, a picture, then Publish." : "No products yet.",
          action: access.edit ? el("button", { type: "button", class: "btn btn-primary", style: "margin-top:12px", onclick: () => newProduct() }, [ic("plus"), "New product"]) : null, panel: true }));
      } else if (!rows.length) {
        list.replaceChildren(el("p", { class: "muted ss-none", text: "Nothing matches." }));
      } else list.replaceChildren(...rows.map((p) => row(p, canOrder)));
      window.egIcons && window.egIcons(list);
    }
    paintList();
    return [el("div", { class: "ss-tools" }, [seg, el("label", { class: "search" }, [ic("search"), search])]), note, list];
  }
  function row(p, canOrder) {
    const [stock, stCls] = stockText(p);
    const st = p.status === "published" ? (p.unreleased ? ["Scheduled", "p-violet"] : ["Live", "p-ok"]) : p.status === "archived" ? ["Archived", "p-muted"] : ["Draft", "p-review"];
    const grip = canOrder ? el("button", { type: "button", class: "ss-grip", "aria-label": "Move " + p.name + " (arrow keys)" }, ic("grip-vertical")) : el("span", { class: "ss-grip off", "aria-hidden": "true" });
    const star = el("button", { type: "button", class: "icon-btn ss-star" + (p.featured ? " on" : ""), "aria-pressed": String(!!p.featured), disabled: !access.publish || p.status === "archived",
      "aria-label": (p.featured ? "Unfeature " : "Feature ") + p.name, title: p.featured ? "Featured" : "Feature it" }, ic("star"));
    star.addEventListener("click", (e) => { e.stopPropagation(); flag(p, "featured", !p.featured); });
    const pub = access.publish && p.status !== "archived"
      ? el("button", { type: "button", class: "btn btn-sm " + (p.status === "published" ? "btn-ghost" : "btn-ok"), onclick: (e) => { e.stopPropagation(); setStatus(p, p.status === "published" ? "draft" : "published", e.currentTarget); } },
        [ic(p.status === "published" ? "eye-off" : "rocket"), p.status === "published" ? "Unpublish" : "Publish"])
      : null;
    const r = el("div", { class: "ss-row" + (p.status === "archived" ? " dim" : ""), role: "listitem", "data-id": p.id }, [
      grip,
      el("button", { type: "button", class: "ss-open", onclick: () => edit(p.id), "aria-label": "Edit " + p.name }, [
        el("span", { class: "ss-th" }, p.thumb ? el("img", { src: SHOP.mediaUrl(p.thumb), alt: "", loading: "lazy" }) : ic("image")),
        el("span", { class: "ss-main" }, [el("b", { text: p.name }),
          el("span", { class: "ss-sub" }, [el("span", { text: "#" + String(p.serial).padStart(3, "0") }), p.category ? el("span", { text: p.category }) : null, p.collection ? el("span", { text: p.collection }) : null,
            p.variants ? el("span", { text: H.plural(p.variants, "option") }) : null])]),
        el("span", { class: "ss-price" }, [el("b", { text: money(p.price) }), p.compare_at && p.compare_at > p.price ? el("s", { text: money(p.compare_at) }) : null]),
        el("span", { class: "ss-stock " + stCls, text: stock }),
        el("span", { class: "pill " + st[1], text: st[0] })
      ]),
      el("span", { class: "ss-acts" }, [star, pub])
    ]);
    if (canOrder) dragRow(r, grip);
    return r;
  }
  async function flag(p, which, on) {
    try { await H.rpc("shop_admin_flag", { p_id: p.id, p_flag: which, p_on: on }); p[which] = on; H.toast(on ? "Featured." : "Not featured any more.", "ok"); paintBody(); }
    catch (e) { H.fail(e); }
  }
  async function setStatus(p, s, btn) {
    if (s === "published" && !p.thumb) {
      const ok = await H.confirm({ title: "Publish without a picture?", body: ["\"" + p.name + "\" will show the EG mark in place of a photo until you add one."], ok: "Publish anyway" });
      if (!ok) return;
    }
    btn.disabled = true;
    try { await H.rpc("shop_admin_set_status", { p_id: p.id, p_status: s }); H.toast(s === "published" ? "Published. It's live in the shop." : "Unpublished.", "ok"); products = await H.rpc("shop_admin_products"); paintBody(); }
    catch (e) { H.fail(e); btn.disabled = false; }
  }

  /* reorder: drag the handle, or arrow keys on it. Saved a moment after you stop. */
  let orderTimer = 0;
  function saveOrder() {
    clearTimeout(orderTimer);
    orderTimer = setTimeout(async () => {
      const ids = Array.from(mainNode.querySelectorAll(".ss-row")).map((r) => r.dataset.id);
      try {
        await H.rpc("shop_admin_reorder", { p_ids: ids });
        const pos = new Map(ids.map((id, i) => [id, i]));
        products.sort((a, b) => (pos.has(a.id) && pos.has(b.id) ? pos.get(a.id) - pos.get(b.id) : 0));
        H.toast("Order saved.", "ok");
      } catch (e) { H.fail(e); }
    }, 600);
  }
  function dragRow(r, grip) {
    grip.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const sib = e.key === "ArrowUp" ? r.previousElementSibling : r.nextElementSibling;
      if (!sib) return;
      if (e.key === "ArrowUp") sib.before(r); else sib.after(r);
      grip.focus();
      saveOrder();
    });
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const list = r.parentElement;
      grip.setPointerCapture(e.pointerId);
      r.classList.add("lifting");
      let lastY = e.clientY;
      const move = (ev) => {
        const dy = ev.clientY - lastY;
        r.style.transform = "translateY(" + (ev.clientY - e.clientY) + "px)";
        const rows = Array.from(list.children).filter((x) => x !== r);
        for (const o of rows) {
          const b = o.getBoundingClientRect();
          const mid = b.top + b.height / 2;
          // r is above o and the pointer went below o's middle: r goes after o (and the mirror going up)
          const down = dy > 0 && ev.clientY > mid && (o.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_PRECEDING);
          const up = dy < 0 && ev.clientY < mid && (o.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (!down && !up) continue;
          const before = r.getBoundingClientRect().top;
          if (down) o.after(r); else o.before(r);
          // keep the row under the pointer now that its slot moved
          e = { clientY: e.clientY + (r.getBoundingClientRect().top - before), pointerId: e.pointerId };
          break;
        }
        r.style.transform = "translateY(" + (ev.clientY - e.clientY) + "px)";
        lastY = ev.clientY;
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        r.classList.remove("lifting");
        r.style.transform = "";
        saveOrder();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
  }

  async function edit(id) {
    H.drawer.open({ title: "Product", wide: true, body: el("span", { class: "loader" }) });
    try {
      const [p, c] = await Promise.all([H.rpc("shop_admin_product", { p_id: id }), catalog.categories.length || catalog.collections.length ? Promise.resolve(catalog) : H.rpc("shop_admin_catalog")]);
      catalog = c;
      SHOP.openEditor(p, editorCtx());
    } catch (e) { H.drawer.set(el("div", { class: "empty" }, [ic("triangle-alert"), el("p", { text: e.message })])); }
  }
  async function newProduct() {
    try { catalog = await H.rpc("shop_admin_catalog"); } catch (e) { H.fail(e); return; }
    SHOP.openEditor(null, editorCtx());
  }
  function editorCtx() {
    return { access: access, catalog: catalog, currency: (ov && ov.currency) || (settings && settings.currency) || "USD",
      onSaved: async () => {
        try { products = await H.rpc("shop_admin_products"); if (tab === "dashboard") ov = await H.rpc("shop_admin_overview"); } catch (e) { /* the list refreshes on the next visit */ }
        if (mainNode && mainNode.isConnected) paintBody();
      } };
  }

  /* ---------- categories and drops ---------- */
  function catalogView() {
    const cats = catalog.categories, cols = catalog.collections;
    const now = Date.now();
    const catRows = cats.map((c, i) => el("div", { class: "ss-crow" + (c.active ? "" : " dim") }, [
      el("span", { class: "ss-cicon" }, c.image ? el("img", { src: SHOP.mediaUrl(c.image), alt: "" }) : ic(c.icon || "tag")),
      el("span", { class: "ss-main" }, [el("b", { text: c.name }), el("span", { class: "ss-sub" }, [el("span", { text: "/" + c.slug }), el("span", { text: H.plural(c.products, "product") })])]),
      c.active ? null : el("span", { class: "pill p-muted", text: "Hidden" }),
      access.catalog ? el("span", { class: "ss-acts" }, [
        el("button", { type: "button", class: "icon-btn", "aria-label": "Move " + c.name + " up", disabled: i === 0, onclick: () => reorder("category", cats, i, -1) }, ic("arrow-up")),
        el("button", { type: "button", class: "icon-btn", "aria-label": "Move " + c.name + " down", disabled: i === cats.length - 1, onclick: () => reorder("category", cats, i, 1) }, ic("arrow-down")),
        el("button", { type: "button", class: "btn btn-sm btn-ice", onclick: () => categoryForm(c) }, [ic("pencil"), "Edit"])]) : null
    ]));
    const colRows = cols.map((k, i) => {
      const rel = k.release_at ? new Date(k.release_at) : null;
      const state = !k.active ? ["Hidden", "p-muted"] : rel && rel.getTime() > now ? ["Drops " + H.fmtDateTime(rel), "p-violet"] : ["Out now", "p-ok"];
      return el("div", { class: "ss-crow" + (k.active ? "" : " dim") }, [
        el("span", { class: "ss-cicon wide" }, k.thumb || k.image ? el("img", { src: SHOP.mediaUrl(k.thumb || k.image), alt: "" }) : el("b", { text: k.code || "—" })),
        el("span", { class: "ss-main" }, [el("b", { text: (k.code ? k.code + " · " : "") + k.name }), el("span", { class: "ss-sub" }, [el("span", { text: "/" + k.slug }), el("span", { text: H.plural(k.products, "product") })])]),
        el("span", { class: "pill " + state[1], text: state[0] }),
        access.catalog ? el("span", { class: "ss-acts" }, [
          el("button", { type: "button", class: "icon-btn", "aria-label": "Move " + k.name + " up", disabled: i === 0, onclick: () => reorder("collection", cols, i, -1) }, ic("arrow-up")),
          el("button", { type: "button", class: "icon-btn", "aria-label": "Move " + k.name + " down", disabled: i === cols.length - 1, onclick: () => reorder("collection", cols, i, 1) }, ic("arrow-down")),
          el("button", { type: "button", class: "btn btn-sm btn-ice", onclick: () => dropForm(k) }, [ic("pencil"), "Edit"])]) : null
      ]);
    });
    return [
      el("section", { class: "panel panel-pad" }, [
        H.pHead({ icon: "layers", title: "Drops", sub: "Collections of products released together. A drop with a future release time keeps its products hidden until then, with a countdown in the shop.",
          right: access.catalog ? el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => dropForm(null) }, [ic("plus"), "New drop"]) : null }),
        el("div", { class: "ss-clist" }, colRows.length ? colRows : [el("p", { class: "muted", text: "No drops yet. Make one for your next release, like DROP-001." })])
      ]),
      el("section", { class: "panel panel-pad" }, [
        H.pHead({ icon: "tags", title: "Categories", sub: "The filters along the top of the shop. Only categories with live products show up there.",
          right: access.catalog ? el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => categoryForm(null) }, [ic("plus"), "New category"]) : null }),
        el("div", { class: "ss-clist" }, catRows.length ? catRows : [el("p", { class: "muted", text: "No categories yet." })])
      ])
    ];
  }
  async function reorder(kind, list, i, d) {
    const ids = list.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try { await H.rpc("shop_admin_reorder_catalog", { p_kind: kind, p_ids: ids }); catalog = await H.rpc("shop_admin_catalog"); paintBody(); }
    catch (e) { H.fail(e); }
  }
  function imagePicker(cur, label) {
    // one optional picture: shows it, swaps it, removes it
    const state = { media_id: cur.media_id || null, path: cur.path || null };
    const show = el("div", { class: "ss-one" });
    function paint() {
      show.replaceChildren(...[state.media_id ? el("span", { class: "ss-one-pic" }, [el("img", { src: SHOP.mediaUrl(state.path), alt: "" }),
        el("button", { type: "button", class: "icon-btn danger", "aria-label": "Remove the picture", onclick: () => { state.media_id = null; state.path = null; paint(); } }, ic("x"))]) : null,
      SHOP.dropZone({ multiple: false, title: state.media_id ? "Replace the picture" : label, hint: "Optional. JPG, PNG or WebP.", onReady: (m) => { state.media_id = m.media_id; state.path = m.thumb || m.path; paint(); } })].filter(Boolean));
      window.egIcons && window.egIcons(show);
    }
    paint();
    return { node: show, get: () => state.media_id };
  }
  function categoryForm(c) {
    c = c || {};
    const name = el("input", { class: "inp", maxlength: 40, required: true, value: c.name || "", placeholder: "Headwear" });
    const slug = el("input", { class: "inp", maxlength: 48, value: c.slug || "", placeholder: "made from the name", spellcheck: "false" });
    const desc = el("textarea", { class: "ta", rows: 3, maxlength: 300, placeholder: "Optional" });
    desc.value = c.description || "";
    let iconName = c.icon || "tag";
    const icons = el("div", { class: "ss-icons", role: "radiogroup", "aria-label": "Icon" });
    const paintIcons = () => { icons.replaceChildren(...ICONS.map((n) => el("button", { type: "button", role: "radio", class: "icon-btn", "aria-checked": String(n === iconName), "aria-label": n, onclick: () => { iconName = n; paintIcons(); } }, ic(n)))); window.egIcons && window.egIcons(icons); };
    paintIcons();
    const pic = imagePicker({ media_id: c.media_id, path: c.image }, "Add a picture");
    const active = SHOP.check("Show it in the shop", c.active !== false, "Hiding a category hides its products too.");
    const save = el("button", { type: "submit", class: "btn btn-primary" }, [ic("check"), c.id ? "Save" : "Add the category"]);
    const f = el("form", { class: "form-grid" }, [SHOP.field("Name", name), SHOP.field("Link name", slug, "Used in /shop/?category=…"), SHOP.field("Description", desc),
      el("div", { class: "field" }, [el("span", { text: "Icon" }), icons]), el("div", { class: "field" }, [el("span", { text: "Picture" }), pic.node]), active.node, save,
      c.id && access.catalog ? el("button", { type: "button", class: "btn btn-danger", onclick: () => removeCat(c) }, [ic("trash-2"), "Delete this category"]) : null]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { H.toast("Give the category a name.", "bad"); name.focus(); return; }
      save.disabled = true;
      try {
        const r = await H.rpc("shop_admin_save_category", { p: { id: c.id || null, name: name.value, slug: SHOP.slugify(slug.value || name.value), description: desc.value, icon: iconName, media_id: pic.get(), active: active.input.checked } });
        SHOP.clearOrphans(r.orphans).catch(() => { /* cleaned later */ });
        H.toast("Saved.", "ok"); H.drawer.close(); catalog = await H.rpc("shop_admin_catalog"); paintBody();
      } catch (err) { H.fail(err); save.disabled = false; }
    });
    H.drawer.open({ title: c.id ? "Edit category" : "New category", body: f });
  }
  async function removeCat(c) {
    const ok = await H.confirm({ title: "Delete \"" + c.name + "\"?", body: [c.products ? H.plural(c.products, "product") + " in it will have no category (they stay in the shop)." : "Nothing is in it.", "This can't be undone."], ok: "Delete", danger: true });
    if (!ok) return;
    try { const r = await H.rpc("shop_admin_delete_category", { p_id: c.id }); SHOP.clearOrphans(r.orphans).catch(() => {}); H.toast("Deleted.", "ok"); H.drawer.close(); catalog = await H.rpc("shop_admin_catalog"); paintBody(); }
    catch (e) { H.fail(e); }
  }
  const localInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  };
  function dropForm(k) {
    k = k || {};
    const name = el("input", { class: "inp", maxlength: 60, required: true, value: k.name || "", placeholder: "Void Series" });
    const code = el("input", { class: "inp", maxlength: 20, value: k.code || "", placeholder: "DROP-001", spellcheck: "false" });
    const slug = el("input", { class: "inp", maxlength: 48, value: k.slug || "", placeholder: "made from the code or name", spellcheck: "false" });
    const tagline = el("input", { class: "inp", maxlength: 120, value: k.tagline || "", placeholder: "One line that sells it" });
    const desc = el("textarea", { class: "ta", rows: 4, maxlength: 1200, placeholder: "Optional: the story behind the drop" });
    desc.value = k.description || "";
    const rel = el("input", { class: "inp", type: "datetime-local", value: localInput(k.release_at) });
    const pic = imagePicker({ media_id: k.media_id, path: k.thumb || k.image }, "Add a banner picture");
    const active = SHOP.check("Show it in the shop", k.active !== false, "Hidden drops have no page; their products still show in the vault.");
    const save = el("button", { type: "submit", class: "btn btn-primary" }, [ic("check"), k.id ? "Save" : "Add the drop"]);
    const f = el("form", { class: "form-grid" }, [
      el("div", { class: "form-row" }, [SHOP.field("Name", name), SHOP.field("Code", code, "The tag on its cards")]),
      SHOP.field("Link name", slug, "Used in /shop/?drop=…"), SHOP.field("Tagline", tagline), SHOP.field("Description", desc),
      SHOP.field("Release time (your time zone)", rel, "Empty means it's out now. In the future, its products stay hidden until then and the shop counts down."),
      el("div", { class: "field" }, [el("span", { text: "Banner" }), pic.node]), active.node, save,
      k.id && access.catalog ? el("button", { type: "button", class: "btn btn-danger", onclick: () => removeDrop(k) }, [ic("trash-2"), "Delete this drop"]) : null]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { H.toast("Give the drop a name.", "bad"); name.focus(); return; }
      save.disabled = true;
      try {
        const r = await H.rpc("shop_admin_save_collection", { p: { id: k.id || null, name: name.value, code: code.value.trim().toUpperCase().replace(/\s+/g, "-"),
          slug: SHOP.slugify(slug.value || code.value || name.value), tagline: tagline.value, description: desc.value,
          release_at: rel.value ? new Date(rel.value).toISOString() : null, media_id: pic.get(), active: active.input.checked } });
        SHOP.clearOrphans(r.orphans).catch(() => { /* cleaned later */ });
        H.toast("Saved.", "ok"); H.drawer.close(); catalog = await H.rpc("shop_admin_catalog"); paintBody();
      } catch (err) { H.fail(err); save.disabled = false; }
    });
    H.drawer.open({ title: k.id ? "Edit drop" : "New drop", body: f });
  }
  async function removeDrop(k) {
    const ok = await H.confirm({ title: "Delete \"" + k.name + "\"?", body: [k.products ? H.plural(k.products, "product") + " in it stay in the shop, just not in a drop." : "Nothing is in it.", "This can't be undone."], ok: "Delete", danger: true });
    if (!ok) return;
    try { const r = await H.rpc("shop_admin_delete_collection", { p_id: k.id }); SHOP.clearOrphans(r.orphans).catch(() => {}); H.toast("Deleted.", "ok"); H.drawer.close(); catalog = await H.rpc("shop_admin_catalog"); paintBody(); }
    catch (e) { H.fail(e); }
  }

  /* ---------- orders: only what Stripe actually paid for ---------- */
  function ordersView() {
    const seg = H.seg([{ value: "all", label: "All" }, { value: "paid", label: "To ship" }, { value: "support", label: "Support" }], orderFilter, (v) => { orderFilter = v; paintBody(); }, { label: "Show" });
    const list = orders.filter((o) => orderFilter === "all" || (orderFilter === "support" ? o.kind === "support" : o.kind === "order" && o.status === orderFilter));
    const body = !orders.length
      ? H.empty({ art: "inbox", title: "No orders yet", text: ov && !ov.checkout ? "Checkout is off, so nothing can be bought yet. Orders show up here the moment Stripe confirms a payment." : "Orders show up here the moment Stripe confirms a payment.", panel: true })
      : list.length ? el("div", { class: "panel ss-orders" }, el("table", { class: "wtable" }, [
        el("thead", null, el("tr", null, ["Order", "When", "Who", "Items", "Total", "Status"].map((t) => el("th", { text: t })))),
        el("tbody", null, list.map((o) => {
          const [l, cls] = o.kind === "support" ? ["Support", "p-pink"] : ORDER_ST[o.status] || ["?", "p-muted"];
          const tr = el("tr", { tabindex: "0", class: "ss-orow" }, [el("td", { text: "#" + String(o.number).padStart(4, "0") }), el("td", { text: H.fmtDateTime(o.created_at) }),
            el("td", { text: o.name || o.email || "—" }), el("td", { text: o.kind === "support" ? "—" : String(o.items) }), el("td", { text: SHOP.money(o.total, o.currency) }),
            el("td", null, [el("span", { class: "pill " + cls, text: l }), (o.flags || []).length ? el("span", { class: "pill p-bad", style: "margin-left:6px", text: o.flags.join(", ") }) : null])]);
          tr.addEventListener("click", () => orderDetail(o.id));
          tr.addEventListener("keydown", (e) => { if (e.key === "Enter") orderDetail(o.id); });
          return tr;
        }))])) : el("p", { class: "muted", text: "Nothing here." });
    return [el("div", { class: "ss-tools" }, seg), body];
  }
  async function orderDetail(id) {
    H.drawer.open({ title: "Order", body: el("span", { class: "loader" }) });
    let o;
    try { o = await H.rpc("shop_admin_order", { p_id: id }); } catch (e) { H.drawer.set(el("p", { text: e.message })); return; }
    const cur = o.currency;
    const addr = o.shipping && o.shipping.address ? o.shipping.address : null;
    const status = el("select", { class: "sel" }, Object.entries(ORDER_ST).map(([k, [l]]) => el("option", { value: k, text: k === "paid" ? "Paid, to ship" : l, selected: o.status === k })));
    const tracking = el("input", { class: "inp", maxlength: 200, value: o.tracking || "", placeholder: "Carrier and tracking number" });
    const note = el("textarea", { class: "ta", rows: 3, maxlength: 2000, placeholder: "Only staff see this" });
    note.value = o.note || "";
    const save = el("button", { type: "submit", class: "btn btn-primary" }, [ic("check"), "Save"]);
    const f = el("form", { class: "form-grid" }, [SHOP.field("Status", status), o.kind === "order" ? SHOP.field("Tracking", tracking) : null, SHOP.field("Staff note", note), save]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); save.disabled = true;
      try { await H.rpc("shop_admin_order_update", { p_id: o.id, p_status: status.value, p_tracking: tracking.value, p_note: note.value }); H.toast("Saved.", "ok"); orders = await H.rpc("shop_admin_orders", {}); H.drawer.close(); paintBody(); }
      catch (err) { H.fail(err); save.disabled = false; }
    });
    H.drawer.set([
      el("dl", { class: "kv" }, [
        el("dt", { text: "Order" }), el("dd", { text: "#" + String(o.number).padStart(4, "0") + (o.kind === "support" ? " (support)" : "") }),
        el("dt", { text: "Paid" }), el("dd", { text: H.fmtDateTime(o.created_at) }),
        el("dt", { text: "Buyer" }), el("dd", { text: [o.name, o.email].filter(Boolean).join(" · ") || "—" }),
        addr ? el("dt", { text: "Ship to" }) : null,
        addr ? el("dd", { style: "white-space:pre-line", text: [o.shipping.name, addr.line1, addr.line2, [addr.city, addr.state, addr.postal_code].filter(Boolean).join(" "), addr.country].filter(Boolean).join("\n") }) : null,
        el("dt", { text: "Total" }), el("dd", { text: SHOP.money(o.total_cents, cur) + (o.shipping_cents ? " (shipping " + SHOP.money(o.shipping_cents, cur) + ")" : "") + (o.tax_cents ? " (tax " + SHOP.money(o.tax_cents, cur) + ")" : "") }),
        o.payment_ref ? el("dt", { text: "Stripe" }) : null,
        o.payment_ref ? el("dd", null, el("a", { href: "https://dashboard.stripe.com/payments/" + encodeURIComponent(o.payment_ref), target: "_blank", rel: "noopener" }, ["Open in Stripe", ic("arrow-up-right")])) : null,
        (o.flags || []).length ? el("dt", { text: "Heads up" }) : null,
        (o.flags || []).length ? el("dd", { text: o.flags.includes("oversold") ? "Sold more than the stock count. Check you can fill it, or refund in Stripe." : o.flags.join(", ") }) : null
      ]),
      (o.items || []).length ? el("div", null, [el("h3", { text: "Items" }), el("table", { class: "wtable" }, el("tbody", null, o.items.map((i) =>
        el("tr", null, [el("td", { text: i.name + (i.variant_label ? " (" + i.variant_label + ")" : "") + (i.sku ? " · " + i.sku : "") }), el("td", { text: "× " + i.qty }), el("td", { text: SHOP.money(i.unit_cents * i.qty, cur) })]))))]) : null,
      f
    ]);
    document.getElementById("drawer-title").textContent = "Order #" + String(o.number).padStart(4, "0");
  }

  /* ---------- settings ---------- */
  function settingsView() {
    const s = settings;
    const can = !!access.settings;
    const dis = can ? null : true;
    const inp = (v, attrs) => el("input", Object.assign({ class: "inp", value: v === null || v === undefined ? "" : v, disabled: dis }, attrs || {}));
    let mode = s.mode;
    const modeSeg = H.seg([{ value: "open", label: "Open", icon: "door-open" }, { value: "sealed", label: "Sealed", icon: "lock" }], mode, (v) => { mode = v; sealedBox.hidden = v !== "sealed"; }, { label: "Storefront" });
    if (!can) modeSeg.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    const sealedTitle = inp(s.sealed_title, { maxlength: 60, placeholder: "The vault is sealed" });
    const sealedMsg = inp(s.sealed_message, { maxlength: 300, placeholder: "New artifacts are being prepared. Return soon." });
    const sealedBox = el("div", { class: "form-grid" }, [SHOP.field("Title", sealedTitle), SHOP.field("Message", sealedMsg)]);
    sealedBox.hidden = mode !== "sealed";
    const ann = inp(s.announcement, { maxlength: 140, placeholder: "e.g. Drop 001 is live" });
    const annLink = inp(s.announcement_link, { maxlength: 300, placeholder: "Optional: /shop/?drop=drop-001 or https://…" });
    const notice = inp(s.notice, { maxlength: 300, placeholder: "e.g. Orders ship within 5 days" });
    const sort = el("select", { class: "sel", disabled: dis }, [["featured", "Featured (your order)"], ["newest", "Newest first"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["name", "Name"]]
      .map(([v, l]) => el("option", { value: v, text: l, selected: s.default_sort === v })));
    const feat = el("select", { class: "sel", disabled: dis }, [el("option", { value: "", text: "Automatic (the next or newest drop)" })]
      .concat(catalog.collections.map((k) => el("option", { value: k.id, text: (k.code ? k.code + " · " : "") + k.name, selected: s.featured_collection === k.id }))));
    const flat = SHOP.moneyInput(SHOP.fromCents(s.shipping_flat_cents), { placeholder: "Empty = free shipping", disabled: dis });
    const free = SHOP.moneyInput(SHOP.fromCents(s.free_shipping_cents), { placeholder: "Optional", disabled: dis });
    const countries = inp((s.ship_countries || []).join(", "), { placeholder: "US, CA, GB" });
    const shipNote = inp(s.shipping_note, { maxlength: 300, placeholder: "e.g. Ships from the US in 3–5 days" });
    const supOn = SHOP.check("Show the support section", s.support_enabled, null, !can);
    const supTitle = inp(s.support_title, { maxlength: 60, placeholder: "Fuel the void" });
    const supBlurb = el("textarea", { class: "ta", rows: 3, maxlength: 400, disabled: dis, placeholder: "Help fund future projects, giveaways, infrastructure…" });
    supBlurb.value = s.support_blurb || "";
    const amounts = inp((s.support_amounts || []).map((c) => c / 100).join(", "), { placeholder: "5, 10, 25, 50" });
    const supUrl = inp(s.support_url, { maxlength: 300, placeholder: "https://buymeacoffee.com/enviousgluttony" });
    const ready = !!s.payments_ready;
    const checkout = SHOP.check("Take payments (checkout on)", s.checkout_enabled,
      ready ? "Visitors pay on Stripe's secure page. Turn off any time to pause sales." : "Can't turn on yet: the Stripe payment functions aren't set up (SHOP-SETUP.md, part 2).", !can || (!ready && !s.checkout_enabled));
    const save = el("button", { type: "submit", class: "btn btn-primary btn-big" }, [ic("check"), "Save settings"]);
    const f = el("form", { class: "ss-settings" }, [
      el("section", { class: "panel panel-pad" }, [H.h3("Storefront", { icon: "store" }), el("div", { class: "field" }, [el("span", { text: "The shop is" }), modeSeg]),
        el("p", { class: "ss-hint", text: "Sealed: visitors see “The vault is sealed”. Staff with shop access still see everything, with a banner." }), sealedBox]),
      el("section", { class: "panel panel-pad" }, [H.h3("Announcements", { icon: "megaphone" }), SHOP.field("Strip across the top", ann), SHOP.field("Strip link", annLink), SHOP.field("Notice above the products", notice)]),
      el("section", { class: "panel panel-pad" }, [H.h3("Catalogue", { icon: "layers" }), el("div", { class: "form-row" }, [SHOP.field("Default sort", sort), SHOP.field("Latest-drop band", feat)])]),
      el("section", { class: "panel panel-pad" }, [H.h3("Shipping", { icon: "truck" }),
        el("div", { class: "form-row" }, [el("label", { class: "field" }, [el("span", { text: "Flat shipping per order" }), flat.node, el("small", { class: "ss-hint", text: "Empty means free shipping." })]),
          el("label", { class: "field" }, [el("span", { text: "Free shipping over" }), free.node, el("small", { class: "ss-hint", text: "Optional." })])]),
        SHOP.field("Countries you ship to", countries, "Two-letter codes. Stripe only accepts addresses in these."), SHOP.field("Shipping note", shipNote, "Shown on products and in the shop's facts row.")]),
      el("section", { class: "panel panel-pad" }, [H.h3("Support", { icon: "flame" }), supOn.node, el("div", { class: "form-row" }, [SHOP.field("Title", supTitle), SHOP.field("Amounts in dollars", amounts, "For Stripe support only (no support page set). Up to 6, $1 to $1,000.")]),
        SHOP.field("Text", supBlurb), SHOP.field("Support page", supUrl, "Where the support button goes (your Buy Me a Coffee page). Empty: once checkout is on, people pick an amount above and pay through Stripe.")]),
      el("section", { class: "panel panel-pad" }, [H.h3("Checkout", { icon: "credit-card" }), checkout.node,
        el("p", { class: "ss-hint", text: ready ? "Stripe is connected." : "Until then the cart works and says checkout opens soon. Nobody can pay, and nothing pretends they can." })]),
      can ? save : el("p", { class: "ss-ro" }, [ic("lock"), "Changing settings needs the shop settings permission."])
    ]);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await H.rpc("shop_admin_save_settings", { p: {
          mode: mode, sealed_title: sealedTitle.value, sealed_message: sealedMsg.value, announcement: ann.value, announcement_link: annLink.value, notice: notice.value,
          currency: s.currency || "USD", default_sort: sort.value, featured_collection: feat.value || null,
          shipping_flat_cents: SHOP.toCents(flat.input.value), free_shipping_cents: SHOP.toCents(free.input.value),
          ship_countries: countries.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean), shipping_note: shipNote.value,
          support_enabled: supOn.input.checked, support_title: supTitle.value, support_blurb: supBlurb.value,
          support_amounts: amounts.value.split(",").map((x) => SHOP.toCents(x)).filter((x) => x), support_url: supUrl.value,
          checkout_enabled: checkout.input.checked } });
        H.toast("Settings saved. The shop updates on its next load.", "ok");
        settings = await H.rpc("shop_admin_settings"); ov = null;
      } catch (err) { H.fail(err); }
      save.disabled = false;
    });
    const out = [f];
    if (H.can("owner")) out.push(accessPanel(s.access || {}));
    if (access.edit) out.push(cleanupPanel());
    return out;
  }
  function accessPanel(cur) {
    const sels = {};
    const rows = PERMS.map(([k, label, hint]) => {
      sels[k] = el("select", { class: "sel", "aria-label": label }, TIERS.map(([t, l]) => el("option", { value: t, text: l, selected: cur[k] === t })));
      return el("tr", null, [el("td", null, [el("b", { text: label }), el("small", { class: "ss-hint", text: hint })]), el("td", null, sels[k])]);
    });
    const save = el("button", { type: "button", class: "btn btn-primary" }, [ic("check"), "Save access"]);
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const p = {};
        for (const k in sels) p[k] = sels[k].value;
        await H.rpc("shop_admin_save_access", { p: p });
        access = await H.rpc("shop_my_access");
        def.hidden = !access.view; H.renderNav();
        H.toast("Access saved.", "ok");
      } catch (e) { H.fail(e); }
      save.disabled = false;
    });
    return el("section", { class: "panel panel-pad" }, [H.h3("Who can do what", { icon: "key-round" }),
      el("p", { class: "ss-hint", text: "Owners only. The database checks these on every action, so hiding a button is never the only lock." }),
      el("table", { class: "ss-access" }, el("tbody", null, rows)), save]);
  }
  function cleanupPanel() {
    const out = el("p", { class: "ss-hint", text: "Pictures uploaded but never saved onto anything (older than 6 hours) can be cleared to save storage." });
    const go = el("button", { type: "button", class: "btn btn-sm" }, [ic("trash-2"), "Find unused pictures"]);
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        const list = await H.rpc("shop_media_orphans");
        if (!list.length) { out.textContent = "No unused pictures. All tidy."; go.disabled = false; return; }
        const mb = (list.reduce((t, m) => t + (m.bytes || 0), 0) / 1048576).toFixed(1);
        const ok = await H.confirm({ title: "Delete " + H.plural(list.length, "unused picture") + "?", body: ["About " + mb + " MB that nothing in the shop uses."], ok: "Delete", danger: true });
        if (ok) { const n = await SHOP.clearOrphans(list); out.textContent = "Cleared " + H.plural(n, "picture") + "."; }
      } catch (e) { H.fail(e); }
      go.disabled = false;
    });
    return el("section", { class: "panel panel-pad" }, [H.h3("Storage", { icon: "image" }), out, go]);
  }

  /* every 20 seconds the hub asks for fresh numbers; leave forms alone */
  async function poll() {
    if (H.drawer.isOpen || !mainNode) return;
    if (tab === "dashboard") { ov = await H.rpc("shop_admin_overview"); paintBody(); }
    else if (tab === "orders") { orders = await H.rpc("shop_admin_orders", {}); paintBody(); }
  }
})();
