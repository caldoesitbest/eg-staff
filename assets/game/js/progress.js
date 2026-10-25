/* Achievements and cosmetics: long-term goals that reward mastery with looks, never with power
   (so the leaderboard stays fair). Achievements listen to the game's events; each one unlocks a
   cosmetic, a title or just its badge. Everything is kept in the save (store.data.achv / cos / life). */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { store } from "./storage.js";
import { item, equipped, earnSigils, sigilAmount } from "./catalog.js";
import { rand, TAU } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { C, SIN, PAL, P_WHITE, P_AMBER, P_VIOLET, P_DVIOLET, P_CYAN, P_ORANGE, P_RED } from "./sprites.js";
import { FUSION_IDS } from "./fusion.js";
import { EVO_LIST } from "./evolve.js";

// ---------------------------------------------------------------------------
// what you can earn
// ---------------------------------------------------------------------------
const GUN_TITLES = { blaster: "Blaster Master", scatter: "Shotgun Saint", smg: "Bullet Hose", rail: "Railgun Royalty", nova: "Grenadier", arc: "Storm Caller", heart: "Heartbreaker" };

/** Every achievement: id, category, name, what to do, icon (site icon name), colour, rewards [[kind, id], ...].
    goal(): [have, need] for the ones that count up across runs. */
export const ACHIEVEMENTS = [
  // combat mastery
  { id: "untouchable", cat: "Combat", name: "Untouchable", desc: "Defeat a sin boss without taking a hit.", icon: "shield-check", col: "#63f4ff", rewards: [["visor", "mirror"]] },
  { id: "matador", cat: "Combat", name: "Matador", desc: "Pull off 10 perfect boosts in one run.", icon: "zap", col: "#a57bff", rewards: [["trail", "afterimage"]] },
  { id: "ghost", cat: "Combat", name: "Ghost in the Machine", desc: "Pull off 250 perfect boosts in all.", icon: "sparkles", col: "#c5a8ff", rewards: [["title", "ghost"]], goal: () => [life().perfects, 250] },
  { id: "deadeye", cat: "Combat", name: "Dead Eye", desc: "Clear a wave (wave 5 or later) after 30+ shots without a single miss.", icon: "radar", col: "#ffe14d", rewards: [["finish", "chrome"]] },
  { id: "overkill", cat: "Combat", name: "Overkill", desc: "Destroy 5 robots with one charged shot.", icon: "flame", col: "#ff8a3d", rewards: [["trail", "supernova"]] },
  { id: "fiend", cat: "Combat", name: "Combo Fiend", desc: "Reach a 100-kill combo.", icon: "activity", col: "#ff42d0", rewards: [["title", "fiend"]] },
  { id: "mutants", cat: "Combat", name: "Mutant Hunter", desc: "Destroy 100 mutated robots in all.", icon: "skull", col: "#9dff5c", rewards: [["trail", "toxic"]], goal: () => [life().mutants, 100] },
  // build mastery
  { id: "sinmax", cat: "Builds", name: "Sin Incarnate", desc: "Take a sin to its maximum level.", icon: "crown", col: SIN.wrath, rewards: [["title", "sinner"]] },
  { id: "seven", cat: "Builds", name: "All Seven", desc: "Hold all seven sins in one run.", icon: "layers", col: SIN.pride, rewards: [["suit", "seven"], ["trail", "sinful"]] },
  { id: "fused", cat: "Builds", name: "Fused", desc: "Activate a Sin Fusion.", icon: "sparkle", col: SIN.lust, rewards: [["visor", "fused"]] },
  { id: "unholy", cat: "Builds", name: "Unholy Union", desc: "Activate all seven Sin Fusions, across your runs.", icon: "infinity", col: SIN.envy, rewards: [["suit", "unholy"]], goal: () => [Object.keys(life().fusions).length, FUSION_IDS.length] },
  { id: "evolved", cat: "Builds", name: "Evolved", desc: "Evolve a weapon.", icon: "chevrons-up", col: "#ffe9a8", rewards: [["finish", "evolved"]] },
  { id: "arsenal", cat: "Builds", name: "Ascendant Arsenal", desc: "Evolve all seven guns (either path), across your runs.", icon: "gem", col: "#ff5ce1", rewards: [["finish", "ascendant"]], goal: () => [Object.keys(life().evoGuns).length, 7] },
  { id: "allpaths", cat: "Builds", name: "Every Path", desc: "Take all 14 weapon evolutions, across your runs.", icon: "orbit", col: "#7b8cff", rewards: [["title", "ascended"]], goal: () => [Object.keys(life().evos).length, 14] },
  // weapon mastery: win the Ladder with the gun doing the most damage
  ...Object.keys(GUN_TITLES).map((g) => ({ id: "m_" + g, cat: "Mastery", name: GUN_TITLES[g], desc: "Beat the Sin Ladder with the " + BALANCE.guns[g].name + " doing the most damage.", icon: "trophy", col: "#ffc861", rewards: [["title", "m_" + g]] })),
  // boss challenges
  { id: "rude", cat: "Bosses", name: "Rude Awakening", desc: "Defeat Sloth in under 20 seconds of fighting.", icon: "timer", col: SIN.sloth, rewards: [] },
  { id: "diet", cat: "Bosses", name: "Diet Plan", desc: "Defeat Gluttony without letting it heal.", icon: "ban", col: SIN.glutton, rewards: [["visor", "toxic"]] },
  { id: "crown", cat: "Bosses", name: "Crown Breaker", desc: "Shatter Pride's crown.", icon: "crown", col: SIN.pride, rewards: [["title", "kingslayer"]] },
  { id: "calm", cat: "Bosses", name: "Keep Calm", desc: "Defeat Wrath without a hit once it reaches its final phase.", icon: "flame", col: SIN.wrath, rewards: [["trail", "ember"]] },
  { id: "mirror", cat: "Bosses", name: "Mirror, Mirror", desc: "Defeat Envy in Boss Rush with two or more modifiers on.", icon: "moon-star", col: SIN.envy, rewards: [["visor", "gold"]] },
  // progression
  { id: "ladder", cat: "Progress", name: "Ladder Climber", desc: "Beat the Sin Ladder.", icon: "flag", col: "#73ffce", rewards: [["suit", "laureate"]] },
  { id: "hard", cat: "Progress", name: "Hardened", desc: "Beat the Sin Ladder on Hard or Nightmare.", icon: "shield", col: "#a57bff", rewards: [["suit", "obsidian"], ["finish", "obsidian"]] },
  { id: "nightmare", cat: "Progress", name: "Nightmare Walker", desc: "Beat the Sin Ladder on Nightmare.", icon: "skull", col: "#ff3b5c", rewards: [["suit", "nightmare"], ["victory", "eclipse"], ["title", "walker"]] },
  { id: "gauntlet", cat: "Progress", name: "The Gauntlet", desc: "Clear Boss Rush.", icon: "flame", col: "#ff9448", rewards: [["trail", "gauntlet"], ["victory", "fireworks"]] },
  { id: "speed", cat: "Progress", name: "Speed Demon", desc: "Earn an S rank in Boss Rush.", icon: "timer", col: "#ffd45c", rewards: [["title", "speed"]] },
  { id: "best", cat: "Progress", name: "Personal Best", desc: "Beat your best score.", icon: "trending-up", col: "#63f4ff", rewards: [] },
  { id: "beyond", cat: "Progress", name: "Beyond the Ladder", desc: "Reach wave 50.", icon: "rocket", col: "#ffffff", rewards: [["victory", "supernova"]] },
  { id: "daily", cat: "Progress", name: "Daily Grind", desc: "Finish a Daily Challenge.", icon: "calendar-days", col: "#ffc861", rewards: [["finish", "gilded"]] },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

const data = () => store.data;
const life = () => store.data.life;
export const unlockedAch = (id) => !!data().achv[id];
/** What an achievement's rewards are called ("Mirror visor", "Ember trail"). */
export function rewardNames(a) {
  return a.rewards.map(([k, id]) => {
    const c = item(k, id);
    return (c ? c.name : id) + " " + (k === "victory" ? "victory effect" : k === "title" ? "title" : k);
  });
}

// ---------------------------------------------------------------------------
// unlocking
// ---------------------------------------------------------------------------
export function unlock(id) {
  const a = ACH_BY_ID[id];
  if (!a || unlockedAch(id)) return false;
  data().achv[id] = Date.now();
  const sig = earnSigils(BALANCE.sigils.achievement, "achv", true);
  store.save();
  G.emit("achv", sig ? { ...a, sig } : a);
  return true;
}

// ---------------------------------------------------------------------------
// listening to the game
// ---------------------------------------------------------------------------
const run = { perfects: 0, bossH0: 0, bossT0: 0, wrathH: -1, chg: new Map() };
let chgSerial = 0;
/** A new id for a charged shot; everything it sets off carries it (Overkill counts its kills). */
export const newCharge = () => ++chgSerial;
const solo = () => G.net.role === "off";
const mine = () => G.player === G.me;

G.on("runStart", () => { run.perfects = 0; run.wrathH = -1; run.chg.clear(); G.runSigils = 0; });
G.on("perfect", () => {
  if (!mine()) return;
  run.perfects++;
  life().perfects++;
  if (run.perfects >= 10) unlock("matador");
  if (life().perfects >= 250) unlock("ghost");
});
G.on("bossFight", () => { run.bossH0 = G.hitsTaken; run.bossT0 = G.time; });
G.on("wrathEnraged", () => { run.wrathH = G.hitsTaken; });
G.on("prideHumbled", () => unlock("crown"));
G.on("bossDown", (f) => {
  if (G.net.role === "client") return;
  // the last sin falls: your victory effect plays over it
  if (f.type === "envy" && (G.mode === "rush" || (G.lap === 0 && !G.won))) victoryFx(f.x, f.y);
  const hits = G.hitsTaken - run.bossH0;
  if (!hits) unlock("untouchable");
  if (f.type === "sloth" && G.time - run.bossT0 < 20) unlock("rude");
  if (f.type === "glutton" && !f.healed) unlock("diet");
  if (f.type === "wrath" && run.wrathH >= 0 && G.hitsTaken === run.wrathH) unlock("calm");
  if (f.type === "wrath") run.wrathH = -1;
});
/** A robot died (world.killEnemy): combo, mutants, charged-shot kill counts. */
export function progressKill(e, chg) {
  if (G.combo >= 100) unlock("fiend");
  if (e.mut && e.ally <= 0) { life().mutants++; if (life().mutants >= 100) unlock("mutants"); }
  if (chg && run.chg.has(chg)) {
    const n = run.chg.get(chg) + 1;
    run.chg.set(chg, n);
    if (n >= 5) unlock("overkill");
  }
}
/** A charged shot of yours went off: its kills start counting. */
export function chargeFired(id) {
  if (run.chg.size > 32) run.chg.clear();
  run.chg.set(id, 0);
}
G.on("waveClear", (n) => {
  if (n >= 5 && (G.waveShots || 0) >= 30 && !(G.waveMisses || 0)) unlock("deadeye");
  if (n >= 50) unlock("beyond");
});
G.on("card", () => {
  const sins = ["gluttony", "greed", "wrath", "pride", "sloth", "envy", "lust"];
  if (sins.some((s) => (G.up[s] || 0) >= 4)) unlock("sinmax");
  if (sins.every((s) => (G.up[s] || 0) >= 1)) unlock("seven");
});
G.on("fusion", (id) => {
  life().fusions[id] = 1;
  unlock("fused");
  if (FUSION_IDS.every((f) => life().fusions[f])) unlock("unholy");
  store.save();
});
G.on("evolve", (g) => {
  life().evoGuns[g.id] = 1;
  life().evos[g.id + "_" + g.evo] = 1;
  unlock("evolved");
  if (Object.keys(life().evoGuns).length >= 7) unlock("arsenal");
  if (Object.keys(life().evos).length >= EVO_LIST.length - 1) unlock("allpaths");
  store.save();
});
G.on("ladderWin", () => {
  unlock("ladder");
  if (G.difficulty === "hard" || G.difficulty === "nightmare") unlock("hard");
  if (G.difficulty === "nightmare") unlock("nightmare");
  // weapon mastery: the gun that did the most damage this run (a solo run, so it's all yours)
  const rs = G.runStats;
  if (rs && solo()) {
    let top = "", best = 0;
    for (const k in rs.byGun) if (rs.byGun[k] > best) { best = rs.byGun[k]; top = k; }
    if (top && GUN_TITLES[top]) unlock("m_" + top);
  }
});
G.on("rushDone", (sum) => {
  if (!sum.cleared) return;
  life().rushClears++;
  unlock("gauntlet");
  if (sum.rank === "S") unlock("speed");
  if ((sum.mods || []).length >= 2) unlock("mirror");
});
G.on("runOver", (sum) => {
  if (sum.newScore && sum.prevBest > 0) unlock("best");
  if (G.daily) unlock("daily");
});

// ---------------------------------------------------------------------------
// Sigil payouts (catalog.js has the economy)
// ---------------------------------------------------------------------------
// The host's events pay out here; co-op guests are paid from the host's messages (main.js), same amounts.
export const sigilsBoss = () => earnSigils(sigilAmount("boss"), "boss");
export const sigilsWin = () => earnSigils(sigilAmount("win"), "win");
export const sigilsRush = (sum) => (sum && sum.cleared ? earnSigils(sigilAmount("rush", sum.rank), "rush") : 0);
G.on("bossDown", () => { if (G.net.role !== "client" && G.mode !== "rush") sigilsBoss(); });
G.on("ladderWin", () => { if (G.net.role !== "client") sigilsWin(); });
G.on("rushDone", (sum) => { if (G.net.role !== "client") sigilsRush(sum); });

// victory effects: played over the last boss's death
const shows = [];
export function victoryFx(x, y) {
  const v = equipped("victory").id;
  if (!v) return;
  if (v === "fireworks") {
    for (let i = 0; i < 9; i++) shows.push({ t: 0.25 + i * 0.28, x: x + rand(-320, 320), y: y + rand(-220, 180), col: Object.values(SIN)[i % 7] });
  } else if (v === "supernova") {
    for (let i = 0; i < 4; i++) shows.push({ t: 0.2 + i * 0.22, x, y, nova: i });
  } else if (v === "eclipse") {
    shows.push({ t: 0.2, x, y, eclipse: true });
  } else if (v === "starburst") {
    for (let i = 0; i < 5; i++) shows.push({ t: 0.2 + i * 0.18, x, y, star: i });
  } else if (v === "singularity") {
    shows.push({ t: 0.15, x, y, hole: 0 }, { t: 1.05, x, y, hole: 1 });
  }
}
/** Runs scheduled victory effects (main.js, every step). */
export function progressTick(dt) {
  for (let i = shows.length - 1; i >= 0; i--) {
    const s = shows[i];
    s.t -= dt;
    if (s.t > 0) continue;
    shows.splice(i, 1);
    if (s.col) {
      const pal = Math.max(0, PAL.indexOf(s.col));
      fx.burst(s.x, s.y, 26, pal, 360, 1.1, 2);
      fx.ring(s.x, s.y, 6, 120, 0.6, s.col, 3);
      fx.sparks(s.x, s.y, -Math.PI / 2, Math.PI, 10, P_WHITE, 300, 0.5);
      audio.play("explode", s.x, s.y, 0.5);
    } else if (s.nova !== undefined) {
      fx.ring(s.x, s.y, 20, 300 + s.nova * 160, 0.9, s.nova % 2 ? "#ffd45c" : "#ffffff", 6 - s.nova);
      if (!s.nova) fx.screenFlash("#fff4d6", 0.5, 1.6);
      fx.burst(s.x, s.y, 20, s.nova % 2 ? P_AMBER : P_WHITE, 520, 1.2, 2.2);
    } else if (s.eclipse) {
      fx.ring(s.x, s.y, 400, 30, 1.1, "#140a26", 18);
      fx.ring(s.x, s.y, 30, 420, 1.3, "#a57bff", 3);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; fx.sparks(s.x + Math.cos(a) * 60, s.y + Math.sin(a) * 60, a, 0.2, 3, P_VIOLET, 420, 0.6); }
      fx.screenFlash("#2a0d44", 0.4, 1.4);
    } else if (s.star !== undefined) {
      // rings of gold stars, each wider than the last
      const n = 8 + s.star * 2, r = 70 + s.star * 70;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + s.star * 0.3;
        fx.burst(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 4, k % 2 ? P_AMBER : P_WHITE, 120, 0.7, 1.6);
      }
      fx.ring(s.x, s.y, r * 0.6, r * 1.3, 0.6, "#ffd45c", 3);
      if (!s.star) audio.play("explode", s.x, s.y, 0.4);
    } else if (s.hole !== undefined) {
      if (!s.hole) {
        // it all falls in...
        fx.ring(s.x, s.y, 520, 20, 0.9, "#0a0614", 22);
        fx.ring(s.x, s.y, 360, 24, 0.85, "#ff8a3d", 3);
        for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; fx.sparks(s.x + Math.cos(a) * 300, s.y + Math.sin(a) * 300, a + Math.PI, 0.25, 2, k % 2 ? P_ORANGE : P_VIOLET, 520, 0.6); }
      } else {
        // ...and comes back out
        fx.screenFlash("#ffe2c4", 0.5, 1.4);
        fx.ring(s.x, s.y, 10, 560, 1.1, "#ff42d0", 5);
        fx.ring(s.x, s.y, 10, 380, 0.9, "#ffffff", 3);
        fx.burst(s.x, s.y, 34, P_ORANGE, 640, 1.2, 2.4);
        audio.play("bigExplode", s.x, s.y, 0.6);
      }
    }
  }
}
