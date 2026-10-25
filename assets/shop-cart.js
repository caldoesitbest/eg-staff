/* Envious Supply: the cart (a drawer), checkout and support.
   Prices are checked against the database every time the cart opens. Paying happens on Stripe's own page,
   started by the shop-checkout function; card details never come near this site. Until an owner turns
   checkout on, the cart says so plainly and there's no pay button. */
(function () {
  "use strict";
  const S = window.SHOP;
  if (!S) return;
  const { el, ic, money, cart, C } = S;
  const $ = (id) => document.getElementById(id);
  const NOTE = {
    gone: "No longer in the shop.",
    sold_out: "Sold out.",
    unavailable: "This option isn't available any more.",
    reduced: "Fewer left than you picked, so the quantity went down.",
    choose: "Pick an option again."
  };
  let quote = null, quoteErr = null, open = false, back = null, qt = 0, closing = 0;
  let payError = "";                 // the last checkout failure, kept across repaints of the cart

  const fnUrl = () => C.SHOP_CHECKOUT_URL || String(C.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1/shop-checkout";
  const checkoutOn = () => !!(state().settings && state().settings.checkout) && !state().sealed;
  const state = () => S.state;

  /* ---------- the button in the header ---------- */
  function badge(bump) {
    const n = cart.count();
    const b = $("cart-n");
    b.textContent = n > 99 ? "99+" : String(n);
    b.hidden = !n;
    $("cart-btn").setAttribute("aria-label", n ? "Cart, " + n + (n === 1 ? " item" : " items") : "Cart, empty");
    if (bump && !S.reduce) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }

  /* ---------- checking the cart against the shop ---------- */
  async function refresh() {
    if (!cart.items.length || !S.EG || !S.EG.sb) { quote = null; if (open) paint(); return; }
    try {
      quote = await S.rpc("shop_cart_quote", { p_items: cart.items.map((i) => ({ p: i.p, v: i.v, q: i.q })) });
      quoteErr = null;
      cart.apply(quote);
    } catch (e) { quoteErr = e; }
    if (open) paint();
  }
  const later = () => { clearTimeout(qt); qt = setTimeout(refresh, 350); };

  /* ---------- the drawer ---------- */
  function openCart() {
    const box = $("cart"), scrim = $("cart-scrim");
    clearTimeout(closing);
    box.classList.remove("out"); scrim.classList.remove("out");
    if (!open) { back = document.activeElement; payError = ""; }
    open = true;
    box.hidden = false; scrim.hidden = false;
    document.body.style.overflow = "hidden";
    $("cart-btn").setAttribute("aria-expanded", "true");
    paint();
    $("cart-title").focus({ preventScroll: true });
    refresh();
  }
  function close() {
    if (!open) return;
    open = false;
    const box = $("cart"), scrim = $("cart-scrim");
    document.body.style.overflow = "";
    $("cart-btn").setAttribute("aria-expanded", "false");
    const hide = () => { box.hidden = true; scrim.hidden = true; box.classList.remove("out"); scrim.classList.remove("out"); };
    if (S.reduce) hide(); else { box.classList.add("out"); scrim.classList.add("out"); closing = setTimeout(hide, 240); }
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }

  function line(i) {
    const k = cart.keyOf(i);
    const s = i.snap || {};
    const bad = i.status && i.status !== "ok" && i.status !== "reduced";
    const max = typeof i.max === "number" && i.max > 0 ? Math.min(20, i.max) : 20;
    const minus = el("button", { type: "button", class: "qb", "aria-label": "One fewer " + s.name, disabled: bad || i.q <= 1 }, ic("minus"));
    const plus = el("button", { type: "button", class: "qb", "aria-label": "One more " + s.name, disabled: bad || i.q >= max }, ic("plus"));
    minus.addEventListener("click", () => { cart.set(k, i.q - 1); later(); });
    plus.addEventListener("click", () => { cart.set(k, i.q + 1); later(); });
    const rm = el("button", { type: "button", class: "linkish rm", "aria-label": "Remove " + s.name }, [ic("trash-2"), el("span", { text: "Remove" })]);
    rm.addEventListener("click", () => {
      const row = rm.closest(".line");
      const go = () => { cart.remove(k); later(); };
      if (S.reduce || !row) go();
      else { row.classList.add("leaving"); setTimeout(go, 220); }
    });
    const thumb = s.image ? el("img", { src: S.mediaUrl(s.image), alt: "", width: 72, height: 90, loading: "lazy", decoding: "async" }) : S.placeholder({});
    return el("li", { class: "line" + (bad ? " bad" : "") }, [
      el("a", { class: "l-img", href: s.slug ? S.href("item", s.slug) : "/shop/", tabindex: "-1", "aria-hidden": "true", onclick: close }, thumb),
      el("div", { class: "l-mid" }, [
        s.slug ? el("a", { class: "l-name", href: S.href("item", s.slug), text: s.name || "Item", onclick: close }) : el("b", { class: "l-name", text: s.name || "Item" }),
        s.label ? el("span", { class: "l-opt", text: s.label }) : null,
        i.status && NOTE[i.status] ? el("span", { class: "l-note " + i.status }, [ic(bad ? "triangle-alert" : "info"), el("span", { text: NOTE[i.status] })]) : null,
        el("div", { class: "l-acts" }, [bad ? null : el("div", { class: "qty sm", role: "group", "aria-label": "Quantity of " + s.name }, [minus, el("output", { class: "qn", text: String(i.q) }), plus]), rm])
      ]),
      el("b", { class: "l-price", text: bad ? "—" : money((s.unit || 0) * i.q) })
    ]);
  }

  function paint() {
    const body = $("cart-body"), foot = $("cart-foot");
    const items = cart.items;
    const n = cart.count();
    $("cart-title").replaceChildren(...["Cargo hold", n ? el("span", { class: "ct-n", text: String(n) }) : null].filter(Boolean));
    if (!items.length) {
      body.replaceChildren(el("div", { class: "cart-empty" }, [
        el("span", { class: "ce-art", "aria-hidden": "true" }, [el("span", { class: "void-ring" }), ic("shopping-bag")]),
        el("h3", { text: "Your cargo hold is empty" }),
        el("p", { text: "Nothing on board yet. The vault's open." }),
        el("a", { class: "btn btn-apply", href: S.href("home"), "data-scroll": "vault", onclick: () => setTimeout(close, 0) }, [el("span", { text: "Browse the vault" }), ic("arrow-right", "arrow")])
      ]));
      foot.replaceChildren();
      window.egIcons && window.egIcons(body);
      return;
    }
    body.replaceChildren(el("ul", { class: "lines" }, items.map(line)));
    const live = items.filter((i) => !i.status || i.status === "ok" || i.status === "reduced");
    const blocked = items.some((i) => i.status && i.status !== "ok" && i.status !== "reduced");
    const sub = live.reduce((t, i) => t + (i.snap && i.snap.unit ? i.snap.unit * i.q : 0), 0);
    const st = state().settings || {};
    const physical = live.some((i) => !i.snap || i.snap.kind !== "digital");
    const free = st.free_shipping, flat = st.shipping_flat;
    // the same rule checkout uses: no flat rate set means free, and so does reaching the free-shipping amount
    const ship = !physical || flat == null || (free != null && sub >= free) ? 0 : flat;
    const rows = [el("div", { class: "sum-row" }, [el("span", { text: "Subtotal" }), el("b", { text: money(sub) })])];
    if (physical) {
      rows.push(el("div", { class: "sum-row" }, [el("span", { text: "Shipping" }), el("b", { text: ship ? money(ship) : "Free" })]));
      if (free && flat && sub < free) {
        const pct = Math.max(0, Math.min(100, (sub / free) * 100));
        rows.push(el("div", { class: "freebar" }, [el("span", { text: money(free - sub) + " more for free shipping" }),
          el("span", { class: "bar", "aria-hidden": "true" }, el("i", { style: "--p:" + pct.toFixed(1) + "%" }))]));
      }
      rows.push(el("div", { class: "sum-row total" }, [el("span", { text: "Total before tax" }), el("b", { text: money(sub + ship) })]));
    }
    const action = [];
    if (checkoutOn()) {
      const go = el("button", { type: "button", class: "btn btn-apply pay", disabled: blocked || !live.length }, [ic("lock"), el("span", { text: "Check out" }), ic("arrow-right", "arrow")]);
      const err = el("p", { class: "pay-err", role: "alert", text: payError });
      go.addEventListener("click", () => checkout({ items: live.map((i) => ({ p: i.p, v: i.v, q: i.q })) }, go, err));
      action.push(go, err);
      if (blocked) action.push(el("p", { class: "cart-fine", text: "Remove the items marked above to check out." }));
      action.push(el("p", { class: "cart-fine" }, [ic("lock"), el("span", { text: "Pay on Stripe's secure page. Taxes, if any, are worked out there." })]));
    } else {
      action.push(el("p", { class: "cart-soon" }, [el("span", { class: "led", "aria-hidden": "true" }),
        el("span", { text: "Checkout opens soon. Your cart is saved on this device until then." })]));
    }
    if (quoteErr) action.push(el("p", { class: "cart-fine", text: "Couldn't check the latest prices just now." + (checkoutOn() ? " They're checked again before you pay." : "") }));
    foot.replaceChildren(el("div", { class: "sum" }, rows), ...action);
    window.egIcons && window.egIcons(box());
  }
  const box = () => $("cart");

  /* ---------- paying ---------- */
  async function checkout(payload, btn, errBox) {
    btn.disabled = true;
    btn.classList.add("busy");
    const label = btn.querySelector("span");
    const was = label ? label.textContent : "";
    if (label) label.textContent = "Opening secure checkout…";
    if (errBox) errBox.textContent = "";
    payError = "";
    try {
      const res = await fetch(fnUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: C.SUPABASE_KEY },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || (res.status === 404 ? "Checkout isn't set up yet." : "Checkout couldn't start. Try again in a moment."));
      if (!/^https:\/\/checkout\.stripe\.com\//.test(data.url)) throw new Error("Checkout sent back an address that isn't Stripe's, so we stopped.");
      try { sessionStorage.setItem("eg-checkout", JSON.stringify({ kind: payload.support_cents ? "support" : "order", at: Date.now() })); } catch (e) { /* fine */ }
      location.href = data.url;
    } catch (e) {
      const m = /failed to fetch|network|load failed/i.test(String(e && e.message)) ? "Couldn't reach checkout. Check your connection and try again." : e.message;
      if (errBox) errBox.textContent = m; else S.toast(m, "bad");
      btn.disabled = false;
      btn.classList.remove("busy");
      if (label) label.textContent = was;
      // the cart may have changed under them: check it again, keeping the message on screen
      if (payload.items) { payError = m; refresh(); }
    }
  }

  /* Coming back from Stripe. */
  async function returned() {
    const q = new URLSearchParams(location.search);
    const how = q.get("checkout");
    if (!how) return;
    const sid = q.get("session_id") || "";
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem("eg-checkout") || "null"); sessionStorage.removeItem("eg-checkout"); } catch (e) { /* fine */ }
    const u = new URL(location.href);
    u.searchParams.delete("checkout"); u.searchParams.delete("session_id");
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    if (how === "canceled") { S.toast("Checkout canceled. Nothing was charged, and your cart's still here.", null); return; }
    if (how !== "success") return;
    const support = pending && pending.kind === "support";
    if (!support) cart.clear();
    const msg = el("p", { text: support ? "Your fuel just hit the void. Stripe is emailing your receipt." : "Payment received. Stripe is emailing your receipt." });
    const num = el("p", { class: "done-num", "aria-live": "polite" });
    const dlg = el("dialog", { class: "done", "aria-labelledby": "done-title" }, [
      el("span", { class: "done-art", "aria-hidden": "true" }, [el("span", { class: "void-ring" }), el("span", { class: "void-ring r2" }), ic(support ? "flame" : "circle-check")]),
      el("p", { class: "void-k", text: "Transmission received" }),
      el("h2", { id: "done-title", text: support ? "Thank you" : "You're all set" }),
      msg, num,
      el("form", { method: "dialog" }, el("button", { class: "btn btn-apply", value: "ok" }, [el("span", { text: support ? "Back to the shop" : "Keep browsing" }), ic("arrow-right", "arrow")]))
    ]);
    document.body.append(dlg);
    window.egIcons && window.egIcons(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    // the order lands a moment after Stripe's webhook arrives
    for (let t = 0; t < 8 && /^cs_/.test(sid); t++) {
      try {
        const r = await S.rpc("shop_order_status", { p_session: sid });
        if (r && r.found) { num.textContent = (r.kind === "support" ? "Receipt" : "Order") + " #" + S.pad(r.number, 4); return; }
      } catch (e) { break; }
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }

  /* ---------- feedback when something goes in ---------- */
  function added(p, v, qty, from) {
    badge(true);
    const img = p.images && p.images[0];
    const thumb = img ? el("img", { src: S.mediaUrl(img.thumb || img.path), alt: "", class: "toast-img" }) : null;
    S.toast((qty > 1 ? qty + " × " : "") + p.name + (v ? " (" + v.label + ")" : "") + " is in your cart.", "ok",
      { image: thumb, action: el("button", { type: "button", class: "linkish", onclick: openCart }, "View cart") });
    fly(img, from);
    later();
  }
  /* the picture flies from the button into the cart */
  function fly(img, from) {
    const to = $("cart-btn");
    if (S.reduce || !img || !from || !to || !Element.prototype.animate) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const f = el("img", { src: S.mediaUrl(img.thumb || img.path), alt: "", class: "fly" });
    f.style.left = (a.left + a.width / 2 - 28) + "px";
    f.style.top = (a.top + a.height / 2 - 28) + "px";
    document.body.append(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: "translate(" + dx * 0.55 + "px," + (dy * 0.55 - 80) + "px) scale(1.15)", opacity: 1, offset: 0.55 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.25)", opacity: 0.3 }],
    { duration: 760, easing: "cubic-bezier(.3,.7,.2,1)" }).finished.then(() => f.remove(), () => f.remove());
  }

  /* ---------- support ---------- */
  function supportForm(st) {
    const amounts = (st.support_amounts || [500, 1000, 2500, 5000]).filter((a) => a >= 100).slice(0, 6);
    let pick = amounts[1] || amounts[0] || 1000;
    let custom = false;
    const go = el("button", { type: "button", class: "btn btn-fuel" });
    const err = el("p", { class: "pay-err", role: "alert" });
    const inp = el("input", { class: "inp", type: "number", inputmode: "decimal", min: "1", max: "1000", step: "1", placeholder: "Amount", "aria-label": "Custom amount in dollars" });
    const customWrap = el("label", { class: "sp-custom", hidden: true }, [el("span", { text: "$", "aria-hidden": "true" }), inp]);
    const chips = el("div", { class: "sp-amts", role: "radiogroup", "aria-label": "Amount" });
    function cents() {
      if (!custom) return pick;
      const v = Math.round(parseFloat(inp.value) * 100);
      return isFinite(v) ? v : 0;
    }
    function paintChips() {
      chips.replaceChildren(...amounts.map((a) => el("button", { type: "button", role: "radio", class: "amt", "aria-checked": String(!custom && pick === a), text: money(a).replace(/\.00$/, ""),
        onclick: () => { custom = false; pick = a; paintChips(); } })),
      el("button", { type: "button", role: "radio", class: "amt", "aria-checked": String(custom), text: "Custom", onclick: () => { custom = true; paintChips(); inp.focus(); } }));
      customWrap.hidden = !custom;
      label();
    }
    function label() {
      const c = cents();
      const ok = c >= 100 && c <= 100000;
      go.disabled = !ok;
      go.replaceChildren(ic("flame"), el("span", { text: ok ? "Send " + money(c).replace(/\.00$/, "") + " of fuel" : "Pick $1 to $1,000" }));
      window.egIcons && window.egIcons(go);
    }
    inp.addEventListener("input", label);
    go.addEventListener("click", () => {
      const c = cents();
      if (c < 100 || c > 100000) { err.textContent = "Support can be $1 to $1,000."; return; }
      checkout({ support_cents: c }, go, err);
    });
    paintChips();
    return el("div", { class: "sp-form" }, [chips, customWrap, el("div", { class: "sp-acts" }, go), err]);
  }

  function init() {
    $("cart-btn").addEventListener("click", openCart);
    $("cart-close").addEventListener("click", close);
    $("cart-scrim").addEventListener("click", close);
    $("cart").addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const f = Array.from($("cart").querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
        .filter((n) => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    // a link inside the cart (a product, "browse the vault") closes it
    $("cart").addEventListener("click", (e) => { if (e.target.closest("a[href]")) setTimeout(close, 0); });
    cart.on(() => { badge(); if (open) paint(); });
    badge();
  }

  S.cartUI = { init: init, refresh: refresh, open: openCart, close: close, added: added, supportForm: supportForm, returned: returned };
})();
