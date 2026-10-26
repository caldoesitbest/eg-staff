/* DOM overlays: HUD, banners, menus, upgrade cards, the shop, game over, settings, touch sticks.
   The HUD only touches the DOM when a value actually changes. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { input } from "./input.js";
import { store, GFX_PRESETS, GFX_KEYS } from "./storage.js";
import { CARD_BY_ID, ENVY_POWERS, estimateDps, computeStats, buildSummary } from "./upgrades.js";
import { gunArt, itemArt, offerInfo, offerPrice, ownedItems, rerollCost, patchCost, gunName, gunCol, GUN_COL, TIER_NAMES, itemInfo } from "./armory.js";
import { evoChoices, evoCode, evoName, EVO_TEXT } from "./evolve.js";
import { ACHIEVEMENTS, ACH_BY_ID, unlockedAch, rewardNames } from "./progress.js";
import { equipped } from "./catalog.js";
import { hangar, lookArt } from "./hangar.js";
import { party } from "./party.js";
import { sprites, PAL } from "./sprites.js";
import { comboMult } from "./world.js";
import { waves } from "./waves.js";
import { formatScore } from "./util.js";
import { online, todayUTC } from "./online.js";
import { SLOT_COL } from "./coop.js";
import { drawCrosshairAt } from "./render.js";
import { synergyFor } from "./synergy.js";
import { MINIBOSSES } from "./enemies/minibosses.js";
import { levelOf, tierOf, xpNeed } from "./xp.js";
import { item as catItem } from "./catalog.js";
import { keys, keyName, kbd, KEY_ACTIONS, RESERVED, rebind, setKeys, DEFAULT_KEYS } from "./keys.js";

const $ = (id) => document.getElementById(id);
const HEART = "M12 21.2s-7.6-4.7-9.7-9.3C.8 8.4 2.9 4.4 6.7 4c2.2-.2 4 .9 5.3 2.7C13.3 4.9 15.1 3.8 17.3 4c3.8.4 5.9 4.4 4.4 7.9-2.1 4.6-9.7 9.3-9.7 9.3Z";

function icon(name, cls) {
  return window.egIcon ? window.egIcon(name, cls) : document.createElement("span");
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const last = { hp: -1, maxHp: -1, shield: -1, maxShield: -1, score: -1, combo: -1, stars: -1, sigils: -1, wave: -1, left: "", boss: -1, envy: "", cd: -1, gun: "", charge: -1, team: "", fusion: "" };
let hudSlowT = 0;         // the bits of the HUD that don't need 60 updates a second
let hudSlowMini = 0;
let boardKind = "all";

// The Sin Ladder, lowest to highest (same names, emoji and colours as the homepage Ladder).
export function ladderRungs() {
  return BALANCE.bosses.order.map((id, i) => {
    const b = BALANCE.bosses[id];
    return { id, i, name: b.name, emoji: b.emoji, c1: b.c1, c2: b.c2, wave: (i + 1) * BALANCE.waves.bossEvery };
  });
}
let screen = null;
let armedAt = 0;            // clicks on cards / game-over buttons are ignored until this time
const armed = () => performance.now() >= armedAt;
let bannerTimer = 0, toastTimer = 0;
let handlers = {};
let bossGhost = 1;
const NEWS_VERSION = 10;
const DIFF_NOTES = {
  normal: "Dodge, learn the robots, build smart.",
  hard: "Smarter, faster robots and less room for mistakes. Score ×1.3.",
  nightmare: "A mastery test: robots evolve early and punish every slip. Score ×1.7.",
};     // bump with each update's What's new

export const ui = {
  els: {},

  init(h) {
    handlers = h;
    const ids = ["game", "hud", "hearts", "hud-wave", "hud-left", "envy-chips", "boss-bar", "boss-name", "boss-fill", "boss-ghost",
      "hud-score", "hud-combo", "combo-x", "combo-fill", "hud-stars", "pause-btn", "fps", "banner", "banner-kicker", "banner-title",
      "banner-sub", "toast", "stick-move", "stick-aim", "ghost-move", "ghost-aim", "boost-btn", "charge-btn", "cards", "rotate-hint",
      "gun-chip", "gun-main", "gun-alt", "team", "fusion-chip", "rush-chip", "rush-time", "ambush-chip"];
    for (const id of ids) this.els[id] = $(id);

    // half-heart clip, shared by every heart icon
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true");
    defs.style.position = "absolute";
    defs.innerHTML = '<defs><clipPath id="eg-half"><rect x="0" y="0" width="12" height="24"/></clipPath></defs>';
    document.body.appendChild(defs);

    const click = (id, fn) => { const n = $(id); if (n) n.addEventListener("click", (e) => { handlers.onClick && handlers.onClick(); fn(e); }); };
    click("play-btn", () => hangar.play());
    for (const b of document.querySelectorAll(".diff-opt")) {
      b.addEventListener("click", () => {
        if (party.on && !party.leading) { this.toast("Your party leader picks the difficulty", 2200); return; }
        store.data.settings.difficulty = b.dataset.diff; store.save(); this.renderDifficulty(); party.sendPick(); hangar.refresh();
      });
    }
    click("how-btn", () => this.show("how"));
    click("settings-btn", () => this.openSettings("menu"));
    click("pause-btn", () => handlers.onPause());
    click("resume-btn", () => handlers.onResume());
    click("restart-btn", () => handlers.onRestart());
    click("pause-settings-btn", () => this.openSettings("pause"));
    click("quit-btn", () => handlers.onQuit());
    click("retry-btn", () => { if (armed()) handlers.onRestart(); });
    click("over-menu-btn", () => { if (armed()) handlers.onQuit(); });
    click("reroll-btn", () => handlers.onReroll());
    click("shop-reroll", () => handlers.onShopReroll());
    click("shop-patch", () => handlers.onPatch());
    click("shop-go", () => { if (armed()) handlers.onShopGo(); });
    click("evo-later", () => { if (armed()) handlers.onEvoLater(); });
    click("event-leave", () => { if (armed()) handlers.onEvent(-1); });
    click("news-btn", () => this.show("news"));
    click("download-btn", () => this.show("download"));
    click("download-done", () => this.show("menu"));
    G.on("achv", (a) => this.achvPop(a));
    hangar.init({ ui: this, handlers, sfx: (n) => handlers.onSfx && handlers.onSfx(n), name: () => (online.user ? "@" + online.name : "Pilot") });
    G.on("sigils", (s) => {
      if (s.quiet) return;
      const why = { "first-win": " · first climb on " + (BALANCE.difficulty[G.difficulty] || {}).name, "first-boss": " · first time beating it", "first-rush": " · first Boss Rush clear", rush: " · Boss Rush cleared", drop: " · a rare find" }[s.why] || "";
      this.toast("+" + s.n + " \u25c6 " + (s.n === 1 ? "Sigil" : "Sigils") + why, 2200);
    });
    click("rush-back", () => this.show("menu"));
    click("rush-start", () => handlers.onRushStart(this.rushMods()));
    click("rushdone-again", () => { if (armed()) handlers.onRushAgain(); });
    click("rushdone-menu", () => { if (armed()) handlers.onQuit(); });
    click("lobby-host", () => { const n = this.lobbyName(); if (n) handlers.onLobbyHost(n); });
    click("lobby-join", () => { const n = this.lobbyName(); const c = ($("lobby-code-in").value || "").trim(); if (!n) return; if (c.length < 5) { this.lobbyStatus("Type the 5-letter code your host gave you.", "bad"); return; } handlers.onLobbyJoin(c, n); });
    click("lobby-go", () => handlers.onLobbyStart());
    click("lobby-leave", () => handlers.onLobbyLeave());
    click("lobby-copy", () => {
      const code = $("lobby-code-show").textContent;
      try { navigator.clipboard.writeText(code).then(() => this.lobbyStatus("Code copied. Send it to your friends.", "ok")); } catch (e) { /* no clipboard */ }
    });
    const codeIn = $("lobby-code-in");
    if (codeIn) {
      codeIn.addEventListener("input", () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
      codeIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("lobby-join").click(); } });
    }
    click("news-done", () => { store.data.seenNews = NEWS_VERSION; store.save(); this.show("menu"); });
    // your build (pause, the Armory, the card pick, the touch HUD) and the Armory's "replace which gun?"
    click("pause-build-btn", () => this.openBuild("pause"));
    click("shop-build", () => this.openBuild("shop"));
    click("up-build", () => this.openBuild("upgrade"));
    click("build-btn", () => handlers.onBuild && handlers.onBuild());
    click("build-back", () => this.closeBuild());
    click("build-resume", () => handlers.onResume());
    for (const t of document.querySelectorAll(".bv-tabs .tab")) t.addEventListener("click", () => { handlers.onClick && handlers.onClick(); this.buildTab = t.dataset.bv; this.renderBuildView(); });
    click("swap-ok", () => { const i = this.swapOffer, sl = this.swapSlot; this.closeSwapPick(); if (i >= 0) handlers.onBuy(i, sl); });
    click("swap-cancel", () => this.closeSwapPick());
    // the fusion chip flashes whenever your Sin Fusion does something (throttled)
    let pulseAt = 0;
    G.on("fusionPulse", () => {
      const n = this.els["fusion-chip"], t = performance.now();
      if (!n || n.hidden || t - pulseAt < 250) return;
      pulseAt = t;
      n.classList.remove("pulse"); void n.offsetWidth; n.classList.add("pulse");
    });
    const gunChip = $("gun-chip");
    if (gunChip) gunChip.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); handlers.onSwap && handlers.onSwap(); });
    document.querySelectorAll("#settings-form .tab").forEach((t) => t.addEventListener("click", () => { handlers.onClick && handlers.onClick(); this.settingsTab(t.dataset.tab); }));
    click("settings-done", () => this.closeSettings());
    click("how-done", () => { store.data.seenHowTo = true; store.save(); this.show(this.howBack || "menu"); });
    click("how-tutorial", () => handlers.onTutorial && handlers.onTutorial());
    click("board-btn", () => this.openBoard("all", "menu"));
    click("board-done", () => this.show(this.boardBack || "menu"));
    click("board-signin", () => online.signIn());
    click("tab-all", () => this.openBoard("all"));
    click("tab-daily", () => this.openBoard("daily"));
    click("tab-coop", () => this.openBoard("coop"));
    click("tab-rush", () => this.openBoard("rush"));
    for (const b of document.querySelectorAll("[data-bdiff]")) b.addEventListener("click", () => { handlers.onClick && handlers.onClick(); this.boardDiff = b.dataset.bdiff; this.openBoard(boardKind); });
    click("account-chip", () => { if (online.user) this.openBoard(boardKind, "menu"); else online.signIn(); });
    click("exit-btn", () => handlers.onExit());
    click("pause-exit-btn", () => handlers.onExit());
    click("win-endless", () => { if (armed()) handlers.onEndless(); });
    click("win-finish", () => { if (armed()) handlers.onFinish(); });
    click("menu-mute", () => { const s = store.data.settings; s.muted = !s.muted; handlers.onSettings(); this.syncSettings(); this.syncMute(); });
    click("rotate-close", () => { store.data.rotateHintDismissed = true; store.save(); this.els["rotate-hint"].hidden = true; });
    const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    for (const id of ["menu-fullscreen", "pause-fullscreen"]) {
      const b = $(id);
      if (!b) continue;
      b.hidden = !fsOk;
      b.addEventListener("click", () => handlers.onFullscreen());
    }

    // hover blips on buttons
    document.querySelectorAll(".game .btn, .game .icon-btn").forEach((b) => {
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") handlers.onHover && handlers.onHover(); });
    });

    // settings controls
    const s = () => store.data.settings;
    const bind = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, () => { fn(n); handlers.onSettings(); this.syncMute(); }); };
    bind("set-sfx", "input", (n) => { s().sfx = n.value / 100; });
    bind("set-music", "input", (n) => { s().music = n.value / 100; });
    bind("set-muted", "change", (n) => { s().muted = n.checked; });
    bind("set-shake", "input", (n) => { s().shakeAmt = Number(n.value); s().shake = s().shakeAmt > 0; });
    bind("set-reduced", "change", (n) => { s().reducedMotion = n.checked; });
    bind("set-autoaim", "change", (n) => { s().autoAim = n.value; });
    bind("set-haptics", "change", (n) => { s().haptics = n.checked; });
    bind("set-fps", "change", (n) => { s().showFps = n.checked; });
    bind("set-post", "change", (n) => { s().postScores = n.checked; });
    bind("set-fpscap", "change", (n) => { s().fpsCap = Number(n.value); });
    bind("set-dmgnum", "change", (n) => { s().dmgNumbers = n.value; });
    bind("set-flashes", "change", (n) => { s().flashes = n.checked; });
    bind("set-contrast", "change", (n) => { s().contrastShots = n.checked; });
    bind("set-lookahead", "change", (n) => { s().lookahead = n.checked; });
    bind("set-arrows", "change", (n) => { s().arrows = n.checked; });
    bind("set-hitstop", "change", (n) => { s().hitstop = n.value; });
    bind("set-hudscale", "input", (n) => { s().hudScale = Number(n.value); });
    click("keys-reset", () => { handlers.onClick && handlers.onClick(); s().keys = { ...DEFAULT_KEYS }; setKeys(s().keys); handlers.onSettings(); this.renderKeybinds(); this.renderControlsHint(); });
    const cross = (id, ev, fn) => bind(id, ev, (n) => { fn(n); this.syncCrosshair(); });
    cross("set-crosscolor", "change", (n) => { s().crossColor = n.value; });
    cross("set-crosscustom", "input", (n) => { s().crossCustom = n.value; });
    cross("set-crosssize", "input", (n) => { s().crossSize = Number(n.value); });
    cross("set-crossstyle", "change", (n) => { s().crossStyle = n.value; });
    cross("set-crossoutline", "change", (n) => { s().crossOutline = n.checked; });
    cross("set-crosstarget", "change", (n) => { s().crossTarget = n.checked; });
    // graphics preset: picking one fills in the detail settings; changing a detail makes it "custom"
    bind("set-quality", "change", (n) => {
      s().quality = n.value;
      const pre = GFX_PRESETS[n.value === "auto" ? "high" : n.value];
      if (pre) Object.assign(s(), pre);
      this.syncSettings();
    });
    const detail = (id, ev, fn) => bind(id, ev, (n) => { fn(n); if (s().quality !== "custom") { s().quality = "custom"; const q = $("set-quality"); if (q) q.value = "custom"; } });
    detail("set-res", "change", (n) => { s().resScale = Number(n.value); });
    detail("set-particles", "change", (n) => { s().particles = n.value; });
    detail("set-background", "change", (n) => { s().background = n.value; });
    detail("set-glow", "change", (n) => { s().glow = n.checked; });
    detail("set-trails", "change", (n) => { s().trails = n.checked; });
    detail("set-grid", "change", (n) => { s().grid = n.checked; });

    this.syncSettings();
    this.syncMute();
  },

  // ---------------- screens ----------------
  show(name) {
    const names = ["menu", "pause", "upgrade", "shop", "over", "settings", "how", "board", "win", "news", "lobby", "evo", "rush", "rushdone", "event", "download", "build"];
    for (const n of names) {
      const node = $("screen-" + n);
      if (!node) continue;
      const on = n === name;
      if (on && node.hidden) { node.hidden = false; node.classList.remove("in"); void node.offsetWidth; node.classList.add("in"); }
      else if (!on) node.hidden = true;
    }
    screen = name;
    if (name === "upgrade" || name === "over" || name === "win" || name === "shop" || name === "evo" || name === "rushdone" || name === "event") armedAt = performance.now() + (name === "upgrade" ? 450 : name === "shop" ? 350 : name === "evo" ? 700 : 800);
    if (name === "how") this.renderHow();
    if (name === "download") this.renderDownload();
    if (name === "menu") { this.refreshMenu(); hangar.show(); }
    const first = name === "menu" ? (hangar.tabNow === "play" ? $("play-btn") : document.querySelector(".hnav.on")) : name && $("screen-" + name) && $("screen-" + name).querySelector(name === "upgrade" ? ".card" : name === "evo" ? ".evo-card" : name === "event" ? ".event-opt:not([disabled])" : name === "shop" ? "#shop-go" : ".btn-primary, .btn, button");
    if (first && (input.mode !== "touch")) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 30);
    this.updateRotateHint();
    this.renderPadHints();
  },
  get screen() { return screen; },
  get boardKindNow() { return boardKind; },
  get armed() { return armed(); },

  setState(state) {
    const g = this.els.game;
    g.classList.remove("state-menu", "state-playing", "state-paused", "state-clear", "state-upgrade", "state-shop", "state-dying", "state-over", "state-win", "state-evolve", "state-event");
    g.classList.add("state-" + state);
    this.els.hud.hidden = !(state === "playing" || state === "clear" || state === "dying" || state === "paused" || state === "upgrade" || state === "shop" || state === "win" || state === "evolve" || state === "event");
    this.updateRotateHint();
  },

  setMode(mode) {
    const g = this.els.game;
    g.classList.remove("mode-kbm", "mode-touch", "mode-gamepad");
    g.classList.add("mode-" + mode);
    // a controller picked up in a menu: put the highlight where it can be seen
    if (mode === "gamepad" && screen) { const r = navRoot(), f = document.activeElement; if (r && (!f || f === document.body || !r.contains(f))) this.navigate("down"); }
    this.renderControlsHint();
    if (screen === "how") this.renderHow();
    if (screen === "upgrade") this.renderUpgradeHint();
    if (screen === "shop") this.renderShopHint();
    if (screen === "over") this.renderOverHint();
    this.updateRotateHint();
  },

  setReduced(on) { this.els.game.classList.toggle("reduced", !!on); },
  /** A combo milestone: the HUD's combo meter flares in that colour. */
  flareCombo(col) {
    const n = this.els["hud-combo"];
    if (!n) return;
    n.style.setProperty("--flare", col);
    n.classList.remove("flare"); void n.offsetWidth; n.classList.add("flare");
  },
  setHudScale(pct) { this.els.game.style.setProperty("--hud-zoom", (Math.max(80, Math.min(140, pct || 100)) / 100).toFixed(2)); },

  /** Settings > Controls: each action and its key. Pick one, press the new key (Esc cancels); a key that was
      another action's swaps with it. */
  renderKeybinds() {
    const box = $("keybinds");
    if (!box || this.stopListen) return;
    box.replaceChildren();
    const B = keys();
    for (const [a, label] of KEY_ACTIONS) {
      const row = el("div", "kb-row");
      const b = el("button", "kb-key", keyName(B[a]));
      b.type = "button";
      b.dataset.act = a;
      b.setAttribute("aria-label", label + ": " + keyName(B[a]) + ". Press to change it");
      b.addEventListener("click", () => this.listenKey(a, b));
      row.append(el("span", "", label), b);
      box.append(row);
    }
  },
  listenKey(action, btn) {
    if (this.stopListen) this.stopListen();
    handlers.onClick && handlers.onClick();
    btn.classList.add("listening");
    btn.textContent = "Press a key";
    input.capture = true;
    const done = () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      input.capture = false;
      this.stopListen = null;
      this.renderKeybinds();
      const nb = document.querySelector('.kb-key[data-act="' + action + '"]');
      if (nb && input.mode !== "touch") nb.focus({ preventScroll: true });
    };
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") { done(); return; }
      if (!e.code || RESERVED.has(e.code)) { btn.textContent = keyName(e.code) + " is kept"; handlers.onSfx && handlers.onSfx("deny"); return; }
      store.data.settings.keys = { ...rebind(action, e.code) };
      handlers.onSettings();
      handlers.onSfx && handlers.onSfx("equip");
      done();
      this.renderControlsHint();
      const at = $("set-aimkey");
      if (at) at.textContent = keyName(keys().aim);
    };
    const onDown = (e) => { if (e.target !== btn) done(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    this.stopListen = done;
  },

  openSettings(back) {
    this.settingsBack = back;
    this.syncSettings();
    this.show("settings");
    this.settingsTab(this.lastTab || "audio", true);
  },
  settingsTab(tab, keepFocus) {
    if (this.stopListen) this.stopListen();
    this.lastTab = tab;
    document.querySelectorAll("#settings-form .tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === tab ? "true" : "false"));
    document.querySelectorAll("#settings-form .set-page").forEach((pg) => { pg.hidden = pg.dataset.page !== tab; });
    if (!keepFocus && input.mode !== "touch") { const t = $("stab-" + tab); if (t) t.focus(); }
  },
  closeSettings() {
    if (this.stopListen) this.stopListen();
    store.save();
    this.show(this.settingsBack || "menu");
  },
  syncSettings() {
    const s = store.data.settings;
    const set = (id, prop, v) => { const n = $(id); if (n) n[prop] = v; };
    set("set-sfx", "value", Math.round(s.sfx * 100));
    set("set-music", "value", Math.round(s.music * 100));
    set("set-muted", "checked", s.muted);
    set("set-shake", "value", s.shakeAmt);
    set("set-reduced", "checked", s.reducedMotion);
    set("set-autoaim", "value", s.autoAim);
    set("set-haptics", "checked", s.haptics);
    set("set-fps", "checked", s.showFps);
    set("set-quality", "value", s.quality);
    set("set-post", "checked", s.postScores);
    set("set-res", "value", String(s.resScale));
    set("set-fpscap", "value", String(s.fpsCap));
    set("set-particles", "value", s.particles);
    set("set-background", "value", s.background);
    set("set-dmgnum", "value", s.dmgNumbers);
    set("set-glow", "checked", s.glow);
    set("set-trails", "checked", s.trails);
    set("set-grid", "checked", s.grid);
    set("set-flashes", "checked", s.flashes);
    set("set-contrast", "checked", s.contrastShots);
    set("set-lookahead", "checked", s.lookahead);
    set("set-arrows", "checked", s.arrows);
    set("set-hitstop", "value", s.hitstop);
    set("set-crosscolor", "value", s.crossColor);
    set("set-crosscustom", "value", s.crossCustom);
    set("set-crosssize", "value", s.crossSize);
    set("set-crossstyle", "value", s.crossStyle);
    set("set-crossoutline", "checked", s.crossOutline);
    set("set-crosstarget", "checked", s.crossTarget);
    set("set-hudscale", "value", s.hudScale);
    set("set-aimkey", "textContent", keyName(keys().aim));
    this.renderKeybinds();
    this.syncCrosshair();
    const note = $("set-note");
    if (note) note.textContent = store.writable ? "Settings save on this device." : "Your browser is blocking storage, so settings and bests won't be saved after you leave.";
  },
  /** The crosshair preview: half dark space, half a bright flash. */
  syncCrosshair() {
    const st = store.data.settings;
    const row = $("set-crosscustom-row");
    if (row) row.hidden = st.crossColor !== "custom";
    const cv = $("cross-preview");
    if (!cv) return;
    const c = cv.getContext("2d");
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "#030518";
    c.fillRect(0, 0, 60, 120);
    const grd = c.createRadialGradient(95, 60, 4, 95, 60, 70);
    grd.addColorStop(0, "#fff7d6"); grd.addColorStop(0.5, "#ffc861"); grd.addColorStop(1, "#ff42d0");
    c.fillStyle = grd;
    c.fillRect(60, 0, 60, 120);
    drawCrosshairAt(c, 60, 60, st, 0.4, false);
  },
  syncMute() {
    const b = $("menu-mute");
    if (!b) return;
    const muted = store.data.settings.muted;
    b.replaceChildren(icon(muted ? "volume-x" : "volume-2"));
    b.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    b.setAttribute("aria-pressed", muted ? "true" : "false");
  },

  // ---------------- menu ----------------
  refreshMenu() {
    const b = store.data.best;
    const dl = $("bests");
    dl.replaceChildren();
    const add = (label, value) => { const d = el("div"); d.append(el("dt", "", label), el("dd", "", value)); dl.append(d); };
    if (b.wave > 0) {
      add("Best score", formatScore(b.score));
      add("Best wave", String(b.wave));
      add("Best combo", String(b.combo));
    } else {
      add("Best score", "—");
      add("Best wave", "—");
    }
    this.renderDifficulty();
    this.renderControlsHint();
    this.renderLadder($("mini-ladder"), b.rung || 0, (b.wins || 0) > 0);
    this.renderProfileStrip();
    const nb = $("news-btn");
    if (nb) nb.classList.toggle("fresh", store.data.seenNews !== NEWS_VERSION);
    this.renderAccount();
  },

  /** The homepage's Ladder in miniature: pillars rising from Sloth to Envy. */
  renderLadder(box, beaten, won) {
    if (!box) return;
    box.replaceChildren();
    for (const r of ladderRungs()) {
      const li = el("li", "rung" + (r.i < beaten ? " beaten" : "") + (r.id === "envy" ? " envy" : ""));
      li.style.setProperty("--c1", r.c1);
      li.style.setProperty("--c2", r.c2);
      li.style.setProperty("--h", (34 + r.i * 9) + "px");
      const emb = el("span", "rung-emb");
      const img = el("img"); img.src = "/assets/home/emoji/" + r.emoji + ".webp"; img.alt = ""; img.width = 34; img.height = 34;
      emb.append(img);
      const pillar = el("span", "rung-pillar");
      const lab = r.id === "envy" ? (won ? "Earned" : "Cannot be earned") : (r.i < beaten ? "Beaten" : "Wave " + r.wave);
      pillar.append(el("b", "", lab));
      li.append(emb, el("span", "rung-name", "@" + r.name), pillar);
      li.title = r.name + " · boss of wave " + r.wave + (r.i < beaten ? " (beaten)" : "");
      box.append(li);
    }
  },

  renderAccount() {
    const chip = $("account-chip");
    if (!chip) return;
    chip.hidden = !online.available;
    chip.replaceChildren();
    if (online.user) {
      chip.append(icon("user-round"), el("span", "", "@" + online.name));
      chip.title = "Signed in. Open the leaderboard";
    } else {
      chip.append(icon("discord"), el("span", "", "Sign in"));
      chip.title = "Sign in with Discord to post your runs";
    }
  },

  // ---------------- leaderboard ----------------
  async openBoard(kind, back) {
    if (back) this.boardBack = back;
    boardKind = kind;
    for (const k of ["all", "daily", "coop", "rush"]) $("tab-" + k).setAttribute("aria-selected", kind === k ? "true" : "false");
    const bd = this.boardDiff || "";
    $("board-diffs").hidden = kind === "daily";
    for (const b of document.querySelectorAll("[data-bdiff]")) b.setAttribute("aria-checked", b.dataset.bdiff === bd ? "true" : "false");
    if (screen !== "board") this.show("board");
    const status = $("board-status"), list = $("board-list");
    list.replaceChildren();
    $("board-signin").hidden = !online.available || !!online.user;
    $("board-who").textContent = online.user ? "Signed in as @" + online.name + (store.data.settings.postScores ? "" : " · posting is off in Settings") : "";
    if (!online.available) { status.textContent = "The leaderboard needs an internet connection."; return; }
    status.textContent = "Loading…";
    const mode = kind === "all" ? "ladder" : kind;
    const res = await online.board2(mode, kind === "daily" ? null : bd || null, kind === "daily" ? todayUTC() : null);
    if (boardKind !== kind || (this.boardDiff || "") !== bd) return;
    if (res.error === "v2") { status.textContent = "The " + (kind === "coop" ? "co-op" : "Boss Rush") + " board turns on with the 4.5 server update. Check back soon."; return; }
    if (res.error === "missing") { status.textContent = "The leaderboard is being set up. Check back soon."; return; }
    if (res.error) { status.textContent = res.error === "offline" ? "The leaderboard needs an internet connection." : res.error; return; }
    if (!res.rows.length) { status.textContent = kind === "daily" ? "Nobody has posted today's Daily yet. Be first." : "No runs posted here yet. Be first."; return; }
    const dn = bd ? BALANCE.difficulty[bd].name : "";
    status.textContent = kind === "daily" ? "Today's Daily Challenge (" + todayUTC() + " UTC): same waves and cards for everyone, always Normal."
      : kind === "coop" ? "Best co-op run per host" + (dn ? " · " + dn : "") + "."
      : kind === "rush" ? "Best Boss Rush per player" + (dn ? " · " + dn : "") + "."
      : !res.v2 ? "Best run per player. (Difficulty tags arrive with the 4.5 server update.)" : "Best run per player" + (dn ? " · " + dn : " · every difficulty") + ".";
    for (const r of res.rows) {
      const li = el("li", "board-row" + (r.is_me ? " me" : ""));
      li.append(el("span", "board-rank", "#" + r.rank));
      const nm = el("span", "board-name", kind === "coop" && r.team ? r.team : "@" + r.username);
      li.append(nm);
      const df = r.difficulty || "";
      li.append(el("span", "board-diff d-" + (df || "none"), df ? BALANCE.difficulty[df].name : "\u2014"));
      li.append(el("span", "board-wave", kind === "rush" ? (r.won ? "Cleared" : r.wave + "/7") : (r.won ? "👑 " : "") + "W" + r.wave));
      li.append(el("span", "board-score", formatScore(r.score)));
      list.append(li);
    }
  },

  /** Game-over line about posting the run. */
  setOnline(state, detail) {
    const box = $("over-online");
    if (!box) return;
    box.replaceChildren();
    box.hidden = !state;
    if (!state) return;
    if (state === "posting") box.append(el("span", "", "Posting your run…"));
    else if (state === "posted") {
      box.append(el("span", "", "Posted to the leaderboard" + (detail && detail.rank ? " · #" + detail.rank + (detail.daily ? " today" : " all-time") : "")));
      const b = el("button", "btn btn-ghost btn-sm", "View");
      b.type = "button"; b.addEventListener("click", () => this.openBoard(detail && detail.daily ? "daily" : "all", "over"));
      box.append(b);
    } else if (state === "signin") {
      box.append(el("span", "", detail === "expired" ? "Your sign-in expired, so this run wasn't posted. Sign in again to post the next one." : "Sign in with Discord to put this run on the leaderboard."));
      const b = el("button", "btn btn-primary btn-sm", "Sign in");
      b.type = "button"; b.addEventListener("click", () => online.signIn());
      box.append(b);
    } else if (state === "error") box.append(el("span", "", "Couldn't post: " + (detail || "try again later.")));
  },

  // ---------------- victory ----------------
  showWin(sum) {
    this.renderLadder($("win-ladder"), 7, true);
    const dl = $("win-stats");
    dl.replaceChildren();
    statTile(dl, "Score", sum.score, false, 0);
    statTile(dl, "Time", sum.time, false, 1);
    statTile(dl, "Kills", sum.kills, false, 2);
    statTile(dl, "Hits taken", sum.hits, false, 3);
    if (G.runSigils) statTile(dl, "Sigils", "+" + G.runSigils + " \u25c6", false, 4);
    const client = G.net.role === "client";
    $("win-endless").hidden = client;
    $("win-finish").hidden = client;
    $("win-note").textContent = client ? "Your host decides: keep climbing in endless, or finish the run." : "Endless laps the ladder again: robots evolve and every sin comes back harder.";
    this.show("win");
  },

  setDesktop(on) {
    for (const id of ["exit-btn", "pause-exit-btn"]) { const n = $(id); if (n) n.hidden = !on; }
  },

  /** Inside the Windows or Android app there's nothing to download. */
  setApp(on) {
    const b = $("download-btn");
    if (b) b.hidden = on;
  },

  /** The download screen: your own platform's app first; iPhone and iPad get the Home Screen tip instead. */
  renderDownload() {
    const ua = navigator.userAgent || "";
    const apk = $("dl-android"), win = $("dl-win"), grid = $("dl-grid");
    const hasApk = !!(apk && $("dl-apk-size").textContent);
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (apk) apk.hidden = !hasApk;
    $("dl-note-android").hidden = !hasApk;
    $("dl-note-ios").hidden = !ios;
    if (grid && apk && win) { if (/Android/.test(ua)) grid.prepend(apk); else grid.prepend(win); }
    const an = $("dl-note-android");
    if (/Android/.test(ua) && an) an.parentNode.prepend(an);
  },

  /** The menu's difficulty picker (applies to the Ladder and to co-op games you host). */
  renderDifficulty() {
    const want = party.on && !party.leading && party.pick ? party.pick.diff : store.data.settings.difficulty;
    const cur = BALANCE.difficulty[want] ? want : "normal";
    for (const b of document.querySelectorAll(".diff-opt")) b.setAttribute("aria-checked", b.dataset.diff === cur ? "true" : "false");
    const note = $("diff-note");
    if (note) note.textContent = DIFF_NOTES[cur];
  },

  renderControlsHint() {
    const n = $("menu-controls");
    if (!n) return;
    n.innerHTML = this.controlsLine(input.mode);
  },

  controlsLine(mode) {
    if (mode === "touch") return "Left thumb moves · right thumb aims &amp; fires · <b>⚡ Boost</b> to dash · hold <b>Charge</b> for a charged shot · tap your gun to swap";
    if (mode === "gamepad") return "<kbd>L</kbd> move · <kbd>R</kbd> aim &amp; fire · <kbd>A</kbd>/<kbd>LB</kbd> boost · hold <kbd>LT</kbd> to charge · <kbd>Y</kbd> swap gun · <kbd>Start</kbd> pause";
    return ["up", "left", "down", "right"].map(kbd).join("") + " move · hold left-click to fire · hold right-click to charge · " + kbd("boost") + " boost · " + kbd("swap") + " swap gun · <kbd>Esc</kbd> pause";
  },

  renderHow() {
    const box = $("how-controls");
    if (!box) return;
    const mode = input.mode;
    const rows = {
      kbm: [["Move", ["up", "left", "down", "right"].map(kbd).join("") + " or arrows"], ["Aim", "Mouse (or auto-aim: " + kbd("aim") + ")"], ["Fire", "Hold left click"], ["Charged shot", "Hold right-click or " + kbd("charge") + ", let go to fire"], ["Boost", kbd("boost") + " or <kbd>Shift</kbd>"], ["Swap gun", kbd("swap") + ", mouse wheel, <kbd>1</kbd>/<kbd>2</kbd>"], ["Your build", kbd("build")], ["Pause", "<kbd>Esc</kbd> or <kbd>P</kbd>"], ["Cards / shop", "<kbd>1</kbd>–<kbd>4</kbd> to pick or buy"], ["Change keys", "Settings, Controls"]],
      touch: [["Move", "Drag anywhere on the left half"], ["Aim + fire", "Drag on the right half (auto-fires)"], ["Boost", "Tap the ⚡ button"], ["Charged shot", "Hold the Charge button, let go to fire"], ["Swap gun", "Tap your gun (top left)"], ["Auto-aim", "On by default: just move, it shoots for you"], ["Pause", "⏸ top right"]],
      gamepad: [["Move", "Left stick"], ["Aim + fire", "Right stick (or hold RT)"], ["Charged shot", "Hold <kbd>LT</kbd>, let go to fire"], ["Boost", "<kbd>A</kbd>, <kbd>LB</kbd> or <kbd>RB</kbd>"], ["Swap gun", "<kbd>Y</kbd>"], ["Pause", "<kbd>Start</kbd>"]],
    };
    const title = { kbm: "Keyboard + mouse", touch: "Touch", gamepad: "Gamepad" };
    box.replaceChildren();
    const h = el("h3", "", title[mode]);
    box.append(h);
    for (const [k, v] of rows[mode]) {
      const r = el("div", "how-row");
      const a = el("span", "", k);
      const b = el("span");
      b.innerHTML = v;
      r.append(a, b);
      box.append(r);
    }
    const other = el("p", "set-note", "Also works with " + Object.keys(title).filter((m) => m !== mode).map((m) => title[m].toLowerCase()).join(" and ") + ". Hints switch to whatever you touch.");
    box.append(other);
  },

  // ---------------- HUD ----------------
  resetHud() {
    for (const k in last) last[k] = typeof last[k] === "string" ? "" : -1;
    bossGhost = 1;
    this.els["boss-bar"].hidden = true;
  },

  renderHearts(P) {
    const box = this.els.hearts;
    box.replaceChildren();
    const full = Math.ceil(P.maxHp / 2);
    for (let i = 0; i < full; i++) {
      const v = Math.max(0, Math.min(2, P.hp - i * 2));
      box.append(heartSvg(v, false));
    }
    const sh = Math.ceil(P.maxShield / 2);
    for (let i = 0; i < sh; i++) {
      const v = Math.max(0, Math.min(2, P.shield - i * 2));
      box.append(heartSvg(v, true));
    }
    box.setAttribute("aria-label", "Health " + P.hp / 2 + " of " + P.maxHp / 2 + " hearts");
    box.classList.toggle("low", P.hp <= 2);
  },

  flashHearts() {
    const box = this.els.hearts;
    box.classList.remove("hurt");
    void box.offsetWidth;
    box.classList.add("hurt");
  },

  updateHud(dt) {
    const P = G.player;
    if (!P) return;
    const E = this.els;
    if (P.hp !== last.hp || P.maxHp !== last.maxHp || P.shield !== last.shield || P.maxShield !== last.maxShield) {
      last.hp = P.hp; last.maxHp = P.maxHp; last.shield = P.shield; last.maxShield = P.maxShield;
      this.renderHearts(P);
    }
    const sc = Math.floor(G.score);
    if (sc !== last.score) { last.score = sc; E["hud-score"].textContent = formatScore(sc); }
    if (G.stars !== last.stars) { last.stars = G.stars; E["hud-stars"].textContent = String(G.stars); }
    // 4.7: the Sigils this run has earned (your balance is in the Hangar)
    const sig = G.runSigils || 0;
    if (sig !== last.sigils) {
      if (last.sigils >= 0 && sig > last.sigils) { const c = $("sigil-chip"); c.classList.remove("got"); void c.offsetWidth; c.classList.add("got"); }
      last.sigils = sig; $("hud-sigils").textContent = "+" + sig;
    }
    if (G.wave !== last.wave) {
      last.wave = G.wave;
      E["hud-wave"].textContent = G.tutorial ? "Flight school" : G.mode === "rush" ? "Boss " + Math.min(7, Math.max(1, G.wave / BALANCE.waves.bossEvery)) + "/7" : "Wave " + G.wave;
      E["rush-chip"].hidden = G.mode !== "rush";
      const r = ladderRungs()[waves.rungOf(Math.max(1, G.wave))];
      const rung = $("hud-rung");
      rung.textContent = G.tutorial ? "" : r.name + (G.lap ? " · lap " + (G.lap + 1) : "");
      $("wave-chip").style.setProperty("--rung", r.c1);
      $("daily-chip").hidden = !G.daily;
      const dc = $("diff-chip");
      dc.hidden = G.difficulty === "normal";
      dc.textContent = BALANCE.difficulty[G.difficulty] ? BALANCE.difficulty[G.difficulty].name : "";
      dc.classList.toggle("nightmare", G.difficulty === "nightmare");
    }
    // a mini-boss's bar (the biggest one alive), a few times a second
    hudSlowMini -= dt;
    if (hudSlowMini <= 0) {
      hudSlowMini = 0.1;
      let mb = null;
      for (let i = 0; i < G.enemies.count; i++) { const e = G.enemies.items[i]; if (!e.dead && e.ally <= 0 && MINIBOSSES[e.type] && (!mb || e.maxHp > mb.maxHp)) mb = e; }
      const bar = $("mini-bar");
      if (!mb) { if (!bar.hidden) bar.hidden = true; }
      else {
        if (bar.hidden || bar.dataset.type !== mb.type) { bar.hidden = false; bar.dataset.type = mb.type; $("mini-name").textContent = MINIBOSSES[mb.type].name; bar.style.setProperty("--mini-col", MINIBOSSES[mb.type].accent); }
        $("mini-fill").style.transform = "scaleX(" + Math.max(0, Math.min(1, mb.hp / mb.maxHp)).toFixed(3) + ")";
        bar.classList.toggle("resist", mb.resT > 0);
      }
    }
    hudSlowT -= dt;
    const slowTick = hudSlowT <= 0;          // 4.5: the counting and string-building parts run 20 times a second, not every frame
    if (slowTick) hudSlowT = 1 / 20;
    if (slowTick) {
      const remaining = G.net.role === "client" ? G.netLeft : waves.remaining();
      const left = G.tutorial ? "" : waves.boss ? (G.boss ? "Boss" : "") : (G.state === "playing" ? remaining + " left" : "Clear");
      if (left !== last.left) { last.left = left; E["hud-left"].textContent = left; }
    }
    const m = comboMult();
    if (G.combo !== last.combo) {
      const up = G.combo > last.combo;
      last.combo = G.combo;
      E["combo-x"].textContent = "×" + m.toFixed(1);
      E["hud-combo"].classList.toggle("on", G.combo > 0);
      if (up && G.combo > 1) { E["hud-combo"].classList.remove("bump"); void E["hud-combo"].offsetWidth; E["hud-combo"].classList.add("bump"); }
    }
    if (slowTick) {
      const a = G.ambush, on = !!(a && a.t > 0);
      E["ambush-chip"].hidden = !on;
      if (on) E["ambush-chip"].textContent = "Ambush " + Math.ceil(a.t) + "s · " + a.left + " left";
    }
    if (slowTick && G.mode === "rush" && G.rush) E["rush-time"].textContent = fmtClock(G.rush.t0 >= 0 ? G.time - G.rush.t0 : 0);
    if (slowTick) E["combo-fill"].style.transform = "scaleX(" + (G.combo > 0 ? Math.max(0, G.comboTimer / BALANCE.combo.window).toFixed(2) : 0) + ")";

    // boss bar
    const b = G.boss;
    if (b && !b.dead && b.state !== -1) {
      if (E["boss-bar"].hidden) {
        E["boss-bar"].hidden = false;
        E["boss-name"].textContent = "@" + b.def.name + " · " + b.def.title;
        E["boss-bar"].style.setProperty("--boss-col", b.def.c1 || b.kind.accent);
        bossGhost = 1; last.bossF = last.bossG = -1;
      }
      const f = Math.max(0, b.hp / b.maxHp);
      if (bossGhost > f) bossGhost = Math.max(f, bossGhost - dt * 0.35); else bossGhost = f;
      // only touch the page when the bar actually moved (a style write every frame costs a style pass)
      const fk = Math.round(f * 1000), gk2 = Math.round(bossGhost * 1000);
      if (fk !== last.bossF) { last.bossF = fk; E["boss-fill"].style.transform = "scaleX(" + (fk / 1000) + ")"; }
      if (gk2 !== last.bossG) { last.bossG = gk2; E["boss-ghost"].style.transform = "scaleX(" + (gk2 / 1000) + ")"; }
    } else if (!E["boss-bar"].hidden && !G.bossFx) {
      E["boss-bar"].hidden = true;
    }

    // teammates (co-op)
    if (slowTick) this.renderTeam();

    // guns
    const gk = !slowTick ? last.gun : (G.guns[0] ? G.guns[0].id + G.guns[0].tier + (G.guns[0].evo || "") : "") + "|" + (G.guns[1] ? G.guns[1].id + G.guns[1].tier + (G.guns[1].evo || "") : "") + "|" + G.gunSlot;
    if (gk !== last.gun) {
      last.gun = gk;
      const a = G.guns[G.gunSlot] || G.guns[0], b = G.guns[1 - G.gunSlot];
      E["gun-main"].replaceChildren(gunArt(a.id), el("b", "", gunName(a)));
      E["gun-chip"].style.setProperty("--gun-col", gunCol(a));
      E["gun-chip"].classList.toggle("evolved", !!a.evo);
      E["gun-alt"].replaceChildren();
      if (b) E["gun-alt"].append(gunArt(b.id), el("span", "", input.mode === "kbm" ? "Q" : input.mode === "gamepad" ? "Y" : "tap"));
      E["gun-alt"].hidden = !b;
      E["gun-chip"].classList.toggle("solo", !b);
    }

    // Sin Fusion
    const fk = !slowTick ? last.fusion : (P.fusions || []).join(",");
    if (fk !== last.fusion) {
      last.fusion = fk;
      const n = E["fusion-chip"];
      n.replaceChildren();
      n.hidden = !fk;
      for (const id of P.fusions || []) {
        const c = CARD_BY_ID[id];
        const s = el("span", "fusion-one");
        s.style.setProperty("--c1", c.color); s.style.setProperty("--c2", c.color2);
        for (const src of c.imgs) { const img = el("img"); img.src = src; img.alt = ""; img.width = 18; img.height = 18; s.append(img); }
        s.append(el("b", "", c.name));
        n.append(s);
      }
    }

    // envy powers
    let key = "";
    for (const p of P.envy) key += p.type + ",";
    if (key !== last.envy) {
      last.envy = key;
      E["envy-chips"].replaceChildren(...P.envy.map((p) => { const c = el("span", "envy-chip", ENVY_POWERS[p.type].name); c.append(el("i")); return c; }));
    }
    const chips = E["envy-chips"].children;
    for (let i = 0; slowTick && i < chips.length && i < P.envy.length; i++) {
      chips[i].lastChild.style.width = Math.max(0, (P.envy[i].t / P.envy[i].max) * 100).toFixed(1) + "%";
    }

    // touch: boost button cooldown + sticks
    if (input.mode === "touch") {
      const cd = P.boostCdT > 0 ? Math.min(1, P.boostCdT / G.stats.boostCd) : 0;
      const q = Math.round(cd * 50) / 50;
      if (q !== last.cd) {
        if (q === 0 && last.cd > 0) { E["boost-btn"].classList.remove("ready"); void E["boost-btn"].offsetWidth; E["boost-btn"].classList.add("ready"); }
        last.cd = q;
        E["boost-btn"].style.setProperty("--cd", q);
        E["boost-btn"].classList.toggle("cooling", q > 0);
      }
      const ch = P.charging ? Math.round(P.charge * 20) / 20 : -1;
      if (ch !== last.charge) {
        last.charge = ch;
        E["charge-btn"].style.setProperty("--charge", Math.max(0, ch));
        E["charge-btn"].classList.toggle("full", ch >= 1);
        E["charge-btn"].classList.toggle("cooling", P.chargeCd > 0 && ch < 0);
      }
      this.updateSticks();
    }
  },

  updateSticks() {
    const E = this.els;
    const put = (node, s) => {
      node.classList.toggle("on", s.active);
      if (!s.active) return;
      node.style.transform = "translate(" + s.ox + "px," + s.oy + "px)";
      const dx = s.cx - s.ox, dy = s.cy - s.oy;
      const d = Math.hypot(dx, dy), max = 56;
      const k = d > max ? max / d : 1;
      node.firstElementChild.style.transform = "translate(" + dx * k + "px," + dy * k + "px)";
    };
    put(E["stick-move"], input.sticks.move);
    put(E["stick-aim"], input.sticks.aim);
    const early = G.wave <= 2;
    E["ghost-move"].classList.toggle("off", input.sticks.move.active || !early);
    E["ghost-aim"].classList.toggle("off", input.sticks.aim.active || !early || store.data.settings.autoAim && G.wave > 1);
  },

  setFps(text) {
    const n = this.els.fps;
    if (text === null) { n.hidden = true; return; }
    n.hidden = false;
    n.textContent = text;
  },

  // ---------------- banners ----------------
  banner(kicker, title, sub, kind, long, col) {
    const E = this.els;
    E["banner-kicker"].textContent = kicker || "";
    E["banner-title"].textContent = title || "";
    E["banner-sub"].innerHTML = sub || "";
    const b = E.banner;
    b.className = "banner" + (kind ? " " + kind : "") + (long ? " long" : "");
    if (col) b.style.setProperty("--banner-col", col); else b.style.removeProperty("--banner-col");
    void b.offsetWidth;
    b.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove("show"), long ? 3300 : 2300);
  },
  clearBanner() { clearTimeout(bannerTimer); this.els.banner.className = "banner"; },

  toast(text, ms = 1800) {
    const t = this.els.toast;
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  },

  // ---------------- upgrade pick ----------------
  showUpgrade(ids, info) {
    this.armoryLine = info.armory || "";
    $("cards").classList.remove("waiting");
    $("up-kicker").textContent = info.kicker;
    $("up-title").textContent = info.title;
    $("up-bonus").innerHTML = info.bonus || "";
    this.renderCards(ids);
    this.renderEconomy();
    this.renderUpgradeHint();
    this.show("upgrade");
  },

  renderCards(ids) {
    const box = this.els.cards;
    box.replaceChildren();
    box.classList.toggle("four", ids.length > 3);
    ids.forEach((id, i) => {
      const c = CARD_BY_ID[id];
      const lvl = G.up[id] || 0;
      const b = el("button", "card" + (c.kind === "fusion" ? " fusion" : ""));
      b.type = "button";
      b.setAttribute("role", "listitem");
      b.dataset.id = id;
      b.style.setProperty("--card-col", c.color);
      b.append(el("span", "card-key", String(i + 1)));
      if (c.kind === "fusion") {
        // a Sin Fusion: both sins' emblems, the pair it needs, what it does
        b.style.setProperty("--card-col2", c.color2);
        b.append(el("span", "card-tag fusion", "Sin Fusion"));
        const art = el("span", "card-art fusion-art");
        for (const src of c.imgs) { const img = el("img"); img.src = src; img.alt = ""; img.width = 60; img.height = 60; art.append(img); }
        art.append(el("i", "fusion-spark"));
        b.append(art);
        b.append(el("span", "card-name", c.name));
        b.append(el("span", "fusion-need", CARD_BY_ID[c.need[0]].name + " + " + CARD_BY_ID[c.need[1]].name));
        const desc = el("p", "card-desc", c.levels[0]);
        desc.append(el("small", "", "One fusion per run"));
        b.append(desc);
        b.setAttribute("aria-label", "Sin Fusion: " + c.name + " (" + c.need.join(" and ") + "). " + c.levels[0]);
        b.addEventListener("click", () => { if (armed()) handlers.onPick(id); });
        b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") handlers.onHover && handlers.onHover(); });
        box.append(b);
        return;
      }
      b.append(el("span", "card-tag" + (c.kind === "gear" ? " gear" : ""), c.kind === "sin" ? "Sin" : "Augment"));
      const art = el("span", "card-art");
      if (c.img) { const img = el("img"); img.src = c.img; img.alt = ""; img.width = 76; img.height = 76; art.append(img); }
      else art.append(icon(c.icon));
      b.append(art);
      b.append(el("span", "card-name", c.name));
      const pips = el("span", "card-pips");
      pips.setAttribute("aria-label", "Level " + (lvl + 1) + " of " + c.max);
      for (let k = 0; k < c.max; k++) pips.append(el("i", k < lvl ? "on" : k === lvl ? "next" : ""));
      b.append(pips);
      const syn = synergyFor("card", id);
      if (syn) b.append(el("span", "synergy", syn));
      const desc = el("p", "card-desc", c.levels[lvl]);
      if (c.tag && lvl === 0) desc.append(el("small", "", c.tag));
      if (lvl > 0) desc.append(el("small", "", "Level " + (lvl + 1) + (lvl + 1 === c.max ? " · max" : "")));
      b.append(desc);
      b.setAttribute("aria-label", c.name + ", level " + (lvl + 1) + ": " + c.levels[lvl]);
      b.addEventListener("click", () => { if (armed()) handlers.onPick(id); });
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") handlers.onHover && handlers.onHover(); });
      box.append(b);
    });
  },

  renderEconomy() {
    const E = BALANCE.economy;
    const rr = E.reroll + E.rerollStep * G.rerolls;
    $("reroll-label").textContent = "Reroll · ★" + rr;
    $("reroll-btn").disabled = G.stars < rr;
    $("up-stars").textContent = "You have ★" + G.stars + (this.armoryLine ? " · " + this.armoryLine : "");
  },

  renderUpgradeHint() {
    const n = $("up-hint");
    if (!n) return;
    const keys = (G.stats.cards || 3) > 3 ? "<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>" : "<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>";
    n.innerHTML = input.mode === "kbm" ? "Press " + keys + " to pick" : input.mode === "gamepad" ? "D-pad to choose · <kbd>A</kbd> to pick" : "Tap a card to pick it";
  },

  // ---------------- achievements + the locker ----------------
  /** Under the menu's bests: your title and the badges you pinned. */
  renderProfileStrip() {
    const box = $("profile-strip");
    if (!box) return;
    box.replaceChildren();
    const c = store.data.cos;
    const title = equipped("title");
    for (const id of c.badges || []) {
      const a = ACH_BY_ID[id];
      if (!a || !unlockedAch(id)) continue;
      const b = el("span", "badge");
      b.style.setProperty("--b", a.col);
      b.title = a.name;
      b.append(icon(a.icon));
      box.append(b);
    }
    if (title.id) box.append(el("span", "player-title", title.name));
    const n = ACHIEVEMENTS.filter((a) => unlockedAch(a.id)).length;
    const lab = $("profile-label");
    if (lab) lab.title = n + " of " + ACHIEVEMENTS.length + " achievements";
  },

  openProfile(tab) {
    this.hangarTab(tab === "locker" ? "locker" : "profile");
  },
  /** Opens the Hangar on one of its tabs (play, locker, shop, challenges, profile). */
  hangarTab(t) {
    if (screen !== "menu") this.show("menu");
    hangar.tab(t, true);
  },

  /** Every achievement: unlocked ones show when, locked ones what to do (and how far along you are). Tap an unlocked one to pin its badge (3 at most). */
  renderAchievements() {
    const list = $("achv-list");
    list.replaceChildren();
    const pins = store.data.cos.badges || (store.data.cos.badges = []);
    const n = ACHIEVEMENTS.filter((a) => unlockedAch(a.id)).length;
    $("achv-summary").textContent = n + " of " + ACHIEVEMENTS.length + " unlocked · tap one you've earned to pin its badge to your profile (3 at most)";
    let cat = "";
    for (const a of ACHIEVEMENTS) {
      if (a.cat !== cat) { cat = a.cat; list.append(el("h3", "achv-cat", cat)); }
      const got = unlockedAch(a.id);
      const b = el("button", "achv" + (got ? " got" : "") + (pins.includes(a.id) ? " pinned" : ""));
      b.type = "button";
      b.setAttribute("role", "listitem");
      b.style.setProperty("--b", a.col);
      const badge = el("span", "badge");
      badge.append(icon(a.icon));
      b.append(badge);
      const txt = el("span", "achv-txt");
      txt.append(el("b", "", a.name), el("span", "", a.desc));
      const rw = rewardNames(a);
      if (rw.length) txt.append(el("small", "", "Unlocks: " + rw.join(", ")));
      if (a.goal && !got) {
        const [have, need] = a.goal();
        const bar = el("i", "achv-bar");
        bar.style.setProperty("--p", Math.min(1, have / need).toFixed(3));
        txt.append(bar, el("small", "", Math.min(have, need) + " / " + need));
      }
      b.append(txt);
      if (got) b.append(el("span", "achv-when", new Date(store.data.achv[a.id]).toLocaleDateString()));
      b.disabled = !got;
      b.setAttribute("aria-label", a.name + (got ? ", unlocked" : ", locked") + ". " + a.desc);
      b.addEventListener("click", () => {
        const i = pins.indexOf(a.id);
        if (i >= 0) pins.splice(i, 1); else { pins.push(a.id); if (pins.length > 3) pins.shift(); }
        store.save();
        handlers.onClick && handlers.onClick();
        this.renderAchievements();
      });
      list.append(b);
    }
  },

  /** An achievement just unlocked: a card slides in at the top (several queue up). */
  /** 4.5: a holographic card slides in (bottom right; top on touch): achievements and level-ups take turns. */
  achvPop(a) {
    (this.achvQ || (this.achvQ = [])).push(a);
    if (this.achvBusy) return;
    const TIER = ["Easy", "Medium", "Hard", "Legendary"];
    const next = () => {
      const x = this.achvQ.shift();
      const box = $("achv-pop");
      if (!x || !box) { this.achvBusy = false; return; }
      this.achvBusy = true;
      box.replaceChildren();
      const col = x.levelUp ? tierOf(x.level).col : x.col;
      box.style.setProperty("--b", col);
      box.className = "achv-pop" + (x.levelUp ? " lvl" : " t" + (x.tier || 0));
      const tile = el("span", "ap-tile");
      if (x.levelUp) tile.append(levelBadge(x.level, true));
      else { const hex = el("span", "ap-hex"); hex.append(icon(x.icon)); tile.append(hex); }
      tile.append(el("i", "ap-shine"));
      const txt = el("span", "ap-txt");
      const kick = el("small", "ap-kick");
      if (x.levelUp) kick.append(el("span", "", "Level up"));
      else { kick.append(el("span", "", "Achievement unlocked")); kick.append(el("em", "", TIER[x.tier || 0])); }
      txt.append(kick);
      if (x.levelUp) {
        const hat = x.hat ? catItem("hat", x.hat) : null;
        txt.append(el("b", "", "Level " + x.level + " \u00b7 " + tierOf(x.level).name),
          el("span", "ap-desc", hat ? "New hat unlocked: " + hat.name + "!" : "Keep climbing."),
          el("span", "ap-rw", "+" + x.sigils + " \u25c6"));
      } else {
        const rw = rewardNames(x);
        txt.append(el("b", "", x.name), el("span", "ap-desc", rw.length ? "Unlocked: " + rw.join(", ") : x.desc));
        const bits = [];
        if (x.sig) bits.push("+" + x.sig + " \u25c6");
        if (x.xp) bits.push("+" + x.xp + " XP");
        if (bits.length) txt.append(el("span", "ap-rw", bits.join("   ")));
      }
      box.append(tile, txt, el("i", "ap-timer"), el("i", "ap-scan"));
      box.classList.remove("show"); void box.offsetWidth; box.classList.add("show");
      handlers.onAchv && handlers.onAchv(x);
      setTimeout(() => { box.classList.remove("show"); setTimeout(next, 420); }, x.levelUp && x.hat ? 5200 : 4200);
    };
    next();
  },
  /** A run's XP on a results screen: what it was for, and the bar filling (past a level, if you made one). */
  renderXp(id) {
    const box = $(id), x = G.runXp;
    if (!box) return;
    box.hidden = !x || !x.total;
    if (!x || !x.total) return;
    box.replaceChildren();
    const up = x.after.level - x.before.level;
    const head = el("div", "xp-head");
    head.append(levelBadge(x.after.level), el("b", "xp-gain", "+" + formatScore(x.total) + " XP"),
      el("span", "xp-lv" + (up ? " up" : ""), up ? (up > 1 ? "+" + up + " levels!" : "Level up!") : "Level " + x.after.level));
    const bar = el("div", "xp-bar");
    const fill = el("i");
    bar.append(fill, el("span", "", x.after.need ? formatScore(x.after.into) + " / " + formatScore(x.after.need) + " XP" : "Max level"));
    const lines = el("ul", "xp-lines");
    for (const [label, n] of x.lines) { const li = el("li"); li.append(el("span", "", label), el("b", "", "+" + formatScore(n))); lines.append(li); }
    for (const [label] of x.mul) lines.append(el("li", "mul", label));
    box.append(head, bar, lines);
    // the bar: from where you were, through any level-ups, to where you are
    const from = up ? 0 : x.before.need ? x.before.into / x.before.need : 1, to = x.after.need ? x.after.into / x.after.need : 1;
    fill.style.transform = "scaleX(" + from.toFixed(3) + ")";
    setTimeout(() => { fill.style.transform = "scaleX(" + Math.max(from, to).toFixed(3) + ")"; }, 250);
    if (G.debug.on) box.append(el("p", "set-note", "Debug run: XP not saved"));
  },

  // ---------------- Boss Rush ----------------
  /** The Rush setup: the seven, your bests, difficulty, modifiers (they unlock after your first clear). */
  openRush() {
    const rs = store.data.rush;
    const d = BALANCE.difficulty[store.data.settings.difficulty] ? store.data.settings.difficulty : "normal";
    const splits = rs.splits[d] || {};
    const order = $("rush-order");
    order.replaceChildren();
    for (const r of ladderRungs()) {
      const li = el("li", "rush-boss");
      li.style.setProperty("--c1", r.c1);
      const img = el("img"); img.src = "/assets/home/emoji/" + r.emoji + ".webp"; img.alt = ""; img.width = 40; img.height = 40;
      li.append(img, el("b", "", "@" + r.name), el("span", "", splits[r.id] ? fmtClock(splits[r.id]) : "—"));
      order.append(li);
    }
    const box = $("rush-mods");
    box.replaceChildren();
    const open = rs.clears > 0;
    $("rush-mods-note").textContent = open ? "each one adds to your score" : "clear the Rush once to unlock them";
    const on = new Set(rs.mods || []);
    for (const id in BALANCE.rush.mods) {
      const m = BALANCE.rush.mods[id];
      const b = el("button", "rush-mod");
      b.type = "button";
      b.dataset.mod = id;
      b.disabled = !open;
      b.setAttribute("role", "switch");
      b.setAttribute("aria-checked", open && on.has(id) ? "true" : "false");
      b.append(el("b", "", m.name), el("span", "", m.text), el("small", "", "+" + Math.round(m.score * 100) + "% score"));
      b.addEventListener("click", () => { b.setAttribute("aria-checked", b.getAttribute("aria-checked") === "true" ? "false" : "true"); handlers.onClick && handlers.onClick(); });
      box.append(b);
    }
    const dl = $("rush-best");
    dl.replaceChildren();
    const best = rs.best[d];
    const add = (k, v) => { const x = el("div"); x.append(el("dt", "", k), el("dd", "", v)); dl.append(x); };
    add("Best time (" + BALANCE.difficulty[d].name + ")", best ? fmtClock(best.time) : "—");
    add("Best rank", best && best.rank ? best.rank : "—");
    add("Best score", best ? formatScore(best.score) : "—");
    add("Clears", String(rs.clears || 0));
    this.renderDifficulty();
    this.show("rush");
  },
  rushMods() {
    return Array.from(document.querySelectorAll("#rush-mods .rush-mod")).filter((b) => !b.disabled && b.getAttribute("aria-checked") === "true").map((b) => b.dataset.mod);
  },

  /** Boss Rush results: rank, time against your best, every split. */
  showRushDone(sum) {
    const dn = BALANCE.difficulty[sum.difficulty] ? BALANCE.difficulty[sum.difficulty].name : "Normal";
    const mods = (sum.mods || []).map((m) => BALANCE.rush.mods[m] && BALANCE.rush.mods[m].name).filter(Boolean);
    $("rushdone-kicker").textContent = "Boss Rush · " + dn + (mods.length ? " · " + mods.join(", ") : "");
    const fell = sum.next && BALANCE.bosses[sum.next] ? BALANCE.bosses[sum.next].name : "";
    $("rushdone-title").textContent = sum.cleared ? "Seven sins. One sitting." : "Fell to @" + fell + " (" + sum.beaten + " of 7)";
    const rank = $("rush-rank");
    rank.textContent = sum.cleared ? sum.rank : "\u2715";
    rank.className = "rush-rank rank-" + (sum.cleared ? sum.rank : "x");
    const nb = $("rushdone-best");
    nb.hidden = !(sum.newTime || sum.newScore);
    nb.textContent = sum.newTime ? "New best time!" : "New best score!";
    const dl = $("rushdone-stats");
    dl.replaceChildren();
    const add = (k, v, isNew) => { const x = el("div"); const dd = el("dd", isNew ? "new" : "", v); x.append(el("dt", "", k), dd); dl.append(x); };
    add("Fighting time", fmtClock(sum.time) + (sum.prevTime && sum.cleared ? " (" + (sum.time <= sum.prevTime ? "−" : "+") + fmtClock(Math.abs(sum.time - sum.prevTime)) + ")" : ""), sum.newTime);
    add("Hits taken", String(sum.hits));
    add("Score", formatScore(sum.score), sum.newScore);
    add("Bosses", sum.beaten + " / 7");
    if (sum.killedBy) add("Got you", sum.killedBy);
    if (G.runSigils) add("Sigils", "+" + G.runSigils + " \u25c6");
    for (const c of G.runContracts || []) add("Contract done", c.text + " \u00b7 +" + c.sigils + " \u25c6");
    const tb = $("rush-splits").tBodies[0];
    tb.replaceChildren();
    for (const s of sum.splits || []) {
      const b = BALANCE.bosses[s.type];
      const tr = el("tr");
      tr.style.setProperty("--c1", b.c1);
      const d = s.pb ? s.t - s.pb : 0;
      tr.append(el("td", "", "@" + b.name), el("td", "", fmtClock(s.t)),
        el("td", s.pb ? (d <= 0 ? "good" : "bad") : "", s.pb ? (d <= 0 ? "−" : "+") + fmtClock(Math.abs(d)) : "first"), el("td", s.hits ? "" : "good", s.hits ? String(s.hits) : "none"));
      tb.append(tr);
    }
    renderBuild($("rushdone-build"), sum.build, sum.buildTitle + (sum.recordNote ? " · " + sum.recordNote : ""));
    const client = G.net.role === "client";
    $("rushdone-again").disabled = client;
    $("rushdone-again").lastChild.textContent = client ? "Waiting for the host" : G.net.role === "host" ? "Run it back (everyone)" : "Run it back";
    $("rushdone-menu").lastChild.textContent = G.net.role !== "off" ? "Leave co-op" : "Menu";
    this.renderXp("rushdone-xp");
    this.show("rushdone");
  },

  // ---------------- special events ----------------
  /** info: { kicker, title, sub, col, options: [{ name, text, cost, col, disabled }], leave: label | false } */
  showEvent(info) {
    $("event-kicker").textContent = info.kicker;
    $("event-title").textContent = info.title;
    $("event-sub").textContent = info.sub || "";
    $("screen-event").style.setProperty("--ev-col", info.col || "#a57bff");
    const box = $("event-opts");
    box.replaceChildren();
    box.classList.toggle("two", info.options.length === 2);
    info.options.forEach((o, i) => {
      const b = el("button", "event-opt");
      b.type = "button";
      b.setAttribute("role", "listitem");
      if (o.col) b.style.setProperty("--opt-col", o.col);
      b.append(el("span", "card-key", String(i + 1)), el("b", "", o.name), el("span", "event-text", o.text));
      if (o.cost) b.append(el("span", "event-cost", o.cost));
      b.disabled = !!o.disabled;
      b.addEventListener("click", () => { if (armed()) handlers.onEvent(i); });
      box.append(b);
    });
    const lv = $("event-leave");
    lv.hidden = !info.leave;
    $("event-leave-label").textContent = info.leave || "";
    const n = $("event-hint");
    if (n) n.innerHTML = input.mode === "kbm" ? "Press <kbd>1</kbd>–<kbd>" + info.options.length + "</kbd> to choose" : "";
    this.show("event");
  },

  // ---------------- weapon evolution ----------------
  /** Two paths for the gun in slot i: pick one (it's locked in for this gun) or decide after the next boss. */
  showEvo(i) {
    const g = G.guns[i];
    if (!g) return;
    const base = BALANCE.guns[g.id];
    $("evo-kicker").textContent = "Weapon evolution · " + base.name + " IV";
    $("evo-title").textContent = "Evolve your " + base.name;
    $("evo-sub").innerHTML = "Pick a path. It's locked in for this gun for the rest of the run.";
    const box = $("evo-cards");
    box.replaceChildren();
    evoChoices(g.id).forEach((c, k) => {
      const b = el("button", "evo-card");
      b.type = "button";
      b.setAttribute("role", "listitem");
      b.dataset.path = c.path;
      b.style.setProperty("--evo-col", c.col);
      b.append(el("span", "card-key", String(k + 1)));
      b.append(el("span", "evo-path", "Path " + c.path.toUpperCase() + " · " + c.tag));
      const art = el("span", "evo-art");
      art.append(gunArt(g.id), el("i", "evo-spark"));
      b.append(art);
      b.append(el("span", "evo-name", c.name));
      const ul = el("ul", "evo-lines");
      for (const line of c.lines) ul.append(el("li", "", line));
      b.append(ul);
      b.setAttribute("aria-label", "Path " + c.path.toUpperCase() + ": " + c.name + ". " + c.lines.join(" "));
      b.addEventListener("click", () => { if (armed()) handlers.onEvo(c.path); });
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") handlers.onHover && handlers.onHover(); });
      box.append(b);
    });
    const n = $("evo-hint");
    if (n) n.innerHTML = input.mode === "kbm" ? "Press <kbd>1</kbd> or <kbd>2</kbd> to evolve" : input.mode === "gamepad" ? "D-pad to choose · <kbd>A</kbd> to evolve" : "Tap a path to evolve";
    this.show("evo");
  },

  // ---------------- co-op ----------------
  openLobby(name) {
    $("lobby-start").hidden = false;
    $("lobby-room").hidden = true;
    $("lobby-name").value = name || "";
    this.lobbyStatus(window.EG && window.EG.sb ? "" : "Co-op needs an internet connection.", window.EG && window.EG.sb ? "" : "bad");
    this.show("lobby");
    setTimeout(() => { try { $("lobby-name").focus(); } catch (e) { /* ignore */ } }, 40);
  },
  lobbyName() {
    const n = ($("lobby-name").value || "").trim().slice(0, 16);
    if (!n) { this.lobbyStatus("Pick a name first.", "bad"); $("lobby-name").focus(); return ""; }
    return n;
  },
  lobbyRoom(code, host) {
    $("lobby-start").hidden = true;
    $("lobby-room").hidden = false;
    // the host picks the mode: the Ladder, or Boss Rush once they've unlocked it
    const row = $("lobby-mode-row"), sel = $("lobby-mode");
    row.hidden = !host || !store.rushUnlocked();
    if (host) {
      sel.value = store.rushUnlocked() && store.data.coopMode === "rush" ? "rush" : "ladder";
      handlers.onLobbyMode && handlers.onLobbyMode(sel.value);
      sel.onchange = () => { store.data.coopMode = sel.value; store.save(); handlers.onLobbyMode && handlers.onLobbyMode(sel.value); };
    }
    $("lobby-code-show").textContent = code;
    $("lobby-go").hidden = !host;
    $("lobby-wait").hidden = host;
  },
  renderLobby(members, host) {
    const list = $("lobby-list");
    if (!list) return;
    list.replaceChildren();
    for (let i = 0; i < 4; i++) {
      const m = members.find((x) => x.slot === i);
      const li = el("li", "lobby-slot" + (m ? "" : " empty"));
      li.style.setProperty("--slot", SLOT_COL[i]);
      if (m) { const art = el("span", "lobby-astro"); art.append(lookArt(m.suit, 46, 52)); li.append(art); }
      else li.append(el("span", "lobby-dot"));
      li.append(el("span", "lobby-pname", m ? m.name : "Waiting for a player…"));
      if (m && m.slot === 0) li.append(el("span", "lobby-tag", "Host"));
      list.append(li);
    }
    const go = $("lobby-go");
    if (go) {
      go.disabled = members.length < 2;
      go.lastChild.textContent = members.length < 2 ? "Waiting for players" : "Start (" + members.length + " players)";
    }
  },
  lobbyStatus(text, kind) {
    const n = $("lobby-status");
    if (!n) return;
    n.textContent = text || "";
    n.className = "lobby-status" + (kind ? " " + kind : "");
  },
  /** The HUD's teammate list: name, hearts, down. */
  renderTeam() {
    const box = this.els.team;
    if (!box) return;
    const on = G.net.role !== "off";
    box.hidden = !on;
    if (!on) return;
    let key = "";
    for (const P of G.players) if (P !== G.me) key += P.slot + ":" + P.hp + "/" + P.maxHp + (P.dead ? "d" + Math.round(P.reviveT * 10) : "") + (P.gone ? "g" : "") + ";";
    if (key === last.team) return;
    last.team = key;
    box.replaceChildren();
    for (const P of G.players) {
      if (P === G.me) continue;
      const row = el("div", "mate" + (P.dead ? " down" : "") + (P.gone ? " gone" : ""));
      row.style.setProperty("--slot", SLOT_COL[P.slot] || "#fff");
      row.append(el("span", "mate-name", P.name || "Player"));
      if (P.gone) row.append(el("span", "mate-hp", "left"));
      else if (P.dead) row.append(el("span", "mate-hp", P.reviveT > 0 ? "reviving " + Math.round(P.reviveT * 100) + "%" : "DOWN · go to them"));
      else row.append(el("span", "mate-hp", "\u2665".repeat(Math.ceil(P.hp / 2)) + "\u2661".repeat(Math.max(0, Math.ceil(P.maxHp / 2) - Math.ceil(P.hp / 2)))));
      box.append(row);
    }
  },
  /** Co-op, a quick wave (no Armory): you picked, now waiting on these people. */
  setCardsWaiting(names) {
    $("cards").classList.add("waiting");
    $("up-title").textContent = "Ready";
    $("up-hint").textContent = names.length ? "Waiting for " + names.join(", ") + "…" : "Starting…";
  },
  /** Co-op shop: you're ready, waiting on these people. */
  setShopWaiting(names) {
    const b = $("shop-go");
    const lab = $("shop-go-label");
    if (!b || !lab) return;
    if (!names.length) { lab.textContent = "Starting…"; b.disabled = true; return; }
    lab.textContent = "Ready · waiting for " + names.join(", ");
    b.disabled = true;
  },

  // ---------------- the Armory (shop) ----------------
  showShop(info) {
    $("shop-kicker").textContent = info.kicker;
    $("shop-next").innerHTML = info.next || "";
    $("shop-go-label").textContent = G.net.role !== "off" ? "Ready" : info.go || "Next wave";
    $("shop-go").disabled = false;
    this.renderShop();
    this.renderShopHint();
    this.show("shop");
  },

  renderShop() {
    const box = $("shop-offers");
    box.replaceChildren();
    G.shop.offers.forEach((o, i) => {
      const wrap = el("div", "offer" + (o && o.sold ? " sold" : "") + (o && o.locked ? " locked" : "") + (!o ? " empty" : ""));
      wrap.setAttribute("role", "listitem");
      if (!o) { wrap.append(el("span", "offer-empty", "Sold out")); box.append(wrap); return; }
      const info = offerInfo(o);
      const price = offerPrice(o);
      wrap.style.setProperty("--offer-col", info.col);
      const b = el("button", "offer-buy");
      b.type = "button";
      b.dataset.i = String(i);
      b.append(el("span", "offer-key", String(i + 1)));
      b.append(el("span", "offer-kicker", info.kicker));
      const art = el("span", "offer-art" + (info.gun ? " gun" : ""));
      art.append(info.gun ? gunArt(o.id) : itemArt(o.id));
      if (info.gun) art.append(el("span", "offer-tier", TIER_NAMES[info.tier - 1]));
      b.append(art);
      b.append(el("span", "offer-name", info.name));
      b.append(el("p", "offer-text", info.text));
      if (info.note) b.append(el("span", "offer-note", info.note));
      const syn = synergyFor(o.kind, o.id);
      if (syn) b.append(el("span", "synergy", syn));
      const pr = el("span", "offer-price" + (G.stars < price && !o.sold ? " short" : ""), o.sold ? "Sold" : "★ " + price);
      b.append(pr);
      b.disabled = o.sold;
      b.setAttribute("aria-label", info.name + ", " + info.kicker + ". " + info.text + (info.note ? ". " + info.note : "") + (o.sold ? ". Sold" : ". " + price + " stars"));
      b.addEventListener("click", () => { if (armed()) handlers.onBuy(i); });
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") handlers.onHover && handlers.onHover(); });
      wrap.append(b);
      if (!o.sold) {
        const lk = el("button", "offer-lock");
        lk.type = "button";
        lk.setAttribute("aria-pressed", o.locked ? "true" : "false");
        lk.setAttribute("aria-label", (o.locked ? "Unlock " : "Lock ") + info.name + " (keeps it for the next shop)");
        lk.title = o.locked ? "Locked: it'll still be here next shop" : "Lock: keep it for the next shop";
        lk.append(icon("lock"));
        lk.addEventListener("click", () => handlers.onLock(i));
        wrap.append(lk);
      }
      box.append(wrap);
    });
    this.renderShopEconomy();
    this.renderLoadout();
  },

  renderShopEconomy() {
    const P = G.player;
    const rc = rerollCost(), pc = patchCost();
    $("shop-stars").textContent = String(G.stars);
    $("shop-reroll-label").textContent = "Reroll · ★" + rc;
    $("shop-patch-label").textContent = "Patch up +½💜 · ★" + pc;
    $("shop-reroll").disabled = G.stars < rc;
    $("shop-patch").disabled = G.stars < pc || !P || P.hp >= P.maxHp;
    // prices you can't afford go dim as stars change
    document.querySelectorAll("#shop-offers .offer-buy").forEach((b) => {
      const o = G.shop.offers[Number(b.dataset.i)];
      const pr = b.querySelector(".offer-price");
      if (o && pr && !o.sold) pr.classList.toggle("short", G.stars < offerPrice(o));
    });
  },

  renderLoadout() {
    const guns = $("shop-guns");
    guns.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const g = G.guns[i];
      const b = el("button", "slot" + (i === G.gunSlot ? " active" : "") + (g ? "" : " empty"));
      b.type = "button";
      if (g) {
        b.style.setProperty("--gun-col", gunCol(g));
        b.classList.toggle("evolved", !!g.evo);
        b.append(gunArt(g.id), el("span", "slot-name", gunName(g)));
        const pips = el("span", "slot-pips");
        for (let k = 0; k < 4; k++) pips.append(el("i", k < g.tier ? "on" : ""));
        if (g.evo) pips.append(el("b", "slot-evo", "✦"));
        else if (g.tier >= 4) pips.title = "Tier IV: beat the next boss to evolve it";
        b.append(pips);
        b.title = i === G.gunSlot ? "Equipped. New guns replace this one when both slots are full" : "Click to equip";
      } else b.append(el("span", "slot-name", "Empty slot"));
      b.setAttribute("aria-pressed", i === G.gunSlot ? "true" : "false");
      b.addEventListener("click", () => handlers.onSelectSlot && handlers.onSelectSlot(i));
      guns.append(b);
    }
    $("shop-swap-hint").textContent = input.mode === "kbm" ? "Q swaps in a fight" : input.mode === "gamepad" ? "Y swaps in a fight" : "tap your gun to swap";
    const gear = $("shop-gear");
    gear.replaceChildren();
    const owned = ownedItems();
    if (!owned.length) gear.append(el("span", "set-note", "Nothing yet."));
    for (const it of owned) {
      const c = el("span", "gear-chip");
      c.style.setProperty("--chip-col", it.col);
      c.title = it.name;
      c.append(itemArt(it.id));
      if (it.n > 1) c.append(el("b", "", "×" + it.n));
      gear.append(c);
    }
    const st = G.stats, P = G.player;
    const dl = $("shop-stats");
    dl.replaceChildren();
    const add = (k, v) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); dl.append(d); };
    add("Damage", st.damage.toFixed(st.damage < 10 ? 1 : 0) + (st.projectiles > 1 ? " ×" + st.projectiles : ""));
    add("Fire rate", st.rate.toFixed(1) + "/s");
    add("DPS", "~" + Math.round(estimateDps()));
    add("Crit", Math.round(st.crit * 100) + "%");
    add("Charge", st.chargeTime.toFixed(2) + "s · ×" + fmtCharge(st));
    add("Health", (P ? P.hp / 2 : 0) + " / " + st.maxHp / 2 + " 💜");
  },

  renderShopHint() {
    const n = $("shop-hint");
    if (!n) return;
    n.innerHTML = input.mode === "kbm" ? "<kbd>1</kbd>–<kbd>4</kbd> buy · <kbd>R</kbd> reroll · <kbd>Enter</kbd> next wave · 🔒 keeps an offer for next time"
      : input.mode === "gamepad" ? "D-pad to choose · <kbd>A</kbd> to buy · 🔒 keeps an offer for next time" : "Tap to buy · 🔒 keeps an offer for next time";
  },

  // ---------------- the Armory: which gun a new one replaces ----------------
  /** Both slots full and a new gun to buy: pick the one it replaces (nothing is spent until you confirm). */
  openSwapPick(i) {
    const o = G.shop.offers[i];
    if (!o) return;
    this.swapOffer = i;
    this.swapSlot = G.gunSlot;
    $("swap-title").textContent = BALANCE.guns[o.id].name;
    $("swap-kicker").textContent = "Tier I \u00b7 \u2605" + offerPrice(o);
    this.renderSwapPick();
    const box = $("swap-pick");
    box.hidden = false;
    box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
    setTimeout(() => { const b = box.querySelector(".swap-slot.on"); if (b) b.focus({ preventScroll: true }); }, 30);
    this.renderPadHints();
  },
  get swapOpen() { const b = $("swap-pick"); return !!b && !b.hidden; },
  pickSwapSlot(sl) { if (!this.swapOpen || !G.guns[sl]) return; this.swapSlot = sl; this.renderSwapPick(); const b = $("swap-slots").children[sl]; if (b) b.focus({ preventScroll: true }); },
  renderSwapPick() {
    const o = G.shop.offers[this.swapOffer];
    const box = $("swap-slots");
    box.replaceChildren();
    for (let sl = 0; sl < 2; sl++) {
      const g = G.guns[sl];
      if (!g) continue;
      const st = statsFor(sl);
      const on = sl === this.swapSlot;
      const b = el("button", "swap-slot" + (on ? " on" : "") + (g.evo ? " evolved" : ""));
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.style.setProperty("--gun-col", gunCol(g));
      const top = el("span", "swap-top");
      top.append(el("span", "swap-k", "Slot " + (sl + 1) + (sl === G.gunSlot ? " \u00b7 in hand" : "")), tierPips(g));
      const art = el("span", "swap-art");
      art.append(gunArt(g.id));
      b.append(top, art, el("b", "swap-name", gunName(g)));
      const dl = el("span", "swap-stats");
      for (const [k, v] of [["Damage", fmtDmg(st)], ["Rate", st.rate.toFixed(1) + "/s"], ["DPS", "~" + Math.round(st.dps)]]) {
        const d = el("span");
        d.append(el("small", "", k), el("b", "", v));
        dl.append(d);
      }
      b.append(dl, el("span", "swap-charge", gunLine(g)));
      b.append(el("span", "swap-out", on ? "This one goes" : "Keep"));
      b.setAttribute("aria-label", "Replace " + gunName(g) + ", Tier " + TIER_NAMES[g.tier - 1] + ", about " + Math.round(st.dps) + " damage a second");
      b.addEventListener("click", () => { this.swapSlot = sl; handlers.onClick && handlers.onClick(); this.renderSwapPick(); const nb = $("swap-slots").children[sl]; if (nb && input.mode !== "touch") nb.focus({ preventScroll: true }); });
      box.append(b);
    }
    const out = G.guns[this.swapSlot];
    $("swap-ok-label").textContent = "Replace " + (out ? gunName(out) : "it") + " \u00b7 \u2605" + (o ? offerPrice(o) : 0);
  },
  closeSwapPick() {
    const box = $("swap-pick");
    if (!box || box.hidden) return false;
    box.hidden = true;
    this.swapOffer = -1;
    this.renderPadHints();
    if (input.mode !== "touch") { const b = $("shop-go"); if (b) b.focus({ preventScroll: true }); }
    return true;
  },

  // ---------------- your build ----------------
  /** from: the screen to go back to ("pause", "shop" or "upgrade"). */
  openBuild(from) {
    this.buildFrom = from || "pause";
    G.emit("buildView");
    if (!this.buildTab) this.buildTab = "guns";
    $("build-kicker").textContent = (G.mode === "rush" ? "Boss Rush" : G.daily ? "Daily Challenge" : "The Sin Ladder") + " \u00b7 wave " + G.wave + (G.net.role !== "off" ? " \u00b7 co-op: the game keeps going" : "");
    $("build-resume").hidden = this.buildFrom !== "pause";
    $("build-back").textContent = this.buildFrom === "shop" ? "Back to the Armory" : this.buildFrom === "upgrade" ? "Back to the cards" : "Back";
    this.renderBuildView();
    this.show("build");
  },
  closeBuild() { this.show(this.buildFrom || "pause"); },
  renderBuildView() {
    for (const t of document.querySelectorAll(".bv-tabs .tab")) t.setAttribute("aria-selected", t.dataset.bv === this.buildTab ? "true" : "false");
    const box = $("bv-page");
    box.replaceChildren();
    const tab = this.buildTab;
    const row = (cls) => { const r = el("div", "bv-row" + (cls ? " " + cls : "")); box.append(r); return r; };
    if (tab === "guns") {
      for (let sl = 0; sl < 2; sl++) {
        const g = G.guns[sl];
        const r = row("bv-gun" + (sl === G.gunSlot ? " held" : ""));
        if (!g) { r.classList.add("empty"); r.append(el("span", "bv-empty", "Slot " + (sl + 1) + ": empty. Buy a gun in the Armory.")); continue; }
        const st = statsFor(sl);
        r.style.setProperty("--chip-col", gunCol(g));
        const head = el("div", "bv-head");
        const art = el("span", "bv-art");
        art.append(gunArt(g.id));
        const name = el("div", "bv-name");
        name.append(el("b", "", gunName(g)), el("small", "", "Slot " + (sl + 1) + (sl === G.gunSlot ? " \u00b7 in hand" : "")));
        head.append(art, name, tierPips(g));
        r.append(head);
        if (g.evo) {
          const lines = EVO_TEXT[g.id + "_" + g.evo] || [];
          const ev = el("div", "bv-evo");
          ev.append(el("b", "", "\u2726 Evolved: " + evoName(evoCode(g.id, g.evo))));
          for (const l of lines) ev.append(el("span", "", l));
          r.append(ev);
        } else r.append(el("p", "bv-note", g.tier >= 4 ? "Tier IV: beat the next sin boss to evolve it." : "Tier " + TIER_NAMES[g.tier - 1] + " of IV. Buying it again in the Armory upgrades it."));
        r.append(el("p", "bv-text", BALANCE.guns[g.id].blurb));
        const dl = el("dl", "bv-stats");
        const add = (k, v) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); dl.append(d); };
        add("Damage", fmtDmg(st));
        add("Fire rate", st.rate.toFixed(1) + "/s");
        add("Damage/s", "~" + Math.round(st.dps));
        add("Crit", Math.round(st.crit * 100) + "% \u00b7 \u00d7" + st.critMul.toFixed(1));
        add("Full charge", st.chargeTime.toFixed(2) + "s \u00b7 \u00d7" + fmtCharge(st));
        if (st.pierce > 0) add("Pierce", String(st.pierce));
        if (st.explode > 0) add("Blast", Math.round(st.explode) + " wide");
        if (st.chain > 0) add("Chains", String(st.chain));
        if (st.homing > 0) add("Homing", "on");
        r.append(dl);
      }
    } else if (tab === "sins") {
      const list = buildSummary().sort((a, b) => (a.kind === "fusion" ? -1 : 0) - (b.kind === "fusion" ? -1 : 0));
      if (!list.length) box.append(el("p", "bv-empty", "No sins or augments yet: you pick one after every wave."));
      for (const c of list) {
        const card = CARD_BY_ID[c.id];
        const r = row(c.kind === "fusion" ? "fusion" : "");
        r.style.setProperty("--chip-col", c.color);
        if (c.color2) r.style.setProperty("--chip-col2", c.color2);
        const head = el("div", "bv-head");
        const art = el("span", "bv-art");
        if (c.imgs) for (const src of c.imgs) { const im = el("img"); im.src = src; im.alt = ""; art.append(im); }
        else if (c.img) { const im = el("img"); im.src = c.img; im.alt = ""; art.append(im); }
        else art.append(icon(c.icon));
        const name = el("div", "bv-name");
        name.append(el("b", "", c.name), el("small", "", c.kind === "fusion" ? "Sin Fusion" : c.kind === "sin" ? "Sin" : "Augment"));
        const lv = el("span", "bv-lv", c.kind === "fusion" ? "" : c.level >= c.max ? "MAX" : "Level " + c.level + " of " + c.max);
        head.append(art, name, lv);
        r.append(head);
        const levels = card && card.levels;
        if (levels && levels.length) r.append(el("p", "bv-text", levels[Math.min(levels.length, c.level) - 1]));
      }
    } else if (tab === "gear") {
      const owned = ownedItems();
      if (!owned.length) box.append(el("p", "bv-empty", "No gear yet: the Armory sells it between waves."));
      for (const it of owned) {
        const info = itemInfo(it.id) || { name: it.name, text: "", cost: "", rarity: "", max: 1 };
        const r = row();
        r.style.setProperty("--chip-col", it.col);
        const head = el("div", "bv-head");
        const art = el("span", "bv-art");
        art.append(itemArt(it.id));
        const name = el("div", "bv-name");
        name.append(el("b", "", info.name), el("small", "", info.rarity));
        head.append(art, name, el("span", "bv-lv", info.max > 1 ? it.n + " of " + info.max : ""));
        r.append(head, el("p", "bv-text", info.text + (info.cost ? " \u00b7 Cost: " + info.cost : "")));
      }
    } else {
      const st = G.stats, P = G.player, B = BALANCE.player;
      const dl = el("dl", "bv-stats wide");
      const add = (k, v) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); dl.append(d); };
      add("Health", (P ? P.hp / 2 : 0) + " / " + st.maxHp / 2 + " 💜");
      if (st.shieldCap > 0) add("Shield", (P ? P.shield || 0 : 0) + " / " + st.shieldCap);
      add("Damage (in hand)", fmtDmg(st));
      add("Fire rate", st.rate.toFixed(1) + "/s");
      add("Damage/s", "~" + Math.round(estimateDps()));
      add("Crit chance", Math.round(st.crit * 100) + "%");
      add("Crit damage", "\u00d7" + st.critMul.toFixed(1));
      add("Move speed", Math.round((st.moveSpeed / B.speed) * 100) + "%");
      add("Boost recharge", st.boostCd.toFixed(1) + "s");
      add("Shots per pull", String(st.projectiles));
      if (st.pierce > 0) add("Pierce", String(st.pierce));
      add("Star value", "\u00d7" + st.starValue.toFixed(2).replace(/\.?0+$/, ""));
      add("Star pickup reach", Math.round(st.magnet) + "");
      if (st.heartMul !== 1) add("Healing", "\u00d7" + st.heartMul);
      if (st.iframesMul !== 1) add("Safety after a hit", "\u00d7" + st.iframesMul);
      if (st.interest > 0) add("Greed interest", Math.round(st.interest * 100) + "%");
      box.append(dl);
    }
  },

  focusCard(i) {
    const c = this.els.cards.children[i];
    if (c) c.focus();
  },

  // ---------------- pause + game over ----------------
  showPause(build, coop) {
    $("pause-title").textContent = coop ? "Menu" : "Paused";
    $("pause-sub").textContent = (coop ? "Co-op: the game keeps going · " : "") + "Wave " + G.wave + " · " + formatScore(G.score) + " pts";
    $("restart-btn").hidden = !!coop;
    $("resume-btn").lastChild.textContent = coop ? "Back to the fight" : "Resume";
    $("quit-btn").lastChild.textContent = coop ? "Leave co-op" : "Quit to menu";
    // the run so far: what you're playing, how it's going, how it measures up to your best
    const ps = $("pause-stats");
    if (ps) {
      ps.replaceChildren();
      const add = (k, v, cls) => { const d = el("div", cls || ""); d.append(el("dt", "", k), el("dd", "", v)); ps.append(d); };
      const dn = BALANCE.difficulty[G.difficulty] ? BALANCE.difficulty[G.difficulty].name : "Normal";
      const mode = G.mode === "rush" ? "Boss Rush" : G.daily ? "Daily Challenge" : G.lap > 0 || G.wave > 35 ? "Endless" : "The Sin Ladder";
      add("Run", mode + " · " + dn + (coop ? " · co-op" : ""), "wide");
      add("Time", fmtClock(G.time).replace(/\.\d$/, ""));
      add("Kills", formatScore(G.kills));
      add("Best combo", String(G.bestCombo || 0));
      add("Stars", "★ " + G.stars);
      if (G.runSigils) add("Sigils", "+" + G.runSigils + " ◆");
      const bw = store.data.best.wave || 0;
      if (G.mode !== "rush" && !G.daily && !coop && bw) add("Your best", G.wave > bw ? "beating it" : "wave " + bw, G.wave > bw ? "ahead" : "");
    }
    renderBuild($("pause-build"), build);
    renderArsenal($("pause-build"));
    this.show("pause");
  },

  showGameOver(sum) {
    $("over-kicker").textContent = sum.kicker || "Run over · wave " + sum.wave;
    $("over-title").textContent = sum.title;
    // 4.6: the score up top, counting up, with what it's measured against; "new best" stamps on when it lands
    const D = BALANCE.difficulty[sum.difficulty] || BALANCE.difficulty.normal;
    const pill = $("over-diff");
    pill.textContent = (G.daily ? "Daily Challenge" : sum.wave > 35 ? "Endless" : "The Sin Ladder") + " \u00b7 " + D.name + (D.score !== 1 ? " \u00b7 score \u00d7" + D.score : "") + (G.net.role !== "off" ? " \u00b7 co-op" : "");
    pill.style.setProperty("--d-col", DIFF_COL[sum.difficulty] || DIFF_COL.normal);
    const dur = Math.round(Math.min(1500, 500 + Math.log10(Math.max(10, sum.score)) * 150));
    countUp($("over-score"), sum.score, 250, dur, true);
    const sub = $("over-score-sub");
    sub.replaceChildren();
    if (G.net.role === "off" && !G.debug.on && sum.prevBest > 0) {
      if (sum.newScore) sub.append("Beat your best by ", el("b", "", formatScore(sum.score - sum.prevBest)));
      else sub.append("Your best: " + formatScore(sum.prevBest));
    }
    sub.hidden = !sub.childNodes.length;
    const best = $("over-best");
    best.hidden = true;
    best.textContent = sum.newScore ? "New best score!" : "New best wave!";
    clearTimeout(this.stampT);
    if (sum.anyBest) this.stampT = setTimeout(() => { if (screen === "over") { best.hidden = false; handlers.onStamp && handlers.onStamp(); } }, 250 + dur + 150);
    // the run's main numbers
    const dl = $("over-stats");
    dl.replaceChildren();
    statTile(dl, "Wave", sum.wave, sum.newWave, 0);
    statTile(dl, "Kills", sum.kills, false, 1);
    statTile(dl, "Best combo", sum.combo, sum.newCombo, 2);
    statTile(dl, "Time", sum.time, false, 3);
    // the rest, in a tidy list
    const more = $("over-more");
    more.replaceChildren();
    const row = (k, v) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); more.append(d); };
    row("Stars collected", formatScore(sum.stars));
    if (sum.spent) row("Stars spent", formatScore(sum.spent));
    if (sum.perfects) row("Perfect boosts", String(sum.perfects));
    if (sum.bosses) row("Bosses down", String(sum.bosses));
    if (sum.dmg) row("Damage dealt", formatScore(sum.dmg));
    if (sum.big) row("Biggest hit", formatScore(sum.big));
    if (sum.topGun) row("Top gun", sum.topGun);
    if (sum.killedBy) row("Got you", sum.killedBy);
    // what you took home
    const rw = $("over-rewards");
    rw.replaceChildren();
    let k = 0;
    const chip = (cls, label, val) => { const c = el("span", "rw-chip" + (cls ? " " + cls : "")); c.style.animationDelay = (0.7 + k++ * 0.12).toFixed(2) + "s"; c.append(el("span", "", label), el("b", "", val)); rw.append(c); };
    if (G.runSigils) chip("", "Sigils earned", "+" + G.runSigils + " \u25c6");
    for (const c of G.runContracts || []) chip("contract", "Contract: " + c.text, "+" + c.sigils + " \u25c6");
    this.renderXp("over-xp");
    const buildBox = $("over-build");
    renderBuild(buildBox, sum.build, sum.buildTitle);
    renderArsenal(buildBox);
    if (sum.unlock) buildBox.append(el("p", "set-note", "Unlocked the " + sum.unlock + " suit!"));
    this.renderOverHint();
    // co-op: only the host can start the next run
    const client = G.net.role === "client";
    $("retry-btn").disabled = client;
    $("retry-btn").lastChild.textContent = client ? "Waiting for the host" : G.net.role === "host" ? "Play again (everyone)" : "One more run";
    $("over-menu-btn").lastChild.textContent = G.net.role !== "off" ? "Leave co-op" : "Menu";
    this.show("over");
  },

  renderOverHint() {
    const n = $("over-hint");
    if (n) n.innerHTML = input.mode === "kbm" ? "<kbd>R</kbd> or <kbd>Enter</kbd> to go again" : input.mode === "gamepad" ? "<kbd>A</kbd> to go again" : "";
  },

  // ---------------- gamepad menu navigation ----------------
  /** D-pad / stick in menus: moves to the nearest control in that direction (what's on screen, not the page's order). */
  navigate(dir) {
    const root = navRoot();
    if (!root) return;
    const list = focusables(root);
    if (!list.length) return;
    const a = document.activeElement;
    if (!list.includes(a)) { focusEl(preferredIn(root, list)); return; }
    if (a.type === "range" && (dir === "left" || dir === "right")) {
      a.value = Number(a.value) + (dir === "right" ? 5 : -5);
      a.dispatchEvent(new Event("input"));
      return;
    }
    if (a.tagName === "SELECT" && (dir === "left" || dir === "right") && a.options.length) {
      a.selectedIndex = (a.selectedIndex + (dir === "right" ? 1 : a.options.length - 1)) % a.options.length;
      a.dispatchEvent(new Event("change"));
      return;
    }
    let next = spatialNext(a, list, dir);
    // nothing roughly that way: up / down take the nearest further up / down, then wrap around; left / right stay put
    if (!next && (dir === "up" || dir === "down")) next = spatialNext(a, list, dir, false) || list[(list.indexOf(a) + (dir === "up" ? list.length - 1 : 1)) % list.length];
    if (next) { focusEl(next); if (handlers.onHover) handlers.onHover(); }
  },
  confirm() {
    const a = document.activeElement;
    const root = navRoot();
    if (!a || a === document.body || (root && !root.contains(a))) { if (root) this.navigate("down"); return; }
    if (a.type === "checkbox") { a.checked = !a.checked; a.dispatchEvent(new Event("change")); return; }
    if (!a.click) return;
    // many buttons redraw the list they're in (the Locker, the shops, the tabs): keep the highlight on the same spot
    const was = screen, before = focusables(root), at = before.indexOf(a), key = focusKey(a);
    a.click();
    const restore = () => {
      if (screen !== was) return;
      const cur = document.activeElement;
      if (cur && cur !== document.body && cur.isConnected) return;
      const r = navRoot();
      if (!r) return;
      const list = focusables(r);
      if (!list.length) return;
      const same = key ? list.filter((n) => focusKey(n) === key) : [];
      focusEl(same.length ? same.reduce((x, y) => Math.abs(list.indexOf(y) - at) < Math.abs(list.indexOf(x) - at) ? y : x) : list[Math.min(Math.max(at, 0), list.length - 1)]);
    };
    restore();
    setTimeout(restore, 60);
  },
  /** With a controller, something on screen always has the highlight (after Back, a redraw, a tab change). */
  ensureFocus() {
    if (input.mode !== "gamepad") return;
    const r = navRoot(), f = document.activeElement;
    if (r && (!f || f === document.body || !r.contains(f) || !visible(f))) this.navigate("down");
  },
  /** LB / RB: the previous / next tab of whatever's open (the Hangar, your build, settings, the leaderboard). */
  cycleTab(step) {
    if (this.swapOpen) { this.pickSwapSlot(this.swapSlot === 0 ? 1 : 0); return true; }
    let tabs, at;
    if (screen === "menu") {
      if (menuOverlay()) return false;
      tabs = Array.from(document.querySelectorAll(".hnav")).filter(visible);
      at = tabs.findIndex((b) => b.classList.contains("on"));
    } else {
      const root = screen && $("screen-" + screen);
      const bar = root && root.querySelector("[role=tablist]");
      if (!bar) return false;
      tabs = Array.from(bar.querySelectorAll("[role=tab]")).filter(visible);
      at = tabs.findIndex((b) => b.getAttribute("aria-selected") === "true");
    }
    if (!tabs.length) return false;
    const next = tabs[(Math.max(0, at) + step + tabs.length) % tabs.length];
    next.click();
    focusEl(next);
    return true;
  },
  /** LT / RT in the Hangar: the sections inside a tab (the Item Shop's rows, the Locker's slots). */
  cycleSubTab(step) {
    if (screen !== "menu" || menuOverlay()) return false;
    const pane = Array.from(document.querySelectorAll(".hpane")).find((n) => !n.hidden);
    if (!pane) return false;
    const bar = pane.querySelector("[role=tablist], .lk-slots");
    if (!bar) return false;
    const tabs = Array.from(bar.querySelectorAll("button")).filter(visible);
    if (!tabs.length) return false;
    const at = tabs.findIndex((b) => b.getAttribute("aria-selected") === "true" || b.getAttribute("aria-pressed") === "true" || b.classList.contains("on"));
    const i = (Math.max(0, at) + step + tabs.length) % tabs.length;
    tabs[i].click();
    // the bar may have been redrawn by that click
    const again = Array.from(bar.querySelectorAll("button")).filter(visible);
    focusEl(again[i] || tabs[i]);
    return true;
  },
  /** The button glyphs along the bottom while a controller drives the menus. */
  renderPadHints() {
    const box = $("pad-hints");
    if (!box) return;
    const keys = [];
    const hasTabs = screen === "menu" || !!(screen && $("screen-" + screen) && $("screen-" + screen).querySelector("[role=tablist]"));
    keys.push(["a", "A", this.swapOpen ? "Buy" : "Select"]);
    if (screen !== "upgrade" && screen !== "evo" && screen !== "event") keys.push(["b", "B", this.swapOpen ? "Cancel" : "Back"]);
    if (this.swapOpen) keys.push(["lb", "LB RB", "Pick the gun"]);
    else if (hasTabs) keys.push(["lb", "LB RB", "Tabs"]);
    if (screen === "menu" && !this.swapOpen) keys.push(["lb", "LT RT", "Sections"]);
    if ((screen === "shop" || screen === "upgrade" || screen === "pause") && !this.swapOpen) keys.push(["view", "View", "Your build"]);
    box.replaceChildren();
    for (const [cls, k, label] of keys) {
      const s = el("span", "pad-hint");
      s.append(el("b", "pad-k " + cls, k), el("span", "", label));
      box.append(s);
    }
    box.hidden = !screen;
  },

  // ---------------- portrait hint ----------------
  updateRotateHint() {
    const n = this.els["rotate-hint"];
    if (!n) return;
    const portrait = window.innerHeight > window.innerWidth;
    n.hidden = !(portrait && input.mode === "touch" && !store.data.rotateHintDismissed && screen === "menu" && G.state === "menu");
  },
};

const DIFF_COL = { normal: "#63f4ff", hard: "#ffc861", nightmare: "#ff3b5c" };

/** Results numbers count up, eased, ticking as they go (reduced motion shows them at once). */
function countUp(node, to, delay = 0, dur = 800, ticks = false) {
  const token = (node._cu = (node._cu || 0) + 1);
  const show = (v) => { node.textContent = formatScore(v); };
  const calm = document.querySelector(".game.reduced") || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!(to > 0) || calm) { show(to || 0); return; }
  show(0);
  const t0 = performance.now() + delay;
  let lastTick = 0;
  const step = (now) => {
    if (node._cu !== token || !node.isConnected) return;
    const k = Math.min(1, Math.max(0, (now - t0) / dur));
    show(k >= 1 ? to : Math.floor(to * (1 - Math.pow(1 - k, 3))));
    if (ticks && k > 0 && k < 1 && now - lastTick > 60) { lastTick = now; handlers.onTick && handlers.onTick(k); }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A results tile; a number counts up, and says so when it's a new best. */
function statTile(dl, label, v, isNew, i = 0) {
  const d = el("div");
  d.style.setProperty("--i", String(i));
  const dd = el("dd", isNew ? "new" : "");
  const num = el("span", "n");
  dd.append(num);
  if (isNew) dd.append(el("small", "", "New best"));
  d.append(el("dt", "", label), dd);
  dl.append(d);
  if (typeof v === "number") countUp(num, v, 350 + i * 90, 700); else num.textContent = v;
  return dd;
}

/** 83.4 → "1:23.4" */
function fmtClock(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
}

function heartSvg(v, shield) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "heart" + (shield ? " shield" : ""));
  s.setAttribute("aria-hidden", "true");
  let html = '<path class="h-bg" d="' + HEART + '"/>';
  if (v === 2) html += '<path class="h-fill" d="' + HEART + '"/>';
  else if (v === 1) html += '<path class="h-fill" clip-path="url(#eg-half)" d="' + HEART + '"/>';
  s.innerHTML = html;
  return s;
}

/** Guns + gear chips (pause and game over), after the cards. */
// ---------------- menu navigation (controller) ----------------
const visible = (n) => n.offsetParent !== null || (n.getClientRects && n.getClientRects().length > 0);
/** Where the d-pad works right now: the open dialog, else the screen. */
/** The Hangar's open overlay (topmost first), if any: it keeps the controller to itself. */
function menuOverlay() {
  if (screen !== "menu") return null;
  return ["sigil-store", "fr-confirm", "portal-menu", "party-drawer", "reveal", "item-detail"].map($).find((n) => n && !n.hidden) || null;
}
function navRoot() {
  const sw = $("swap-pick");
  if (sw && !sw.hidden) return sw;
  return menuOverlay() || (screen ? $("screen-" + screen) : null);
}
function focusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll("button:not([disabled]):not([tabindex='-1']), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")).filter(visible);
}
/** Where the highlight starts on a screen: PLAY (or the open tab) in the Hangar, else its main button. */
function preferredIn(root, list) {
  if (root.id === "screen-menu") {
    const n = hangar.tabNow === "play" ? $("play-btn") : document.querySelector(".hnav.on");
    if (n && list.includes(n)) return n;
  }
  return list.find((n) => n.matches(".btn-primary")) || list.find((n) => n.matches("[aria-selected='true'], [aria-pressed='true']")) || list[0];
}
function focusEl(n) {
  if (!n) return;
  try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
  if (n.scrollIntoView) n.scrollIntoView({ block: "nearest", inline: "nearest" });
}
/** Something that survives a redraw: the id, else the data-* values and the first class. */
function focusKey(n) {
  if (n.id) return "#" + n.id;
  const d = Object.keys(n.dataset || {}).sort().map((k) => k + "=" + n.dataset[k]).join("&");
  return d ? (n.className.split(" ")[0] || n.tagName) + "?" + d : "";
}
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
/** The control nearest to `from` in direction dir, by where they sit on screen. strict: only ones roughly that way
    (a cone), not anything that happens to be a little further over. */
function spatialNext(from, list, dir, strict = true) {
  const r = from.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const flat = dir === "left" || dir === "right";
  let best = null, bestScore = Infinity;
  for (const n of list) {
    if (n === from) continue;
    const q = n.getBoundingClientRect();
    if (!q.width && !q.height) continue;
    const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
    let along, across;
    if (dir === "right") { if (qx <= cx + 4 || q.right <= r.right - 2) continue; along = q.left - r.right; across = overlap(q.top, q.bottom, r.top, r.bottom); }
    else if (dir === "left") { if (qx >= cx - 4 || q.left >= r.left + 2) continue; along = r.left - q.right; across = overlap(q.top, q.bottom, r.top, r.bottom); }
    else if (dir === "down") { if (qy <= cy + 4 || q.bottom <= r.bottom - 2) continue; along = q.top - r.bottom; across = overlap(q.left, q.right, r.left, r.right); }
    else { if (qy >= cy - 4 || q.top >= r.top + 2) continue; along = r.top - q.bottom; across = overlap(q.left, q.right, r.left, r.right); }
    along = Math.max(0, along);
    if (strict && across > along * 2 + 30) continue;
    // the same row / column first, then the closest
    const score = along + across * 2.5 + (across > 0 ? 40 : 0) + Math.abs(flat ? qy - cy : qx - cx) * 0.12;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best;
}

/** One gun's numbers (the stats are computed for the gun in hand, so this borrows its slot for a moment). */
function statsFor(slot) {
  const keep = G.gunSlot;
  G.gunSlot = slot;
  computeStats();
  const s = G.stats;
  const out = { damage: s.damage, projectiles: s.projectiles, rate: s.rate, crit: s.crit, critMul: s.critMul, chargeTime: s.chargeTime,
    chargeMul: s.chargeMul, pierce: s.pierce, explode: s.explode, chain: s.chain, homing: s.homing, dps: estimateDps() };
  G.gunSlot = keep;
  computeStats();
  return out;
}
/** A full charge's damage, as a multiple of a normal shot. */
const fmtCharge = (st) => (BALANCE.charge.dmg[1] * st.chargeMul).toFixed(1).replace(/\.0$/, "");
const fmtDmg = (st) => st.damage.toFixed(st.damage < 10 ? 1 : 0) + (st.projectiles > 1 ? " \u00d7" + st.projectiles : "");
function tierPips(g) {
  const pips = el("span", "slot-pips");
  for (let k = 0; k < 4; k++) pips.append(el("i", k < g.tier ? "on" : ""));
  if (g.evo) pips.append(el("b", "slot-evo", "\u2726"));
  pips.setAttribute("aria-label", "Tier " + TIER_NAMES[g.tier - 1]);
  return pips;
}
/** The gun's line for the "replace which?" cards: its charged shot, or what it evolved into. */
function gunLine(g) {
  if (g.evo) return "\u2726 " + evoName(evoCode(g.id, g.evo));
  const b = BALANCE.guns[g.id].blurb;
  const i = b.indexOf("Charged:");
  return i >= 0 ? b.slice(i) : b;
}

/** A level badge: a hexagon in the colour of its band, the number in it. */
export function levelBadge(L, big) {
  const t = tierOf(L);
  const b = el("span", "lv-badge" + (big ? " big" : "") + (L >= 1000 ? " max" : ""), String(L));
  b.style.setProperty("--lv", t.col);
  b.title = "Level " + L + " · " + t.name;
  return b;
}

function renderArsenal(box) {
  for (const g of G.guns) {
    if (!g) continue;
    const chip = el("span", "build-chip gun");
    chip.style.setProperty("--chip-col", gunCol(g));
    chip.append(gunArt(g.id), document.createTextNode((g.evo ? "✦ " : "") + gunName(g)));
    box.append(chip);
  }
  for (const it of ownedItems()) {
    const chip = el("span", "build-chip");
    chip.style.setProperty("--chip-col", it.col);
    chip.append(itemArt(it.id), document.createTextNode(it.name + " "));
    if (it.n > 1) chip.append(el("b", "", "×" + it.n));
    box.append(chip);
  }
}

function renderBuild(box, build, title) {
  box.replaceChildren();
  if (title) { const t = el("p", "set-note", title); t.style.width = "100%"; box.append(t); }
  if (!build || !build.length) { if (!title) box.append(el("span", "set-note", "No upgrades yet.")); return; }
  for (const c of build) {
    const chip = el("span", "build-chip" + (c.kind === "fusion" ? " fusion" : ""));
    chip.style.setProperty("--chip-col", c.color);
    if (c.kind === "fusion") {
      chip.style.setProperty("--chip-col2", c.color2);
      for (const src of c.imgs) { const img = el("img"); img.src = src; img.alt = ""; chip.append(img); }
      chip.append(document.createTextNode(c.name + " "));
      chip.append(el("b", "", "FUSION"));
      box.append(chip);
      continue;
    }
    if (c.img) { const img = el("img"); img.src = c.img; img.alt = ""; chip.append(img); }
    else chip.append(icon(c.icon));
    chip.append(document.createTextNode(c.name + " "));
    chip.append(el("b", "", c.level >= c.max ? "MAX" : "L" + c.level));
    box.append(chip);
  }
}
