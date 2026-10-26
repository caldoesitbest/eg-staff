/* Key bindings (4.6): which key does what on a keyboard (Settings > Controls), and how a key is written on screen.
   The arrow keys always move, Shift always boosts, and Esc / P, Tab, Enter and 1-4 stay with menus and pausing. */

export const DEFAULT_KEYS = { up: "KeyW", left: "KeyA", down: "KeyS", right: "KeyD", boost: "Space", charge: "KeyE", swap: "KeyQ", aim: "KeyT", build: "KeyI" };

/** In the order Settings lists them. */
export const KEY_ACTIONS = [
  ["up", "Move up"], ["left", "Move left"], ["down", "Move down"], ["right", "Move right"],
  ["boost", "Boost"], ["charge", "Charged shot"], ["swap", "Swap gun"], ["aim", "Auto-aim (cycle)"], ["build", "Your build"],
];

export const RESERVED = new Set(["Escape", "KeyP", "Tab", "Enter", "NumpadEnter", "Digit1", "Digit2", "Digit3", "Digit4",
  "Numpad1", "Numpad2", "Numpad3", "Numpad4", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight",
  "F11", "F12", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu"]);

let binds = { ...DEFAULT_KEYS };

/** The current bindings. */
export const keys = () => binds;

/** A saved set, checked: unknown or reserved keys and doubles fall back to the defaults. */
export function cleanKeys(k) {
  const src = k && typeof k === "object" ? k : {};
  const out = {}, used = new Set();
  for (const [a] of KEY_ACTIONS) {
    const c = src[a];
    if (typeof c === "string" && /^[A-Za-z0-9]{2,24}$/.test(c) && !RESERVED.has(c) && !used.has(c)) { out[a] = c; used.add(c); }
  }
  // anything missing (or doubled up) gets its default if that's free, else stays unbound until it's set again
  for (const [a] of KEY_ACTIONS) if (!out[a] && !used.has(DEFAULT_KEYS[a])) { out[a] = DEFAULT_KEYS[a]; used.add(out[a]); }
  for (const [a] of KEY_ACTIONS) if (!out[a]) out[a] = "";
  return out;
}

export function setKeys(k) { binds = cleanKeys(k); return binds; }

/** Binds `action` to `code`. If another action had that key, it takes this action's old one. Returns the new set. */
export function rebind(action, code) {
  if (!(action in DEFAULT_KEYS) || RESERVED.has(code)) return binds;
  const next = { ...binds };
  const other = Object.keys(next).find((a) => a !== action && next[a] === code);
  if (other) next[other] = next[action];
  next[action] = code;
  binds = next;
  return binds;
}

const NAMES = {
  Space: "Space", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";",
  Quote: "'", Comma: ",", Period: ".", Slash: "/", CapsLock: "Caps", Backspace: "Bksp", ControlLeft: "Ctrl", ControlRight: "R Ctrl",
  AltLeft: "Alt", AltRight: "R Alt", Delete: "Del", Insert: "Ins", Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
  IntlBackslash: "\\", NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *", NumpadDivide: "Num /", NumpadDecimal: "Num .",
};

/** "KeyW" → "W", "Space" → "Space", "Numpad5" → "Num 5". */
export function keyName(code) {
  if (!code) return "none";
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return "Num " + code.slice(6);
  return code;
}

/** A key as a <kbd> for hint text. */
export const kbd = (action) => "<kbd>" + keyName(binds[action]).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]) + "</kbd>";

/** The four movement keys as hint text: "WASD" when they're single letters, else "E / S / D / F". */
export function moveKeys(sep = "") {
  const n = ["up", "left", "down", "right"].map((a) => keyName(binds[a]));
  return n.every((x) => x.length === 1) ? n.join(sep) : n.join(" / ");
}
