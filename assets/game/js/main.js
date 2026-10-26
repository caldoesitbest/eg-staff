/* Envious Glider: Sinners vs. Machines. Boot + game states:
   intro → menu → playing ⇄ paused → clear → upgrade (pick a card) → shop (the Armory) → playing …
   → (wave 35: Envy down) win → endless … → dying → over → (retry) playing.  The run is the Sin Ladder:
   Sloth → Gluttony → Greed → Lust → Wrath → Pride → Envy, one boss every 5 waves.
   Co-op (coop.js + net.js): the host runs this same flow for everyone; clients follow its messages. */

import { G, usePlayer, setDifficulty, diff } from "./state.js";
import { BALANCE } from "./balance.js";
import { store, GFX_PRESETS } from "./storage.js";
import { startLoop } from "./loop.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import { renderer } from "./render.js";
import { fx } from "./fx.js";
import { ui } from "./ui.js";
import { waves } from "./waves.js";
import { stepWorld, clearWorld, spawnEdgeAsteroid, addScore, healPlayer, killEnemy, revivePlayer, haptic } from "./world.js";
import { createPlayer, cancelCharge } from "./player.js";
import { resetUpgrades, computeStats, offerCards, applyCard, onWaveEnd, buildSummary, buildTitle, CARDS, CARD_BY_ID } from "./upgrades.js";
import { popAllAllies, spawnEnemy, hostileCount } from "./enemies/index.js";
import { P_CYAN, P_WHITE, C, sprites } from "./sprites.js";
import { formatScore, rand, pick, TAU, withSeed, hashStr, seedRng } from "./util.js";
import { online, todayUTC } from "./online.js";
import { ladderRungs } from "./ui.js";
import { resetArmory, openShop as rollNewShop, buy, toggleLock, rerollShop, patchCost, swapGun, offerInfo, armoryAfter, nextArmoryWave, armorySoldOut, evoCandidate, evolveGun, gunCol, gunName, needsSlotPick, offerPrice } from "./armory.js";
import { GAME_VERSION, VERSION_NAME } from "./version.js";
import { fusionActivated, fusionWave } from "./fusion.js";
import { mutKey, mutHint } from "./mutations.js";
import { progressTick, sigilsBoss, sigilsWin, sigilsRush } from "./progress.js";
import { look, lookCode, itemsOf, runPay, earnSigils } from "./catalog.js";
import { reportRun } from "./contracts.js";
import { hangar } from "./hangar.js";
import { rollChapterEvent, eventWaveStart, eventTick, pendingEvent, eventDone, cacheAway, cacheOptions, relicOptions, takeRelic, altarOptions, takeAltar, acceptAmbush, ambushReward } from "./events.js";
import { giveItem } from "./armory.js";
import { net } from "./net.js";
import { coop, initCoop, startHost, setupPlayers, coopRoster, hostBefore, hostAfter, clientStep, hostSend, hostReady, clientReady, resetReady, endCoop, waitingOn } from "./coop.js";
import { social } from "./social.js";
import { pressureTick } from "./pressure.js";
import { MINIBOSSES } from "./enemies/minibosses.js";
import { splash } from "./splash.js";
import { keys, keyName, moveKeys, setKeys } from "./keys.js";
import { tutorial } from "./tutorial.js";
import { payRun, level, tierOf } from "./xp.js";
import { cloud } from "./cloud.js";
import { party } from "./party.js";
import { friendsUI } from "./friends.js";
import { lookArt } from "./hangar.js";

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
G.debug.on = params.get("debug") === "1";
G.debug.startWave = Math.max(1, Math.min(99, parseInt(params.get("wave"), 10) || 1));
G.debug.speed = G.debug.on ? Math.max(1, Math.min(8, parseInt(params.get("speed"), 10) || 1)) : 1;   // fast-forward for testing

// The Windows app (WebView2) talks to its launcher through window.chrome.webview.
G.desktop = !!(window.chrome && window.chrome.webview);
G.androidApp = /EnviousGliderAndroid\//.test(navigator.userAgent);     // the Android app's WebView adds this to its user agent

store.load();
G.settings = store.data.settings;
if (G.debug.on && params.get("diff")) G.settings.difficulty = params.get("diff");     // balance tests: ?diff=hard
if (G.debug.on && params.get("zoom")) G.debug.zoom = Math.max(1, Math.min(4, parseFloat(params.get("zoom")) || 1));   // close-up screenshots
computeStats();

const root = document.getElementById("game");
const canvas = document.getElementById("game-canvas");
const layer = document.getElementById("touch-layer");

const suitDef = () => look();          // what you're wearing (catalog.js)

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
  setKeys(s.keys);
  ui.setHudScale(s.hudScale);
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

/** Files this run against today's contracts (once: at game over, Boss Rush results, or when you quit it). */
function fileRun() {
  if (G.runFiled) return;
  G.runFiled = true;
  if (G.tutorial) return;                 // flight school counts for nothing
  const rush = G.mode === "rush";
  // 4.5: a real run pays a few Sigils (a daily cap; standing still with auto-fire doesn't count as playing)
  const active = G.time > 0 ? (G.activeT || 0) / G.time : 0, bosses = rush ? (G.rush ? G.rush.i : 0) : G.bossesKilled || 0;
  G.runPay = runPay({ time: G.time, kills: G.kills, wave: G.wave, won: !!G.won, rush, bosses, active });
  // 4.5: XP for the run (shown on the results screen)
  cloud.soon(5000);
  G.runXp = payRun({ wave: G.wave, kills: G.kills, bosses, won: !!G.won, rush, cleared: rush && bosses >= 7, minis: G.runMinis || 0, perfects: G.perfects || 0, active, coop: G.net.role !== "off" });
  G.runContracts = reportRun({
    kills: G.kills, wave: G.wave, bosses: rush ? (G.rush ? G.rush.i : 0) : G.bossesKilled || 0, perfects: G.perfects || 0,
    stars: G.starsTotal || 0, combo: G.bestCombo || 0, difficulty: G.difficulty, daily: !!G.daily, rush,
  });
}
G.on("runStart", () => { G.runFiled = false; G.runContracts = []; });

function menuScene() {
  clearWorld();
  setupRunPlayers(false);
  G.player.iframes = 0;
  G.boss = null; G.bossFx = null;
  for (let i = 0; i < BALANCE.arena.asteroids; i++) spawnEdgeAsteroid(true);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
}

function toMenu() {
  tutorial.abandon();
  menuScene();
  splash.roll();
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
  G.tutorial = !!(opts && opts.tutorial);
  const isCoop = !!(opts && opts.coop);
  G.daily = opts && opts.daily ? opts.daily : null;
  G.mode = opts && opts.rush && !G.daily ? "rush" : "ladder";
  // the Daily Challenge is always Normal (everyone plays the same run); co-op uses the host's pick
  const want = (opts && opts.difficulty) || G.settings.difficulty;
  const mods = G.mode === "rush" ? ((opts && opts.mods) || []).filter((m) => BALANCE.rush.mods[m]) : [];
  setDifficulty(G.daily ? "normal" : want, mods);
  G.lastBonus = "";
  // Boss Rush: i = bosses beaten, t0 = when the first boss arrived (the clock), pb = best splits so far
  G.rush = G.mode === "rush" ? { i: 0, mods, t0: -1, fightT0: 0, h0: 0, splits: [], picks: 0, inBreak: false, pb: { ...(store.data.rush.splits[G.difficulty] || {}) } } : null;
  G.mark = 0; G.lap = 0; G.won = false; G.rungThisRun = 0;
  Object.assign(G, {
    time: 0, wave: 0, score: 0, kills: 0, combo: 0, comboTimer: 0, bestCombo: 0, stars: 0, starsTotal: 0,
    waveHits: 0, hitsTaken: 0, flawlessWaves: 0, bossesKilled: 0, rerolls: 0, patches: 0, perfects: 0,
    hitstop: 0, slowmo: 0, slowScale: 1, freezeT: 0, vacuum: false, boss: null, bossFx: null, autoTarget: null,
    lastSlowmo: -9, hitMark: 0, killMark: 0,
    runStats: { dmg: 0, big: 0, byGun: {}, spent: 0 },
    activeT: 0, runPay: null, runDrops: 0, runXp: null, runMinis: 0,
  });
  setupRunPlayers(isCoop);
  G.emit("runStart");
  if (G.net.role !== "client") for (let i = 0; i < BALANCE.arena.asteroids; i++) spawnEdgeAsteroid(true);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  if (G.mode === "rush") { for (const P of G.players) { usePlayer(P); G.stars = BALANCE.rush.stars; } usePlayer(G.me); }
  // debug: start later with a matching handful of upgrades
  const start = G.debug.on && !isCoop && G.mode !== "rush" ? G.debug.startWave : 1;
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
  if (!G.tutorial) store.data.totals.runs++;
  if (G.daily) {
    const d = store.data.daily;
    if (d.date !== G.daily) { d.date = G.daily; d.score = 0; d.wave = 0; d.tries = 0; }
    d.tries++;
  }
  if (G.net.role === "client") return;     // the host starts the waves
  if (G.tutorial) { tutorial.begin(); return; }        // flight school: no waves
  if (G.mode === "rush") { openUpgrade(); return; }     // Boss Rush opens with a draft
  startWave(start);
  if (!store.data.seenHowTo) { store.data.seenHowTo = true; store.save(); }
}

const boostWord = () => (input.mode === "touch" ? "Tap ⚡" : input.mode === "gamepad" ? "Press A" : "Press " + keyName(keys().boost));
const HINTS = {
  1: () => (input.mode === "touch"
    ? "Left thumb moves. " + (G.settings.autoAim ? "You fire on your own." : "Right thumb aims and fires.")
    : input.mode === "gamepad" ? "Left stick moves, right stick aims and fires." : moveKeys() + " to move, mouse to aim, hold click to fire."),
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

/** The wave after this one (Boss Rush: the next boss's wave). */
const nextWave = () => (G.mode === "rush" ? (G.rush.i + 1) * BALANCE.waves.bossEvery : G.wave + 1);

function startWave(n) {
  if (G.mode === "rush") { G.rush.inBreak = false; if (G.rush.t0 < 0) G.rush.t0 = G.time; }
  G.waveShots = 0; G.waveMisses = 0;          // Dead Eye: your trigger pulls and misses this wave
  seeded("wave" + n, () => waves.start(n));
  seeded("event" + n, () => rollChapterEvent(n));
  if (G.net.role !== "client") eventWaveStart(n);
  G.vacuum = false;
  for (const P of G.players) { usePlayer(P); P.bubble = G.stats.bubble; P.feastN = 0; fusionWave(P); }     // Bubble Shield refills every wave; Gluttony's (and fusions') per-wave caps reset
  usePlayer(G.me);
  waveIntro(n);
  hostSend({ k: "go", n });
}

/** The banner and music for the start of wave n. */
function waveIntro(n) {
  if (G.mode === "rush") {
    const rung = waves.rungOf(n), def = BALANCE.bosses[BALANCE.bosses.order[rung]];
    const pb = G.rush.pb[BALANCE.bosses.order[rung]];
    ui.banner("Boss Rush · " + (rung + 1) + " of 7", "@" + def.name, "<b>" + def.title + "</b>" + (pb ? " · best split " + fmtSplit(pb) : ""), "boss", true, def.c1);
    audio.musicIntensity(2);
    audio.play("wave");
    return;
  }
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
  // 4.6: past your best wave (solo Ladder runs that count): said once, the first wave past it
  const bw = store.data.best.wave || 0;
  if (bw >= 5 && n === bw + 1 && G.net.role === "off" && !G.daily && !G.debug.on) {
    setTimeout(() => { if (G.state === "playing" || G.state === "clear") { ui.toast("Past your best (wave " + bw + "). Every wave from here is a record.", 3400); audio.play("stamp"); } }, 900);
  }
}

// Climbing: remember the highest rung you've beaten.
G.on("bossDown", () => {
  if (G.lap > 0) return;
  G.rungThisRun = waves.rungOf(G.wave) + 1;
  if (!G.debug.on && G.rungThisRun > (store.data.best.rung || 0)) { store.data.best.rung = G.rungThisRun; store.save(); }
});

G.on("waveClear", (n) => {
  if (G.state !== "playing") return;
  if (G.mode === "rush") { rushBossDown(); return; }
  popAllAllies();
  cacheAway();
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
    hostSend({ k: "clear", b: ["The Sin Ladder", "Cleared!", "Envy can't be earned. You took it.", "good", true], snd: "newBest", sig: "envy" });
    audio.play("newBest");
    setState("clear");
    return;
  }
  const head = waves.boss ? "@" + BALANCE.bosses[waves.bossType].name + " down" : "Wave " + n;
  hostSend({ k: "clear", b: [head, waves.boss ? "Clear!" : "Clear", "+" + formatScore(bonus) + " clear bonus" + (flawless ? " · <b>Flawless</b>" : ""), "good", false], snd: "clear", sig: waves.boss ? waves.bossType : 0 });   // sig: which sin boss fell (guests earn its first-time Sigils)
  ui.banner(head, waves.boss ? "Clear!" : "Clear", text, "good");
  audio.play("clear");
  audio.musicIntensity(1);
  clearT = BALANCE.waves.breather + (waves.boss ? 1.2 : 0);
  setState("clear");
});

// ---------------------------------------------------------------------------
// Boss Rush
// ---------------------------------------------------------------------------
G.on("bossFight", () => { if (G.mode === "rush" && G.rush) { G.rush.fightT0 = G.time; G.rush.h0 = G.hitsTaken; } });

/** 83.4 → "1:23.4" */
function fmtSplit(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
}
/** The Armory opens after every boss (every other one on Sealed Armory). */
const rushArmoryOpen = () => !G.rush.mods.includes("sealed") || G.rush.i % 2 === 0;

function rushBossDown() {
  popAllAllies();
  const R = G.rush, RB = BALANCE.rush, type = waves.bossType, def = BALANCE.bosses[type];
  const t = Math.max(0, G.time - R.fightT0), hits = G.hitsTaken - R.h0;
  R.splits.push({ type, t, hits });
  R.i++;
  if (!hits) G.score += RB.hitless * diff().score;
  // between bosses: a little health back (none on Starved), the Armory's stipend, everyone back up
  for (const P of G.players) {
    if (P.gone) continue;
    usePlayer(P);
    if (P.dead && G.net.role === "host") revivePlayer(P);
    if (!R.mods.includes("starved")) P.hp = Math.min(P.maxHp, P.hp + RB.heal);
    G.stars += RB.stipend;
  }
  usePlayer(G.me);
  G.vacuum = true;
  const pb = R.pb[type], d = pb ? t - pb : 0;
  const sub = "Split <b>" + fmtSplit(t) + "</b>" + (pb ? " · <b class='" + (d <= 0 ? "good" : "bad") + "'>" + (d <= 0 ? "−" : "+") + fmtSplit(Math.abs(d)) + "</b> vs best" : "") +
    " · " + (hits ? hits + (hits === 1 ? " hit" : " hits") : "<b>no hits</b>");
  G.lastBonus = "@" + def.name + " fell in " + fmtSplit(t);
  const done = R.i >= 7;
  const b = ["Boss Rush · " + R.i + " of 7", "@" + def.name + " down", sub, "good", true];
  ui.banner(...b, def.c1);
  hostSend({ k: "clear", b, snd: done ? "newBest" : "clear" });
  audio.play(done ? "newBest" : "clear");
  audio.musicIntensity(1);
  clearT = BALANCE.waves.breather + 1.4;
  setState("clear");
}

/** Boss Rush rank: S/A/B/C/D by fighting time (more room on Hard and Nightmare); every 10 hits costs a grade. */
function rushRank(time, hits) {
  const RK = BALANCE.rush.rank, slow = RK.slower[G.difficulty] || 1;
  let g = RK.par.findIndex((p) => time <= p * slow);
  if (g < 0) g = 4;
  return "SABCD"[Math.min(4, g + Math.floor(hits / RK.hits))];
}

/** The Rush is over: all seven down, or you fell. Records your bests (solo runs only) and shows the results. */
function finishRush(cleared) {
  overShown = true;
  const R = G.rush, RB = BALANCE.rush;
  const fight = R.splits.reduce((a, s) => a + s.t, 0);
  if (cleared) G.score += Math.max(0, RB.timeScore.base - fight * RB.timeScore.perSec) * diff().score;
  const sum = {
    rush: true, cleared, score: Math.floor(G.score), time: fight, hits: G.hitsTaken, beaten: R.i, kills: G.kills,
    splits: R.splits.map((s) => ({ type: s.type, t: s.t, hits: s.hits, pb: R.pb[s.type] || 0 })),
    mods: R.mods.slice(), difficulty: G.difficulty, rank: cleared ? rushRank(fight, G.hitsTaken) : "",
    next: cleared ? "" : BALANCE.bosses.order[R.i] || "", killedBy: cleared ? "" : sourceName(G.me && G.me.killedBy),
    build: buildSummary(), buildTitle: buildTitle(),
  };
  const record = !G.debug.on && G.net.role === "off";
  if (!G.debug.on && G.net.role !== "client") online.submitRun({ mode: "rush", difficulty: G.difficulty, score: sum.score, wave: R.i, won: cleared, seconds: fight, players: G.players.length });
  if (record) {
    const rs = store.data.rush;
    const best = (rs.splits[G.difficulty] = rs.splits[G.difficulty] || {});
    for (const s of R.splits) if (!best[s.type] || s.t < best[s.type]) best[s.type] = Math.round(s.t * 100) / 100;
    if (cleared) {
      rs.clears++;
      const prev = rs.best[G.difficulty];
      sum.prevTime = prev ? prev.time : 0;
      sum.newTime = !prev || fight < prev.time;
      sum.newScore = !prev || sum.score > prev.score;
      if (sum.newTime || sum.newScore) {
        rs.best[G.difficulty] = {
          time: sum.newTime ? Math.round(fight * 10) / 10 : prev.time, score: sum.newScore ? sum.score : prev.score,
          hits: sum.newTime ? sum.hits : prev.hits, rank: sum.newTime ? sum.rank : prev.rank, mods: sum.newTime ? sum.mods : prev.mods,
        };
      }
    }
  }
  sum.solo = record;
  if (!record) sum.recordNote = G.net.role !== "off" ? "co-op run: records are kept for solo runs" : "debug run, records not saved";
  store.data.totals.kills += G.kills;
  store.save(true);
  G.emit("rushDone", sum);
  lastRun = sum;
  hostSend({ k: "rushdone", sum: { ...sum, build: [] } });
  fileRun();
  setState("over");
  ui.showRushDone(sum);
  audio.play(cleared ? "newBest" : "gameOver");
}

function showVictory() {
  ui.clearBanner();
  setState("win");
  input.releaseAll();
  G.emit("ladderWin");
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
  if (G.net.role === "host") { resetReady(); hostSend({ k: "between", w: G.wave, bonus: G.lastBonus, ev: pendingEvent(), cache: !!G.cacheCracked }); }
  ui.clearBanner();
  if (G.mode === "rush" && !G.rush.inBreak) {
    // Boss Rush: a draft to open with, then a couple of cards after each boss
    G.rush.inBreak = true;
    G.rush.i = Math.round(G.wave / BALANCE.waves.bossEvery);
    G.rush.picks = G.wave === 0 ? BALANCE.rush.draft : BALANCE.rush.picks;
  }
  // a sin boss just fell and a gun is at Tier IV: it can evolve (one evolution per boss)
  if (G.wave > 0 && waves.isBossWave(G.wave) && evoCandidate() >= 0) { openEvolve(); return; }
  openCards();
}

// ---------------------------------------------------------------------------
// special events (events.js): a choice between waves
// ---------------------------------------------------------------------------
let evOpts = [], evType = "";
function openEvent(type) {
  evType = type;
  setState("event");
  input.releaseAll();
  const w = G.wave;
  if (type === "cache") {
    evOpts = cacheOptions();
    ui.showEvent({ kicker: "Cosmic Cache", title: "The cache cracks open", sub: "Stars spill out, and something glints inside. Take one.", col: "#ffc861",
      options: evOpts.map((o) => ({ name: o.name, text: o.text, col: o.col })), leave: false });
  } else if (type === "corrupt") {
    evOpts = relicOptions();
    ui.showEvent({ kicker: "Corrupted Armory", title: "Power, at a price", sub: "A broken vending unit hums with stolen power. Each relic is strong, and each one costs you. Take one, or walk away.", col: "#ff2a55",
      options: evOpts.map((o) => ({ name: o.name, text: o.text, cost: o.cost, col: "#ff2a55" })), leave: "Walk away" });
  } else if (type === "altar") {
    evOpts = altarOptions();
    ui.showEvent({ kicker: "Sin Altar", title: "An altar to the seven", sub: "It takes what you offer and gives what you want. You have \u2605" + G.stars + ".", col: "#a98bff",
      options: evOpts.map((o) => ({ name: o.name, text: o.text, cost: o.price ? "\u2605 " + o.price : "Free", disabled: o.price > G.stars })), leave: "Leave it" });
  } else if (type === "ambush") {
    evOpts = [{ id: "fight" }];
    ui.showEvent({ kicker: "Elite Ambush · wave " + (w + 1), title: "Hunters have your scent", sub: "Three mutated hunters will be waiting when the next wave starts. Kill all three within " + BALANCE.events.ambush.time + " seconds.", col: "#ff3b3b",
      options: [{ name: "Take the fight", text: "Win: \u2605 " + ambushReward() + " and an extra card after the wave", cost: "Lose: they keep hunting you" }], leave: "Slip away" });
  }
  audio.play("evoReady");
}
function pickEvent(i) {
  if (G.state !== "event") return;
  const o = evOpts[i];
  if (i >= 0 && !o) return;
  if (evType === "cache" && o) { if (o.id === "stars") G.stars += o.stars; else giveItem(o.item); }
  else if (evType === "corrupt" && o) takeRelic(o.id);
  else if (evType === "altar" && o) { if (!takeAltar(o)) { audio.play("deny"); ui.toast("Not enough stars"); return; } }
  else if (evType === "ambush" && o) acceptAmbush();
  audio.play(i >= 0 ? "buy" : "click");
  eventDone(evType);
  afterCards();
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
  if (G.mode === "rush") {
    const R = G.rush, nb = BALANCE.bosses[BALANCE.bosses.order[R.i]];
    ui.showUpgrade(offered, {
      kicker: R.i === 0 ? "Boss Rush · opening draft" : "Boss Rush · " + R.i + " of 7 down",
      title: nb ? "@" + nb.name + " is next" : "Choose your power",
      bonus: (R.picks > 1 ? R.picks + " picks left" : "Last pick") + (G.lastBonus ? " · " + G.lastBonus : ""),
      armory: rushArmoryOpen() ? "the Armory is next" : "the Armory is sealed this time",
    });
    if (!offered.length) { ui.toast("Every Sin and Augment maxed"); R.picks = 1; afterCards(); }
    return;
  }
  const nextBoss = (G.wave + 1) % BALANCE.waves.bossEvery === 0;
  const nb = nextBoss ? BALANCE.bosses[BALANCE.bosses.order[waves.rungOf(G.wave + 1)]] : null;
  const armoryNext = armorySoldOut() ? "the Armory is sold out" : armoryAfter(G.wave) ? "the Armory is next" : "the Armory opens after wave " + nextArmoryWave(G.wave);
  ui.showUpgrade(offered, { kicker: "Wave " + G.wave + " cleared", title: nb ? "@" + nb.name + " is next" : "Choose your power", bonus: G.lastBonus, armory: armoryNext });
  // endless: every Sin and Augment maxed, so there's nothing to pick; carry on
  if (!offered.length) { ui.toast("Every Sin and Augment maxed"); afterCards(); }
}

/** After the card: the Armory (if it opens this wave and has anything left for you), else the next wave. */
function afterCards() {
  if (G.tutorial) { tutorial.cardPicked(); return; }
  if (G.mode === "rush" && G.rush.picks > 1) { G.rush.picks--; openCards(); return; }
  if (G.bonusPick > 0) { G.bonusPick--; openCards(); return; }            // the Elite Ambush's extra card
  const ev = pendingEvent();
  if (ev) { openEvent(ev); return; }
  const P = G.player;
  const skipShop = armorySoldOut() && (!P || P.hp >= P.maxHp);      // still opens to patch you up
  if ((G.mode === "rush" ? rushArmoryOpen() : armoryAfter(G.wave)) && !skipShop) { openArmory(); return; }
  if (G.net.role !== "off") {
    if (G.net.role === "host") hostReady(); else if (!coop.waiting) clientReady();
    coop.waiting = true;
    ui.setCardsWaiting(waitingOn());
    return;
  }
  ui.show(null);
  setState("playing");
  startWave(nextWave());
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
  G.emit("card", id);
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
  if (G.mode === "rush") {
    const nb = BALANCE.bosses[BALANCE.bosses.order[G.rush.i]];
    ui.showShop({ kicker: G.rush.i === 0 ? "Boss Rush · stock up" : "Boss Rush · the Armory pays a bounty", next: "Next: <b>@" + nb.name + "</b>, " + nb.title + ".", go: "Face @" + nb.name });
    return;
  }
  const next = G.wave + 1;
  const boss = next % BALANCE.waves.bossEvery === 0;
  const nb = boss ? BALANCE.bosses[BALANCE.bosses.order[waves.rungOf(next)]] : null;
  ui.showShop({
    kicker: bounty ? "Boss down · the Armory pays a bounty" : "Wave " + G.wave + " cleared · the Armory",
    next: nb ? "Next: <b>@" + nb.name + "</b>, " + nb.title + ". Stock up." : "Next: wave " + next + (waves.markOf(next) > G.mark ? " · <b>robots evolve</b>" : ""),
    go: nb ? "Face @" + nb.name : "Wave " + next,
  });
}

/** slot: which gun a new one replaces when both slots are full; left out, the player is asked first. */
function shopBuy(i, slot) {
  if (G.state !== "shop") return;
  const o = G.shop.offers[i];
  if (!o || o.sold) return;
  const info = offerInfo(o);
  if (slot === undefined && needsSlotPick(o)) {
    if (G.stars < offerPrice(o)) { audio.play("deny"); ui.toast("Not enough stars"); return; }
    audio.play("click");
    ui.openSwapPick(i);
    return;
  }
  if (!buy(i, slot)) { audio.play("deny"); ui.toast("Not enough stars"); return; }
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
  startWave(nextWave());
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
/** Your build (the HUD button, I, a controller's View button): from a fight it pauses first (in co-op the game keeps going). */
function toggleBuild() {
  if (ui.swapOpen) return;
  if (ui.screen === "build") { ui.closeBuild(); return; }
  const s = G.state;
  if (s === "playing" || s === "clear") {
    if (G.netMenu) { ui.openBuild("pause"); return; }
    pause();
    if (G.state === "paused" || G.netMenu) ui.openBuild("pause");
  } else if (s === "paused" && ui.screen === "pause") ui.openBuild("pause");
  else if (s === "shop" && ui.screen === "shop") ui.openBuild("shop");
  else if (s === "upgrade" && ui.screen === "upgrade") ui.openBuild("upgrade");
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
  bulwark: "a Bulwark", boomer: "a Boomer's blast", sniper: "a Sniper", patch: "a Patch Bot", gem: "Pride's crown gem", decoy: "one of Lust's fakes", volatile: "a Shrapnel elite's burst",
  shockwave: "a Shockwave mutant's ring", "volatile mutant": "a Volatile mutant's blast" };

// The Elite Ambush (events.js)
G.on("ambushStart", () => ui.banner("Elite Ambush", "Hunters!", "Kill all three within " + BALANCE.events.ambush.time + " seconds", "boss", false, "#ff3b3b"));
G.on("ambushWon", (gain) => ui.toast("Ambush survived: ★" + gain + " and an extra card after this wave", 3200));
G.on("ambushLost", () => ui.toast("Too slow: the hunters are still after you", 2800));

// The first time you ever meet each mutation, a hint says what to do about it.
G.on("mutSpawn", (e) => {
  const k = mutKey(e.mut), seen = store.data.seenMut || (store.data.seenMut = {});
  if (!k || seen[k] || G.state === "menu") return;
  seen[k] = 1;
  store.save();
  ui.toast("Mutation · " + mutHint(e.mut), 4600);
});
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
  if (G.net.role === "client") { ui.setOnline(null); return; }     // a co-op run is posted once, by its host
  if (!online.available) { ui.setOnline(null); return; }
  if (!online.user) { ui.setOnline("signin"); return; }
  if (!store.data.settings.postScores) { ui.setOnline(null); return; }
  ui.setOnline("posting");
  // 4.5: the difficulty boards (co-op has its own); the original board still gets solo runs below
  const coopRun = G.net.role === "host";
  const v2 = online.submitRun({ mode: coopRun ? "coop" : G.daily ? "daily" : "ladder", difficulty: G.daily ? "normal" : G.difficulty, score: sum.score, wave: sum.wave,
    won: !!G.won, seconds: G.time, daily: G.daily, team: coopRun ? G.players.map((P) => P.name).join(" + ") : null, players: G.players.length });
  if (coopRun) {
    const r = await v2;
    if (G.state !== "over") return;
    if (r.ok) ui.setOnline("posted", { rank: r.rank, daily: false });
    else ui.setOnline(r.skipped ? null : "error", r.error);
    return;
  }
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
  if (G.mode === "rush") { finishRush(false); return; }
  overShown = true;
  const best = store.data.best;
  const oldWave = best.wave;
  const sum = {
    prevBest: best.score,
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
  const unlocked = itemsOf("suit").filter((s) => s.wave && s.wave > oldWave && s.wave <= best.wave);
  if (unlocked.length) sum.unlock = unlocked.map((s) => s.name).join(" and ");
  const pool = TITLES.find((t) => sum.wave >= t[0])[1];
  sum.title = G.won ? (G.lap > 0 || G.wave > 35 ? "Past the top of the Ladder" : "You climbed the whole Ladder") : pool[Math.floor(Math.random() * pool.length)];
  const rung = ladderRungs()[Math.min(6, G.rungThisRun || 0)];
  sum.kicker = G.won ? "Sin Ladder cleared · wave " + sum.wave : (G.rungThisRun ? "Beat " + G.rungThisRun + " of 7 sins · " : "") + "Fell on wave " + sum.wave + (G.won ? "" : " · @" + rung.name + " was next");
  if (G.daily && record) {
    const d = store.data.daily;
    if (d.date === G.daily && sum.score > d.score) { d.score = sum.score; d.wave = sum.wave; sum.dailyBest = true; }
  }
  fileRun();
  G.emit("runOver", sum);
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

/** A brand-new player's first PLAY goes to flight school first (skippable; How to play replays it). */
function firstFlight() {
  if (store.data.tutorial || G.net.role !== "off" || (store.data.totals.runs || 0) > 0) return false;
  if (G.debug.on && params.get("tutorial") !== "1") return false;
  tutorial.start();
  return true;
}
/** Seconds you've actually been flying this run (moving or boosting; auto-fire alone doesn't count): run Sigils need it. */
function trackActive(dt) {
  const P = G.me;
  if (G.state !== "playing" || !P || P.dead) return;
  if (Math.abs(input.move.x) + Math.abs(input.move.y) > 0.25 || P.boostT > 0) G.activeT += dt;
}
function update(dt) {
  const s = G.state;
  trackActive(dt);
  if (G.net.role === "client" && s !== "menu") { clientStep(dt); return; }
  if (s === "paused" || s === "upgrade" || s === "shop" || s === "over" || s === "win" || s === "evolve" || s === "event") return;
  if (G.hitstop > 0) { G.hitstop -= dt; if (G.net.role === "host") hostAfter(); return; }
  let sdt = dt;
  if (G.slowmo > 0) { G.slowmo -= dt; sdt = dt * G.slowScale; }
  if (s === "menu") { menuStep(sdt); return; }
  if (G.net.role === "host") hostBefore(sdt);
  stepWorld(sdt);
  pressureTick(sdt);
  if (G.tutorial) tutorial.tick(sdt);
  if (G.net.role === "host") hostAfter();
  if (s === "playing") eventTick(sdt);
  progressTick(sdt);
  fx.update(sdt);
  if (s === "dying") {
    deathT += dt;
    if (deathT > 1.5 && !overShown) gameOver();
  } else if (s === "clear") {
    clearT -= dt;
    if (clearT <= 0) {
      if (G.mode === "rush") { if (G.rush.i >= 7) finishRush(true); else openUpgrade(); }
      else if (G.won && G.wave === 35) showVictory(); else openUpgrade();
    }
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
  if (s === "upgrade" || s === "shop" || s === "paused" || s === "over" || s === "win" || s === "evolve" || s === "event") {
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
  onPlay: () => { audio.unlock(); if (firstFlight()) return; startRun(); },
  onDaily: () => { audio.unlock(); if (firstFlight()) return; startRun({ daily: todayUTC() }); },
  onTutorial: () => { audio.unlock(); if (G.net.role === "off") tutorial.start(); },
  onRush: () => { if (store.rushUnlocked() || G.debug.on) ui.openRush(); else ui.toast("Beat @Envy on the Sin Ladder to open Boss Rush", 2600); },
  onRushStart: (mods) => { store.data.rush.mods = mods; store.save(); audio.unlock(); startRun({ rush: true, mods }); },
  onRushAgain: () => { if (G.net.role === "host") startHost(); else if (G.net.role === "off") startRun({ rush: true, mods: (lastRun && lastRun.mods) || [] }); },
  onEndless: () => { ui.show(null); openUpgrade(); audio.musicIntensity(1); },
  onFinish: finishWonRun,
  onExit: () => { store.save(true); if (G.desktop) window.chrome.webview.postMessage({ type: "quit" }); },
  onPause: pause,
  onResume: resume,
  onRestart: () => { if (G.net.role !== "client") fileRun(); if (G.net.role === "host") startHost(); else if (G.net.role === "off") startRun(G.mode === "rush" ? { rush: true, mods: G.rush.mods } : G.daily ? { daily: todayUTC() } : null); },
  onQuit: () => {
    if (G.state !== "menu") fileRun();
    const done = G.state === "over" || G.state === "win";
    if (G.net.role === "host" && net.members.length > 1) party.home();           // everyone back to the Hangar, still a party
    else if (G.net.role === "client" && done) party.home();                        // results screen: back to the Hangar, still in the party
    else if (G.net.role !== "off") endCoop();                                      // left mid-run: out of the party
    toMenu();
  },
  onCoop: () => {
    audio.unlock();
    // already in a party: that's your lobby
    if (net.role !== "off") { ui.openLobby(store.data.coopName || online.name || ""); ui.lobbyRoom(net.code, net.role === "host"); ui.renderLobby(net.members, net.role === "host"); return; }
    ui.openLobby(store.data.coopName || online.name || "");
  },
  onPartyPlay: (mode) => { audio.unlock(); return party.play(mode); },
  onLobbyHost: async (name) => {
    store.data.coopName = name; store.save();
    try { await net.host(name, lookCode() + social.tag()); ui.lobbyRoom(net.code, true); party.changed(); } catch (e) { ui.lobbyStatus(e.message, "bad"); net.leave(); }
  },
  onLobbyJoin: async (code, name) => {
    store.data.coopName = name; store.save();
    try { await net.join(code, name, lookCode() + social.tag()); ui.lobbyRoom(net.code, false); party.changed(); } catch (e) { ui.lobbyStatus(e.message, "bad"); net.leave(); }
  },
  onLobbyMode: (mode) => { coop.mode = mode; coop.mods = store.data.rush.mods || []; },
  onLobbyStart: () => { if (net.role === "host" && net.members.length >= 2) { audio.unlock(); startHost(); } },
  onLobbyLeave: () => { party.leave(true); ui.show("menu"); },
  onPick: pickCard,
  onEvo: pickEvolution,
  onEvent: pickEvent,
  onEvoLater: laterEvolution,
  onReroll: reroll,
  onPatch: patchUp,
  onBuy: shopBuy,
  onLock: (i) => { toggleLock(i); audio.play("click"); ui.renderShop(); },
  onShopReroll: shopReroll,
  onShopGo: shopGo,
  onSelectSlot: (i) => { if (swapGun(i)) audio.play("swap"); ui.renderShop(); },
  onSwap: () => { if (G.state === "playing" || G.state === "clear") { input.queued.swap = true; input.swapTo = undefined; } },
  onBuild: () => toggleBuild(),
  onSettings: applySettings,
  onLook: () => renderer.setSuit(suitDef()),
  onSfx: (name) => audio.play(name),
  onAchv: (x) => audio.play(x && x.levelUp ? "levelUp" : "achv"),
  onTick: (p) => audio.play("tick", undefined, undefined, 1, { p }),
  onStamp: () => { audio.play("stamp"); haptic([20, 30, 60]); },
  onFullscreen: () => { if (G.desktop) window.chrome.webview.postMessage({ type: "fullscreen" }); else toggleFullscreen(); },
  onClick: () => audio.play("click"),
  onHover: () => audio.play("hover", undefined, undefined, 0.6),
});

input.init({ root, layer, boostButton: document.getElementById("boost-btn"), chargeButton: document.getElementById("charge-btn") });
party.init({ lookCode, toast: (t, ms) => ui.toast(t, ms), readyCheck: (name, pick) => friendsUI.readyCheck(name, pick) });
splash.init({ sfx: (n) => audio.play(n), toast: (t, ms) => ui.toast(t, ms) });
// Discord (the Windows app shows it on your profile): what you're doing, which wave, who's with you
if (G.desktop && !G.debug.on) {
  let lastPresence = "", runT0 = 0;
  G.on("runStart", () => { runT0 = Date.now(); });
  setInterval(() => {
    const diffName = (BALANCE.difficulty[G.difficulty] || {}).name || "Normal";
    let details, state = "";
    if (G.state === "menu") {
      details = "In the Hangar";
      state = net.role !== "off" ? "In a party" : "Level " + level() + " · " + tierOf(level()).name;
    } else if (G.tutorial) { details = "Flight school"; state = "Learning to fly"; }
    else {
      const what = G.mode === "rush" ? "Boss Rush" : G.daily ? "Daily Challenge" : G.wave > 35 ? "Endless" : "The Sin Ladder";
      details = G.mode === "rush" ? what + " · " + Math.min(7, (G.rush && G.rush.i) || 0) + "/7 bosses" : what + " · Wave " + G.wave;
      state = (G.daily ? "Normal" : diffName) + (G.net.role !== "off" ? " · co-op" : " · solo") + (G.boss && !G.boss.dead ? " · fighting @" + G.boss.def.name : "");
    }
    const size = net.role !== "off" ? net.members.length : 1;
    const msg = { type: "presence", details, state, start: G.state === "menu" ? 0 : runT0, size, max: net.role !== "off" ? 4 : 0, party: net.role !== "off" ? net.code : "" };
    const key = JSON.stringify(msg);
    if (key === lastPresence) return;
    lastPresence = key;
    try { window.chrome.webview.postMessage(msg); } catch (e) { /* not the desktop app */ }
  }, 2000);
}
tutorial.init({ spawnEnemy, startRun, toMenu, openCards, audio, resumePlay: () => { ui.show(null); setState("playing"); } });
friendsUI.init({
  ui, lookArt, toast: (t, ms) => ui.toast(t, ms), sfx: (n) => audio.play(n), signIn: () => online.signIn(),
  hangar: { tab: (t) => { if (ui.screen !== "menu") ui.show("menu"); hangar.tab(t); }, refresh: () => hangar.refresh(), now: () => hangar.tabNow },
});
const AIM_NAMES = { off: "Off", assist: "Aim assist", auto: "Full auto" };
input.onHotkey = (code) => {
  if (code !== "aim") return;
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
  if (ui.swapOpen) { ui.closeSwapPick(); return true; }
  if (ui.screen === "build") { ui.closeBuild(); return true; }
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
  if (s === "menu" && ui.screen === "menu") return hangar.back();
  if (s === "menu" && (ui.screen === "settings" || ui.screen === "how" || ui.screen === "news" || ui.screen === "profile" || ui.screen === "rush" || ui.screen === "download")) { if (ui.screen === "settings") ui.closeSettings(); else ui.show("menu"); return true; }
  if (s === "menu" && ui.screen === "lobby") { ui.show("menu"); return true; }        // a party stays open (Leave ends it)
  if (s === "over" && ui.screen === "settings") { ui.closeSettings(); return true; }
  return false;
};
input.onMenuNav = (dir) => ui.navigate(dir);
input.onMenuTab = (step, sub) => { if (sub) ui.cycleSubTab(step); else ui.cycleTab(step); };
input.onBuild = toggleBuild;
input.onMenuConfirm = () => { audio.unlock(); ui.confirm(); };
input.onMenuBack = (start) => {
  if (ui.swapOpen) { ui.closeSwapPick(); return; }
  if (ui.screen === "build") { if (start && ui.buildFrom === "pause") resume(); else ui.closeBuild(); return; }
  if (G.state === "paused" && start) { resume(); return; }
  if (ui.screen === "settings") ui.closeSettings();
  else if (G.state === "menu" && ui.screen === "menu") hangar.back();
  else if (ui.screen === "how" || ui.screen === "news" || ui.screen === "profile" || ui.screen === "rush" || ui.screen === "download") ui.show("menu");
  else if (G.state === "paused") resume();
  setTimeout(() => ui.ensureFocus(), 40);
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
  if (ui.swapOpen) {
    // the "replace which gun?" dialog: 1 / 2 pick the slot, Enter buys, Esc cancels (onPause)
    if (digit === 0 || digit === 1) { e.preventDefault(); ui.pickSwapSlot(digit); }
    return;
  }
  if (e.code === keys().build && !e.ctrlKey && !e.metaKey && !e.altKey && (s === "playing" || s === "clear" || s === "paused" || s === "shop" || s === "upgrade" || ui.screen === "build")) { e.preventDefault(); toggleBuild(); return; }
  if (ui.screen === "build") return;
  if (s === "shop") {
    if (digit >= 0) { e.preventDefault(); if (ui.armed) shopBuy(digit); return; }
    if (e.code === "KeyR") { e.preventDefault(); shopReroll(); return; }
    const onButton = document.activeElement && document.activeElement.tagName === "BUTTON" && document.activeElement.id !== "shop-go";
    if ((e.code === "Enter" || e.code === "Space") && !onButton) { e.preventDefault(); if (ui.armed) shopGo(); return; }
  } else if (s === "event") {
    if (digit >= 0 && digit < 3) { e.preventDefault(); if (ui.armed) pickEvent(digit); return; }
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
  } else if (s === "over" && ui.screen === "rushdone") {
    if (ui.armed && e.code === "KeyR") { e.preventDefault(); if (G.net.role === "host") startHost(); else if (G.net.role === "off") startRun({ rush: true, mods: (lastRun && lastRun.mods) || [] }); }
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
    bot.onEvent = pickEvent;
    bot.onBuy = (i) => shopBuy(i, G.gunSlot);
    bot.onShopGo = shopGo;
    autopilot = bot;
    window.__bot = bot;
    bot.rushRuns = [];
    G.on("rushDone", (sum) => bot.rushRuns.push({ cleared: sum.cleared, beaten: sum.beaten, time: Math.round(sum.time), hits: sum.hits, rank: sum.rank, score: sum.score,
      killedBy: sum.killedBy, splits: sum.splits.map((x) => x.type + ":" + Math.round(x.t) + "s/" + x.hits + "h").join(" "), guns: G.guns.filter(Boolean).map((g) => g.id + g.tier + (g.evo || "")).join("+"), cards: Object.keys(G.up).length }));
    G.debug.god = params.get("god") === "1";
    if (params.get("cohost") || params.get("cojoin")) { bot.autoRetry = false; return; }   // co-op tests start from the lobby
    if (params.get("rush") === "1") {
      const mods = (params.get("mods") || "").split(",").filter(Boolean);
      bot.onRetry = () => startRun({ rush: true, mods });
      bot.onRushAgain = bot.onRetry;
      startRun({ rush: true, mods });
      if (params.get("god") === "1") G.debug.god = true;
      return;
    }
    startRun();
    if (params.get("god") === "1") G.debug.god = true;
  });
}
// debug co-op: ?debug=1&cohost=N opens a lobby and starts once N players are in; ?debug=1&cojoin=CODE joins it
if (G.debug.on && params.get("cohost")) {
  setTimeout(async () => {
    try {
      const code = await net.host("Host", lookCode());
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
  setTimeout(() => net.join(params.get("cojoin"), "Guest" + Math.floor(Math.random() * 90 + 10), lookCode()).then(() => { ui.lobbyRoom(net.code, false); ui.show("lobby"); }).catch((e) => console.log("[coop] " + e.message)), 600);
}
if (G.debug.on && params.get("cosmoke") === "1") import("./debug-bot.js").then(({ coopSmoke }) => coopSmoke());
if (G.debug.on && params.get("scene")) {
  import("./debug-bot.js").then(({ scene }) => setTimeout(() => scene(params.get("scene"), { startRun, spawnEnemy, waves, input, seedRng }), 900));
}
if (G.debug.on && params.get("tests") === "1") {
  import("./tests.js").then(({ runTests }) => setTimeout(() => runTests({ startRun, spawnEnemy, waves, rushRank, shopBuy, openArmory }), 800));
}
if (G.debug.on && params.get("smoke") === "1") {
  import("./debug-bot.js").then(({ smoke }) => setTimeout(() => smoke({ startRun, openArmory, shopBuy, shopGo, spawnEnemy }), 800));
}
if (G.debug.on) {
  import("./armory.js").then((armory) => {
    window.__eg = { get offered() { return offered; }, G, waves, startRun, startWave, spawnEnemy, applyCard, CARDS, loop, store, hostileCount, ui, input, armory, openArmory, shopGo, shopBuy, toggleBuild, applySettings, net, coop, party, social, friendsUI, tutorial,
      openUpgrade, openEvolve, pickEvolution, openEvent, pickEvent,
      stage: (gun, path, opts) => import("./debug-bot.js").then((m) => m.stage({ spawnEnemy, waves }, gun, path, opts)),
      zoneAt: (t, f) => import("./debug-bot.js").then((m) => m.zoneAt(t, f)) };
  });
  ui.toast("Debug: N skip · B boss · G god · K kill · U upgrade · H heal · J swarm · M stars", 5000);
}

// ---------------------------------------------------------------------------
// desktop app + online
// ---------------------------------------------------------------------------
ui.setApp(G.desktop || G.androidApp);
G.on("campWarn", () => ui.toast("Standing still draws fire: keep moving!", 2600));
G.on("levelUp", (lv) => { ui.achvPop({ levelUp: true, ...lv }); hangar.refresh(); });
// a mini-boss on its way: who it is and how to fight it
const MINI_HINT = {
  warden: "Its shield turns slower than you can circle it. Hit it from behind, or while it vents after a volley.",
  lancer: "It paints a line, then dashes along it and the line bursts. Step off before it locks red.",
  siege: "Its shells land where you are and where you're heading. Keep turning, and don't hug it.",
};
function miniWarn(type) { ui.banner("Mini-boss incoming", MINIBOSSES[type].name, MINI_HINT[type] || "", "bad", true, MINIBOSSES[type].accent); audio.play("minibossAlarm"); }
G.on("minibossWarn", (type) => { miniWarn(type); if (G.net.role === "host") hostSend({ k: "mini", type }); });
G.on("minibossDown", (e) => {
  G.runMinis = (G.runMinis || 0) + 1; ui.banner("Mini-boss down", MINIBOSSES[e.type] ? MINIBOSSES[e.type].name : "", "", "good"); audio.play("clear"); });
// 4.6: a combo milestone, called out over your head (and the HUD's combo meter flares)
const COMBO_COL = [[300, "#ff42d0"], [150, "#ffc861"], [100, "#ff7a3d"], [50, "#73ffce"], [0, "#63f4ff"]];
G.on("comboMark", (n) => {
  const P = G.me;
  if (!P || P.dead) return;
  const col = COMBO_COL.find((c) => n >= c[0])[1];
  fx.text(P.x, P.y - 58, n + " COMBO", col, n >= 100 ? 26 : 21, 1.3);
  audio.play("comboUp", undefined, undefined, 1, { n });
  ui.flareCombo(col);
});
G.on("look", () => { renderer.setSuit(suitDef()); social.setLook(lookCode()); });
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
// The Android app (its WebView adds "EnviousGliderAndroid/" to the user agent) calls these: the system back button
// (false = nothing left to close, so the app goes to the background) and the app leaving / returning to the screen.
if (G.androidApp) {
  window.egApp = {
    back: () => {
      if (input.onPause()) return true;
      if (G.state === "menu" && ui.screen && ui.screen !== "menu") { ui.show("menu"); return true; }
      return false;
    },
    pause: () => { if (G.net.role === "off") pause(); audio.suspend(); },
    resume: () => { audio.resume(); loop.resetClock(); },
  };
}
cloud.init();
G.on("cloud", (c) => { if (c.reason === "restore") return; hangar.refresh(); });
G.on("auth", () => { ui.renderAccount(); if (ui.screen === "board") ui.openBoard(ui.boardKindNow || "all"); social.sync(lookCode()); });
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
  // now and then, a thank-you on the way in
  if (Math.random() < 1 / 12) { const c = document.getElementById("intro-credit"); if (c) c.hidden = false; }
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
net.on.lobby = (members) => { ui.renderLobby(members, net.role === "host"); party.lobby(members); };
net.on.status = (text, kind) => ui.lobbyStatus(text, kind);
initCoop({
  startRun,
  toMenu,
  // the party leader went back to the Hangar: so do you (still in the party)
  partyHome: () => { if (G.state !== "menu") { fileRun(); party.home(); toMenu(); ui.toast("Back in the Hangar with your party", 2400); } },
  sigilShard: (n) => { if (n > 0 && n <= 3) earnSigils(n, "drop"); },
  partyReady: (id, r) => party.onReady(id, r),
  partyPick: (msg) => party.onPick(msg),
  partyCheck: (msg) => party.onCheck(msg),
  partyStarted: () => { party.ready = false; },
  kicked: () => { const inRun = G.state !== "menu"; endCoop(); if (inRun) toMenu(); party.changed(); ui.toast("You were removed from the party", 2800); },
  partyClosed: () => { party.changed(); ui.toast("The party leader left. You're on your own now.", 3000); },
  toast: (t, ms) => ui.toast(t, ms),
  openUpgrade: (msg) => {
    G.wave = msg.w; G.lastBonus = msg.bonus || "";
    // the host's event for this break (everyone makes their own choice)
    G.event = msg.ev && msg.ev !== "cache" ? { type: msg.ev, wave: msg.w, done: false, spawnAt: -1 } : null;
    G.cacheCracked = !!msg.cache;
    openUpgrade();
  },
  closeBetween: (n) => {
    if (G.state !== "playing") { ui.show(null); setState("playing"); }
    G.wave = n;
    if (G.mode === "rush") { G.rush.inBreak = false; if (G.rush.t0 < 0) G.rush.t0 = G.time; }
    waveIntro(n);
  },
  rushDone: (sum) => { sigilsRush(sum); fileRun(); lastRun = sum; setState("over"); ui.showRushDone(sum); audio.play(sum.cleared ? "newBest" : "gameOver"); },
  miniWarn: (type) => miniWarn(type),
  waveBanner: (msg) => { ui.banner(...msg.b); audio.play(msg.snd || "clear"); if (msg.sig) { sigilsBoss(msg.sig); G.bossesKilled = (G.bossesKilled || 0) + 1; } },
  gameOver: (sum) => {
    // the host's numbers are the host's: keep the team ones, put in your own
    delete sum.dmg; delete sum.big; delete sum.topGun;
    sum.spent = G.runStats ? G.runStats.spent : 0;
    sum.killedBy = sourceName(G.me && G.me.killedBy);
    fileRun();
    lastRun = sum; setState("over"); ui.showGameOver(sum); audio.play("gameOver");
  },
  showWin: (sum) => { sigilsWin(); ui.clearBanner(); setState("win"); ui.showWin(sum); audio.musicIntensity(0); },
  readyChanged: () => {
    if (G.state === "shop" && coop.waiting) ui.setShopWaiting(waitingOn());
    if (G.state === "upgrade" && coop.waiting) ui.setCardsWaiting(waitingOn());
  },
  nextWave: () => { ui.show(null); setState("playing"); resetReady(); startWave(nextWave()); },
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
