/* DOM overlays: HUD, banners, menus, upgrade cards, the shop, game over, settings, touch sticks.
   The HUD only touches the DOM when a value actually changes. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { input } from "./input.js";
import { store, SUITS, GFX_PRESETS, GFX_KEYS } from "./storage.js";
import { CARD_BY_ID, ENVY_POWERS, estimateDps } from "./upgrades.js";
import { gunArt, itemArt, offerInfo, offerPrice, ownedItems, rerollCost, patchCost, gunName, GUN_COL, TIER_NAMES } from "./armory.js";
import { comboMult } from "./world.js";
import { waves } from "./waves.js";
import { formatScore } from "./util.js";
import { online, todayUTC } from "./online.js";
import { SLOT_COL } from "./coop.js";
import { drawCrosshairAt } from "./render.js";
import { synergyFor } from "./synergy.js";

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

const last = { hp: -1, maxHp: -1, shield: -1, maxShield: -1, score: -1, combo: -1, stars: -1, wave: -1, left: "", boss: -1, envy: "", cd: -1, gun: "", charge: -1, team: "" };
let hudSlowT = 0;         // the bits of the HUD that don't need 60 updates a second
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
const NEWS_VERSION = 5;
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
      "gun-chip", "gun-main", "gun-alt", "team"];
    for (const id of ids) this.els[id] = $(id);

    // half-heart clip, shared by every heart icon
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true");
    defs.style.position = "absolute";
    defs.innerHTML = '<defs><clipPath id="eg-half"><rect x="0" y="0" width="12" height="24"/></clipPath></defs>';
    document.body.appendChild(defs);

    const click = (id, fn) => { const n = $(id); if (n) n.addEventListener("click", (e) => { handlers.onClick && handlers.onClick(); fn(e); }); };
    click("play-btn", () => handlers.onPlay());
    for (const b of document.querySelectorAll(".diff-opt")) {
      b.addEventListener("click", () => { store.data.settings.difficulty = b.dataset.diff; store.save(); this.renderDifficulty(); });
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
    click("news-btn", () => this.show("news"));
    click("coop-btn", () => handlers.onCoop());
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
    const gunChip = $("gun-chip");
    if (gunChip) gunChip.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); handlers.onSwap && handlers.onSwap(); });
    document.querySelectorAll("#settings-form .tab").forEach((t) => t.addEventListener("click", () => { handlers.onClick && handlers.onClick(); this.settingsTab(t.dataset.tab); }));
    click("settings-done", () => this.closeSettings());
    click("how-done", () => { store.data.seenHowTo = true; store.save(); this.show(this.howBack || "menu"); });
    click("daily-btn", () => handlers.onDaily());
    click("board-btn", () => this.openBoard("all", "menu"));
    click("board-done", () => this.show(this.boardBack || "menu"));
    click("board-signin", () => online.signIn());
    click("tab-all", () => this.openBoard("all"));
    click("tab-daily", () => this.openBoard("daily"));
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

    this.renderSuits();
    this.syncSettings();
    this.syncMute();
  },

  // ---------------- screens ----------------
  show(name) {
    const names = ["menu", "pause", "upgrade", "shop", "over", "settings", "how", "board", "win", "news", "lobby"];
    for (const n of names) {
      const node = $("screen-" + n);
      if (!node) continue;
      const on = n === name;
      if (on && node.hidden) { node.hidden = false; node.classList.remove("in"); void node.offsetWidth; node.classList.add("in"); }
      else if (!on) node.hidden = true;
    }
    screen = name;
    if (name === "upgrade" || name === "over" || name === "win" || name === "shop") armedAt = performance.now() + (name === "upgrade" ? 450 : name === "shop" ? 350 : 800);
    if (name === "how") this.renderHow();
    if (name === "menu") this.refreshMenu();
    const first = name && $("screen-" + name) && $("screen-" + name).querySelector(name === "upgrade" ? ".card" : name === "shop" ? "#shop-go" : ".btn-primary, .btn, button");
    if (first && (input.mode !== "touch")) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 30);
    this.updateRotateHint();
  },
  get screen() { return screen; },
  get boardKindNow() { return boardKind; },
  get armed() { return armed(); },

  setState(state) {
    const g = this.els.game;
    g.classList.remove("state-menu", "state-playing", "state-paused", "state-clear", "state-upgrade", "state-shop", "state-dying", "state-over", "state-win");
    g.classList.add("state-" + state);
    this.els.hud.hidden = !(state === "playing" || state === "clear" || state === "dying" || state === "paused" || state === "upgrade" || state === "shop" || state === "win");
    this.updateRotateHint();
  },

  setMode(mode) {
    const g = this.els.game;
    g.classList.remove("mode-kbm", "mode-touch", "mode-gamepad");
    g.classList.add("mode-" + mode);
    this.renderControlsHint();
    if (screen === "how") this.renderHow();
    if (screen === "upgrade") this.renderUpgradeHint();
    if (screen === "shop") this.renderShopHint();
    if (screen === "over") this.renderOverHint();
    this.updateRotateHint();
  },

  setReduced(on) { this.els.game.classList.toggle("reduced", !!on); },

  openSettings(back) {
    this.settingsBack = back;
    this.syncSettings();
    this.show("settings");
    this.settingsTab(this.lastTab || "audio", true);
  },
  settingsTab(tab, keepFocus) {
    this.lastTab = tab;
    document.querySelectorAll("#settings-form .tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === tab ? "true" : "false"));
    document.querySelectorAll("#settings-form .set-page").forEach((pg) => { pg.hidden = pg.dataset.page !== tab; });
    if (!keepFocus && input.mode !== "touch") { const t = $("stab-" + tab); if (t) t.focus(); }
  },
  closeSettings() {
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
    this.renderSuits();
    this.renderDifficulty();
    this.renderControlsHint();
    this.renderLadder($("mini-ladder"), b.rung || 0, (b.wins || 0) > 0);
    const daily = store.data.daily;
    const today = todayUTC();
    $("daily-label").textContent = daily.date === today && daily.score > 0 ? "Daily · best " + formatScore(daily.score) : "Daily Challenge";
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
    $("tab-all").setAttribute("aria-selected", kind === "all" ? "true" : "false");
    $("tab-daily").setAttribute("aria-selected", kind === "daily" ? "true" : "false");
    if (screen !== "board") this.show("board");
    const status = $("board-status"), list = $("board-list");
    list.replaceChildren();
    $("board-signin").hidden = !online.available || !!online.user;
    $("board-who").textContent = online.user ? "Signed in as @" + online.name + (store.data.settings.postScores ? "" : " · posting is off in Settings") : "";
    if (!online.available) { status.textContent = "The leaderboard needs an internet connection."; return; }
    status.textContent = "Loading…";
    const res = await online.board(kind === "daily" ? todayUTC() : null);
    if (boardKind !== kind) return;
    if (res.error === "missing") { status.textContent = "The leaderboard is being set up. Check back soon."; return; }
    if (res.error) { status.textContent = res.error === "offline" ? "The leaderboard needs an internet connection." : res.error; return; }
    if (!res.rows.length) { status.textContent = kind === "daily" ? "Nobody has posted today's Daily yet. Be first." : "No runs posted yet. Be first."; return; }
    status.textContent = kind === "daily" ? "Today's Daily Challenge (" + todayUTC() + " UTC): same waves and cards for everyone." : "Best run per player.";
    for (const r of res.rows) {
      const li = el("li", "board-row" + (r.is_me ? " me" : ""));
      li.append(el("span", "board-rank", "#" + r.rank));
      li.append(el("span", "board-name", "@" + r.username));
      li.append(el("span", "board-wave", (r.won ? "👑 " : "") + "W" + r.wave));
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
    const add = (label, value) => { const d = el("div"); d.append(el("dt", "", label), el("dd", "", value)); dl.append(d); };
    add("Score", formatScore(sum.score));
    add("Time", sum.time);
    add("Kills", String(sum.kills));
    add("Hits taken", String(sum.hits));
    const client = G.net.role === "client";
    $("win-endless").hidden = client;
    $("win-finish").hidden = client;
    $("win-note").textContent = client ? "Your host decides: keep climbing in endless, or finish the run." : "Endless laps the ladder again: robots evolve and every sin comes back harder.";
    this.show("win");
  },

  setDesktop(on) {
    for (const id of ["exit-btn", "pause-exit-btn"]) { const n = $(id); if (n) n.hidden = !on; }
  },

  /** The menu's difficulty picker (applies to the Ladder and to co-op games you host). */
  renderDifficulty() {
    const cur = BALANCE.difficulty[store.data.settings.difficulty] ? store.data.settings.difficulty : "normal";
    for (const b of document.querySelectorAll(".diff-opt")) b.setAttribute("aria-checked", b.dataset.diff === cur ? "true" : "false");
    const note = $("diff-note");
    if (note) note.textContent = DIFF_NOTES[cur];
  },

  renderSuits() {
    const list = $("suit-list");
    if (!list) return;
    list.replaceChildren();
    const cur = store.data.settings.suit;
    for (const s of SUITS) {
      const unlocked = store.suitUnlocked(s);
      const b = el("button", "suit");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", s.id === cur ? "true" : "false");
      b.setAttribute("aria-label", s.name + (unlocked ? "" : " (reach wave " + s.wave + ")"));
      b.title = unlocked ? s.name : "Reach wave " + s.wave + " to unlock";
      b.style.setProperty("--suit", s.suit);
      b.style.setProperty("--trim", s.trim);
      if (!unlocked) { b.disabled = true; b.append(el("span", "lock", "W" + s.wave)); }
      b.addEventListener("click", () => { handlers.onSuit(s.id); this.renderSuits(); });
      list.append(b);
    }
  },

  renderControlsHint() {
    const n = $("menu-controls");
    if (!n) return;
    n.innerHTML = this.controlsLine(input.mode);
  },

  controlsLine(mode) {
    if (mode === "touch") return "Left thumb moves · right thumb aims &amp; fires · <b>⚡ Boost</b> to dash · hold <b>Charge</b> for a charged shot · tap your gun to swap";
    if (mode === "gamepad") return "<kbd>L</kbd> move · <kbd>R</kbd> aim &amp; fire · <kbd>A</kbd>/<kbd>LB</kbd> boost · hold <kbd>LT</kbd> to charge · <kbd>Y</kbd> swap gun · <kbd>Start</kbd> pause";
    return "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · hold left-click to fire · hold right-click to charge · <kbd>Space</kbd> boost · <kbd>Q</kbd> swap gun · <kbd>Esc</kbd> pause";
  },

  renderHow() {
    const box = $("how-controls");
    if (!box) return;
    const mode = input.mode;
    const rows = {
      kbm: [["Move", "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows"], ["Aim", "Mouse (or auto-aim: <kbd>T</kbd>)"], ["Fire", "Hold left click"], ["Charged shot", "Hold right-click or <kbd>E</kbd>, let go to fire"], ["Boost", "<kbd>Space</kbd> or <kbd>Shift</kbd>"], ["Swap gun", "<kbd>Q</kbd>, mouse wheel, <kbd>1</kbd>/<kbd>2</kbd>"], ["Pause", "<kbd>Esc</kbd> or <kbd>P</kbd>"], ["Cards / shop", "<kbd>1</kbd>–<kbd>4</kbd> to pick or buy"]],
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
    if (G.wave !== last.wave) {
      last.wave = G.wave;
      E["hud-wave"].textContent = "Wave " + G.wave;
      const r = ladderRungs()[waves.rungOf(Math.max(1, G.wave))];
      const rung = $("hud-rung");
      rung.textContent = r.name + (G.lap ? " · lap " + (G.lap + 1) : "");
      $("wave-chip").style.setProperty("--rung", r.c1);
      $("daily-chip").hidden = !G.daily;
      const dc = $("diff-chip");
      dc.hidden = G.difficulty === "normal";
      dc.textContent = BALANCE.difficulty[G.difficulty] ? BALANCE.difficulty[G.difficulty].name : "";
      dc.classList.toggle("nightmare", G.difficulty === "nightmare");
    }
    const remaining = G.net.role === "client" ? G.netLeft : waves.remaining();
    const left = waves.boss ? (G.boss ? "Boss" : "") : (G.state === "playing" ? remaining + " left" : "Clear");
    if (left !== last.left) { last.left = left; E["hud-left"].textContent = left; }
    const m = comboMult();
    if (G.combo !== last.combo) {
      const up = G.combo > last.combo;
      last.combo = G.combo;
      E["combo-x"].textContent = "×" + m.toFixed(1);
      E["hud-combo"].classList.toggle("on", G.combo > 0);
      if (up && G.combo > 1) { E["hud-combo"].classList.remove("bump"); void E["hud-combo"].offsetWidth; E["hud-combo"].classList.add("bump"); }
    }
    hudSlowT -= dt;
    const slowTick = hudSlowT <= 0;
    if (slowTick) hudSlowT = 1 / 20;
    if (slowTick) E["combo-fill"].style.transform = "scaleX(" + (G.combo > 0 ? Math.max(0, G.comboTimer / BALANCE.combo.window).toFixed(2) : 0) + ")";

    // boss bar
    const b = G.boss;
    if (b && !b.dead && b.state !== -1) {
      if (E["boss-bar"].hidden) {
        E["boss-bar"].hidden = false;
        E["boss-name"].textContent = "@" + b.def.name + " · " + b.def.title;
        E["boss-bar"].style.setProperty("--boss-col", b.def.c1 || b.kind.accent);
        bossGhost = 1;
      }
      const f = Math.max(0, b.hp / b.maxHp);
      if (bossGhost > f) bossGhost = Math.max(f, bossGhost - dt * 0.35); else bossGhost = f;
      E["boss-fill"].style.transform = "scaleX(" + f.toFixed(4) + ")";
      E["boss-ghost"].style.transform = "scaleX(" + bossGhost.toFixed(4) + ")";
    } else if (!E["boss-bar"].hidden && !G.bossFx) {
      E["boss-bar"].hidden = true;
    }

    // teammates (co-op)
    if (slowTick) this.renderTeam();

    // guns
    const gk = (G.guns[0] ? G.guns[0].id + G.guns[0].tier : "") + "|" + (G.guns[1] ? G.guns[1].id + G.guns[1].tier : "") + "|" + G.gunSlot;
    if (gk !== last.gun) {
      last.gun = gk;
      const a = G.guns[G.gunSlot] || G.guns[0], b = G.guns[1 - G.gunSlot];
      E["gun-main"].replaceChildren(gunArt(a.id), el("b", "", gunName(a)));
      E["gun-chip"].style.setProperty("--gun-col", GUN_COL[a.id]);
      E["gun-alt"].replaceChildren();
      if (b) E["gun-alt"].append(gunArt(b.id), el("span", "", input.mode === "kbm" ? "Q" : input.mode === "gamepad" ? "Y" : "tap"));
      E["gun-alt"].hidden = !b;
      E["gun-chip"].classList.toggle("solo", !b);
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
      const b = el("button", "card");
      b.type = "button";
      b.setAttribute("role", "listitem");
      b.dataset.id = id;
      b.style.setProperty("--card-col", c.color);
      b.append(el("span", "card-key", String(i + 1)));
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
      li.append(el("span", "lobby-dot"));
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
        b.style.setProperty("--gun-col", GUN_COL[g.id]);
        b.append(gunArt(g.id), el("span", "slot-name", gunName(g)));
        const pips = el("span", "slot-pips");
        for (let k = 0; k < 4; k++) pips.append(el("i", k < g.tier ? "on" : ""));
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
    add("Charge", st.chargeTime.toFixed(2) + "s · ×" + st.chargeMul.toFixed(2));
    add("Health", (P ? P.hp / 2 : 0) + " / " + st.maxHp / 2 + " 💜");
  },

  renderShopHint() {
    const n = $("shop-hint");
    if (!n) return;
    n.innerHTML = input.mode === "kbm" ? "<kbd>1</kbd>–<kbd>4</kbd> buy · <kbd>R</kbd> reroll · <kbd>Enter</kbd> next wave · 🔒 keeps an offer for next time"
      : input.mode === "gamepad" ? "D-pad to choose · <kbd>A</kbd> to buy · 🔒 keeps an offer for next time" : "Tap to buy · 🔒 keeps an offer for next time";
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
    renderBuild($("pause-build"), build);
    renderArsenal($("pause-build"));
    this.show("pause");
  },

  showGameOver(sum) {
    $("over-kicker").textContent = sum.kicker || "Run over · wave " + sum.wave;
    $("over-title").textContent = sum.title;
    const best = $("over-best");
    best.hidden = !sum.anyBest;
    best.textContent = "New best!";
    const dl = $("over-stats");
    dl.replaceChildren();
    const add = (label, value, isNew) => {
      const d = el("div");
      const dd = el("dd", isNew ? "new" : "", value);
      if (isNew) dd.append(el("small", "", "New best"));
      d.append(el("dt", "", label), dd);
      dl.append(d);
    };
    if (sum.difficulty && sum.difficulty !== "normal") add("Difficulty", BALANCE.difficulty[sum.difficulty].name + " · score ×" + BALANCE.difficulty[sum.difficulty].score);
    add("Score", formatScore(sum.score), sum.newScore);
    add("Wave", String(sum.wave), sum.newWave);
    add("Kills", String(sum.kills));
    add("Best combo", String(sum.combo), sum.newCombo);
    add("Stars", String(sum.stars));
    add("Time", sum.time);
    if (sum.perfects) add("Perfect boosts", String(sum.perfects));
    if (sum.bosses) add("Bosses", String(sum.bosses));
    if (sum.dmg) add("Damage dealt", formatScore(sum.dmg));
    if (sum.big) add("Biggest hit", formatScore(sum.big));
    if (sum.topGun) add("Top gun", sum.topGun);
    if (sum.spent) add("Stars spent", String(sum.spent));
    if (sum.killedBy) add("Got you", sum.killedBy);
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
  navigate(dir) {
    const root = screen && $("screen-" + screen);
    if (!root) return;
    const list = Array.from(root.querySelectorAll("button:not([disabled]), input, select")).filter((n) => n.offsetParent !== null);
    if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    if (i < 0) { list[0].focus(); return; }
    if (document.activeElement.type === "range" && (dir === "left" || dir === "right")) {
      const r = document.activeElement;
      r.value = Number(r.value) + (dir === "right" ? 5 : -5);
      r.dispatchEvent(new Event("input"));
      return;
    }
    i = dir === "up" || dir === "left" ? (i - 1 + list.length) % list.length : (i + 1) % list.length;
    list[i].focus();
  },
  confirm() {
    const a = document.activeElement;
    if (!a || a === document.body) return;
    if (a.type === "checkbox") { a.checked = !a.checked; a.dispatchEvent(new Event("change")); return; }
    if (a.click) a.click();
  },

  // ---------------- portrait hint ----------------
  updateRotateHint() {
    const n = this.els["rotate-hint"];
    if (!n) return;
    const portrait = window.innerHeight > window.innerWidth;
    n.hidden = !(portrait && input.mode === "touch" && !store.data.rotateHintDismissed && screen === "menu" && G.state === "menu");
  },
};

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
function renderArsenal(box) {
  for (const g of G.guns) {
    if (!g) continue;
    const chip = el("span", "build-chip gun");
    chip.style.setProperty("--chip-col", GUN_COL[g.id]);
    chip.append(gunArt(g.id), document.createTextNode(gunName(g)));
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
    const chip = el("span", "build-chip");
    chip.style.setProperty("--chip-col", c.color);
    if (c.img) { const img = el("img"); img.src = c.img; img.alt = ""; chip.append(img); }
    else chip.append(icon(c.icon));
    chip.append(document.createTextNode(c.name + " "));
    chip.append(el("b", "", c.level >= c.max ? "MAX" : "L" + c.level));
    box.append(chip);
  }
}
