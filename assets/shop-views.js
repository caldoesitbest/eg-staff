/* Envious Supply: what you see. The front (hero, latest drop, the vault, support), product pages, drops,
   the sealed vault, and the empty and error states. */
(function () {
  "use strict";
  const S = window.SHOP;
  if (!S) return;
  const { el, ic, money, pad, state } = S;
  const $ = (id) => document.getElementById(id);
  const SORTS = [["featured", "Featured"], ["newest", "Newest"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["name", "Name"]];
  let timers = [];                                   // countdowns, cleared on every page change
  let leave = [];                                    // other clean-up for the page being left
  const every = (ms, f) => { f(); timers.push(setInterval(f, ms)); };

  /* ---------- bits every page uses ---------- */
  function corners() { return ["tl", "tr", "bl", "br"].map((c) => el("span", { class: "crop " + c, "aria-hidden": "true" })); }
  function badges(p, max) {
    const out = [];
    if (!p.in_stock) out.push(el("span", { class: "badge b-out", text: "Sold out" }));
    if (p.status === "draft") out.push(el("span", { class: "badge b-draft", text: "Draft" }));
    if (p.limited) out.push(el("span", { class: "badge b-ltd", text: p.edition_size ? "Limited · " + p.edition_size : "Limited" }));
    if (p.salePct >= 1 && p.in_stock) out.push(el("span", { class: "badge b-sale", text: "−" + p.salePct + "%" }));
    if (p.isNew && p.in_stock) out.push(el("span", { class: "badge b-new", text: "New" }));
    if (p.low && !p.limited) out.push(el("span", { class: "badge b-low", text: p.left + " left" }));
    return out.slice(0, max || 2);
  }
  function priceRow(p, big) {
    return el("p", { class: "price" + (big ? " big" : "") }, [
      p.varies ? el("span", { class: "from", text: "From" }) : null,
      el("b", { text: money(p.varies ? p.minPrice : p.price) }),
      p.compare_at ? el("s", { "aria-label": "was " + money(p.compare_at), text: money(p.compare_at) }) : null
    ]);
  }
  function stockLine(p, v) {
    let cls = "ok", text = "In stock";
    const left = v ? v.left : p.left;
    if (!p.in_stock || (v && !v.available)) { cls = "out"; text = v && p.in_stock ? "Sold out in this option" : "Sold out"; }
    else if (typeof left === "number" && left <= 5) { cls = "low"; text = "Only " + left + " left"; }
    else if (p.kind === "digital") text = "Digital · delivered online";
    return el("p", { class: "stock " + cls, role: "status" }, [el("span", { class: "led", "aria-hidden": "true" }), text]);
  }
  function emptyState(o) {
    return el("div", { class: "void" + (o.cls ? " " + o.cls : "") }, [
      el("div", { class: "void-art", "aria-hidden": "true" }, [el("span", { class: "void-ring" }), el("span", { class: "void-ring r2" }),
        el("img", { src: "/assets/staff/art/hub-planet.webp", alt: "", width: 1100, height: 682, loading: "lazy" })]),
      el("p", { class: "void-k", text: o.kicker || "Scan complete" }),
      el("h2", { text: o.title }),
      o.text ? el("p", { class: "void-t", text: o.text }) : null,
      o.action || null
    ]);
  }

  /* A product card: a display case with a number, tags, and a second look on hover. */
  function card(p, i) {
    const imgs = p.images || [];
    const media = el("span", { class: "card-media" }, [
      imgs[0] ? S.picture(imgs[0], { cls: "a", product: p, alt: "", eager: i < 2 }) : S.placeholder(p),
      imgs[1] && S.fine ? S.picture(imgs[1], { cls: "b", product: p, alt: "" }) : null,
      el("span", { class: "card-glow", "aria-hidden": "true" }),
      ...corners(),
      el("span", { class: "card-top" }, [el("span", { class: "serial", text: "#" + pad(p.serial) }), el("span", { class: "badges" }, badges(p, 2))]),
      el("span", { class: "card-view", "aria-hidden": "true" }, [el("span", { text: p.in_stock ? "View" : "View anyway" }), ic("arrow-up-right")])
    ]);
    const label = p.name + ", " + (p.varies ? "from " : "") + money(p.varies ? p.minPrice : p.price) + (p.in_stock ? "" : ", sold out");
    const a = el("a", { class: "card" + (p.in_stock ? "" : " out") + (imgs[1] && S.fine ? " has-b" : ""), href: S.href("item", p.slug), "aria-label": label }, [
      media,
      el("span", { class: "card-body" }, [
        el("span", { class: "code", text: S.codeOf(p) }),
        el("span", { class: "name", text: p.name }),
        priceRow(p)
      ])
    ]);
    if (S.fine && !S.reduce) {
      let raf = 0;
      a.addEventListener("pointermove", (e) => {
        const r = a.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          a.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
          a.style.setProperty("--my", (y * 100).toFixed(1) + "%");
          a.style.setProperty("--ry", ((x - 0.5) * 6).toFixed(2) + "deg");
          a.style.setProperty("--rx", ((0.5 - y) * 5).toFixed(2) + "deg");
        });
      });
      a.addEventListener("pointerleave", () => { cancelAnimationFrame(raf); a.style.setProperty("--rx", "0deg"); a.style.setProperty("--ry", "0deg"); });
    }
    return a;
  }
  function grid(list) {
    const g = el("div", { class: "grid" }, list.map(card));
    requestAnimationFrame(() => S.reveal(g.children));
    return g;
  }

  /* The time left until a drop, ticking. */
  function countdown(target) {
    const box = el("span", { class: "count", role: "timer", "aria-label": "Time until the drop" });
    const parts = [["d", "days"], ["h", "hrs"], ["m", "min"], ["s", "sec"]].map(([k, l]) => {
      const n = el("b", { text: "00" });
      box.append(el("span", { class: "cd-" + k }, [n, el("small", { text: l })]));
      return n;
    });
    every(1000, () => {
      const ms = Math.max(0, target.getTime() - S.now());
      const v = [Math.floor(ms / 86400000), Math.floor(ms / 3600000) % 24, Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60];
      v.forEach((x, i) => { parts[i].textContent = String(x).padStart(2, "0"); });
      if (ms <= 0 && !box.dataset.done) { box.dataset.done = "1"; setTimeout(() => S.load().then(() => S.render()).catch(() => { /* keep showing */ }), 1500); }
    });
    return box;
  }
  const released = (k) => !k.release || k.release.getTime() <= S.now();

  /* ---------- shared chrome: the announcement strip and the staff ribbon ---------- */
  function chrome() {
    const st = state.settings || {};
    $("nav-support").hidden = !st.support || state.route.view === "draft";
    const bar = $("sh-announce");
    if (st.announcement) {
      const inner = st.announcement_link
        ? el("a", { href: st.announcement_link, target: /^https?:/.test(st.announcement_link) ? "_blank" : null, rel: "noopener" }, [st.announcement, ic("arrow-right")])
        : el("span", { text: st.announcement });
      bar.replaceChildren(el("span", { class: "spark", "aria-hidden": "true", text: "✦" }), inner, el("span", { class: "spark", "aria-hidden": "true", text: "✦" }));
      bar.hidden = false;
      document.body.classList.add("has-announce");
      window.egIcons && window.egIcons(bar);
    } else { bar.hidden = true; document.body.classList.remove("has-announce"); }
    let rb = $("staff-ribbon");
    if (state.staff || state.route.view === "draft") {
      if (!rb) { rb = el("div", { class: "ribbon", id: "staff-ribbon", role: "note" }); document.body.append(rb); }
      const kids = [];
      if (state.route.view === "draft") kids.push(el("b", { text: "Preview" }), el("span", { text: "Not saved yet. Only you can see this." }));
      else if (state.sealed) kids.push(el("b", { text: "Sealed" }), el("span", { text: "Only staff can see the shop right now." }));
      else if (state.preview) kids.push(el("b", { text: "Staff preview" }), el("span", { text: "Drafts and unreleased drops are showing." }));
      else kids.push(el("b", { text: "Staff" }));
      if (state.preview) {
        const u = new URL(location.href);
        u.searchParams.delete("preview");
        kids.push(el("a", { href: u.pathname + u.search }, "Exit preview"));
      } else if (state.route.view !== "draft") kids.push(el("a", { href: S.href("home", "", { preview: "1" }) }, "Preview drafts"));
      kids.push(el("a", { href: "/staff/#shop" }, ["Manage", ic("arrow-up-right")]));
      rb.replaceChildren(...kids);
      window.egIcons && window.egIcons(rb);
    } else if (rb) rb.remove();
  }
  // preview on and off reload the data (drafts come from the server)
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("#staff-ribbon a");
    if (a && a.getAttribute("href").indexOf("/shop/") === 0) { e.preventDefault(); e.stopPropagation(); location.href = a.getAttribute("href"); }
  }, true);

  /* ---------- the front ---------- */
  function hero() {
    const ps = state.products;
    $("ro-items").textContent = pad(ps.length);
    $("ro-drops").textContent = pad(state.collections.filter((k) => k.active).length, 2);
    $("ro-status").replaceChildren(el("span", { class: state.sealed ? "warn" : "ok", text: state.sealed ? "Sealed" : "Online" }));
    $("sh-uplink").textContent = state.sealed ? "Sealed" : "Online";
    document.querySelector(".sh-kicker").classList.toggle("sealed", state.sealed);
    $("hero-support").hidden = !state.settings.support;
    // the spotlight: a featured piece that's in stock, else the newest
    const pick = ps.find((p) => p.featured && p.in_stock) || ps.find((p) => p.in_stock) || ps[0];
    const slot = $("sh-spot");
    if (!pick) { slot.replaceChildren(); return; }
    const img = pick.images && pick.images[0];
    slot.replaceChildren(el("a", { class: "spot", href: S.href("item", pick.slug), "aria-label": "Now showing: " + pick.name + ", " + money(pick.minPrice) }, [
      el("span", { class: "spot-k" }, [el("span", { class: "led", "aria-hidden": "true" }), "Now showing · #" + pad(pick.serial)]),
      el("span", { class: "spot-media" }, [img ? S.picture(img, { product: pick, alt: "", eager: true, sizes: "(max-width: 900px) 80vw, 340px" }) : S.placeholder(pick), ...corners()]),
      el("span", { class: "spot-b" }, [el("b", { text: pick.name }), priceRow(pick)]),
      el("span", { class: "spot-base", "aria-hidden": "true" })
    ]));
  }
  function ticker() {
    const words = ["Envious Supply", "Official merch"];
    state.products.slice(0, 6).forEach((p) => words.push(p.name));
    if (state.products.some((p) => p.limited)) words.push("Limited runs");
    state.collections.filter((k) => k.active && k.code).slice(0, 2).forEach((k) => words.push(k.code));
    const run = () => words.flatMap((w) => [el("span", { text: w }), el("i", { text: "✦" })]);
    $("sh-ticker").replaceChildren(...run(), ...run());
  }

  function latestDrop() {
    const st = state.settings;
    const ks = state.collections.filter((k) => k.active || state.preview);
    const k = (st.featured_collection && ks.find((x) => x.slug === st.featured_collection))
      || ks.find((x) => !released(x)) || ks.find((x) => state.products.some((p) => p.collection === x.slug));
    if (!k) return null;
    const out = released(k);
    const n = out ? state.products.filter((p) => p.collection === k.slug).length : k.count;
    const bg = k.image ? el("img", { class: "db-bg", src: S.mediaUrl(k.image), alt: "", loading: "lazy", decoding: "async" })
      : el("img", { class: "db-bg art", src: "/assets/home/poster-1200.webp", srcset: "/assets/home/poster-1200.webp 1200w, /assets/home/poster-2400.webp 2400w", sizes: "100vw", alt: "", loading: "lazy", decoding: "async" });
    return el("section", { class: "container sh-section", "aria-labelledby": "drop-title" },
      el("a", { class: "drop-band" + (out ? "" : " soon"), href: S.href("drop", k.slug) }, [
        bg, el("span", { class: "db-shade", "aria-hidden": "true" }),
        k.code ? el("span", { class: "db-code", "aria-hidden": "true", text: k.code }) : null,
        el("span", { class: "db-copy" }, [
          el("span", { class: "eyebrow" }, [el("span", { class: "num", text: out ? "Out now" : "Incoming" }), "Latest drop"]),
          el("span", { class: "db-name", id: "drop-title", text: k.name }),
          k.tagline ? el("span", { class: "db-tag", text: k.tagline }) : null,
          out ? el("span", { class: "db-meta" }, [ic("package"), n === 1 ? "1 artifact" : n + " artifacts"])
            : el("span", { class: "db-meta" }, [countdown(k.release)]),
          el("span", { class: "btn btn-line db-go" }, [el("span", { text: out ? "Enter the drop" : "See what's coming" }), ic("arrow-right", "arrow")])
        ])
      ]));
  }

  function vault(route) {
    const ps = state.products;
    const counts = new Map();
    ps.forEach((p) => { if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1); });
    const cats = state.categories.filter((c) => counts.get(c.slug));
    const def = state.settings.default_sort || "featured";
    let sort = SORTS.some(([k]) => k === route.sort) ? route.sort : def;
    const current = () => (cats.some((x) => x.slug === state.route.category) ? state.route.category : "");
    const sortParam = () => (sort !== def ? { sort: sort } : null);
    const wrap = el("section", { class: "container sh-section", id: "vault", "aria-labelledby": "vault-title" });
    const total = el("span", { class: "sh-count" });
    const head = el("div", { class: "sh-head" }, [
      el("div", null, [el("p", { class: "eyebrow" }, [el("span", { class: "num", text: "01" }), "The vault"]),
        el("h2", { class: "h-lg", id: "vault-title" }, ["All ", el("span", { class: "grad", text: "artifacts" })])]),
      total
    ]);
    const body = el("div", { class: "vault-body" });
    const pills = el("div", { class: "pills", role: "group", "aria-label": "Category" });
    function pill(slug, label, n, iconName) {
      const b = el("button", { type: "button", class: "pill", "aria-pressed": String(slug === current()) }, [iconName ? ic(iconName) : null, el("span", { text: label }), el("small", { text: String(n) })]);
      b.addEventListener("click", () => {
        if (slug === current()) return;
        history.replaceState(history.state, "", S.href("category", slug, sortParam()));
        S.swap(() => { state.route = { view: "home", category: slug, sort: sort }; paintVault(); });
      });
      return b;
    }
    const sel = el("select", { class: "sel", id: "sort", "aria-label": "Sort" }, SORTS.map(([k, l]) => el("option", { value: k, text: l, selected: k === sort })));
    sel.addEventListener("change", () => {
      sort = sel.value;
      state.route.sort = sort;
      history.replaceState(history.state, "", S.href("category", current(), sortParam()));
      S.swap(paintVault);
    });
    function paintVault() {
      const c = current();
      pills.replaceChildren(pill("", "All", ps.length), ...cats.map((x) => pill(x.slug, x.name, counts.get(x.slug), x.icon)));
      window.egIcons && window.egIcons(pills);
      let list = ps.filter((p) => !c || p.category === c);
      list = sortList(list, sort);
      total.textContent = pad(list.length) + (list.length === 1 ? " item" : " items");
      if (!ps.length) {
        body.replaceChildren(emptyState({ title: "The void is empty", text: "No artifacts detected in this sector yet. The first drop is being prepared.",
          action: el("a", { class: "btn btn-line", href: S.C.DISCORD_INVITE || "https://discord.gg/enviousgluttony", target: "_blank", rel: "noopener" }, [ic("discord"), el("span", { text: "Hear about it first" })]) }));
      } else if (!list.length) {
        body.replaceChildren(emptyState({ kicker: "No signal", title: "Nothing here right now", text: "No artifacts in this sector. Try another category.",
          action: el("a", { class: "btn btn-line", href: S.href("home") }, el("span", { text: "Show everything" })) }));
      } else {
        body.replaceChildren(grid(list));
      }
      window.egIcons && window.egIcons(body);
    }
    const tools = el("div", { class: "vault-tools" }, [pills, el("label", { class: "sort" }, [el("span", { class: "sr-only", text: "Sort" }), ic("sliders-horizontal"), sel])]);
    wrap.append(...[head, cats.length > 1 || ps.length > 4 ? tools : null, body].filter(Boolean));
    state.route.category = current();
    paintVault();
    return wrap;
  }
  function sortList(list, sort) {
    const by = {
      featured: (a, b) => (b.featured - a.featured) || (a.position - b.position),
      newest: (a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0),
      "price-asc": (a, b) => a.minPrice - b.minPrice,
      "price-desc": (a, b) => b.minPrice - a.minPrice,
      name: (a, b) => a.name.localeCompare(b.name)
    }[sort] || (() => 0);
    // sold-out pieces stay on show, just after everything you can still get
    return list.slice().sort((a, b) => (sort === "name" ? 0 : (b.in_stock - a.in_stock)) || by(a, b));
  }

  /* Support: a contribution, set apart from the merch so nobody mistakes it for a product. */
  function support() {
    const st = state.settings;
    if (!st.support) return null;
    const title = st.support_title || "Fuel the void";
    const words = title.split(" ");
    const last = words.pop();
    const copy = el("div", { class: "sp-copy" }, [
      el("p", { class: "eyebrow" }, [el("span", { class: "num", text: "02" }), "Support · not a product"]),
      el("h2", { class: "h-lg", id: "support-title" }, [words.length ? words.join(" ") + " " : "", el("span", { class: "grad-pink", text: last })]),
      el("p", { class: "sp-blurb", text: st.support_blurb || "Help fund future projects, giveaways, infrastructure, merch, events and the continued growth of Envious Gluttony™. Every bit goes back into the community." })
    ]);
    // the owners' own support page wins; without one, support runs through Stripe checkout once that's on
    if (st.support_url) {
      let host = "";
      try { host = new URL(st.support_url).hostname.replace(/^www\./, ""); } catch (e) { /* shown without it */ }
      const name = { "buymeacoffee.com": "Buy Me a Coffee", "ko-fi.com": "Ko-fi", "patreon.com": "Patreon" }[host] || host;
      copy.append(el("div", { class: "sp-acts" }, el("a", { class: "btn btn-fuel", href: st.support_url, target: "_blank", rel: "noopener" },
        [ic("flame"), el("span", { text: name ? "Support on " + name : "Support Envious Gluttony" }), ic("arrow-up-right")])));
      if (host) copy.append(el("p", { class: "sp-via", text: "Opens " + host + " in a new tab. Pick any amount there." }));
    } else if (st.checkout) copy.append(window.SHOP.cartUI.supportForm(st));
    else {
      copy.append(el("p", { class: "sp-soon" }, [el("span", { class: "led", "aria-hidden": "true" }),
        el("span", { text: "Support opens soon. When it does, this is where it'll live." })]));
    }
    copy.append(el("p", { class: "sp-fine", text: "Support is a contribution to the community, not a purchase. Nothing ships." }));
    return el("section", { class: "container sh-section", id: "support", "aria-labelledby": "support-title" },
      el("div", { class: "support" }, [
        el("div", { class: "sp-art", "aria-hidden": "true" }, el("img", { src: "/assets/home/poster-1200.webp", srcset: "/assets/home/poster-1200.webp 1200w, /assets/home/poster-2400.webp 2400w", sizes: "(max-width: 900px) 100vw, 60vw", alt: "", loading: "lazy", decoding: "async" })),
        copy
      ]));
  }

  /* Facts only: what the settings actually say. */
  function promises() {
    const st = state.settings;
    const items = [];
    const ship = st.shipping_note || (st.free_shipping ? "Free shipping on orders over " + money(st.free_shipping) + "." : null);
    if (ship) items.push(["truck", "Shipping", ship]);
    if (st.checkout) items.push(["lock", "Secure checkout", "Payments run through Stripe. Your card details never touch our servers."]);
    items.push(["message-circle", "Questions", "Ask the staff in the Discord. Real people, usually quick."]);
    return el("section", { class: "container sh-section tight" }, el("ul", { class: "promises" }, items.map(([i, t, d]) =>
      el("li", null, [ic(i), el("div", null, [el("b", { text: t }), el("span", { text: d })])]))));
  }

  function home(route, opts) {
    show("home");
    document.title = "Envious Supply · Official Envious Gluttony™ merch";
    hero();
    ticker();
    const st = state.settings;
    const parts = [
      st.notice ? el("div", { class: "container" }, el("p", { class: "notice" }, [ic("info"), el("span", { text: st.notice })])) : null,
      latestDrop(),
      vault(route),
      support(),
      promises()
    ].filter(Boolean);
    $("home-dynamic").replaceChildren(...parts);
    window.egIcons && window.egIcons($("view-home"));
    S.reveal($("home-dynamic").querySelectorAll(".drop-band, .sh-head, .support, .promises li, .notice"));
    if (opts && opts.first && location.hash) requestAnimationFrame(() => S.scrollToId(location.hash.slice(1)));
  }

  /* ---------- a product ---------- */
  function gallery(p) {
    const imgs = p.images || [];
    const track = el("div", { class: "gal-track", tabindex: imgs.length > 1 ? "0" : null, "aria-label": imgs.length > 1 ? "Pictures, " + imgs.length + " of them. Use the arrow keys." : null });
    const slides = (imgs.length ? imgs : [null]).map((img, i) => {
      const fig = el("figure", { class: "gal-slide" }, [img ? S.picture(img, { full: true, product: p, eager: i === 0, alt: img.alt || (i === 0 ? p.name : p.name + ", picture " + (i + 1)), sizes: "(max-width: 900px) 100vw, 55vw" }) : S.placeholder(p)]);
      if (img && S.fine && !S.reduce) {
        fig.addEventListener("pointermove", (e) => {
          const r = fig.getBoundingClientRect();
          fig.style.setProperty("--zx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
          fig.style.setProperty("--zy", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
          fig.classList.add("zoom");
        });
        fig.addEventListener("pointerleave", () => fig.classList.remove("zoom"));
      }
      return fig;
    });
    track.append(...slides);
    const frame = el("div", { class: "gal-frame" }, [track, ...corners(), el("span", { class: "gal-serial", text: "#" + pad(p.serial) })]);
    const box = el("div", { class: "gallery" }, frame);
    if (imgs.length < 2) return box;
    let cur = 0;
    const thumbs = el("div", { class: "gal-thumbs", role: "group", "aria-label": "Choose a picture" }, imgs.map((img, i) =>
      el("button", { type: "button", class: "gal-th", "aria-label": "Picture " + (i + 1), "aria-pressed": String(i === 0), onclick: () => goTo(i) },
        S.picture(img, { product: p, alt: "", sizes: "96px" }))));
    const dots = el("div", { class: "gal-dots", "aria-hidden": "true" }, imgs.map((_, i) => el("span", { class: i === 0 ? "on" : null })));
    const prev = el("button", { type: "button", class: "round gal-prev", "aria-label": "Previous picture", onclick: () => goTo(cur - 1) }, ic("chevron-left"));
    const next = el("button", { type: "button", class: "round gal-next", "aria-label": "Next picture", onclick: () => goTo(cur + 1) }, ic("chevron-right"));
    frame.append(prev, next, dots);
    box.append(thumbs);
    function goTo(i) {
      i = (i + imgs.length) % imgs.length;
      track.scrollTo({ left: slides[i].offsetLeft, behavior: S.reduce ? "auto" : "smooth" });
      mark(i);
    }
    function mark(i) {
      cur = i;
      Array.from(thumbs.children).forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
      Array.from(dots.children).forEach((d, k) => d.classList.toggle("on", k === i));
    }
    let st;
    track.addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(() => mark(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))), 60); }, { passive: true });
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(cur + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(cur - 1); }
    });
    return box;
  }

  function buyBox(p, opts) {
    opts = opts || {};
    const st = state.settings || {};
    const options = (p.options || []).filter((o) => o && o.name && (o.values || []).length);
    const variants = p.variants || [];
    const sel = {};
    // one choice, or only one buyable combination: pick it for them
    options.forEach((o) => { if (o.values.length === 1) sel[o.name] = o.values[0]; });
    const buyable = variants.filter((v) => v.available);
    if (options.length && buyable.length === 1) Object.assign(sel, buyable[0].opts);
    let qty = 1;

    const match = () => (options.length && options.every((o) => sel[o.name]) ? variants.find((v) => options.every((o) => v.opts[o.name] === sel[o.name])) || null : null);
    const okFor = (name, val) => variants.some((v) => v.available && v.opts[name] === val && options.every((o) => o.name === name || !sel[o.name] || v.opts[o.name] === sel[o.name]));

    const price = el("div", { class: "pd-price" });
    const stock = el("div");
    const optBox = el("div", { class: "pd-opts" });
    const qn = el("output", { class: "qn", "aria-live": "polite", text: "1" });
    const minus = el("button", { type: "button", class: "qb", "aria-label": "One fewer" }, ic("minus"));
    const plus = el("button", { type: "button", class: "qb", "aria-label": "One more" }, ic("plus"));
    const add = el("button", { type: "button", class: "btn btn-apply add" });
    const msg = el("p", { class: "pd-msg", role: "alert" });

    function maxQty() {
      const v = match();
      const left = v ? v.left : options.length ? null : p.left;
      return Math.max(1, Math.min(20, typeof left === "number" ? left : 20));
    }
    function paint() {
      const v = match();
      const shown = v ? Object.assign({}, p, { price: v.price, varies: false }) : p;
      price.replaceChildren(...[priceRow(shown, true), p.salePct >= 1 ? el("span", { class: "badge b-sale", text: "Save " + p.salePct + "%" }) : null].filter(Boolean));
      stock.replaceChildren(stockLine(p, v));
      optBox.replaceChildren(...options.map((o) => {
        const group = el("div", { class: "opt", role: "radiogroup", "aria-label": o.name });
        const head = el("p", { class: "opt-h" }, [el("span", { text: o.name }), el("b", { text: sel[o.name] || "Choose" })]);
        group.append(...o.values.map((val) => {
          const ok = okFor(o.name, val);
          const b = el("button", { type: "button", role: "radio", class: "chip" + (ok ? "" : " x"), "aria-checked": String(sel[o.name] === val),
            "aria-label": val + (ok ? "" : ", sold out") }, el("span", { text: val }));
          b.addEventListener("click", () => { sel[o.name] = val; msg.textContent = ""; optBox.classList.remove("need"); qty = Math.min(qty, maxQty()); paint(); });
          return b;
        }));
        return el("fieldset", { class: "opt-set" }, [el("legend", { class: "sr-only", text: o.name }), head, group]);
      }));
      qty = Math.min(qty, maxQty());
      qn.textContent = String(qty);
      minus.disabled = qty <= 1;
      plus.disabled = qty >= maxQty();
      const missing = options.find((o) => !sel[o.name]);
      const soldOut = !p.in_stock || (v && !v.available);
      add.disabled = soldOut || !!opts.preview;
      add.replaceChildren(...(soldOut ? [ic("lock"), el("span", { text: "Sold out" })]
        : missing ? [ic("shopping-bag"), el("span", { text: "Choose " + missing.name.toLowerCase() })]
        : [ic("shopping-bag"), el("span", { text: "Add to cart" }), el("span", { class: "add-p", text: money((v ? v.price : p.price) * qty) })]));
      window.egIcons && window.egIcons(add);
    }
    minus.addEventListener("click", () => { qty = Math.max(1, qty - 1); paint(); });
    plus.addEventListener("click", () => { qty = Math.min(maxQty(), qty + 1); paint(); });
    add.addEventListener("click", () => {
      const missing = options.find((o) => !sel[o.name]);
      if (missing) {
        msg.textContent = "Pick a " + missing.name.toLowerCase() + " first.";
        optBox.classList.remove("need"); void optBox.offsetWidth; optBox.classList.add("need");
        const first = optBox.querySelector("fieldset:nth-of-type(" + (options.indexOf(missing) + 1) + ") .chip");
        if (first) first.focus();
        return;
      }
      const v = match();
      try {
        S.cart.add(p, v, qty);
      } catch (e) { msg.textContent = e.message; return; }
      add.classList.remove("done"); void add.offsetWidth; add.classList.add("done");
      window.SHOP.cartUI.added(p, v, qty, add);
    });
    paint();

    const k = p.collection && S.collection(p.collection);
    const c = p.category && S.category(p.category);
    const sections = [];
    if (p.description) sections.push(["Details", el("div", { class: "prose" }, prose(p.description)), true]);
    if ((p.specs || []).length) sections.push(["Specifications", el("dl", { class: "specs" }, p.specs.flatMap((s) => [el("dt", { text: s.label }), el("dd", { text: s.value })])), !p.description]);
    const shipText = p.kind === "digital" ? "Digital: nothing ships. You'll get it online after checkout."
      : p.shipping_note || st.shipping_note || (st.free_shipping ? "Free shipping on orders over " + money(st.free_shipping) + "." : null);
    if (shipText) sections.push(["Shipping", el("p", { text: shipText }), false]);
    if (p.limited) sections.push(["Edition", el("p", { text: p.edition_size ? "A limited run of " + p.edition_size + ". When they're gone, they're gone." : "A limited run. When it's gone, it's gone." }), false]);

    const ltd = p.limited && p.edition_size && typeof p.left === "number"
      ? el("div", { class: "ltd" }, [el("div", { class: "ltd-h" }, [el("span", { text: "Limited run" }), el("b", { text: p.left + " / " + p.edition_size + " left" })]),
        el("span", { class: "bar", "aria-hidden": "true" }, el("i", { style: "--p:" + Math.max(0, Math.min(100, (p.left / p.edition_size) * 100)).toFixed(1) + "%" }))])
      : null;

    const box = el("div", { class: "pd-buy" }, [
      el("p", { class: "pd-k" }, [el("span", { text: p._code || S.codeOf(p) }), el("span", { text: "#" + pad(p.serial || 0) }),
        // the code already names the category unless the product is in a coded drop
        c && k && k.code ? el("a", { href: S.href("category", c.slug), text: c.name }) : null]),
      el("h1", { class: "pd-name", text: p.name }),
      p.subtitle ? el("p", { class: "pd-sub", text: p.subtitle }) : null,
      price, stock, ltd, optBox,
      el("div", { class: "pd-row" }, [el("div", { class: "qty", role: "group", "aria-label": "Quantity" }, [minus, qn, plus]), add]),
      msg,
      opts.preview ? el("p", { class: "pd-note", text: "Preview: the button works once it's published." })
        : !st.checkout ? el("p", { class: "pd-note" }, [ic("info"), el("span", { text: "Checkout opens soon. Your cart is saved on this device until then." })]) : null,
      k ? el("a", { class: "pd-drop", href: S.href("drop", k.slug) }, [ic("layers"), el("span", null, [el("small", { text: "Part of" }), el("b", { text: (k.code ? k.code + " · " : "") + k.name })]), ic("arrow-right")]) : null,
      sections.length ? el("div", { class: "acc" }, sections.map(([t, body, open]) => el("details", { open: open || null }, [el("summary", null, [el("span", { text: t }), ic("plus")]), el("div", { class: "acc-b" }, body)]))) : null,
      (p.tags || []).length ? el("p", { class: "pd-tags" }, p.tags.map((t) => el("span", { text: "#" + t }))) : null
    ]);
    box.addButton = add;
    box.price = () => money(match() ? match().price : p.minPrice);
    return box;
  }
  // plain text with blank lines between paragraphs
  function prose(text) {
    return String(text).split(/\n{2,}/).map((para) => {
      const p = el("p");
      para.split("\n").forEach((line, i) => { if (i) p.append(el("br")); p.append(line); });
      return p;
    });
  }

  function related(p) {
    const others = state.products.filter((x) => x.id !== p.id);
    const score = (x) => (x.collection && x.collection === p.collection ? 4 : 0) + (x.category && x.category === p.category ? 2 : 0) + (x.in_stock ? 1 : 0);
    const list = others.slice().sort((a, b) => score(b) - score(a) || a.position - b.position).slice(0, 4);
    if (!list.length) return null;
    return el("section", { class: "sh-section related", "aria-labelledby": "rel-title" }, [
      el("div", { class: "sh-head" }, [el("div", null, [el("p", { class: "eyebrow" }, [el("span", { class: "num", text: "→" }), "Keep looking"]),
        el("h2", { class: "h-md", id: "rel-title" }, ["More from the ", el("span", { class: "grad", text: "vault" })])])]),
      grid(list)
    ]);
  }

  function productPage(p, opts) {
    opts = opts || {};
    const c = p.category && S.category(p.category);
    const crumbs = el("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, el("ol", null, [
      el("li", null, el("a", { href: S.href("home") }, "Shop")),
      c ? el("li", null, el("a", { href: S.href("category", c.slug) }, c.name)) : null,
      el("li", { "aria-current": "page", text: p.name })
    ]));
    const buy = buyBox(p, opts);
    const page = el("div", { class: "pdp container" }, [crumbs, el("div", { class: "pdp-grid" }, [gallery(p), buy]), opts.preview ? null : related(p)]);
    // phones: the price and button follow you once the real button scrolls away
    const bar = el("div", { class: "buybar", "aria-hidden": "true" }, [el("span", { class: "bb-n" }, [el("b", { text: p.name }), el("span", { text: buy.price() })]),
      el("button", { type: "button", class: "btn btn-apply btn-sm", tabindex: "-1", onclick: () => buy.addButton.click() }, [ic("shopping-bag"), el("span", { text: p.in_stock ? "Add" : "Sold out" })])]);
    if (!opts.preview && p.in_stock && "IntersectionObserver" in window) {
      document.body.append(bar);
      const ob = new IntersectionObserver(([e]) => {
        const below = !e.isIntersecting && e.boundingClientRect.top < 0;
        bar.classList.toggle("on", below && window.innerWidth < 900);
        bar.querySelector(".bb-n span").textContent = buy.price();
      });
      ob.observe(buy.addButton);
      leave.push(() => { ob.disconnect(); bar.remove(); });
    }
    return page;
  }

  function item(route) {
    const p = state.bySlug.get(route.slug);
    if (!p) { lost(); return; }
    show("page");
    document.title = p.name + " · Envious Supply";
    $("view-page").replaceChildren(productPage(p));
    window.egIcons && window.egIcons($("view-page"));
    S.reveal($("view-page").querySelectorAll(".gallery, .pd-buy > *"));
  }

  /* A product staff are still editing, handed over from the Staff Hub on this device. */
  function draft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem("eg-shop-draft") || "null"); } catch (e) { /* nothing to show */ }
    state.settings = state.settings || {};
    if (d && d.currency) state.settings.currency = d.currency;
    if (!d || !d.product) { lost("There's no preview waiting on this device. Open it again from the Staff Hub's product editor."); return; }
    const p = S.decorate(Object.assign({ images: [], variants: [], options: [], specs: [], tags: [], serial: 0 }, d.product));
    show("page");
    document.title = "Preview: " + p.name + " · Envious Supply";
    $("view-page").replaceChildren(productPage(p, { preview: true }));
    window.egIcons && window.egIcons($("view-page"));
  }

  /* ---------- a drop ---------- */
  function drop(route) {
    const k = S.collection(route.slug);
    if (!k) { lost("That drop isn't in the vault. It may have been moved or taken down."); return; }
    show("page");
    document.title = k.name + " · Envious Supply";
    const out = released(k) || state.preview;
    const list = sortList(state.products.filter((p) => p.collection === k.slug), "featured");
    const bg = k.image ? el("img", { class: "dh-bg", src: S.mediaUrl(k.image), alt: "", decoding: "async" })
      : el("img", { class: "dh-bg art", src: "/assets/home/poster-1200.webp", srcset: "/assets/home/poster-1200.webp 1200w, /assets/home/poster-2400.webp 2400w", sizes: "100vw", alt: "", decoding: "async" });
    const head = el("header", { class: "drop-hero" }, [bg, el("span", { class: "db-shade", "aria-hidden": "true" }),
      el("div", { class: "container dh-in" }, [
        el("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, el("ol", null, [el("li", null, el("a", { href: S.href("home") }, "Shop")), el("li", { "aria-current": "page", text: k.name })])),
        k.code ? el("p", { class: "dh-code", text: k.code }) : null,
        el("h1", { class: "h-xl", text: k.name }),
        k.tagline ? el("p", { class: "dh-tag", text: k.tagline }) : null,
        k.description ? el("div", { class: "dh-desc" }, prose(k.description)) : null,
        released(k) ? el("p", { class: "dh-meta" }, [el("span", { class: "led", "aria-hidden": "true" }), "Out now", k.release ? " · since " + k.release.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "", " · " + list.length + (list.length === 1 ? " artifact" : " artifacts")])
          : el("div", { class: "dh-meta soon" }, [el("span", null, "Drops " + k.release.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), countdown(k.release)])
      ])]);
    let body;
    if (!out) {
      body = emptyState({ kicker: "Incoming", title: k.count ? k.count + (k.count === 1 ? " artifact" : " artifacts") + " on the way" : "Being prepared", text: "This drop unlocks when the timer hits zero. Keep this page open, or come back then.", cls: "incoming" });
    } else if (!list.length) {
      body = emptyState({ title: "Nothing in this drop yet", text: "No artifacts detected in this drop. Check back soon.", action: el("a", { class: "btn btn-line", href: S.href("home") }, el("span", { text: "Back to the vault" })) });
    } else body = grid(list);
    $("view-page").replaceChildren(el("div", { class: "drop-page" }, [head, el("section", { class: "container sh-section" }, body)]));
    window.egIcons && window.egIcons($("view-page"));
  }

  /* ---------- sealed, lost, failed ---------- */
  function sealed() {
    const d = state.data || {};
    show("page");
    document.title = "The vault is sealed · Envious Supply";
    document.body.classList.add("is-sealed");
    $("view-page").replaceChildren(el("section", { class: "sealed", "aria-labelledby": "sealed-title" }, [
      el("div", { class: "seal-art", "aria-hidden": "true" }, [el("span", { class: "seal-ring" }), el("span", { class: "seal-ring r2" }), el("span", { class: "seal-ring r3" }),
        el("span", { class: "seal-lock" }, ic("lock"))]),
      el("p", { class: "void-k", text: "Envious Supply · Offline" }),
      el("h1", { class: "h-xl", id: "sealed-title" }, (d.title || "The vault is sealed").split(" ").map((w, i, a) => i === a.length - 1 ? el("span", { class: "grad", text: w }) : w + " ")),
      el("p", { class: "void-t", text: d.message || "New artifacts are being prepared. Return soon." }),
      el("div", { class: "sh-ctas" }, [el("a", { class: "btn btn-apply", href: "/" }, [el("span", { text: "Back to Envious Gluttony" }), ic("arrow-right", "arrow")]),
        el("a", { class: "btn btn-line", href: S.C.DISCORD_INVITE || "https://discord.gg/enviousgluttony", target: "_blank", rel: "noopener" }, [ic("discord"), el("span", { text: "Get pinged when it opens" })])])
    ]));
    window.egIcons && window.egIcons($("view-page"));
  }
  function lost(text) {
    show("page");
    document.title = "Signal lost · Envious Supply";
    $("view-page").replaceChildren(el("div", { class: "container sh-section lost" }, emptyState({ kicker: "Signal lost", title: "Not in the vault",
      text: text || "That artifact isn't here any more. It may have sold out and been taken down, or the link is wrong.",
      action: el("a", { class: "btn btn-apply", href: S.href("home") }, [el("span", { text: "Back to the vault" }), ic("arrow-right", "arrow")]) })));
    window.egIcons && window.egIcons($("view-page"));
  }
  S.fail = function (e) {
    show("page");
    $("view-page").replaceChildren(el("div", { class: "container sh-section lost" }, emptyState({ kicker: "Uplink failed", title: "Couldn't reach the vault",
      text: (e && e.message) || "Check your connection and try again.",
      action: el("button", { type: "button", class: "btn btn-apply", onclick: () => location.reload() }, [ic("refresh-cw"), el("span", { text: "Try again" })]) })));
    window.egIcons && window.egIcons($("view-page"));
  };

  /* ---------- switching pages ---------- */
  function show(which) {
    $("view-home").hidden = which !== "home";
    $("view-page").hidden = which !== "page";
  }
  S.renderer = function (route, opts) {
    timers.forEach(clearInterval); timers = [];
    leave.forEach((f) => { try { f(); } catch (e) { /* gone anyway */ } }); leave = [];
    document.body.classList.remove("is-sealed");
    if (route.view === "draft") { draft(); chrome(); return; }
    if (!state.data) return;
    if (state.data.sealed && !state.staff) { sealed(); return; }
    chrome();
    if (route.view === "item") item(route);
    else if (route.view === "drop") drop(route);
    else home(route, opts);
    if (opts && opts.nav) { const m = $("main"); m.focus({ preventScroll: true }); }
  };
})();
