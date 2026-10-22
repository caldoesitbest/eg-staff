/* Envious Glider: Sinners vs. Machines. Boot + game states:
   menu → playing ⇄ paused → clear → upgrade → playing … → dying → over → (retry) playing */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { store, SUITS } from "./storage.js";
import { startLoop } from "./loop.js";
import { input } from "./input.js";
import { audio } from "./audio.js";
import { renderer } from "./render.js";
import { fx } from "./fx.js";
import { ui } from "./ui.js";
import { waves } from "./waves.js";
import { stepWorld, clearWorld, spawnEdgeAsteroid, addScore, healPlayer, killEnemy } from "./world.js";
import { createPlayer } from "./player.js";
import { resetUpgrades, computeStats, offerCards, applyCard, onWaveEnd, buildSummary, buildTitle, CARDS, CARD_BY_ID } from "./upgrades.js";
import { popAllAllies, spawnEnemy, hostileCount } from "./enemies/index.js";
import { P_CYAN, P_WHITE, C } from "./sprites.js";
import { formatScore, rand, pick, TAU } from "./util.js";

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
G.debug.on = params.get("debug") === "1";
G.debug.startWave = Math.max(1, Math.min(99, parseInt(params.get("wave"), 10) || 1));
G.debug.speed = G.debug.on ? Math.max(1, Math.min(8, parseInt(params.get("speed"), 10) || 1)) : 1;   // fast-forward for testing

store.load();
G.settings = store.data.settings;
computeStats();

const root = document.getElementById("game");
const canvas = document.getElementById("game-canvas");
const layer = document.getElementById("touch-layer");

const suitDef = () => SUITS.find((s) => s.id === G.settings.suit && store.suitUnlocked(s)) || SUITS[0];

G.quality = G.settings.quality === "low" ? 0 : 2;
fx.setQuality(G.quality);
renderer.init(canvas, suitDef());
renderer.resize();

let offered = [];
let prevState = "playing";
let clearT = 0;
let deathT = 0;
let overShown = false;
let lastRun = null;

let lastQualitySetting = G.settings.quality;
function applySettings() {
  const s = G.settings;
  if (s.quality === "auto" && lastQualitySetting !== "auto" && G.quality !== 2) { G.quality = 2; applyQuality(); }
  lastQualitySetting = s.quality;
  audio.setVolumes(s.sfx, s.music, s.muted);
  fx.shakeOn = s.shake && !s.reducedMotion;
  fx.reduced = s.reducedMotion;
  ui.setReduced(s.reducedMotion);
  if (s.quality === "high" && G.quality !== 2) { G.quality = 2; applyQuality(); }
  if (s.quality === "low" && G.quality !== 0) { G.quality = 0; applyQuality(); }
  if (!s.showFps) ui.setFps(null);
  store.save();
}
function applyQuality() {
  fx.setQuality(G.quality);
  renderer.resize();
}

function setState(s) {
  G.state = s;
  ui.setState(s);
  input.enabled = s === "playing" || s === "clear";
  if (!input.enabled) { input.mouse.down = false; input.queued.boost = false; }
}

// ---------------------------------------------------------------------------
// menu scene: the astronaut floats, rocks drift
// ---------------------------------------------------------------------------
function menuScene() {
  clearWorld();
  resetUpgrades();
  G.player = createPlayer();
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
function startRun() {
  clearWorld();
  resetUpgrades();
  Object.assign(G, {
    time: 0, wave: 0, score: 0, kills: 0, combo: 0, comboTimer: 0, bestCombo: 0, stars: 0, starsTotal: 0,
    waveHits: 0, hitsTaken: 0, flawlessWaves: 0, bossesKilled: 0, rerolls: 0, patches: 0, perfects: 0,
    hitstop: 0, slowmo: 0, slowScale: 1, freezeT: 0, vacuum: false, boss: null, bossFx: null, autoTarget: null,
  });
  G.player = createPlayer();
  for (let i = 0; i < BALANCE.arena.asteroids; i++) spawnEdgeAsteroid(true);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  // debug: start later with a matching handful of upgrades
  const start = G.debug.on ? G.debug.startWave : 1;
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

function startWave(n) {
  waves.start(n);
  G.vacuum = false;
  if (waves.boss) {
    const def = BALANCE.bosses[waves.bossType];
    ui.banner("Wave " + n + " · Boss", def.name, def.tagline, "boss", true);
    audio.musicIntensity(2);
  } else {
    const hint = HINTS[n] ? HINTS[n]() : n === 12 ? "From here on, some robots come <b>overcharged</b>." : "";
    ui.banner(n === 1 ? "Hold the line" : "Incoming", "Wave " + n, hint, "", !!hint);
    audio.musicIntensity(1);
  }
  audio.play("wave");
}

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
  onWaveEnd();
  if (G.stars > before) text += " · Greed interest ★+" + (G.stars - before);
  G.lastBonus = text;
  G.vacuum = true;
  ui.banner(waves.boss ? "Boss down" : "Wave " + n, waves.boss ? "Clear!" : "Clear", text, "good");
  audio.play("clear");
  audio.musicIntensity(1);
  clearT = BALANCE.waves.breather + (waves.boss ? 1.2 : 0);
  setState("clear");
});

function openUpgrade() {
  ui.clearBanner();
  setState("upgrade");
  input.releaseAll();
  offered = offerCards();
  ui.showUpgrade(offered, { kicker: "Wave " + G.wave + " cleared", title: G.wave % 5 === 4 ? "Boss next. Choose well" : "Pick your sin", bonus: G.lastBonus });
}

function pickCard(id) {
  if (G.state !== "upgrade" || offered.indexOf(id) === -1) return;
  const lvl = applyCard(id);
  const c = CARD_BY_ID[id];
  const P = G.player;
  audio.play("pick");
  fx.ring(P.x, P.y, 10, 120, 0.5, c.color, 4);
  fx.burst(P.x, P.y, 24, P_CYAN, 260, 0.7, 1.8);
  fx.text(P.x, P.y - 40, c.name.toUpperCase() + (lvl >= c.max ? " MAX" : " " + lvl), c.color, 18, 1.3);
  ui.show(null);
  setState("playing");
  startWave(G.wave + 1);
}

function reroll() {
  const E = BALANCE.economy;
  const cost = E.reroll + E.rerollStep * G.rerolls;
  if (G.state !== "upgrade" || G.stars < cost) return;
  G.stars -= cost;
  G.rerolls++;
  offered = offerCards();
  ui.renderCards(offered);
  ui.renderEconomy();
  audio.play("steal");
  if (input.mode !== "touch") ui.focusCard(0);
}

function patchUp() {
  const E = BALANCE.economy;
  const cost = E.patch + E.patchStep * G.patches;
  const P = G.player;
  if (G.state !== "upgrade" || G.stars < cost || P.hp >= P.maxHp) return;
  G.stars -= cost;
  G.patches++;
  P.hp = Math.min(P.maxHp, P.hp + E.patchHeal);
  audio.play("heart");
  ui.renderEconomy();
  ui.renderHearts(P);
}

// ---------------------------------------------------------------------------
// pause, death, game over
// ---------------------------------------------------------------------------
function pause() {
  if (G.state !== "playing" && G.state !== "clear") return;
  prevState = G.state;
  setState("paused");
  input.releaseAll();
  ui.showPause(buildSummary());
  audio.musicIntensity(0);
}
function resume() {
  if (G.state !== "paused") return;
  ui.show(null);
  setState(prevState);
  loop.resetClock();
  audio.resume();
  audio.musicIntensity(waves.boss && G.boss ? 2 : 1);
}

G.on("playerDown", () => {
  setState("dying");
  deathT = 0;
  overShown = false;
  audio.musicIntensity(0);
});

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}

const TITLES = [
  [20, ["Legend. Still scrap.", "The planet will remember you", "Chaos, but make it art"]],
  [10, ["So close to glory", "Good people. Bad luck.", "They needed a boss for that"]],
  [5, ["The machines win this round", "Grounded.", "Bad habits. Worse luck."]],
  [0, ["Scrap happens", "Robots 1, Sinners 0", "Even legends warm up"]],
];

function gameOver() {
  overShown = true;
  const best = store.data.best;
  const oldWave = best.wave;
  const sum = {
    score: Math.floor(G.score), wave: G.wave, kills: G.kills, combo: G.bestCombo, stars: G.starsTotal,
    time: fmtTime(G.time), perfects: G.perfects, bosses: G.bossesKilled,
    build: buildSummary(), buildTitle: buildTitle(),
  };
  const record = !G.debug.on;           // debug runs (wave skips, god mode) don't count
  sum.newScore = record && sum.score > best.score && sum.score > 0;
  sum.newWave = record && sum.wave > best.wave;
  sum.newCombo = record && sum.combo > best.combo;
  sum.anyBest = sum.newScore || sum.newWave;
  if (sum.newScore) best.score = sum.score;
  if (sum.newWave) best.wave = sum.wave;
  if (sum.newCombo) best.combo = sum.combo;
  if (record) best.kills = Math.max(best.kills, sum.kills);
  store.data.totals.kills += sum.kills;
  if (!record) sum.buildTitle = (sum.buildTitle || "") + " · debug run, bests not saved";
  const unlocked = SUITS.filter((s) => s.wave > oldWave && s.wave <= best.wave);
  if (unlocked.length) sum.unlock = unlocked.map((s) => s.name).join(" and ");
  const pool = TITLES.find((t) => sum.wave >= t[0])[1];
  sum.title = pool[Math.floor(Math.random() * pool.length)];
  store.save(true);
  lastRun = sum;
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
  if (s === "paused" || s === "upgrade" || s === "over") return;
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  let sdt = dt;
  if (G.slowmo > 0) { G.slowmo -= dt; sdt = dt * G.slowScale; }
  if (s === "menu") { menuStep(sdt); return; }
  stepWorld(sdt);
  fx.update(sdt);
  if (s === "dying") {
    deathT += dt;
    if (deathT > 1.5 && !overShown) gameOver();
  } else if (s === "clear") {
    clearT -= dt;
    if (clearT <= 0) openUpgrade();
  }
}

let fpsT = 0, qT = 0, slowWin = 0, fastWin = 0;
function before(dt) {
  input.poll(dt);
}
function render(alpha, dt) {
  fx.tickScreen(dt);
  renderer.updateCamera(alpha, dt);
  audio.setListener(G.cam.x, G.cam.y);
  renderer.draw(alpha, dt);
  if (G.state !== "menu") ui.updateHud(dt);

  fpsT += dt;
  if (fpsT >= 0.5) {
    fpsT = 0;
    if (G.settings.showFps || G.debug.on) {
      const st = loop.stats;
      ui.setFps(Math.round(st.fps) + " fps · " + st.frameMs.toFixed(1) + " ms frame · " + st.workMs.toFixed(1) + " ms work · Q" + G.quality +
        " · " + G.enemies.count + " bots · " + fx.parts.count + " fx" + (G.debug.god ? " · GOD" : ""));
    }
  }
  // auto quality: step down if frames stay slow, back up when there's room
  qT += dt;
  if (qT >= 1 && G.settings.quality === "auto" && !document.hidden) {
    qT = 0;
    const st = loop.stats;
    if (st.frameMs > 23 && G.state === "playing") { slowWin++; fastWin = 0; }
    else if (st.frameMs < 17.5 && st.workMs < 5) { fastWin++; slowWin = 0; }
    else { slowWin = 0; fastWin = 0; }
    if (slowWin >= 3 && G.quality > 0) { G.quality--; slowWin = 0; applyQuality(); }
    if (fastWin >= 10 && G.quality < 2) { G.quality++; fastWin = 0; applyQuality(); }
  }
}

let autopilot = null;      // debug only: ?debug=1&autoplay=1
const step = (dt) => {
  for (let i = 0; i < G.debug.speed; i++) {
    if (autopilot) autopilot.tick();
    update(dt);
  }
};
const loop = startLoop({ before, update: step, render });

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
  onPause: pause,
  onResume: resume,
  onRestart: () => startRun(),
  onQuit: toMenu,
  onPick: pickCard,
  onReroll: reroll,
  onPatch: patchUp,
  onSettings: applySettings,
  onSuit: (id) => { G.settings.suit = id; store.save(); renderer.setSuit(suitDef()); audio.play("click"); },
  onFullscreen: toggleFullscreen,
  onClick: () => audio.play("click"),
  onHover: () => audio.play("hover", undefined, undefined, 0.6),
});

input.init({ root, layer, boostButton: document.getElementById("boost-btn") });
input.onModeChange = (m) => { G.touchActive = m === "touch"; ui.setMode(m); };
input.onPause = () => {
  const s = G.state;
  if (s === "playing" || s === "clear") { pause(); return true; }
  if (s === "paused") {
    if (ui.screen === "settings") { ui.closeSettings(); return true; }
    resume();
    return true;
  }
  if (s === "menu" && (ui.screen === "settings" || ui.screen === "how")) { if (ui.screen === "settings") ui.closeSettings(); else ui.show("menu"); return true; }
  if (s === "over" && ui.screen === "settings") { ui.closeSettings(); return true; }
  return false;
};
input.onMenuNav = (dir) => ui.navigate(dir);
input.onMenuConfirm = () => { audio.unlock(); ui.confirm(); };
input.onMenuBack = (start) => {
  if (G.state === "paused" && start) { resume(); return; }
  if (ui.screen === "settings") ui.closeSettings();
  else if (ui.screen === "how") ui.show("menu");
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
  if (s === "upgrade") {
    const i = ["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].indexOf(e.code) % 3;
    if (i >= 0 && offered[i]) { e.preventDefault(); if (ui.armed) pickCard(offered[i]); return; }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      const cards = Array.from(document.querySelectorAll("#cards .card"));
      const at = cards.indexOf(document.activeElement);
      const next = at < 0 ? 0 : (at + (e.code === "ArrowRight" ? 1 : cards.length - 1)) % cards.length;
      if (cards[next]) { e.preventDefault(); cards[next].focus(); }
    }
  } else if (s === "over" && ui.screen === "over") {
    if (!ui.armed) return;
    if (e.code === "KeyR") { e.preventDefault(); startRun(); }
    else if (e.code === "Enter" && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); startRun(); }
  } else if (s === "menu" && ui.screen === "menu") {
    if ((e.code === "Enter" || e.code === "Space") && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); audio.unlock(); startRun(); }
  }
  if (G.debug.on && (s === "playing" || s === "clear")) debugKey(e);
});

// ---------------------------------------------------------------------------
// tab switches, resizes
// ---------------------------------------------------------------------------
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { pause(); audio.suspend(); }
  else { audio.resume(); loop.resetClock(); }
});
window.addEventListener("blur", () => { if (!G.debug.on) pause(); });
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
    case "KeyU": { const ids = offerCards(); const id = pick(ids); applyCard(id); ui.toast("+" + CARD_BY_ID[id].name); break; }
    case "KeyH": if (P) { P.hp = P.maxHp; } break;
    case "KeyJ": for (let i = 0; i < 40; i++) waves.spawnGroup(pick(["drone", "swarm", "gunner", "ripper"]), 1); break;
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
    autopilot = bot;
    window.__bot = bot;
    G.debug.god = params.get("god") === "1";
    startRun();
    if (params.get("god") === "1") G.debug.god = true;
  });
}
if (G.debug.on) {
  window.__eg = { get offered() { return offered; }, G, waves, startRun, startWave, spawnEnemy, applyCard, CARDS, loop, store, hostileCount, ui, input };
  ui.toast("Debug: N skip · B boss · G god · K kill · U upgrade · H heal · J swarm", 5000);
}

// go
applySettings();
toMenu();
ui.setMode(input.mode);
if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches) input.setMode("touch");
document.documentElement.classList.add("eg-ready");
