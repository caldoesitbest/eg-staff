/* Cloud saves (4.5): your items, Sigils, XP, achievements and records follow your account between the website,
   the Windows app and the Android app. It needs you signed in and the 4.5 server update (docs/game-4.5.sql: a
   private table and two functions); without them it does nothing and the game saves on the device as always.

   How saves merge without losing or doubling anything:
   - Things you own (items, achievements, one-time rewards) are a union: own it anywhere, own it everywhere.
   - Sigils and XP are counted per device (a ledger): what each device started with, earned and spent. The balance
     is the sum over every device, so a purchase on the website and a run in the app both count, once each, and
     syncing twice changes nothing.
   - Records keep the best; your outfit and loadouts follow whichever device saved last.
   "Restore my items" (Profile) pulls the cloud copy in, merges it, and says what came back. */

import { G } from "./state.js";
import { store } from "./storage.js";
import { online } from "./online.js";

const sb = () => (window.EG && window.EG.sb) || null;
const sum = (o) => Object.values(o || {}).reduce((s, n) => s + (Number(n) || 0), 0);
const maxMap = (a, b) => { const o = { ...(a || {}) }; for (const k in b || {}) o[k] = Math.max(Number(o[k]) || 0, Number(b[k]) || 0); return o; };
const unionMap = (a, b) => { const o = { ...(a || {}) }; for (const k in b || {}) if (!(k in o) || (b[k] && b[k] < o[k])) o[k] = b[k]; return o; };

/** The ledger: one per save, a device id and per-device counters. Created the first time a 4.5 save loads. */
export function ledger(d = store.data) {
  if (!d.ledger || !d.ledger.dev) {
    const dev = "d" + Math.random().toString(36).slice(2, 10);
    d.ledger = { dev, base: { [dev]: d.sigils || 0 }, earned: {}, spent: {}, xpBase: { [dev]: d.xp || 0 }, xp: {} };
  }
  for (const k of ["base", "earned", "spent", "xpBase", "xp"]) if (!d.ledger[k]) d.ledger[k] = {};
  return d.ledger;
}
/** Counts Sigils earned / spent and XP gained on this device (catalog.js, xp.js call it). */
export function ledgerAdd(kind, n) {
  if (!(n > 0)) return;
  const L = ledger();
  L[kind][L.dev] = (L[kind][L.dev] || 0) + n;
  dirty = true;
}

/** What goes to the cloud: everything that's yours, nothing that's this device's preference. */
function pack() {
  const d = store.data;
  return {
    v: 1, at: Date.now(),
    owned: d.owned, achv: d.achv, claims: d.claims || {}, ledger: ledger(),
    best: d.best, totals: d.totals, rush: { clears: d.rush.clears, best: d.rush.best, splits: d.rush.splits },
    contracts: d.contracts, sigilDay: d.sigilDay, cos: d.cos, suit: d.settings.suit, presets: d.presets, lookAt: d.lookAt || 0,
    life: { ...d.life }, tutorial: d.tutorial || 0, xpDay: d.xpDay || "", daily: d.daily,
  };
}

/** Merges a cloud copy into this save (pure on the inputs; returns what changed). */
export function mergeInto(d, c) {
  if (!c || typeof c !== "object") return { items: 0, sigils: 0, xp: 0 };
  const before = { items: Object.keys(d.owned || {}).length, sigils: d.sigils || 0, xp: d.xp || 0 };
  d.owned = unionMap(d.owned, c.owned);
  d.achv = unionMap(d.achv, c.achv);
  d.claims = unionMap(d.claims, c.claims);
  // the ledger: every device's counters, the bigger of each (a counter only ever goes up)
  const L = ledger(d), C = c.ledger || {};
  for (const k of ["base", "earned", "spent", "xpBase", "xp"]) L[k] = maxMap(L[k], C[k]);
  d.sigils = Math.max(0, Math.round(sum(L.base) + sum(L.earned) - sum(L.spent) + ((d.paid && d.paid.total) || 0)));   // 4.7: plus what the account bought
  d.xp = Math.max(0, Math.round(sum(L.xpBase) + sum(L.xp)));
  // records: the best of each
  for (const k in c.best || {}) {
    const a = d.best[k], b = c.best[k];
    if (typeof b !== "number") continue;
    d.best[k] = k === "fastestWin" ? (a ? Math.min(a, b) : b) : Math.max(a || 0, b);
  }
  for (const k in c.totals || {}) if (typeof c.totals[k] === "number") d.totals[k] = Math.max(d.totals[k] || 0, c.totals[k]);
  if (c.rush) {
    d.rush.clears = Math.max(d.rush.clears || 0, c.rush.clears || 0);
    for (const df in c.rush.best || {}) { const a = d.rush.best[df], b = c.rush.best[df]; if (b && (!a || (b.score || 0) > (a.score || 0))) d.rush.best[df] = b; }
    for (const df in c.rush.splits || {}) { d.rush.splits[df] = d.rush.splits[df] || {}; for (const bs in c.rush.splits[df]) { const a = d.rush.splits[df][bs], b = c.rush.splits[df][bs]; if (b && (!a || b < a)) d.rush.splits[df][bs] = b; } }
  }
  for (const k in c.life || {}) if (k !== "sigils" && typeof c.life[k] === "number") d.life[k] = Math.max(d.life[k] || 0, c.life[k]);
  for (const k of ["fusions", "evos", "evoGuns"]) if (c.life && c.life[k]) d.life[k] = { ...(d.life[k] || {}), ...c.life[k] };
  d.life.sigils = Math.max(d.life.sigils || 0, sum(L.earned) + sum(L.base));
  // today's contracts: the same day merges progress (and what's paid stays paid); a newer day wins
  if (c.contracts && c.contracts.day) {
    if (!d.contracts.day || c.contracts.day > d.contracts.day) d.contracts = c.contracts;
    else if (c.contracts.day === d.contracts.day && Array.isArray(c.contracts.list)) {
      d.contracts.list.forEach((x, i) => { const y = c.contracts.list[i]; if (y && y.id === x.id) { x.have = Math.max(x.have, y.have); x.done = x.done || y.done; } });
    }
  }
  if (c.sigilDay && c.sigilDay.day) {
    if (!d.sigilDay || c.sigilDay.day > d.sigilDay.day) d.sigilDay = { ...c.sigilDay };
    else if (c.sigilDay.day === d.sigilDay.day) { d.sigilDay.run = Math.max(d.sigilDay.run || 0, c.sigilDay.run || 0); d.sigilDay.rush = Math.max(d.sigilDay.rush || 0, c.sigilDay.rush || 0); }
  }
  d.tutorial = Math.max(d.tutorial || 0, c.tutorial || 0);
  if (c.xpDay && c.xpDay > (d.xpDay || "")) d.xpDay = c.xpDay;
  if (c.daily && c.daily.date && (!d.daily.date || c.daily.date > d.daily.date || (c.daily.date === d.daily.date && (c.daily.score || 0) > (d.daily.score || 0)))) d.daily = { ...d.daily, ...c.daily };
  // your look follows whichever device saved last
  if ((c.lookAt || 0) > (d.lookAt || 0)) {
    d.lookAt = c.lookAt;
    if (c.cos) d.cos = { ...d.cos, ...c.cos };
    if (c.suit) d.settings.suit = c.suit;
    if (Array.isArray(c.presets) && c.presets.length === 3) d.presets = c.presets;
  }
  return { items: Object.keys(d.owned).length - before.items, sigils: d.sigils - before.sigils, xp: d.xp - before.xp };
}

let dirty = false, busy = null, rev = 0, timer = 0;
export const cloud = {
  /** "off" (signed out), "missing" (no 4.5 server update), "ok", "error". */
  state: "off",
  last: 0,
  get dirty() { return dirty; },
  markDirty() { dirty = true; },

  /** Pull, merge, push. Resolves what changed (for the restore button). */
  async sync(reason) {
    if (busy) return busy;
    if (!sb() || !online.user || G.debug.on && !new URLSearchParams(location.search).get("cloud")) { this.state = online.user ? this.state : "off"; return null; }
    busy = (async () => {
      try {
        const got = await sb().rpc("game_save_get");
        if (got.error) { this.state = /could not find|PGRST202|does not exist|42883/i.test(got.error.message + got.error.code) ? "missing" : "error"; return null; }
        const row = Array.isArray(got.data) ? got.data[0] : got.data;
        let changed = { items: 0, sigils: 0, xp: 0 };
        if (row && row.data) { changed = mergeInto(store.data, row.data); rev = row.rev || 0; }
        else rev = 0;
        store.save(true);
        // push our merged copy (a newer one from elsewhere: merge that and try once more)
        for (let tries = 0; tries < 2; tries++) {
          const put = await sb().rpc("game_save_put", { p_data: pack(), p_rev: rev + 1 });
          const r = Array.isArray(put.data) ? put.data[0] : put.data;
          if (put.error) { this.state = "error"; return changed; }
          if (r && r.ok) { rev = r.rev; break; }
          const again = await sb().rpc("game_save_get");
          const row2 = again.data && (Array.isArray(again.data) ? again.data[0] : again.data);
          if (row2 && row2.data) { const c2 = mergeInto(store.data, row2.data); changed.items += c2.items; changed.sigils += c2.sigils; changed.xp += c2.xp; rev = row2.rev || rev; }
        }
        dirty = false;
        this.state = "ok";
        this.last = Date.now();
        G.emit("cloud", { reason, changed });
        return changed;
      } catch (e) { this.state = "error"; return null; }
      finally { busy = null; }
    })();
    return busy;
  },
  /** Saves soon (after a run, a purchase): bundles a burst of changes into one push. */
  soon(ms) { dirty = true; clearTimeout(timer); timer = setTimeout(() => this.sync("auto"), ms || 4000); },
  init() {
    G.on("auth", () => { if (online.user) this.sync("signin"); else this.state = "off"; });
    G.on("bought", () => this.soon(2500));
    G.on("look", () => { store.data.lookAt = Date.now(); this.soon(6000); });
    G.on("levelUp", () => this.soon(3000));
    setInterval(() => { if (dirty && online.user) this.sync("auto"); }, 120000);
    document.addEventListener("visibilitychange", () => { if (document.hidden && dirty && online.user) this.sync("hide"); });
  },
};
