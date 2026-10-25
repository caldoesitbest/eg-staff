/* Envious Supply (/shop/): the core. Data, money, pictures, the cart, the address bar, and the sky.
   The database decides what's for sale and what it costs; this file only shows it and remembers the cart. */
(function () {
  "use strict";

  const C = window.EG_CONFIG || {};
  const EG = window.EG;
  const icon = window.egIcon;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (id) => document.getElementById(id);
  const MEDIA = String(C.SUPABASE_URL || "").replace(/\/+$/, "") + "/storage/v1/object/public/shop-media/";

  /* ---------- small helpers ---------- */
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(kids === undefined ? [] : kids)) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const ic = (name, cls) => icon(name, "i-" + name + (cls ? " " + cls : ""));
  const pad = (n, w) => String(n).padStart(w || 3, "0");

  let fmtMoney = null;
  function money(cents) {
    if (cents === null || cents === undefined) return "";
    if (!fmtMoney) {
      const cur = (state.settings && state.settings.currency) || "USD";
      try { fmtMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: cur }); }
      catch (e) { fmtMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }); }
    }
    return fmtMoney.format(cents / 100);
  }
  const mediaUrl = (path) => (path ? MEDIA + String(path).split("/").map(encodeURIComponent).join("/") : "");

  /* A picture with its small copy for grids and the full one for big screens. */
  function picture(img, opts) {
    opts = opts || {};
    if (!img || !img.path) return null;
    const full = mediaUrl(img.path), small = img.thumb ? mediaUrl(img.thumb) : full;
    const w = img.w || 1200, h = img.h || 1500;
    const sw = img.thumb ? Math.min(720, w) : w;
    const node = el("img", {
      src: opts.full ? full : small, alt: opts.alt !== undefined ? opts.alt : (img.alt || ""),
      width: w, height: h, loading: opts.eager ? "eager" : "lazy", decoding: "async", class: opts.cls || null,
      fetchpriority: opts.eager ? "high" : null,
      srcset: img.thumb && full !== small ? small + " " + sw + "w, " + full + " " + w + "w" : null,
      sizes: img.thumb ? (opts.sizes || "(max-width: 700px) 50vw, 25vw") : null
    });
    node.addEventListener("load", () => node.classList.add("in"), { once: true });
    node.addEventListener("error", () => {
      const ph = placeholder(opts.product || {});
      if (opts.cls) ph.classList.add(...opts.cls.split(" "));
      node.replaceWith(ph);
    }, { once: true });
    return node;
  }
  /* No picture yet: the EG mark on a little planet, with the item's number. */
  function placeholder(p) {
    return el("div", { class: "ph", "aria-hidden": "true" }, [
      el("img", { src: "/assets/home/eg-mark.webp", alt: "", width: 144, height: 108, loading: "lazy" }),
      el("span", { text: p && p.serial ? "#" + pad(p.serial) : "No signal" })
    ]);
  }

  /* ---------- data ---------- */
  const state = {
    data: null, settings: null, products: [], bySlug: new Map(), byId: new Map(),
    categories: [], collections: [], preview: false, staff: false, sealed: false, loadedAt: null, route: null
  };

  function friendly(err) {
    const m = String((err && (err.message || err.msg)) || err || "");
    if (/Could not find the function|PGRST202|schema cache/i.test(m)) return "The shop isn't set up yet. An owner needs to run shop.sql in Supabase.";
    if (/failed to fetch|network|load failed/i.test(m)) return "Couldn't reach the vault. Check your connection and try again.";
    return m || "Something went wrong. Try again.";
  }
  async function rpc(name, args) {
    if (!EG || !EG.sb) throw new Error("The shop isn't connected. Add the Supabase keys to assets/config.js.");
    const { data, error } = await EG.sb.rpc(name, args || {});
    if (error) throw new Error(friendly(error));
    return data;
  }

  async function load() {
    const q = new URLSearchParams(location.search);
    const data = await rpc("shop_storefront", { p_preview: q.get("preview") === "1" });
    state.data = data;
    state.sealed = !!data.sealed;
    state.staff = !!data.staff;
    state.preview = !!data.preview;
    state.settings = data.settings || {};
    fmtMoney = null;
    state.products = (data.products || []).map(decorate);
    state.bySlug = new Map(state.products.map((p) => [p.slug, p]));
    state.byId = new Map(state.products.map((p) => [p.id, p]));
    state.categories = data.categories || [];
    state.collections = (data.collections || []).map((k) => Object.assign(k, { release: k.release_at ? new Date(k.release_at) : null }));
    // the server's clock decides when a drop is out, not the visitor's
    state.skew = data.server_now ? new Date(data.server_now).getTime() - Date.now() : 0;
    state.loadedAt = new Date();
    return data;
  }
  const now = () => Date.now() + (state.skew || 0);

  /* Extra facts every view uses. */
  function decorate(p) {
    const prices = (p.variants || []).filter((v) => v.available).map((v) => v.price);
    const all = (p.variants || []).map((v) => v.price);
    p.minPrice = prices.length ? Math.min(...prices) : all.length ? Math.min(...all) : p.price;
    p.varies = new Set(all).size > 1;
    p.isNew = !!p.published_at && Date.now() - new Date(p.published_at).getTime() < 21 * 86400000;
    p.salePct = p.compare_at && p.compare_at > p.price ? Math.round((1 - p.price / p.compare_at) * 100) : 0;
    p.low = p.in_stock && typeof p.left === "number" && p.left > 0 && p.left <= 5;
    return p;
  }
  const category = (slug) => state.categories.find((c) => c.slug === slug) || null;
  const collection = (slug) => state.collections.find((k) => k.slug === slug) || null;

  /* The terminal tag on cards: the drop's code, or the category. ENV//DROP-001 */
  function codeOf(p) {
    const k = p.collection && collection(p.collection);
    const c = p.category && category(p.category);
    const tail = k && k.code ? k.code : c ? c.name : "Supply";
    return "ENV//" + String(tail).toUpperCase().replace(/\s+/g, "-");
  }

  /* ---------- addresses: everything lives at /shop/ with a query, so links work on a static host ---------- */
  function href(kind, slug, extra) {
    const q = new URLSearchParams();
    if (kind === "item") q.set("item", slug);
    else if (kind === "drop") q.set("drop", slug);
    else if (kind === "category" && slug) q.set("category", slug);
    if (state.preview) q.set("preview", "1");
    for (const [k, v] of Object.entries(extra || {})) if (v) q.set(k, v);
    const s = q.toString();
    return "/shop/" + (s ? "?" + s : "");
  }
  function parse() {
    const q = new URLSearchParams(location.search);
    if (q.get("preview") === "draft") return { view: "draft" };
    if (q.get("item")) return { view: "item", slug: q.get("item") };
    if (q.get("drop")) return { view: "drop", slug: q.get("drop") };
    return { view: "home", category: q.get("category") || "", sort: q.get("sort") || "" };
  }

  let renderer = null;              // shop-views.js sets this
  function render(opts) {
    state.route = parse();
    if (renderer) renderer(state.route, opts || {});
  }
  function go(url, opts) {
    opts = opts || {};
    if (url === location.pathname + location.search && !opts.force) { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); return; }
    history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), "");
    history[opts.replace ? "replaceState" : "pushState"]({ y: 0 }, "", url);
    swap(() => { render({ nav: true }); window.scrollTo(0, 0); });
  }
  /* page changes cross-fade where the browser can (View Transitions); otherwise they just change */
  function swap(fn) {
    if (!reduce && document.startViewTransition) {
      try { document.startViewTransition(fn); return; } catch (e) { /* fall through */ }
    }
    fn();
  }
  window.addEventListener("popstate", (e) => {
    swap(() => { render({ nav: true }); window.scrollTo(0, (e.state && e.state.y) || 0); });
  });
  // same-page links (cards, breadcrumbs, filters) move without reloading
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname !== "/shop/") return;
    if (!state.data) return;                      // still loading: let the browser do it
    const scrollTo = a.getAttribute("data-scroll") || (u.hash && u.hash.slice(1));
    e.preventDefault();
    if (u.search === location.search && scrollTo) { scrollToId(scrollTo); return; }
    go(u.pathname + u.search);
    if (scrollTo) requestAnimationFrame(() => scrollToId(scrollTo));
  });
  function scrollToId(id) {
    const t = document.getElementById(id);
    if (t) t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  /* ---------- the cart (on this device) ---------- */
  const CART_KEY = "eg-cart";
  const cart = (() => {
    let items = read();
    const subs = new Set();
    function read() {
      try {
        const d = JSON.parse(localStorage.getItem(CART_KEY) || "null");
        return d && Array.isArray(d.items) ? d.items.filter((i) => i && typeof i.p === "string" && i.q > 0).slice(0, 30) : [];
      } catch (e) { return []; }
    }
    function write() {
      try { localStorage.setItem(CART_KEY, JSON.stringify({ v: 1, items: items, at: Date.now() })); } catch (e) { /* private mode: the cart lasts this visit */ }
      subs.forEach((f) => f(items));
    }
    const keyOf = (i) => i.p + ":" + (i.v || "");
    window.addEventListener("storage", (e) => { if (e.key === CART_KEY) { items = read(); subs.forEach((f) => f(items)); } });
    return {
      get items() { return items; },
      count: () => items.reduce((n, i) => n + (i.status && i.status !== "ok" && i.status !== "reduced" ? 0 : i.q), 0),
      keyOf: keyOf,
      add(p, v, q) {
        const k = p.id + ":" + (v ? v.id : "");
        const have = items.find((i) => keyOf(i) === k);
        const img = p.images && p.images[0];
        const snap = { name: p.name, label: v ? v.label : null, unit: v ? v.price : p.price, image: img ? img.thumb || img.path : null, slug: p.slug, kind: p.kind };
        if (have) { have.q = Math.min(20, have.q + q); have.snap = snap; have.status = "ok"; }
        else {
          if (items.length >= 30) throw new Error("Your cart is full (30 different items).");
          items.push({ p: p.id, v: v ? v.id : null, q: Math.min(20, q), snap: snap, status: "ok" });
        }
        write();
      },
      set(k, q) { const i = items.find((x) => keyOf(x) === k); if (!i) return; i.q = Math.max(1, Math.min(20, q)); write(); },
      remove(k) { items = items.filter((x) => keyOf(x) !== k); write(); },
      clear() { items = []; write(); },
      /* the server's word on each line: price, stock, still for sale */
      apply(quote) {
        const byKey = new Map((quote.lines || []).map((l) => [l.p + ":" + (l.v || ""), l]));
        for (const i of items) {
          const l = byKey.get(keyOf(i));
          if (!l) continue;
          i.status = l.status;
          i.max = l.max;
          if (l.status === "reduced") i.q = l.q;
          if (l.name) i.snap = { name: l.name, label: l.label, unit: l.unit, image: l.image, slug: l.slug, kind: l.kind };
        }
        write();
      },
      on(f) { subs.add(f); return () => subs.delete(f); }
    };
  })();

  /* ---------- toasts ---------- */
  function toast(msg, kind, extra) {
    const zone = $("toasts");
    while (zone.children.length >= 3) zone.firstElementChild.remove();
    const t = el("div", { class: "toast" + (kind ? " " + kind : "") }, [
      extra && extra.image ? extra.image : ic(kind === "bad" ? "circle-x" : kind === "ok" ? "circle-check" : "info"),
      el("span", { text: msg }), extra && extra.action ? extra.action : null
    ]);
    zone.append(t);
    window.egIcons && window.egIcons(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, kind === "bad" ? 6500 : 3800);
  }

  /* ---------- the sky ---------- */
  function stars() {
    const cv = $("stars");
    const ctx = cv && cv.getContext ? cv.getContext("2d") : null;
    if (!ctx) return;
    let W, H, list = [], last = 0, raf = 0;
    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let seed = 11;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      list = Array.from({ length: Math.min(220, Math.round((W * H) / 6500)) }, () => {
        const z = Math.pow(r(), 2.4);
        return { x: r() * W, y: r() * H, s: 0.35 + z * 1.4, a: 0.18 + r() * 0.5 + z * 0.3, tw: 0.3 + r() * 1.3, ph: r() * 6.28, c: r() < 0.12 ? "#9ff9ff" : r() < 0.1 ? "#ffb3ef" : "#fff" };
      });
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      for (const s of list) {
        ctx.globalAlpha = Math.min(1, s.a * (reduce ? 1 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.tw + s.ph)));
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, s.s * 1.4, s.s * 1.4);
      }
      ctx.globalAlpha = 1;
    }
    function loop(t) {
      raf = 0;
      if (document.hidden) return;
      if (t - last > 90) { draw(t); last = t; }
      raf = requestAnimationFrame(loop);
    }
    build();
    draw(0);
    if (!reduce) {
      raf = requestAnimationFrame(loop);
      document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) raf = requestAnimationFrame(loop); });
    }
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); draw(performance.now()); }, 150); });
  }

  /* The planet and rocks lean away from the pointer and drift as you scroll (only while the hero is on screen). */
  function parallax() {
    if (reduce) return;
    const hero = document.querySelector(".sh-hero");
    if (!hero) return;
    const layers = [[document.querySelector(".sh-planet"), -26, -16, 0.18], [document.querySelector(".sh-rock.a"), 30, 20, -0.12],
      [document.querySelector(".sh-rock.b"), 22, 16, -0.08], [document.querySelector(".sh-nebula"), -8, -6, 0.06]].filter((l) => l[0]);
    let visible = true, raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(hero);
    function kick() { if (!raf && visible) raf = requestAnimationFrame(step); }
    if (fine) window.addEventListener("pointermove", (e) => { tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5; kick(); }, { passive: true });
    window.addEventListener("scroll", kick, { passive: true });
    function step() {
      raf = 0;
      x += (tx - x) * 0.08; y += (ty - y) * 0.08;
      const sy = Math.min(window.scrollY, 1200);
      for (const [n, kx, ky, ks] of layers) n.style.transform = "translate3d(" + (x * kx).toFixed(1) + "px," + (y * ky + sy * ks).toFixed(1) + "px,0)";
      if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) kick();
    }
    kick();
  }

  /* Things rise in as they come on screen. */
  const io = !reduce && "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" })
    : null;
  function reveal(nodes) {
    Array.from(nodes || []).forEach((n, i) => {
      if (!(n instanceof HTMLElement)) return;
      if (!io) { n.classList.add("in"); return; }
      n.classList.add("rv");
      n.style.setProperty("--d", (Math.min(i, 8) * 0.06).toFixed(2) + "s");
      io.observe(n);
    });
  }

  /* The header turns solid once you scroll. */
  function header() {
    const nav = $("nav");
    const set = () => nav.classList.toggle("scrolled", window.scrollY > 24);
    set();
    window.addEventListener("scroll", set, { passive: true });
  }

  async function boot() {
    header();
    stars();
    parallax();
    $("year").textContent = String(new Date().getFullYear());
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (C.DISCORD_INVITE) document.querySelectorAll("[data-invite]").forEach((a) => { a.href = C.DISCORD_INVITE; });
    window.SHOP.cartUI && window.SHOP.cartUI.init();
    state.route = parse();
    if (state.route.view === "draft") { render(); return; }   // a staff preview from this device's editor: no need to wait
    try {
      await load();
    } catch (e) {
      window.SHOP.fail && window.SHOP.fail(e);
      return;
    }
    render({ first: true });
    window.SHOP.cartUI && window.SHOP.cartUI.refresh();
    window.SHOP.cartUI && window.SHOP.cartUI.returned();
  }

  window.SHOP = {
    C: C, EG: EG, el: el, ic: ic, pad: pad, money: money, mediaUrl: mediaUrl, picture: picture, placeholder: placeholder,
    state: state, rpc: rpc, load: load, decorate: decorate, category: category, collection: collection, codeOf: codeOf, now: now,
    href: href, go: go, render: render, swap: swap, scrollToId: scrollToId, cart: cart, toast: toast, reveal: reveal,
    reduce: reduce, fine: fine, friendly: friendly, boot: boot,
    set renderer(f) { renderer = f; }
  };
})();
