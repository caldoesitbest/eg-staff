/* Daily contracts (4.3, the Hangar's Challenges tab): three small goals a day (UTC), one easy, one medium,
   one hard, each paying Sigils (balance.sigils.contracts). Progress comes from each run's report (main.js
   files one when the run ends or you quit it), so solo and co-op runs both count. Never in debug runs.
   A contract pays once: it's marked done in the save the moment it pays. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { store } from "./storage.js";
import { dayKey, earnSigils } from "./catalog.js";

// how: "sum" adds up across the day's runs, "max" is your best single run. need: easy, medium, hard.
const POOL = [
  { id: "kills", how: "sum", need: [150, 300, 500], text: (n) => "Destroy " + n + " robots" },
  { id: "bosses", how: "sum", need: [1, 3, 5], text: (n) => "Beat " + n + " sin boss" + (n === 1 ? "" : "es") },
  { id: "wave", how: "max", need: [10, 18, 26], text: (n) => "Reach wave " + n + " on the Ladder" },
  { id: "perfects", how: "sum", need: [5, 12, 20], text: (n) => "Pull off " + n + " perfect boosts" },
  { id: "stars", how: "sum", need: [300, 700, 1200], text: (n) => "Collect " + n + " stars" },
  { id: "combo", how: "max", need: [30, 60, 90], text: (n) => "Reach a " + n + "-kill combo" },
  { id: "hard", how: "max", need: [6, 12, 18], text: (n) => "Reach wave " + n + " on Hard or Nightmare" },
  { id: "runs", how: "sum", need: [2, 3, 4], text: (n) => "Play " + n + " runs (wave 3 or later)" },
  { id: "rush", how: "sum", need: [2, 4, 7], text: (n) => "Beat " + n + " bosses in Boss Rush", rush: true },
];
const TIERS = ["Easy", "Medium", "Hard"];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rushOpen = () => (store.data.best.wins || 0) > 0 || (store.data.rush && store.data.rush.clears > 0);

/** Today's three (picked from the day's seed; Boss Rush contracts only once you've opened Boss Rush). */
export function pickContracts(day, rush) {
  let seed = hash("contracts:" + day);
  const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  const pool = POOL.filter((c) => rush || !c.rush);
  const list = [];
  while (list.length < 3) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (list.some((x) => x.id === c.id)) continue;
    const tier = list.length;
    list.push({ id: c.id, tier, need: c.need[tier], have: 0, done: false });
  }
  return list;
}

/** Today's contracts, rolling over to a new set at midnight UTC. */
export function contracts() {
  const st = store.data.contracts;
  const day = dayKey();
  if (st.day !== day || !st.list || st.list.length !== 3) {
    st.day = day;
    st.list = pickContracts(day, rushOpen());
    store.save();
  }
  return st.list;
}
export const contractDef = (c) => POOL.find((p) => p.id === c.id);
export const contractText = (c) => contractDef(c).text(c.need);
export const contractTier = (c) => TIERS[c.tier];
export const contractReward = (c) => BALANCE.sigils.contracts[c.tier];
/** Milliseconds until the next set. */
export function contractsResetIn(now) {
  const d = now || new Date();
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - d.getTime();
}

/** What one run counts for, per contract kind. */
function amount(id, r) {
  switch (id) {
    case "kills": return r.kills || 0;
    case "bosses": return r.bosses || 0;
    case "wave": return r.rush ? 0 : r.wave || 0;
    case "perfects": return r.perfects || 0;
    case "stars": return r.stars || 0;
    case "combo": return r.combo || 0;
    case "hard": return r.rush || (r.difficulty !== "hard" && r.difficulty !== "nightmare") ? 0 : r.wave || 0;
    case "runs": return (r.wave || 0) >= 3 || (r.rush && r.bosses > 0) ? 1 : 0;
    case "rush": return r.rush ? r.bosses || 0 : 0;
    default: return 0;
  }
}

/** Files a finished (or quit) run against today's contracts. Pays any it completes; returns those. */
export function reportRun(r, force) {
  if (G.debug.on && !force) return [];
  const done = [];
  for (const c of contracts()) {
    if (c.done) continue;
    const n = amount(c.id, r);
    if (!n) continue;
    c.have = contractDef(c).how === "max" ? Math.max(c.have, n) : c.have + n;
    if (c.have >= c.need) {
      c.have = c.need;
      c.done = true;
      const paid = force ? contractReward(c) : earnSigils(contractReward(c), "contract", true);
      done.push({ text: contractText(c), sigils: paid });
    }
  }
  store.save(true);
  if (done.length) G.emit("contracts", done);
  return done;
}
