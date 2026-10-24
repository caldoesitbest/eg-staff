/* Envious Glider: Sinners vs. Machines. Boot + game states:
   intro → menu → playing ⇄ paused → clear → upgrade (pick a card) → shop (the Armory) → playing …
   → (wave 35: Envy down) win → endless … → dying → over → (retry) playing.  The run is the Sin Ladder:
   Sloth → Gluttony → Greed → Lust → Wrath → Pride → Envy, one boss every 5 waves.
   Co-op (coop.js + net.js): the host runs this same flow for everyone; clients follow its messages. */

import { G, usePlayer } from "./state.js";
import { BALANCE } from "./balance.js";
import { store, SUITS, GFX_PRESETS } from "./storage.js";
import { startLoop } from "./loop.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import { renderer } from "./render.js";
import { fx } from "./fx.js";
import { ui } from "./ui.js";
import { waves } from "./waves.js";
import { stepWorld, clearWorld, spawnEdgeAsteroid, addScore, healPlayer, killEnemy, revivePlayer } from "./world.js";
import { createPlayer, cancelCharge } from "./player.js";
import { resetUpgrades, computeStats, offerCards, applyCard, onWaveEnd, buildSummary, buildTitle, CARDS, CARD_BY_ID } from "./upgrades.js";
import { popAllAllies, spawnEnemy, hostileCount } from "./enemies/index.js";
import { P_CYAN, P_WHITE, C, sprites } from "./sprites.js";
import { formatScore, rand, pick, TAU, withSeed, hashStr, seedRng } from "./util.js";
import { online, todayUTC } from "./online.js";
import { ladderRungs } from "./ui.js";
import { resetArmory, openShop as rollNewShop, buy, toggleLock, rerollShop, patchCost, swapGun, offerInfo, armoryAfter, nextArmoryWave, armorySoldOut, evoCandidate, evolveGun, gunCol, gunName } from "./armory.js";
import { GAME_VERSION, VERSION_NAME } from "./version.js";
import { fusionActivated, fusionWave } from "./fusion.js";
import { net } from "./net.js";
import { coop, initCoop, startHost, setupPlayers, coopRoster, hostBefore, hostAfter, clientStep, hostSend, hostReady, clientReady, resetReady, endCoop, waitingOn } from "./coop.js";

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
G.debug.on = params.get("debug") === "1";
G.debug.startWave = Math.max(1, Math.min(99, parseInt(params.get("wave"), 10) || 1));
G.debug.speed = G.debug.on ? Math.max(1, Math.min(8, parseInt(params.get("speed"), 10) || 1)) : 1;   // fast-forward for testing

// The Windows app (WebView2) talks to its launcher through window.chrome.webview.
G.desktop = !!(window.chrome && window.chrome.webview);

store.load();
G.settings = store.data.settings;
if (G.debug.on && params.get("diff")) G.settings.difficulty = params.get("diff");     // balance tests: ?diff=hard
if (G.debug.on && params.get("zoom")) G.debug.zoom = Math.max(1, Math.min(4, parseFloat(params.get("zoom")) || 1));   // close-up screenshots
computeStats();

const root = document.getElementById("game");
const canvas = document.getElementById("game-canvas");
const layer = document.getElementById("touch-layer");

const suitDef = () => SUITS.find((s) => s.id === G.settings.suit && store.suitUnlocked(s)) || SUITS[0];

const FIXED_LEVEL = { high: 2, medium: 1, low: 0, potato: 0, custom: 2 };
/** Auto's starting point, from what the device says about itself (it adjusts from there as you play). */
function deviceLevel() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  let coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) { /* ignore */ }
  if (cores <= 2 || mem <= 2) return 0;
  if (cores <= 4 || mem <= 4 || coarse) return 1;
  return 2;
}
G.quality = G.settings.quality in FIXED_LEVEL ? FIXED_LEVEL[G.settings.quality] : deviceLevel();

/** The graphics the renderer actually uses: the preset's (Auto: by its current step) or your custom picks. */
function computeGfx() {
  const st = G.settings;
  const auto = st.quality === "auto";
  const src = auto ? GFX_PRESETS[["low", "medium", "high"][G.quality]] : st;
  const g = G.gfx;
  g.resScale = src.resScale * (auto ? G.dynRes : 1); g.particles = src.particles; g.glow = src.glow;
  g.background = src.background; g.grid = src.grid; g.trails = src.trails;
}
computeGfx();
fx.setQuality(2, G.gfx.particles);
renderer.init(canvas, suitDef());
renderer.resize();

let offered = [];
let prevState = "playing";
let clearT = 0;
let deathT = 0;
let overShown = false;
let lastRun = null;

let gfxKey = "";
function applySettings() {
  const s = G.settings;
  if (s.quality in FIXED_LEVEL) G.quality = FIXED_LEVEL[s.quality];
  else if (s.quality === "auto" && gfxKey.indexOf("auto") !== 0) { G.quality = deviceLevel(); G.dynRes = 1; }   // switching to Auto starts where the device suggests
  audio.setVolumes(s.sfx, s.music, s.muted);
  fx.shakeOn = s.shakeAmt > 0 && !s.reducedMotion;
  fx.shakeScale = s.shakeAmt / 100;
  fx.flashesOn = s.flashes;
  fx.reduced = s.reducedMotion;
  ui.setReduced(s.reducedMotion);
  loop.setCap(s.fpsCap);
  applyQuality();
  if (!s.showFps) ui.setFps(null);
  store.save();
}
function applyQuality() {
  computeGfx();
  fx.setQuality(2, G.gfx.particles);        // the preset (or Auto's current step) already picked the particle level
  // only rebuild the canvas when something that affects it changed
  const key = G.settings.quality + ":" + G.quality + ":" + G.gfx.resScale.toFixed(2);
  if (key !== gfxKey) { gfxKey = key; renderer.resize(); }
}

function setState(s) {
  G.state = s;
  G.netMenu = false;
  ui.setState(s);
  input.enabled = s === "playing" || s === "clear";
  if (!input.enabled) { input.mouse.down = false; input.mouse.charge = false; input.queued.boost = false; input.queued.swap = false; cancelCharge(); }
}

// ---------------------------------------------------------------------------
// menu scene: the astronaut floats, rocks drift
// ---------------------------------------------------------------------------
/** Everyone in the run (solo: just you; co-op: the lobby), each with a fresh build. */
function setupRunPlayers(isCoop) {
  if (!isCoop) { G.net.role = "off"; G.net.slot = 0; G.net.n = 1; }
  const list = isCoop ? coopRoster() : [{ slot: 0, name: online.name || "You", suit: G.settings.suit }];
  setupPlayers(list, createPlayer);
  const n = G.players.length;
  for (const P of G.players) {
    usePlayer(P);
    resetArmory();
    resetUpgrades();
    P.hp = P.maxHp = G.stats.maxHp;
    P.maxShield = G.stats.shieldCap;
    if (n > 1) P.x = P.px = BALANCE.arena.w / 2 + (P.slot - (n - 1) / 2) * 70;
  }
  usePlayer(G.me);
}

function menuScene() {
  clearWorld();
  setupRunPlayers(false);
  G.player.iframes = 0;
  G.boss = null; G.bossFx = null;
  for (let i = 0; i < BALANCE.arena.asteroids; i++) spawnEdgeAsteroid(true);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
}

function toMenu() {
  menuScene();
  setState("menu");
  ui.clearBanner();
  ui.show("menu");
  audio.musicStart(0);
  audio.musicIntensity(0);
}

// ---------------------------------------------------------------------------
// runs + waves
// ---------------------------------------------------------------------------
function startRun(opts) {
  clearWorld();
  const isCoop = !!(opts && opts.coop);
  G.daily = opts && opts.daily ? opts.daily : null;
  // the Daily Challenge is always Normal (everyone plays the same run); co-op uses the host's pick
  const want = (opts && opts.difficulty) || G.settings.difficulty;
  G.difficulty = !G.daily && BALANCE.difficulty[want] ? want : "normal";
  G.mark = 0; G.lap = 0; G.won = false; G.rungThisRun = 0;
  Object.assign(G, {
    time: 0, wave: 0, score: 0, kills: 0, combo: 0, comboTimer: 0, bestCombo: 0, stars: 0, starsTotal: 0,
    waveHits: 0, hitsTaken: 0, flawlessWaves: 0, bossesKilled: 0, rerolls: 0, patches: 0, perfects: 0,
    hitstop: 0, slowmo: 0, slowScale: 1, freezeT: 0, vacuum: false, boss: null, bossFx: null, autoTarget: null,
    lastSlowmo: -9, hitMark: 0, killMark: 0,
    runStats: { dmg: 0, big: 0, byGun: {}, spent: 0 },
  });
  setupRunPlayers(isCoop);
  if (G.net.role !== "client") for (let i = 0; i < BALANCE.arena.asteroids; i++) spawnEdgeAsteroid(true);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  // debug: start later with a matching handful of upgrades
  const start = G.debug.on && !isCoop ? G.debug.startWave : 1;
  for (let i = 1; i < start; i++) { const ids = offerCards(); applyCard(pick(ids)); }
  G.player.hp = G.player.maxHp = G.stats.maxHp;
  G.player.maxShield = G.stats.shieldCap;
  deathT = 0;
  overShown = false;
  ui.resetHud();
  ui.clearBanner();
  ui.show(null);
  setState("playing");
  audio.musicStart(1);
  audio.musicIntensity(1);
  store.data.totals.runs++;
  if (G.daily) {
    const d = store.data.daily;
    if (d.date !== G.daily) { d.date = G.daily; d.score = 0; d.wave = 0; d.tries = 0; }
    d.tries++;
  }
  if (G.net.role === "client") return;     // the host starts the waves
  startWave(start);
  if (!store.data.seenHowTo) { store.data.seenHowTo = true; store.save(); }
}

const boostWord = () => (input.mode === "touch" ? "Tap ⚡" : input.mode === "gamepad" ? "Press A" : "Press Space");
const HINTS = {
  1: () => (input.mode === "touch"
    ? "Left thumb moves. " + (G.settings.autoAim ? "You fire on your own." : "Right thumb aims and fires.")
    : input.mode === "gamepad" ? "Left stick moves, right stick aims and fires." : "WASD to move, mouse to aim, hold click to fire."),
  2: () => "Rippers flash, then charge in a line. " + boostWord() + " to boost through.",
  3: () => "Gunners hang back. Their orbs are slow: weave through.",
  4: () => "Splitters burst into minis when they pop.",
  6: () => "Bulwarks block shots from the front. Get behind them.",
  7: () => "Boomers rush in. Leave the red ring. Shoot them near friends.",
  8: () => "Swarmlings come in packs. Keep moving.",
  9: () => "Snipers paint a laser first. Step off the line.",
  11: () => "Patch Bots heal the others. Kill them first.",
};

const MARK_NAMES = ["Mk I", "Mk II", "Mk III", "Mk IV", "Mk V", "Mk VI", "Mk VII", "Mk VIII", "Mk IX", "Mk X"];
const markName = (m) => MARK_NAMES[Math.min(m, MARK_NAMES.length - 1)] + (m >= MARK_NAMES.length ? "+" : "");

/** Daily Challenge: wave mixes and card offers come from the day's seed, the same for everyone. */
function seeded(tag, fn) {
  return G.daily ? withSeed(hashStr(G.daily + ":" + tag), fn) : fn();
}

function startWave(n) {
  seeded("wave" + n, () => waves.start(n));
  G.vacuum = false;
  for (const P of G.players) { usePlayer(P); P.bubble = G.stats.bubble; P.feastN = 0; fusionWave(P); }     // Bubble Shield refills every wave; Gluttony's (and fusions') per-wave caps reset
  usePlayer(G.me);
  waveIntro(n);
  hostSend({ k: "go", n });
}

/** The banner and music for the start of wave n. */
function waveIntro(n) {
  const lap = waves.lapOf(n);
  if (waves.isBossWave(n)) {
    const def = BALANCE.bosses[BALANCE.bosses.order[waves.rungOf(n)]];
    const rung = waves.rungOf(n);
    ui.banner("Rung " + (rung + 1) + " of 7 · Wave " + n + (lap ? " · Lap " + (lap + 1) : ""), "@" + def.name,
      "<b>" + def.title + "</b> · " + def.tagline, "boss", true, def.c1);
    audio.musicIntensity(2);
  } else {
    // every message for this wave shows (wave 12 used to lose the elite one under the Mk II one)
    const lines = [];
    if (n > 1 && waves.markOf(n) > waves.markOf(n - 1)) lines.push("<b>Robots evolved: " + markName(waves.markOf(n)) + ".</b> Same robots, nastier tricks.");
    if (n === BALANCE.elite.from) lines.push("From here on, some robots come <b>overcharged</b> with a trait.");
    if (!lines.length && HINTS[n] && !lap) lines.push(HINTS[n]());
    const hint = lines.join("<br>");
    const r = ladderRungs()[waves.rungOf(n)];
    ui.banner(n === 1 ? "Rung 1 · @Sloth" : "Rung " + (r.i + 1) + " · @" + r.name, "Wave " + n, hint, "", !!hint, r.c1);
    audio.musicIntensity(1);
  }
  audio.play("wave");
}

// Climbing: remember the highest rung you've beaten.
G.on("bossDown", () => {
  if (G.lap > 0) return;
  G.rungThisRun = waves.rungOf(G.wave) + 1;
  if (!G.debug.on && G.rungThisRun > (store.data.best.rung || 0)) { store.data.best.rung = G.rungThisRun; store.save(); }
});

G.on("waveClear", (n) => {
  if (G.state !== "playing") return;
  popAllAllies();
  const bonus = BALANCE.score.waveClear * n;
  const flawless = G.waveHits === 0;
  addScore(bonus);
  let text = "+" + formatScore(bonus * 1) + " clear bonus";
  if (flawless) {
    addScore(BALANCE.score.flawless * n);
    G.flawlessWaves++;
    text += " · <b>Flawless</b> +" + formatScore(BALANCE.score.flawless * n);
  }
  const before = G.stars;
  for (const P of G.players) { if (P.gone) continue; usePlayer(P); onWaveEnd(); }    // interest, everyone's own
  usePlayer(G.me);
  if (G.stars > before) text += " · Greed interest ★+" + (G.stars - before);
  G.lastBonus = text;
  G.vacuum = true;
  // co-op: everyone who's down gets back up between waves
  if (G.net.role === "host") for (const P of G.players) if (P.dead && !P.gone) revivePlayer(P);
  if (waves.boss && waves.bossType === "envy" && G.lap === 0 && !G.won) {
    G.won = true;
    G.winTime = G.time;
    clearT = 2.4;
    ui.banner("The Sin Ladder", "Cleared!", "Envy can't be earned. You took it.", "good", true);
    hostSend({ k: "clear", b: ["The Sin Ladder", "Cleared!", "Envy can't be earned. You took it.", "good", true], snd: "newBest" });
    audio.play("newBest");
    setState("clear");
    return;
  }
  const head = waves.boss ? "@" + BALANCE.bosses[waves.bossType].name + " down" : "Wave " + n;
  hostSend({ k: "clear", b: [head, waves.boss ? "Clear!" : "Clear", "+" + formatScore(bonus) + " clear bonus" + (flawless ? " · <b>Flawless</b>" : ""), "good", false], snd: "clear" });
  ui.banner(head, waves.boss ? "Clear!" : "Clear", text, "good");
  audio.play("clear");
  audio.musicIntensity(1);
  clearT = BALANCE.waves.breather + (waves.boss ? 1.2 : 0);
  setState("clear");
});

function showVictory() {
  ui.clearBanner();
  setState("win");
  input.releaseAll();
  if (!G.debug.on) {
    const b = store.data.best;
    b.wins = (b.wins || 0) + 1;
    b.rung = 7;
    if (!b.fastestWin || G.winTime < b.fastestWin) b.fastestWin = Math.round(G.winTime);
    store.save(true);
  }
  const sum = { score: Math.floor(G.score), time: fmtTime(G.time), kills: G.kills, hits: G.hitsTaken };
  hostSend({ k: "win", sum });
  ui.showWin(sum);
  audio.musicIntensity(0);
}

function openUpgrade() {
  if (G.net.role === "host") { resetReady(); hostSend({ k: "between", w: G.wave, bonus: G.lastBonus }); }
  ui.clearBanner();
  // a sin boss just fell and a gun is at Tier IV: it can evolve (one evolution per boss)
  if (waves.isBossWave(G.wave) && evoCandidate() >= 0) { openEvolve(); return; }
  openCards();
}

// ---------------------------------------------------------------------------
// weapon evolution (evolve.js): two paths, pick one or decide after the next boss
// ---------------------------------------------------------------------------
let evoSlot = -1, evoBusy = false;
function openEvolve() {
  evoSlot = evoCandidate();
  evoBusy = false;
  setState("evolve");
  input.releaseAll();
  ui.showEvo(evoSlot);
  audio.play("evoReady");
}
function pickEvolution(path) {
  if (G.state !== "evolve" || evoBusy || evoSlot < 0) return;
  if (!evolveGun(evoSlot, path)) return;
  evoBusy = true;
  const g = G.guns[evoSlot], P = G.player, col = gunCol(g);
  if (G.gunSlot !== evoSlot) swapGun(evoSlot);
  audio.play("evolve");
  const card = document.querySelector('#evo-cards .evo-card[data-path="' + path + '"]');
  if (card) card.classList.add("chosen");
  if (P) {
    fx.ring(P.x, P.y, 10, 160, 0.6, col, 5);
    fx.burst(P.x, P.y, 30, P_CYAN, 300, 0.8, 2);
    fx.text(P.x, P.y - 44, gunName(g).toUpperCase(), col, 22, 1.6);
  }
  setTimeout(() => { if (G.state === "evolve") openCards(); }, 650);
}
function laterEvolution() {
  if (G.state !== "evolve" || evoBusy) return;
  audio.play("click");
  openCards();
}

function openCards() {
  setState("upgrade");
  input.releaseAll();
  offered = seeded("cards" + G.wave + ":" + G.rerolls, () => offerCards());
  const nextBoss = (G.wave + 1) % BALANCE.waves.bossEvery === 0;
  const nb = nextBoss ? BALANCE.bosses[BALANCE.bosses.order[waves.rungOf(G.wave + 1)]] : null;
  const armoryNext = armorySoldOut() ? "the Armory is sold out" : armoryAfter(G.wave) ? "the Armory is next" : "the Armory opens after wave " + nextArmoryWave(G.wave);
  ui.showUpgrade(offered, { kicker: "Wave " + G.wave + " cleared", title: nb ? "@" + nb.name + " is next" : "Choose your power", bonus: G.lastBonus, armory: armoryNext });
  // endless: every Sin and Augment maxed, so there's nothing to pick; carry on
  if (!offered.length) { ui.toast("Every Sin and Augment maxed"); afterCards(); }
}

/** After the card: the Armory (if it opens this wave and has anything left for you), else the next wave. */
function afterCards() {
  const P = G.player;
  const skipShop = armorySoldOut() && (!P || P.hp >= P.maxHp);      // still opens to patch you up
  if (armoryAfter(G.wave) && !skipShop) { openArmory(); return; }
  if (G.net.role !== "off") {
    if (G.net.role === "host") hostReady(); else if (!coop.waiting) clientReady();
    coop.waiting = true;
    ui.setCardsWaiting(waitingOn());
    return;
  }
  ui.show(null);
  setState("playing");
  startWave(G.wave + 1);
}

function pickCard(id) {
  if (G.state !== "upgrade" || offered.indexOf(id) === -1 || coop.waiting) return;
  const lvl = applyCard(id);
  const c = CARD_BY_ID[id];
  const P = G.player;
  if (c.kind === "fusion") {
    // a Sin Fusion: its own moment
    fusionActivated(P, id, c.name);
    G.emit("fusion", id);
    ui.toast("Sin Fusion: " + c.name, 2600);
    afterCards();
    return;
  }
  audio.play("pick");
  fx.ring(P.x, P.y, 10, 120, 0.5, c.color, 4);
  fx.burst(P.x, P.y, 24, P_CYAN, 260, 0.7, 1.8);
  fx.text(P.x, P.y - 40, c.name.toUpperCase() + (lvl >= c.max ? " MAX" : " " + lvl), c.color, 18, 1.3);
  afterCards();
}

// ---------------------------------------------------------------------------
// the Armory (shop between waves)
// ---------------------------------------------------------------------------
function openArmory() {
  setState("shop");
  input.releaseAll();
  const bounty = G.wave % BALANCE.waves.bossEvery === 0;
  seeded("shop" + G.wave, () => rollNewShop(bounty));
  const next = G.wave + 1;
  const boss = next % BALANCE.waves.bossEvery === 0;
  const nb = boss ? BALANCE.bosses[BALANCE.bosses.order[waves.rungOf(next)]] : null;
  ui.showShop({
    kicker: bounty ? "Boss down · the Armory pays a bounty" : "Wave " + G.wave + " cleared · the Armory",
    next: nb ? "Next: <b>@" + nb.name + "</b>, " + nb.title + ". Stock up." : "Next: wave " + next + (waves.markOf(next) > G.mark ? " · <b>robots evolve</b>" : ""),
    go: nb ? "Face @" + nb.name : "Wave " + next,
  });
}

function shopBuy(i) {
  if (G.state !== "shop") return;
  const o = G.shop.offers[i];
  if (!o || o.sold) return;
  const info = offerInfo(o);
  if (!buy(i)) { audio.play("deny"); ui.toast("Not enough stars"); return; }
  audio.play("buy");
  const P = G.player;
  if (P) fx.ring(P.x, P.y, 10, 90, 0.4, info.col, 3);
  const held = o.kind === "gun" && G.guns.find((g) => g && g.id === o.id);
  if (held && held.tier === 4 && !held.evo) { ui.toast(BALANCE.guns[o.id].name + " is Tier IV: beat the next boss to evolve it", 3200); audio.play("evoReady"); }
  ui.renderShop();
}

function shopReroll() {
  if (G.state !== "shop") return;
  if (!seeded("shopRoll" + G.wave + ":" + G.shop.rerolls, () => rerollShop())) { audio.play("deny"); return; }
  audio.play("steal");
  ui.renderShop();
}

function shopGo() {
  if (G.state !== "shop") return;
  if (G.net.role !== "off") {
    // co-op: ready up; the next wave starts when everyone is
    if (G.net.role === "host") hostReady(); else if (!coop.waiting) clientReady();
    coop.waiting = true;
    ui.setShopWaiting(waitingOn());
    audio.play("pick");
    return;
  }
  ui.show(null);
  setState("playing");
  startWave(G.wave + 1);
}

function reroll() {
  const E = BALANCE.economy;
  const cost = E.reroll + E.rerollStep * G.rerolls;
  if (G.state !== "upgrade" || G.stars < cost) return;
  G.stars -= cost;
  G.runStats.spent += cost;
  G.rerolls++;
  offered = seeded("cards" + G.wave + ":" + G.rerolls, () => offerCards());
  ui.renderCards(offered);
  ui.renderEconomy();
  audio.play("steal");
  if (input.mode !== "touch") ui.focusCard(0);
}

function patchUp() {
  const cost = patchCost();
  const P = G.player;
  if (G.state !== "shop" || G.stars < cost || P.hp >= P.maxHp) { audio.play("deny"); return; }
  G.stars -= cost;
  G.runStats.spent += cost;
  G.patches++;
  P.hp = Math.min(P.maxHp, P.hp + BALANCE.shop.patchHeal);
  audio.play("heart");
  ui.renderShopEconomy();
  ui.renderLoadout();
  ui.renderHearts(P);
}

// ---------------------------------------------------------------------------
// pause, death, game over
// ---------------------------------------------------------------------------
function pause() {
  if (G.state !== "playing" && G.state !== "clear") return;
  if (G.net.role !== "off") {
    // co-op: the world keeps going (your teammates are still in it); this is just a menu
    if (G.netMenu) return;
    G.netMenu = true;
    input.enabled = false;
    input.releaseAll();
    cancelCharge();
    ui.showPause(buildSummary(), true);
    return;
  }
  prevState = G.state;
  setState("paused");
  input.releaseAll();
  ui.showPause(buildSummary());
  audio.muffle(true);
}
function resume() {
  if (G.netMenu) {
    G.netMenu = false;
    ui.show(null);
    input.enabled = G.state === "playing" || G.state === "clear";
    return;
  }
  if (G.state !== "paused") return;
  ui.show(null);
  setState(prevState);
  loop.resetClock();
  audio.resume();
  audio.muffle(false);
}

G.on("playerDown", () => {
  cancelCharge();
  setState("dying");
  deathT = 0;
  overShown = false;
  audio.musicIntensity(0);
});

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}

// "What got you", for the summary screen.
const SRC_NAMES = { drone: "a Drone", swarm: "a Swarmling", ripper: "a Ripper's charge", gunner: "a Gunner", splitter: "a Splitter", mini: "a Splitter shard",
  bulwark: "a Bulwark", boomer: "a Boomer's blast", sniper: "a Sniper", patch: "a Patch Bot", gem: "Pride's crown gem", decoy: "one of Lust's fakes", volatile: "a Volatile elite's burst" };
function sourceName(src) {
  if (!src) return "";
  if (BALANCE.bosses[src]) return "@" + BALANCE.bosses[src].name;
  return SRC_NAMES[src] || src;
}

const TITLES = [
  [20, ["Legend. Still scrap.", "The planet will remember you", "Chaos, but make it art"]],
  [10, ["So close to glory", "Good people. Bad luck.", "They needed a boss for that"]],
  [5, ["The machines win this round", "Grounded.", "Bad habits. Worse luck."]],
  [0, ["Scrap happens", "Robots 1, Sinners 0", "Even legends warm up"]],
];

async function postRun(sum) {
  if (G.debug.on) return;
  if (G.net.role !== "off") { ui.setOnline(null); return; }   // the leaderboard is solo runs
  if (!online.available) { ui.setOnline(null); return; }
  if (!online.user) { ui.setOnline("signin"); return; }
  if (!store.data.settings.postScores) { ui.setOnline(null); return; }
  ui.setOnline("posting");
  const res = await online.submit({
    score: sum.score, wave: sum.wave, kills: sum.kills, combo: sum.combo, seconds: G.time, won: G.won,
    daily: G.daily, buildIds: { ...G.up, guns: G.guns.filter(Boolean).map((g) => g.id + g.tier).join(","), gear: { ...G.items }, difficulty: G.difficulty },
  });
  if (G.state !== "over") return;
  if (res.skipped === "expired") ui.setOnline("signin", "expired");
  else if (res.skipped) ui.setOnline(null);
  else if (res.ok) ui.setOnline("posted", { rank: res.rank, daily: !!G.daily });
  else ui.setOnline("error", res.error);
}

function finishWonRun() {
  G.player.dead = true;
  gameOver();
}

function gameOver() {
  overShown = true;
  const best = store.data.best;
  const oldWave = best.wave;
  const sum = {
    score: Math.floor(G.score), wave: G.wave, kills: G.kills, combo: G.bestCombo, stars: G.starsTotal,
    time: fmtTime(G.time), perfects: G.perfects, bosses: G.bossesKilled,
    build: buildSummary(), buildTitle: buildTitle(), difficulty: G.difficulty,
  };
  // how the run went: your damage, your best hit, the gun that did the most, what you spent, what got you
  const rs = G.runStats;
  if (rs && rs.dmg > 0) {
    sum.dmg = Math.round(rs.dmg);
    sum.big = Math.round(rs.big);
    let top = "", best = 0;
    for (const k in rs.byGun) if (rs.byGun[k] > best) { best = rs.byGun[k]; top = k; }
    if (top) sum.topGun = BALANCE.guns[top].name + " (" + Math.round((best / rs.dmg) * 100) + "%)";
  }
  if (rs) sum.spent = rs.spent;
  if (!G.won) sum.killedBy = sourceName(G.me && G.me.killedBy);
  const record = !G.debug.on && G.net.role === "off";    // debug and co-op runs don't count for your solo bests
  sum.newScore = record && sum.score > best.score && sum.score > 0;
  sum.newWave = record && sum.wave > best.wave;
  sum.newCombo = record && sum.combo > best.combo;
  sum.anyBest = sum.newScore || sum.newWave;
  if (sum.newScore) best.score = sum.score;
  if (sum.newWave) best.wave = sum.wave;
  if (sum.newCombo) best.combo = sum.combo;
  if (record) best.kills = Math.max(best.kills, sum.kills);
  store.data.totals.kills += sum.kills;
  if (!record) sum.buildTitle = (sum.buildTitle || "") + (G.net.role !== "off" ? " · co-op run (solo bests and the leaderboard stay solo)" : " · debug run, bests not saved");
  if (G.net.role !== "off") sum.team = G.players.filter((p) => !p.gone).map((p) => p.name).join(", ");
  const unlocked = SUITS.filter((s) => s.wave > oldWave && s.wave <= best.wave);
  if (unlocked.length) sum.unlock = unlocked.map((s) => s.name).join(" and ");
  const pool = TITLES.find((t) => sum.wave >= t[0])[1];
  sum.title = G.won ? (G.lap > 0 || G.wave > 35 ? "Past the top of the Ladder" : "You climbed the whole Ladder") : pool[Math.floor(Math.random() * pool.length)];
  const rung = ladderRungs()[Math.min(6, G.rungThisRun || 0)];
  sum.kicker = G.won ? "Sin Ladder cleared · wave " + sum.wave : (G.rungThisRun ? "Beat " + G.rungThisRun + " of 7 sins · " : "") + "Fell on wave " + sum.wave + (G.won ? "" : " · @" + rung.name + " was next");
  if (G.daily && record) {
    const d = store.data.daily;
    if (d.date === G.daily && sum.score > d.score) { d.score = sum.score; d.wave = sum.wave; sum.dailyBest = true; }
  }
  store.save(true);
  postRun(sum);
  lastRun = sum;
  hostSend({ k: "over", sum: { ...sum, build: [], buildTitle: "Co-op · " + (sum.team || "") } });
  setState("over");
  ui.showGameOver(sum);
  audio.play(sum.anyBest ? "newBest" : "gameOver");
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
function menuStep(dt) {
  stepWorld(dt);
  const P = G.player;
  if (P) {
    const t = G.time;
    P.x = BALANCE.arena.w / 2 + Math.sin(t * 0.35) * 160;
    P.y = BALANCE.arena.h / 2 + Math.sin(t * 0.6) * 70;
    P.vx = Math.cos(t * 0.35) * 56; P.vy = 0;
    P.aimAng = Math.sin(t * 0.4) * 0.6;
    P.facing = 1;
    P.tilt = Math.cos(t * 0.35) * 0.18;
    if (Math.random() < dt * 14) fx.p(0, P.x - 10, P.y + 4, -80 + rand(-20, 20), rand(-20, 20), 0.4, 1.5, 1, 3);
  }
  fx.update(dt);
}

function update(dt) {
  const s = G.state;
  if (G.net.role === "client" && s !== "menu") { clientStep(dt); return; }
  if (s === "paused" || s === "upgrade" || s === "shop" || s === "over" || s === "win" || s === "evolve") return;
  if (G.hitstop > 0) { G.hitstop -= dt; if (G.net.role === "host") hostAfter(); return; }
  let sdt = dt;
  if (G.slowmo > 0) { G.slowmo -= dt; sdt = dt * G.slowScale; }
  if (s === "menu") { menuStep(sdt); return; }
  if (G.net.role === "host") hostBefore(sdt);
  stepWorld(sdt);
  if (G.net.role === "host") hostAfter();
  fx.update(sdt);
  if (s === "dying") {
    deathT += dt;
    if (deathT > 1.5 && !overShown) gameOver();
  } else if (s === "clear") {
    clearT -= dt;
    if (clearT <= 0) { if (G.won && G.wave === 35) showVictory(); else openUpgrade(); }
  }
}

let fpsT = 0, qT = 0, slowWin = 0, fastWin = 0, beatT = 0;

// ---------------------------------------------------------------------------
// the music director: which theme, which arrangement, how intense (works the same on co-op clients)
// ---------------------------------------------------------------------------
let lastBossId = 0, lastBossLive = false;
function musicDirector() {
  const s = G.state;
  if (s === "menu") { audio.musicTheme("menu", "chapter"); audio.musicIntensity(0); return; }
  const sin = BALANCE.bosses.order[waves.rungOf(Math.max(1, G.wave))];
  const b = G.boss && !G.boss.dead ? G.boss : null;
  // a boss arriving: a riser through its entrance, an impact when the fight starts
  if (b && b.id !== lastBossId) { lastBossId = b.id; lastBossLive = false; audio.riser(2.1); }
  const live = !!(b && b.state !== -1);
  if (live && !lastBossLive) audio.impact();
  lastBossLive = live;
  if (s === "upgrade" || s === "shop" || s === "paused" || s === "over" || s === "win" || s === "evolve") {
    audio.musicTheme(s === "win" ? "envy" : sin, "chapter");
    audio.musicIntensity(0);
    return;
  }
  if (live) {
    audio.musicTheme(sin, "boss");
    audio.musicIntensity(b.hp / b.maxHp < 0.5 || b.b ? 4 : 3);
    return;
  }
  audio.musicTheme(sin, "chapter");
  const P = G.me;
  const threat = G.enemies.count > 24 || (P && !P.dead && P.hp <= 2) || (waves.boss && !b);
  audio.musicIntensity(s === "dying" ? 0 : threat ? 2 : 1);
}
function before(dt) {
  input.poll(dt);
}
function render(alpha, dt) {
  fx.tickScreen(dt);
  renderer.updateCamera(alpha, dt);
  audio.setListener(G.cam.x, G.cam.y);
  renderer.draw(alpha, dt);
  if (G.state !== "menu") ui.updateHud(dt);
  musicDirector();
  // low health: a heartbeat
  const Pl = G.player;
  if (Pl && !Pl.dead && Pl.hp <= 2 && G.state === "playing") {
    beatT -= dt;
    if (beatT <= 0) { beatT = Pl.hp <= 1 ? 0.75 : 1.1; audio.play("heartbeat", undefined, undefined, Pl.hp <= 1 ? 0.9 : 0.6); }
  } else beatT = 0;

  fpsT += dt;
  if (fpsT >= 0.5) {
    fpsT = 0;
    if (G.settings.showFps || G.debug.on) {
      const st = loop.stats;
      ui.setFps(Math.round(st.fps) + " fps · " + st.frameMs.toFixed(1) + " ms frame · " + st.workMs.toFixed(1) + " ms work · Q" + G.quality +
        " · " + G.enemies.count + " bots · " + fx.parts.count + " fx" + (G.dynRes < 1 ? " · res " + Math.round(G.dynRes * 100) + "%" : "") + (G.debug.god ? " · GOD" : ""));
    }
  }
  // auto quality: step down if frames stay slow, back up when there's room
  qT += dt;
  if (qT >= 1 && G.settings.quality === "auto" && !document.hidden) {
    qT = 0;
    const st = loop.stats;
    const capMs = G.settings.fpsCap ? 1000 / G.settings.fpsCap : 0;      // a capped frame rate isn't "slow"
    if (st.frameMs > Math.max(22, capMs * 1.3) && G.state === "playing") { slowWin++; fastWin = 0; }
    else if (st.frameMs < Math.max(17.5, capMs * 1.1) && st.workMs < 5) { fastWin++; slowWin = 0; }
    else { slowWin = 0; fastWin = 0; }
    if (slowWin >= 2) {
      // slow frames with little script work: the graphics card is the bottleneck, so draw fewer pixels
      // (cheap now: no sprites are rebuilt). Script-heavy: cut effects instead.
      if (G.dynRes > 0.65 && st.workMs < st.frameMs * 0.45) G.dynRes = Math.round((G.dynRes - 0.1) * 100) / 100;
      else if (G.quality > 0) G.quality--;
      slowWin = 0;
      applyQuality();
    }
    if (fastWin >= 8) {
      if (G.dynRes < 1) G.dynRes = Math.min(1, Math.round((G.dynRes + 0.1) * 100) / 100);
      else if (G.quality < 2) G.quality++;
      fastWin = 0;
      applyQuality();
    }
  }
}

let autopilot = null;      // debug only: ?debug=1&autoplay=1
const step = (dt) => {
  if (G.debug.freeze) return;           // debug ?scene=: a frozen moment for screenshots
  for (let i = 0; i < G.debug.speed; i++) {
    if (autopilot) autopilot.tick();
    update(dt);
  }
};
const loop = startLoop({ before, update: step, render, timer: G.debug.on && params.get("headless") === "1" });

// ---------------------------------------------------------------------------
// input wiring
// ---------------------------------------------------------------------------
function toggleFullscreen() {
  const d = document;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const el = d.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    const p = req.call(el, { navigationUI: "hide" });
    const lock = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* not allowed */ } };
    if (p && p.then) p.then(lock).catch(() => {}); else lock();
  } catch (e) { /* not supported */ }
}

ui.init({
  onPlay: () => { audio.unlock(); startRun(); },
  onDaily: () => { audio.unlock(); startRun({ daily: todayUTC() }); },
  onEndless: () => { ui.show(null); openUpgrade(); audio.musicIntensity(1); },
  onFinish: finishWonRun,
  onExit: () => { store.save(true); if (G.desktop) window.chrome.webview.postMessage({ type: "quit" }); },
  onPause: pause,
  onResume: resume,
  onRestart: () => { if (G.net.role === "host") startHost(); else if (G.net.role === "off") startRun(G.daily ? { daily: todayUTC() } : null); },
  onQuit: () => { if (G.net.role !== "off") endCoop(); toMenu(); },
  onCoop: () => { audio.unlock(); ui.openLobby(store.data.coopName || online.name || ""); },
  onLobbyHost: async (name) => {
    store.data.coopName = name; store.save();
    try { await net.host(name, G.settings.suit); ui.lobbyRoom(net.code, true); } catch (e) { ui.lobbyStatus(e.message, "bad"); net.leave(); }
  },
  onLobbyJoin: async (code, name) => {
    store.data.coopName = name; store.save();
    try { await net.join(code, name, G.settings.suit); ui.lobbyRoom(net.code, false); } catch (e) { ui.lobbyStatus(e.message, "bad"); net.leave(); }
  },
  onLobbyStart: () => { if (net.role === "host" && net.members.length >= 2) { audio.unlock(); startHost(); } },
  onLobbyLeave: () => { endCoop(); ui.show("menu"); },
  onPick: pickCard,
  onEvo: pickEvolution,
  onEvoLater: laterEvolution,
  onReroll: reroll,
  onPatch: patchUp,
  onBuy: shopBuy,
  onLock: (i) => { toggleLock(i); audio.play("click"); ui.renderShop(); },
  onShopReroll: shopReroll,
  onShopGo: shopGo,
  onSelectSlot: (i) => { if (swapGun(i)) audio.play("swap"); ui.renderShop(); },
  onSwap: () => { if (G.state === "playing" || G.state === "clear") { input.queued.swap = true; input.swapTo = undefined; } },
  onSettings: applySettings,
  onSuit: (id) => { G.settings.suit = id; store.save(); renderer.setSuit(suitDef()); audio.play("click"); },
  onFullscreen: () => { if (G.desktop) window.chrome.webview.postMessage({ type: "fullscreen" }); else toggleFullscreen(); },
  onClick: () => audio.play("click"),
  onHover: () => audio.play("hover", undefined, undefined, 0.6),
});

input.init({ root, layer, boostButton: document.getElementById("boost-btn"), chargeButton: document.getElementById("charge-btn") });
const AIM_NAMES = { off: "Off", assist: "Aim assist", auto: "Full auto" };
input.onHotkey = (code) => {
  if (code !== "KeyT") return;
  const order = ["off", "assist", "auto"];
  const s = G.settings;
  s.autoAim = order[(order.indexOf(s.autoAim) + 1) % order.length];
  store.save();
  ui.syncSettings();
  ui.toast("Auto-aim: " + AIM_NAMES[s.autoAim] + (s.autoAim === "auto" && input.mode === "kbm" ? " · hold left-click to aim yourself" : ""));
};
input.onModeChange = (m) => { G.touchActive = m === "touch"; ui.setMode(m); };
input.onPause = () => {
  const s = G.state;
  if ((s === "playing" || s === "clear") && G.netMenu) {
    if (ui.screen === "settings") ui.closeSettings(); else resume();
    return true;
  }
  if (s === "playing" || s === "clear") { pause(); return true; }
  if (s === "paused") {
    if (ui.screen === "settings") { ui.closeSettings(); return true; }
    resume();
    return true;
  }
  if (s === "menu" && (ui.screen === "settings" || ui.screen === "how" || ui.screen === "news")) { if (ui.screen === "settings") ui.closeSettings(); else ui.show("menu"); return true; }
  if (s === "menu" && ui.screen === "lobby") { endCoop(); ui.show("menu"); return true; }
  if (s === "over" && ui.screen === "settings") { ui.closeSettings(); return true; }
  return false;
};
input.onMenuNav = (dir) => ui.navigate(dir);
input.onMenuConfirm = () => { audio.unlock(); ui.confirm(); };
input.onMenuBack = (start) => {
  if (G.state === "paused" && start) { resume(); return; }
  if (ui.screen === "settings") ui.closeSettings();
  else if (ui.screen === "how" || ui.screen === "news") ui.show("menu");
  else if (G.state === "paused") resume();
};

// first gesture unlocks audio (iOS needs this)
let unlockedOnce = false;
const unlock = () => {
  audio.unlock();
  if (unlockedOnce || !audio.unlocked) return;
  unlockedOnce = true;
  audio.setVolumes(G.settings.sfx, G.settings.music, G.settings.muted);
  if (G.state === "menu") audio.musicStart(0);
};
window.addEventListener("pointerdown", unlock, { passive: true });
window.addEventListener("keydown", unlock);
window.addEventListener("touchend", unlock, { passive: true });

window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  const s = G.state;
  const digit = ["Digit1", "Digit2", "Digit3", "Digit4", "Numpad1", "Numpad2", "Numpad3", "Numpad4"].indexOf(e.code) % 4;
  if (s === "shop") {
    if (digit >= 0) { e.preventDefault(); if (ui.armed) shopBuy(digit); return; }
    if (e.code === "KeyR") { e.preventDefault(); shopReroll(); return; }
    const onButton = document.activeElement && document.activeElement.tagName === "BUTTON" && document.activeElement.id !== "shop-go";
    if ((e.code === "Enter" || e.code === "Space") && !onButton) { e.preventDefault(); if (ui.armed) shopGo(); return; }
  } else if (s === "evolve") {
    if (digit === 0 || digit === 1) { e.preventDefault(); if (ui.armed) pickEvolution(digit === 0 ? "a" : "b"); return; }
  } else if (s === "upgrade") {
    const i = digit;
    if (i >= 0 && offered[i]) { e.preventDefault(); if (ui.armed) pickCard(offered[i]); return; }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      const cards = Array.from(document.querySelectorAll("#cards .card"));
      const at = cards.indexOf(document.activeElement);
      const next = at < 0 ? 0 : (at + (e.code === "ArrowRight" ? 1 : cards.length - 1)) % cards.length;
      if (cards[next]) { e.preventDefault(); cards[next].focus(); }
    }
  } else if (s === "over" && ui.screen === "over") {
    if (!ui.armed) return;
    const again = () => { if (G.net.role === "host") startHost(); else if (G.net.role === "off") startRun(G.daily ? { daily: todayUTC() } : null); };
    if (e.code === "KeyR") { e.preventDefault(); again(); }
    else if (e.code === "Enter" && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); again(); }
  } else if (s === "menu" && ui.screen === "menu") {
    if ((e.code === "Enter" || e.code === "Space") && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); audio.unlock(); startRun(); }
  }
  if (G.debug.on && (s === "playing" || s === "clear")) debugKey(e);
});

// ---------------------------------------------------------------------------
// tab switches, resizes
// ---------------------------------------------------------------------------
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (!(G.debug.on && params.get("headless") === "1") && G.net.role === "off") pause(); audio.suspend(); }
  else { audio.resume(); loop.resetClock(); }
});
window.addEventListener("blur", () => { if (!G.debug.on && G.net.role === "off") pause(); });
let resizeT = 0;
const onResize = () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { renderer.resize(); input.updateRect(); ui.updateRotateHint(); }, 60);
};
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);
if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);

// ---------------------------------------------------------------------------
// debug (?debug=1): N skip wave · B next boss · G god mode · K kill all · U upgrade · H heal · J +40 drones
// ---------------------------------------------------------------------------
function debugKey(e) {
  if (G.net.role === "client") return;
  const P = G.player;
  switch (e.code) {
    case "KeyN": killAll(); waves.queue.length = 0; G.warnings.clear(); break;
    case "KeyB": {
      killAll(); waves.queue.length = 0; G.warnings.clear();
      const next = Math.ceil((G.wave + 1) / 5) * 5;
      G.wave = next - 1;
      break;
    }
    case "KeyG": G.debug.god = !G.debug.god; ui.toast("God mode " + (G.debug.god ? "on" : "off")); break;
    case "KeyK": killAll(); break;
    case "KeyU": { const ids = offerCards(); if (!ids.length) break; const id = pick(ids); applyCard(id); ui.toast("+" + CARD_BY_ID[id].name); break; }
    case "KeyH": if (P) { P.hp = P.maxHp; } break;
    case "KeyJ": for (let i = 0; i < 40; i++) waves.spawnGroup(pick(["drone", "swarm", "gunner", "ripper"]), 1); break;
    case "KeyM": G.stars += 500; ui.toast("+500 stars"); break;
    default: return;
  }
  e.preventDefault();
}
function killAll() {
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss) killEnemy(o); }
  if (G.boss && !G.boss.dead) { G.boss.invuln = false; G.boss.hp = 1; killEnemy(G.boss); }
}
if (G.debug.on && params.get("autoplay") === "1") {
  import("./debug-bot.js").then(({ bot }) => {
    bot.onRetry = startRun;
    bot.onPick = pickCard;
    bot.onEvo = pickEvolution;
    bot.onBuy = shopBuy;
    bot.onShopGo = shopGo;
    autopilot = bot;
    window.__bot = bot;
    G.debug.god = params.get("god") === "1";
    if (params.get("cohost") || params.get("cojoin")) { bot.autoRetry = false; return; }   // co-op tests start from the lobby
    startRun();
    if (params.get("god") === "1") G.debug.god = true;
  });
}
// debug co-op: ?debug=1&cohost=N opens a lobby and starts once N players are in; ?debug=1&cojoin=CODE joins it
if (G.debug.on && params.get("cohost")) {
  setTimeout(async () => {
    try {
      const code = await net.host("Host", G.settings.suit);
      window.__coopCode = code;
      if (G.desktop) window.chrome.webview.postMessage({ type: "status", msg: "code " + code });
      ui.lobbyRoom(code, true);
      ui.show("lobby");
      const want = Math.max(2, parseInt(params.get("cohost"), 10) || 2);
      const prev = net.on.lobby;
      net.on.lobby = (m) => { if (prev) prev(m); if (m.length >= want && G.state === "menu") setTimeout(startHost, 600); };
    } catch (e) { console.log("[coop] " + e.message); }
  }, 600);
}
if (G.debug.on && params.get("cojoin")) {
  setTimeout(() => net.join(params.get("cojoin"), "Guest" + Math.floor(Math.random() * 90 + 10), G.settings.suit).then(() => { ui.lobbyRoom(net.code, false); ui.show("lobby"); }).catch((e) => console.log("[coop] " + e.message)), 600);
}
if (G.debug.on && params.get("cosmoke") === "1") import("./debug-bot.js").then(({ coopSmoke }) => coopSmoke());
if (G.debug.on && params.get("scene")) {
  import("./debug-bot.js").then(({ scene }) => setTimeout(() => scene(params.get("scene"), { startRun, spawnEnemy, waves, input, seedRng }), 900));
}
if (G.debug.on && params.get("smoke") === "1") {
  import("./debug-bot.js").then(({ smoke }) => setTimeout(() => smoke({ startRun, openArmory, shopBuy, shopGo, spawnEnemy }), 800));
}
if (G.debug.on) {
  import("./armory.js").then((armory) => {
    window.__eg = { get offered() { return offered; }, G, waves, startRun, startWave, spawnEnemy, applyCard, CARDS, loop, store, hostileCount, ui, input, armory, openArmory, shopGo, applySettings, net, coop,
      openUpgrade, openEvolve, pickEvolution,
      stage: (gun, path, opts) => import("./debug-bot.js").then((m) => m.stage({ spawnEnemy, waves }, gun, path, opts)),
      zoneAt: (t, f) => import("./debug-bot.js").then((m) => m.zoneAt(t, f)) };
  });
  ui.toast("Debug: N skip · B boss · G god · K kill · U upgrade · H heal · J swarm · M stars", 5000);
}

// ---------------------------------------------------------------------------
// desktop app + online
// ---------------------------------------------------------------------------
if (G.desktop) {
  ui.setDesktop(true);
  // script errors go to the launcher's log (%LOCALAPPDATA%\EnviousGlider\error.log)
  const report = (msg) => { try { window.chrome.webview.postMessage({ type: "log", msg: String(msg).slice(0, 2000) }); } catch (e) { /* ignore */ } };
  window.addEventListener("error", (e) => report(e.message + " @ " + (e.filename || "").split("/").pop() + ":" + e.lineno));
  window.addEventListener("unhandledrejection", (e) => report("promise: " + (e.reason && e.reason.message || e.reason)));
  window.addEventListener("keydown", (e) => { if (e.code === "F11" || (e.altKey && e.code === "Enter")) { e.preventDefault(); window.chrome.webview.postMessage({ type: "fullscreen" }); } });
  window.chrome.webview.addEventListener("message", (ev) => {
    const m = ev.data || {};
    if (m.type === "auth") online.refresh();
    if (m.type === "pause") pause();
  });
}
G.on("auth", () => { ui.renderAccount(); if (ui.screen === "board") ui.openBoard(ui.boardKindNow || "all"); });
online.init();

// ---------------------------------------------------------------------------
// the studio intro ("Brought to you by EG"), then the menu
// ---------------------------------------------------------------------------
function playIntro() {
  const intro = document.getElementById("intro");
  if (!intro) return;
  let seen = false;
  try { seen = !G.desktop && sessionStorage.getItem("eg-intro") === "1"; } catch (e) { /* storage blocked */ }
  if (seen || G.debug.on || G.settings.reducedMotion && !G.desktop) { intro.remove(); return; }
  try { sessionStorage.setItem("eg-intro", "1"); } catch (e) { /* storage blocked */ }
  intro.classList.add(G.desktop ? "long" : "short");
  if (G.desktop) { audio.unlock(); setTimeout(() => audio.play("bossDown", undefined, undefined, 0.35), 350); }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    intro.classList.add("out");
    setTimeout(() => intro.remove(), 600);
    window.removeEventListener("keydown", skip, true);
    intro.removeEventListener("pointerdown", skip);
  };
  const skip = (e) => { if (e && e.type === "keydown") e.stopPropagation(); finish(); };
  window.addEventListener("keydown", skip, true);
  intro.addEventListener("pointerdown", skip);
  setTimeout(finish, G.desktop ? 3600 : 2300);
}

// ---------------------------------------------------------------------------
// co-op: what a client does when the host says so
// ---------------------------------------------------------------------------
net.on.lobby = (members) => ui.renderLobby(members, net.role === "host");
net.on.status = (text, kind) => ui.lobbyStatus(text, kind);
initCoop({
  startRun,
  toMenu,
  toast: (t, ms) => ui.toast(t, ms),
  openUpgrade: (msg) => { G.wave = msg.w; G.lastBonus = msg.bonus || ""; openUpgrade(); },
  closeBetween: (n) => {
    if (G.state !== "playing") { ui.show(null); setState("playing"); }
    G.wave = n;
    waveIntro(n);
  },
  waveBanner: (msg) => { ui.banner(...msg.b); audio.play(msg.snd || "clear"); },
  gameOver: (sum) => {
    // the host's numbers are the host's: keep the team ones, put in your own
    delete sum.dmg; delete sum.big; delete sum.topGun;
    sum.spent = G.runStats ? G.runStats.spent : 0;
    sum.killedBy = sourceName(G.me && G.me.killedBy);
    lastRun = sum; setState("over"); ui.showGameOver(sum); audio.play("gameOver");
  },
  showWin: (sum) => { ui.clearBanner(); setState("win"); ui.showWin(sum); audio.musicIntensity(0); },
  readyChanged: () => {
    if (G.state === "shop" && coop.waiting) ui.setShopWaiting(waitingOn());
    if (G.state === "upgrade" && coop.waiting) ui.setCardsWaiting(waitingOn());
  },
  nextWave: () => { ui.show(null); setState("playing"); resetReady(); startWave(G.wave + 1); },
});

// damage-number digits are pre-rendered with the game font: redo them once it has loaded
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (sprites.P) sprites.buildDigits(sprites.P); });

// go
const verEl = document.getElementById("menu-ver");
if (verEl) verEl.textContent = "v" + GAME_VERSION + " · " + VERSION_NAME;
applySettings();
toMenu();
playIntro();
ui.setMode(input.mode);
if (G.desktop) window.chrome.webview.postMessage({ type: "ready" });
if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches) input.setMode("touch");
document.documentElement.classList.add("eg-ready");
