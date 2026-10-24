/* Saved bests, settings and unlocks. Every read and write is wrapped, so the game still
   runs (without saving) when storage is blocked, full or in a private window. */

const KEY = "eg-glider-v1";

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}
function coarsePointer() {
  try { return window.matchMedia("(pointer: coarse)").matches; } catch (e) { return false; }
}

export const SUITS = [
  { id: "classic", name: "Classic", wave: 0, suit: "#eef2ff", trim: "#38e8ff", visor: "#8e44ff" },
  { id: "violet", name: "Violet", wave: 5, suit: "#d9c8ff", trim: "#a57bff", visor: "#ff42d0" },
  { id: "mint", name: "Mint", wave: 10, suit: "#d6fff1", trim: "#73ffce", visor: "#38e8ff" },
  { id: "magenta", name: "Magenta", wave: 15, suit: "#ffd6f4", trim: "#ff42d0", visor: "#8e44ff" },
  { id: "gold", name: "Gold", wave: 20, suit: "#fff1cc", trim: "#ffc861", visor: "#ff42d0" },
  { id: "void", name: "Void", wave: 25, suit: "#2a2f55", trim: "#63f4ff", visor: "#63f4ff" },
];

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
      // crosshair
      crossColor: "auto",   // auto (inverts what's behind it) | cyan | white | yellow | lime | magenta | red | orange | custom
      crossCustom: "#63f4ff",
      crossSize: 100,       // %
      crossStyle: "ring",   // ring | cross | dot | ringcross
      crossOutline: true,
      crossTarget: true,    // turns red over a robot
    },
    seenHowTo: false,
    rotateHintDismissed: false,
  };
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
        };
        // v3 saves: auto-aim became a mode, screen shake a strength
        const st = data.settings;
        if (st.autoAim === true) st.autoAim = "auto";
        else if (st.autoAim === false) st.autoAim = "off";
        if (saved.settings && saved.settings.shakeAmt === undefined && saved.settings.shake === false) st.shakeAmt = 0;
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

  suitUnlocked(s) { return (data.best.wave || 0) >= s.wave; },
};
