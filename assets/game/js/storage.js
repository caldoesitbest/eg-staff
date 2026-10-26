/* Saved bests, settings and unlocks. Every read and write is wrapped, so the game still
   runs (without saving) when storage is blocked, full or in a private window. */

import { BALANCE } from "./balance.js";
import { DEFAULT_KEYS, cleanKeys } from "./keys.js";

const KEY = "eg-glider-v1";
// Save format version. 1: up to 4.1. 2 (4.2): Boss Rush records, achievements, cosmetics, lifetime stats.
// 3 (4.2): Sigils and hats. 4 (4.3): one cosmetics inventory (owned), loadout presets, daily contracts.
// 5 (4.4): friends (social.js): per account, the friends list, requests and blocks; per device, privacy choices.
// 6 (4.5): the Sigil economy: prices x5 (balances x5 with them), achievements by tier, one-time firsts (claims),
//    daily caps (sigilDay), the tutorial.
const SAVE_VER = 6;

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}
function coarsePointer() {
  try { return window.matchMedia("(pointer: coarse)").matches; } catch (e) { return false; }
}

// Suits, and every other cosmetic, are in catalog.js (4.3).

// Graphics presets fill in these settings (Auto uses High and steps down on its own when frames are slow).
export const GFX_KEYS = ["resScale", "particles", "glow", "background", "grid", "trails"];
export const GFX_PRESETS = {
  high:   { resScale: 1, particles: "high", glow: true, background: "full", grid: true, trails: true },
  medium: { resScale: 0.85, particles: "medium", glow: true, background: "simple", grid: true, trails: true },
  low:    { resScale: 0.7, particles: "low", glow: false, background: "simple", grid: true, trails: false },
  potato: { resScale: 0.5, particles: "minimal", glow: false, background: "off", grid: false, trails: false },
};

function defaults() {
  return {
    best: { score: 0, wave: 0, combo: 0, kills: 0, rung: 0, wins: 0, fastestWin: 0 },   // rung: sin bosses beaten (0-7)
    totals: { runs: 0, kills: 0 },
    daily: { date: "", score: 0, wave: 0, tries: 0 },
    settings: {
      sfx: 0.8,
      music: 0.5,
      muted: false,
      shake: true,
      reducedMotion: prefersReducedMotion(),
      autoAim: coarsePointer() ? "auto" : "off",   // "off" | "assist" | "auto"
      showFps: false,
      quality: "auto",      // graphics preset: auto | high | medium | low | potato | custom
      haptics: true,
      suit: "classic",
      postScores: true,     // post runs to the online leaderboard when signed in
      // graphics (presets fill these in; changing one makes the preset "custom")
      resScale: 1,
      particles: "high",    // high | medium | low | minimal
      glow: true,
      background: "full",   // full | simple | off
      grid: true,
      trails: true,
      // display + comfort (not part of presets)
      fpsCap: 0,            // 0 = match the screen
      shakeAmt: 100,        // %
      flashes: true,
      dmgNumbers: "all",    // all | crits | off
      arrows: true,         // off-screen robot markers
      lookahead: true,      // camera leans toward your aim
      contrastShots: false, // bolder robot shots
      hitstop: "light",     // impact freeze on big hits: full | light | off
      difficulty: "normal", // normal | hard | nightmare (the Daily Challenge is always Normal)
      mode: "ladder",       // the Hangar's mode: ladder | daily | rush | coop
      // crosshair
      crossColor: "auto",   // auto (inverts what's behind it) | cyan | white | yellow | lime | magenta | red | orange | custom
      crossCustom: "#63f4ff",
      crossSize: 100,       // %
      crossStyle: "ring",   // ring | cross | dot | ringcross
      crossOutline: true,
      crossTarget: true,    // turns red over a robot
      // 4.6
      keys: { ...DEFAULT_KEYS },   // keyboard bindings (keys.js)
      hudScale: 100,        // % (hearts, score and the buttons in a run)
    },
    seenHowTo: false,
    rotateHintDismissed: false,
    paid: { uid: "", total: 0, at: 0 },   // 4.7: Sigils bought with money, as the server last said (sigilshop.js)
    ver: SAVE_VER,
    // Boss Rush: clears, and per difficulty your best run ({ time, score, hits, mods, splits }) and best split per boss
    rush: { clears: 0, best: {}, splits: {}, mods: [] },
    seenMut: {},          // elite mutations you've met (their hint shows once)
    achv: {},             // achievements: id -> when (progress.js)
    cos: { visor: "", trail: "", finish: "", title: "", victory: "", badges: [], hat: "crown" },   // the cosmetics you picked
    life: { perfects: 0, mutants: 0, fusions: {}, evos: {}, evoGuns: {}, rushClears: 0, sigils: 0 },   // lifetime counts (achievements, Sigils earned)
    sigils: 0,            // the Hangar's currency (catalog.js)
    owned: {},            // cosmetics you bought: "kind:id" -> when (catalog.js)
    presets: [null, null, null],   // three saved outfits (catalog.js)
    contracts: { day: "", list: [] },   // today's contracts (contracts.js)
    shopSeen: "",         // the last day you looked at the Item Shop's featured row
    social: { prefs: {}, acct: {} },   // friends (social.js): prefs on this device, and per account code its friends, requests and blocks
    claims: {},           // one-time Sigil rewards already paid: "boss:sloth:hard", "win:nightmare", "rush:normal" (catalog.js)
    sigilDay: { day: "", run: 0, rush: 0 },   // today's capped Sigils: from runs, Boss Rush clears paid
    tutorial: 0,          // 0: not done, 1: finished or skipped (tutorial.js)
    xp: 0,                // your XP (xp.js makes your level from it)
    xpDay: "",            // the day your first run's bonus was used
  };
}

/** Brings an older save up to this version (only ever adds things: nothing you earned is lost). */
function migrate(d, saved) {
  const from = saved.ver || 1;
  if (from < 2) {
    // 4.2: Boss Rush opens for anyone who already beat Envy; achievements you clearly earned already count
    d.rush = { clears: 0, best: {}, splits: {}, mods: [] };
    const now = Date.now();
    if ((d.best.wins || 0) > 0) d.achv.ladder = now;
    if ((d.best.wave || 0) >= 50) d.achv.beyond = now;
  }
  if (from < 3) {
    // Sigils arrive: the achievements you already have pay out, as if earned today (3 each, the 4.2 rate)
    d.sigils = (d.sigils || 0) + Object.keys(d.achv || {}).length * 3;
  }
  if (from < 4) {
    // 4.3: hats bought in 4.2 join the one cosmetics inventory
    for (const id of Object.keys(saved.hats || {})) d.owned["hat:" + id] = saved.hats[id];
    delete d.hats;
  }
  if (from < 6) {
    // 4.5: Sigils are worth more. Prices went x5, so balances go x5 (what you could buy, you still can), and the
    // achievements you'd earned are topped up to what they pay now (they paid 3, which is 15 at the new scale).
    const SG = BALANCE.sigils, k = SG.rescale;
    d.sigils = Math.round((d.sigils || 0) * k);
    d.life.sigils = Math.round((d.life.sigils || 0) * k);
    let top = 0;
    for (const id of Object.keys(d.achv || {})) top += Math.max(0, SG.achv[SG.achvTier[id] || 0] - 3 * k);
    d.sigils += top; d.life.sigils += top;
    // firsts you'd already done are counted as done (their achievements were just topped up instead)
    const c = d.claims || (d.claims = {});
    const now = Date.now();
    if (d.achv.ladder) c["win:normal"] = now;
    if (d.achv.hard) c["win:hard"] = now;
    if (d.achv.nightmare) c["win:nightmare"] = now;
    if (d.achv.gauntlet || (d.rush && d.rush.clears > 0)) c["rush:normal"] = now;
    BALANCE.bosses.order.slice(0, d.best.rung || 0).forEach((b) => { c["boss:" + b + ":normal"] = now; });
    // a player who's already played doesn't need the tutorial
    if ((d.totals.runs || 0) > 0) d.tutorial = 1;
  }
  d.ver = SAVE_VER;
  return d;
}

let data = defaults();
let writable = true;
let saveTimer = 0;

export const store = {
  get data() { return data; },
  get writable() { return writable; },

  load() {
    let raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { writable = false; }
    try {
      // Desktop app: the launcher also keeps a copy on disk; use whichever has seen more runs.
      const disk = typeof window.__EG_DESKTOP_SAVE === "string" ? window.__EG_DESKTOP_SAVE : null;
      if (disk) {
        try {
          const a = raw ? JSON.parse(raw) : null, b = JSON.parse(disk);
          if (!a || ((b.totals && b.totals.runs) || 0) > ((a.totals && a.totals.runs) || 0)) raw = disk;
        } catch (e) { /* keep localStorage */ }
      }
      if (raw) {
        const saved = JSON.parse(raw);
        const d = defaults();
        data = {
          ...d,
          ...saved,
          best: { ...d.best, ...(saved.best || {}) },
          totals: { ...d.totals, ...(saved.totals || {}) },
          settings: { ...d.settings, ...(saved.settings || {}) },
          daily: { ...d.daily, ...(saved.daily || {}) },
          rush: { ...d.rush, ...(saved.rush || {}) },
          achv: { ...(saved.achv || {}) },
          owned: { ...(saved.owned || {}) },
          presets: Array.isArray(saved.presets) && saved.presets.length === 3 ? saved.presets : [null, null, null],
          contracts: saved.contracts && Array.isArray(saved.contracts.list) ? saved.contracts : { day: "", list: [] },
          cos: { ...d.cos, ...(saved.cos || {}) },
          life: { ...d.life, ...(saved.life || {}) },
          social: saved.social && typeof saved.social === "object" ? { prefs: { ...(saved.social.prefs || {}) }, acct: { ...(saved.social.acct || {}) } } : d.social,
          claims: { ...(saved.claims || {}) },
          sigilDay: { ...d.sigilDay, ...(saved.sigilDay || {}) },
        };
        migrate(data, saved);
        // v3 saves: auto-aim became a mode, screen shake a strength
        const st = data.settings;
        if (st.autoAim === true) st.autoAim = "auto";
        else if (st.autoAim === false) st.autoAim = "off";
        if (saved.settings && saved.settings.shakeAmt === undefined && saved.settings.shake === false) st.shakeAmt = 0;
        st.keys = cleanKeys(st.keys);
        st.hudScale = Math.max(80, Math.min(140, Number(st.hudScale) || 100));
      }
    } catch (e) {
      data = defaults();
    }
    return data;
  },

  save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      const json = JSON.stringify(data);
      try { window.localStorage.setItem(KEY, json); writable = true; } catch (e) { writable = false; }
      // Desktop app: mirror the save to a file next to the game (survives cache clears and crashes)
      try { if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage({ type: "save", data: json }); } catch (e) { /* not the desktop app */ }
    };
    if (now) write(); else saveTimer = setTimeout(write, 250);
  },

  /** Boss Rush opens once you've beaten Envy on the Ladder. */
  rushUnlocked() { return (data.best.wins || 0) > 0 || (data.rush && data.rush.clears > 0); },
};
