/* Envious Gluttony™: the brand dropdown menu at the top left of every page */
(function () {
  "use strict";

  const slot = document.getElementById("brand-slot");
  if (!slot) return;
  const C = window.EG_CONFIG;
  const icon = window.egIcon;
  const EG = window.EG;

  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children || [])) if (c) node.append(c);
    return node;
  }

  const button = el("button", {
    type: "button", class: "brand brand-btn", id: "brand-btn",
    "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": "brand-menu"
  }, [icon("crown"), el("span", { text: "Envious Gluttony™" }), icon("chevron-down", "chev")]);
  const menu = el("div", { class: "menu", id: "brand-menu", role: "menu", "aria-labelledby": "brand-btn", hidden: true });
  slot.replaceChildren(button, menu);

  const path = location.pathname.replace(/index\.html$/, "");
  function link(href, ic, label, opts) {
    opts = opts || {};
    return el("a", {
      href: href, role: "menuitem", class: "menu-item", tabindex: "-1",
      target: opts.ext ? "_blank" : null, rel: opts.ext ? "noopener" : null,
      "aria-current": opts.current ? "page" : null
    }, [icon(ic), el("span", { text: label }), opts.ext ? icon("external-link", "ext") : null]);
  }

  function render(state) {
    const items = [];
    if (state.user) {
      items.push(el("div", { class: "menu-who" }, [
        el("span", { text: "Signed in as" }),
        el("strong", { text: state.username ? "@" + state.username : (state.user.email || "your account") })
      ]));
    }
    items.push(link("/", "house", "Home"));
    items.push(link("/", "clipboard-list", "Staff Recruitment", { current: path === "/" }));
    items.push(el("div", { class: "menu-sep", role: "separator" }));
    if (state.user) {
      items.push(link("/account/", "user-round", "My account", { current: path === "/account/" }));
      if (state.admin) items.push(link("/admin/", "shield-check", "Admin", { current: path === "/admin/" }));
      const out = el("button", { type: "button", role: "menuitem", class: "menu-item", tabindex: "-1" }, [icon("log-out"), el("span", { text: "Sign out" })]);
      out.addEventListener("click", async () => {
        close();
        await EG.signOut();
        location.href = "/";
      });
      items.push(out);
    } else {
      items.push(link("/signin/", "log-in", "Sign in", { current: path === "/signin/" || path === "/signup/" }));
    }
    items.push(el("div", { class: "menu-sep", role: "separator" }));
    items.push(link(C.DISCORD_INVITE || "https://discord.gg/enviousgluttony", "message-circle", "Discord", { ext: true }));
    menu.replaceChildren(...items);
  }

  const focusables = () => Array.from(menu.querySelectorAll(".menu-item"));
  function open() {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const first = focusables()[0];
    if (first) first.focus();
  }
  function close(returnFocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
  }

  button.addEventListener("click", () => (menu.hidden ? open() : close()));
  document.addEventListener("click", (e) => { if (!slot.contains(e.target)) close(); });
  menu.addEventListener("click", (e) => { if (e.target.closest("a.menu-item")) close(); });
  slot.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(true); return; }
    if (e.key === "ArrowDown" && menu.hidden && e.target === button) { e.preventDefault(); open(); return; }
    if (menu.hidden || (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End")) return;
    e.preventDefault();
    const list = focusables();
    const i = list.indexOf(document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1
      : e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next].focus();
  });
  menu.addEventListener("focusout", (e) => { if (!slot.contains(e.relatedTarget)) close(); });

  async function refresh() {
    const user = EG && EG.configured ? await EG.user() : null;
    let username = null;
    let admin = false;
    if (user) {
      try {
        const p = await EG.profile();
        username = p && p.username;
        admin = await EG.isAdmin();
      } catch (e) { /* still show the signed-in menu */ }
    }
    render({ user: user, username: username, admin: admin });
  }

  render({ user: null });
  refresh();
  if (EG && EG.sb) EG.sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(refresh, 0);
  });
  window.EG_NAV = { refresh: refresh };
})();
