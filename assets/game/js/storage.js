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

function defaults() {
  return {
    best: { score: 0, wave: 0, combo: 0, kills: 0 },
    totals: { runs: 0, kills: 0 },
    settings: {
      sfx: 0.8,
      music: 0.5,
      muted: false,
      shake: true,
      reducedMotion: prefersReducedMotion(),
      autoAim: coarsePointer(),
      showFps: false,
      quality: "auto",
      haptics: true,
      suit: "classic",
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
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const d = defaults();
        data = {
          ...d,
          ...saved,
          best: { ...d.best, ...(saved.best || {}) },
          totals: { ...d.totals, ...(saved.totals || {}) },
          settings: { ...d.settings, ...(saved.settings || {}) },
        };
      }
    } catch (e) {
      writable = false;
      data = defaults();
    }
    return data;
  },

  save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      try { window.localStorage.setItem(KEY, JSON.stringify(data)); writable = true; } catch (e) { writable = false; }
    };
    if (now) write(); else saveTimer = setTimeout(write, 250);
  },

  suitUnlocked(s) { return (data.best.wave || 0) >= s.wave; },
};
