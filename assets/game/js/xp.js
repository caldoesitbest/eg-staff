/* Levels (4.5): every run, challenge and achievement earns XP, and XP makes your level, from 1 to 1000. Each level
   pays a few Sigils (every fifth a few more), and seven levels unlock a hat you can't get any other way:
   10 Cadet Wings, 25 Comet Antenna, 50 Saturn Ring, 100 Nebula Crown, 250 Pulsar Helm, 500 Supernova Corona and
   1000 The Thousandfold. A run's XP is broken down on the results screen, so you can see where it came from.
   Nothing here touches power: levels are for showing off. Debug runs earn none. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { store } from "./storage.js";
import { earnSigils, dayKey } from "./catalog.js";
import { ledgerAdd } from "./cloud.js";

const LV = BALANCE.levels;

/** XP to go from level L to L+1. */
export const xpNeed = (L) => (L < 100 ? LV.base + LV.step * L : LV.base + LV.step * 100 + LV.late * (L - 100));
let cacheXp = -1, cacheLv = null;
/** { level, into (XP into this level), need (XP for the next), total } for an XP total. */
export function levelOf(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  if (xp === cacheXp) return cacheLv;
  let L = 1, left = xp;
  while (L < LV.max) { const n = xpNeed(L); if (left < n) break; left -= n; L++; }
  const r = { level: L, into: L >= LV.max ? 0 : left, need: L >= LV.max ? 0 : xpNeed(L), total: xp };
  cacheXp = xp; cacheLv = r;
  return r;
}
export const level = () => levelOf(store.data.xp || 0).level;

/** The band a level is in: name and colour (the badge's look). */
export const TIERS = [[1, "Rookie", "#9aa7c7"], [10, "Cadet", "#63f4ff"], [25, "Ace", "#73ffce"], [50, "Commander", "#a57bff"],
  [100, "Legend", "#ffd45c"], [250, "Mythic", "#ff42d0"], [500, "Cosmic", "#ff8a3d"], [1000, "Ascended", "#ffffff"]];
export function tierOf(L) {
  let t = TIERS[0];
  for (const x of TIERS) if (L >= x[0]) t = x;
  return { name: t[1], col: t[2], min: t[0] };
}
/** The level hats, in order: [level, hat id]. */
export const LEVEL_HATS = Object.entries(LV.hats).map(([l, id]) => [Number(l), id]).sort((a, b) => a[0] - b[0]);
/** The next level that unlocks a hat (or null at the top). */
export function nextHat(L) { for (const [l, id] of LEVEL_HATS) if (l > L) return { level: l, id }; return null; }

/** Adds XP. Each level gained pays its Sigils and says so (G "levelUp"). Returns the levels gained. */
export function addXp(n, why) {
  n = Math.round(n || 0);
  if (!(n > 0) || G.debug.on) return 0;
  const d = store.data;
  const before = levelOf(d.xp || 0).level;
  ledgerAdd("xp", n);
  d.xp = (d.xp || 0) + n;
  const after = levelOf(d.xp).level;
  G.emit("xp", { n, why });
  for (let L = before + 1; L <= after; L++) {
    const hat = LV.hats[L] || "";
    const sig = (L % 5 === 0 ? LV.sigils.fifth : LV.sigils.every) + (hat ? LV.milestone : 0);
    earnSigils(sig, "level", true);
    G.emit("levelUp", { level: L, sigils: sig, hat });
  }
  store.save();
  return after - before;
}

/** What a finished run is worth: { total, lines: [[label, xp]], mul: [[label, x]] }. r: the run's numbers. */
export function runXp(r) {
  const R = LV.run;
  const lines = [];
  const add = (label, x) => { x = Math.round(x); if (x > 0) lines.push([label, x]); };
  if (r.rush) {
    add("Bosses beaten", (r.bosses || 0) * R.rushBoss);
    if (r.cleared) add("Boss Rush cleared", R.rushClear);
  } else {
    add("Waves", Math.min(35, r.wave || 0) * R.wave);
    if ((r.wave || 0) > 35) add("Endless waves", ((r.wave || 0) - 35) * R.endlessWave);
    add("Sin bosses", (r.bosses || 0) * R.boss);
    if (r.won) add("Ladder climbed", R.win);
  }
  add("Robots destroyed", (r.kills || 0) * R.kill);
  if (r.minis) add("Mini-bosses", r.minis * R.mini);
  if (r.perfects) add("Perfect boosts", r.perfects * R.perfect);
  const mul = [];
  const dm = LV.diff[G.difficulty] || 1;
  if (dm !== 1) mul.push([(BALANCE.difficulty[G.difficulty] || {}).name + " ×" + dm, dm]);
  if (r.coop) mul.push(["Co-op ×" + LV.coop, LV.coop]);
  const today = dayKey();
  if (store.data.xpDay !== today && lines.length) mul.push(["First run today ×" + LV.firstOfDay, LV.firstOfDay]);
  if ((r.active || 0) < LV.idleBelow) mul.push(["Mostly standing still ×" + LV.idle, LV.idle]);
  let total = lines.reduce((s, l) => s + l[1], 0);
  for (const [, m] of mul) total *= m;
  return { total: Math.round(total), lines, mul, first: store.data.xpDay !== today };
}
/** Pays a run's XP (main.js, when the run is filed). Keeps where you were and where you got to, for the results. */
export function payRun(r) {
  const x = runXp(r);
  x.before = levelOf(store.data.xp || 0);
  if (x.total > 0 && !G.debug.on) { if (x.first) store.data.xpDay = dayKey(); addXp(x.total, "run"); }
  x.after = levelOf((store.data.xp || 0) + (G.debug.on ? x.total : 0));
  return x;
}
