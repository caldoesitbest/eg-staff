/* Neon vector art drawn in code and pre-rendered once to offscreen canvases (glow baked in),
   so the hot loop only does drawImage. Rebuilt when the zoom/pixel ratio changes. */

import { TAU } from "./util.js";
import { BALANCE } from "./balance.js";

export const C = {
  bg: "#030518", bg2: "#04050f",
  cyan: "#63f4ff", cyan2: "#38e8ff", violet: "#8e44ff", violet2: "#a57bff",
  magenta: "#ff42d0", mint: "#73ffce", amber: "#ffc861", danger: "#ff7d95",
  white: "#ffffff", orange: "#ff8a3d", red: "#ff3b5c", green: "#45f0a8", blue: "#5b86ff",
  heart: "#b26bff", steel: "#141a3c", steel2: "#232c5e", rock: "#2b2545",
};

// Particle palette (index → colour). Glow dots are pre-rendered per entry.
// The seven sins, in the homepage Ladder's colours.
export const SIN = {
  sloth: "#b8bfe0", glutton: "#ff4f8b", greed: "#ffd45c", lust: "#d77fb0", wrath: "#ff9448", pride: "#a98bff", envy: "#6d7bff",
};
export const PAL = [C.cyan, C.violet2, C.magenta, C.mint, C.amber, C.danger, C.white, C.orange, C.red, C.green, C.violet, C.heart, C.blue,
  SIN.sloth, SIN.glutton, SIN.greed, SIN.lust, SIN.wrath, SIN.pride, SIN.envy];
// Weapon evolutions bring their own colours (evolve.js looks them up by colour).
for (const gun in BALANCE.evolution) for (const path of ["a", "b"]) { const c = BALANCE.evolution[gun][path].col; if (PAL.indexOf(c) < 0) PAL.push(c); }
export const P_CYAN = 0, P_VIOLET = 1, P_MAGENTA = 2, P_MINT = 3, P_AMBER = 4, P_DANGER = 5, P_WHITE = 6,
  P_ORANGE = 7, P_RED = 8, P_GREEN = 9, P_DVIOLET = 10, P_HEART = 11, P_BLUE = 12,
  P_SLOTH = 13, P_GLUT = 14, P_GREED = 15, P_LUST = 16, P_WRATH = 17, P_PRIDE = 18, P_ENVY = 19;

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** size: world units (square). draw(g) draws around (0,0) in world units. */
function make(size, P, draw) {
  const px = Math.ceil(size * P);
  const c = canvas(px, px);
  const g = c.getContext("2d");
  g.setTransform(px / size, 0, 0, px / size, px / 2, px / 2);
  g.lineJoin = "round";
  g.lineCap = "round";
  draw(g, P);
  return { c, w: size, h: size };
}

function tinted(spr, color, alpha) {
  const c = canvas(spr.c.width, spr.c.height);
  const g = c.getContext("2d");
  g.drawImage(spr.c, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return { c, w: spr.w, h: spr.h };
}

const glow = (g, P, color, blur) => { g.shadowColor = color; g.shadowBlur = blur * P; };
const noGlow = (g) => { g.shadowBlur = 0; g.shadowColor = "transparent"; };

function poly(g, n, r, rot) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
function shapeFromPoints(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

// Body fill + glowing outline in one go.
function bodyStroke(g, P, accent, width = 2) {
  g.fillStyle = C.steel;
  g.fill();
  glow(g, P, accent, 8);
  g.strokeStyle = accent;
  g.lineWidth = width;
  g.stroke();
  noGlow(g);
}
function eye(g, P, x, y, r, color) {
  glow(g, P, color, 10);
  g.fillStyle = color;
  circle(g, x, y, r); g.fill();
  noGlow(g);
  g.fillStyle = "#fff";
  circle(g, x + r * 0.15, y, r * 0.45); g.fill();
}

// ---------- robots (all face +x) ----------
export const ROBOT_ART = {
  drone: { size: 46, accent: C.danger, draw(g, P, a) {
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(-3, s * 11.5, 6.5, 3, 0, 0, TAU);
      g.fillStyle = C.steel2; g.fill(); g.strokeStyle = a; g.lineWidth = 1.2; g.stroke();
    }
    poly(g, 6, 11.5, Math.PI / 6); bodyStroke(g, P, a);
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1; poly(g, 6, 7, Math.PI / 6); g.stroke();
    eye(g, P, 4.5, 0, 3.6, a);
  } },
  swarm: { size: 30, accent: "#c86bff", draw(g, P, a) {
    shapeFromPoints(g, [10, 0, -6, -7, -2.5, 0, -6, 7]); bodyStroke(g, P, a, 1.6);
    eye(g, P, 2, 0, 1.8, a);
  } },
  ripper: { size: 50, accent: C.amber, draw(g, P, a) {
    shapeFromPoints(g, [19, 0, 4, -6, -8, -14, -4, -5, -13, 0, -4, 5, -8, 14, 4, 6]); bodyStroke(g, P, a);
    g.strokeStyle = a; g.lineWidth = 1.4; g.beginPath(); g.moveTo(15, 0); g.lineTo(-6, 0); g.stroke();
    eye(g, P, 3, -3.6, 1.8, a); eye(g, P, 3, 3.6, 1.8, a);
  } },
  gunner: { size: 52, accent: C.violet2, draw(g, P, a) {
    g.fillStyle = "#0b0f26";
    rrect(g, -13, -16, 24, 6, 2); g.fill(); rrect(g, -13, 10, 24, 6, 2); g.fill();
    g.strokeStyle = "rgba(165,123,255,0.5)"; g.lineWidth = 1;
    for (let i = -11; i < 10; i += 4) { g.beginPath(); g.moveTo(i, -16); g.lineTo(i, -10); g.moveTo(i, 10); g.lineTo(i, 16); g.stroke(); }
    rrect(g, -12, -11, 22, 22, 5); bodyStroke(g, P, a);
    g.fillStyle = C.steel2; rrect(g, 3, -3, 19, 6, 2); g.fill();
    glow(g, P, a, 6); g.strokeStyle = a; g.lineWidth = 1.5; g.stroke(); noGlow(g);
    circle(g, 0, 0, 7.5); g.fillStyle = C.steel2; g.fill(); g.strokeStyle = a; g.lineWidth = 1.5; g.stroke();
    eye(g, P, 0, 0, 2.6, a);
  } },
  splitter: { size: 56, accent: C.magenta, draw(g, P, a) {
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU + 0.12, a1 = ((i + 1) / 3) * TAU - 0.12;
      const mid = (a0 + a1) / 2, ox = Math.cos(mid) * 1.6, oy = Math.sin(mid) * 1.6;
      g.beginPath(); g.moveTo(ox, oy); g.arc(ox, oy, 17, a0, a1); g.closePath();
      bodyStroke(g, P, a, 1.8);
    }
    circle(g, 0, 0, 6.5); g.fillStyle = C.steel2; g.fill();
    eye(g, P, 0, 0, 4, a);
  } },
  mini: { size: 32, accent: C.magenta, draw(g, P, a) {
    g.beginPath(); g.moveTo(-5, 0); g.arc(-5, 0, 13, -0.95, 0.95); g.closePath();
    bodyStroke(g, P, a, 1.5);
    eye(g, P, 3, 0, 2.2, a);
  } },
  bulwark: { size: 76, accent: C.blue, draw(g, P, a) {
    rrect(g, -17, -17, 30, 34, 8); bodyStroke(g, P, a, 2.2);
    g.strokeStyle = "rgba(91,134,255,0.35)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-12, -9); g.lineTo(8, -9); g.moveTo(-12, 9); g.lineTo(8, 9); g.stroke();
    eye(g, P, 5, 0, 3.4, C.amber);
    // shield arc out front
    const half = 0.98;
    glow(g, P, C.amber, 14);
    g.strokeStyle = C.amber; g.lineWidth = 6.5;
    g.beginPath(); g.arc(-4, 0, 27, -half, half); g.stroke();
    noGlow(g);
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 1.6;
    g.beginPath(); g.arc(-4, 0, 27, -half + 0.12, half - 0.12); g.stroke();
  } },
  // 4.5 mini-bosses: big, heavy, unmistakable
  warden: { size: 104, accent: C.amber, draw(g, P, a) {
    poly(g, 6, 27, Math.PI / 6); bodyStroke(g, P, a, 3);
    g.strokeStyle = "rgba(255,200,97,0.4)"; g.lineWidth = 1.6;
    poly(g, 6, 17, Math.PI / 6); g.stroke();
    for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU + Math.PI / 6; g.beginPath(); g.moveTo(Math.cos(t) * 17, Math.sin(t) * 17); g.lineTo(Math.cos(t) * 27, Math.sin(t) * 27); g.stroke(); }
    g.fillStyle = C.steel2; circle(g, 0, 0, 10); g.fill();
    eye(g, P, 4, 0, 5, C.amber);
    glow(g, P, C.blue, 8); g.fillStyle = C.blue;
    for (const [x, y] of [[-14, -14], [-14, 14]]) { circle(g, x, y, 2.6); g.fill(); }
    noGlow(g);
  } },
  lancer: { size: 96, accent: C.magenta, draw(g, P, a) {
    // a long arrowhead with twin blades swept back
    g.strokeStyle = "#9aa4cf"; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-6, -10); g.lineTo(-30, -24); g.moveTo(-6, 10); g.lineTo(-30, 24); g.stroke();
    glow(g, P, a, 10); g.strokeStyle = a; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-14, -15); g.lineTo(-32, -26); g.moveTo(-14, 15); g.lineTo(-32, 26); g.stroke(); noGlow(g);
    shapeFromPoints(g, [36, 0, 4, -13, -18, -7, -12, 0, -18, 7, 4, 13]); bodyStroke(g, P, a, 2.6);
    g.strokeStyle = "rgba(255,66,208,0.45)"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(28, 0); g.stroke();
    eye(g, P, 14, 0, 4, C.white);
    glow(g, P, C.magenta, 12); g.fillStyle = C.magenta; circle(g, -13, 0, 3.4); g.fill(); noGlow(g);
  } },
  siege: { size: 108, accent: C.orange, draw(g, P, a) {
    // treads, a heavy hull, a mortar barrel
    g.fillStyle = C.steel2;
    rrect(g, -26, -30, 50, 11, 4); g.fill(); rrect(g, -26, 19, 50, 11, 4); g.fill();
    g.strokeStyle = "rgba(255,138,61,0.5)"; g.lineWidth = 1.2;
    for (let x = -22; x < 22; x += 7) { g.beginPath(); g.moveTo(x, -30); g.lineTo(x, -19); g.moveTo(x, 19); g.lineTo(x, 30); g.stroke(); }
    rrect(g, -22, -18, 42, 36, 9); bodyStroke(g, P, a, 3);
    g.fillStyle = "#2a3366"; rrect(g, 6, -6, 30, 12, 4); g.fill();
    g.strokeStyle = a; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#0b0f26"; circle(g, 36, 0, 4.4); g.fill();
    eye(g, P, -6, 0, 5.5, C.orange);
    glow(g, P, C.red, 8); g.fillStyle = C.red;
    circle(g, -16, -11, 2.2); g.fill(); circle(g, -16, 11, 2.2); g.fill();
    noGlow(g);
  } },
  boomer: { size: 50, accent: C.orange, draw(g, P, a) {
    g.strokeStyle = "#8b8fb5"; g.lineWidth = 2; g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(-19, -5, -21, 1); g.stroke();
    eye(g, P, -21, 1, 2.2, C.amber);
    circle(g, 0, 0, 14); bodyStroke(g, P, a, 2.2);
    g.save(); circle(g, 0, 0, 13); g.clip();
    g.fillStyle = "rgba(255,138,61,0.32)";
    g.fillRect(-14, -9, 28, 4); g.fillRect(-14, 5, 28, 4);
    g.restore();
    // warning triangle face
    glow(g, P, C.red, 8);
    g.fillStyle = C.red; shapeFromPoints(g, [9, 0, 1, -5, 1, 5]); g.fill();
    noGlow(g);
  } },
  sniper: { size: 72, accent: C.red, draw(g, P, a) {
    g.strokeStyle = "#9aa4cf"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(8, 0); g.lineTo(31, 0); g.stroke();
    glow(g, P, a, 6); g.strokeStyle = a; g.lineWidth = 1; g.beginPath(); g.moveTo(26, -2.5); g.lineTo(31, -2.5); g.stroke(); noGlow(g);
    shapeFromPoints(g, [16, 0, -6, -9, -16, 0, -6, 9]); bodyStroke(g, P, a);
    g.strokeStyle = "rgba(255,59,92,0.4)"; g.lineWidth = 1; g.beginPath(); g.moveTo(-11, 0); g.lineTo(10, 0); g.stroke();
    eye(g, P, 4, 0, 3, a);
  } },
  gem: { size: 44, accent: "#a98bff", draw(g, P, a) {
    shapeFromPoints(g, [0, -15, 12, -4, 8, 13, -8, 13, -12, -4]);
    glow(g, P, a, 12);
    const grd = g.createLinearGradient(-12, -15, 12, 13);
    grd.addColorStop(0, "#efe6ff"); grd.addColorStop(0.45, a); grd.addColorStop(1, "#3a1f8a");
    g.fillStyle = grd; g.fill(); noGlow(g);
    g.strokeStyle = "#ffffff"; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-12, -4); g.lineTo(12, -4); g.moveTo(0, -15); g.lineTo(-4, -4); g.lineTo(0, 13); g.lineTo(4, -4); g.closePath(); g.stroke();
  } },
  patch: { size: 50, accent: C.green, draw(g, P, a) {
    g.strokeStyle = "#8b8fb5"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-8, -10); g.lineTo(-14, -18); g.stroke();
    eye(g, P, -14, -18, 2, a);
    rrect(g, -12, -12, 24, 24, 7); bodyStroke(g, P, a);
    glow(g, P, a, 10); g.fillStyle = a;
    g.fillRect(-2.6, -8, 5.2, 16); g.fillRect(-8, -2.6, 16, 5.2);
    noGlow(g);
    g.fillStyle = "#fff"; g.fillRect(-1, -6, 2, 12); g.fillRect(-6, -1, 12, 2);
  } },
};

// ---------- the crowned astronaut (faces right; flipped when aiming left) ----------
function drawAstronaut(g, P, suit) {
  const s = suit.suit, trim = suit.trim, visor = suit.visor;
  const dark = suit.dark || suit.id === "void" ? "#14183a" : "#8a93c2";
  // jetpack
  rrect(g, -15, -6, 9, 19, 3); g.fillStyle = dark; g.fill();
  glow(g, P, trim, 6); g.strokeStyle = trim; g.lineWidth = 1.2; g.stroke(); noGlow(g);
  // legs
  g.fillStyle = s;
  rrect(g, -7, 10, 6, 9, 3); g.fill();
  rrect(g, 1, 10, 6, 9, 3); g.fill();
  g.fillStyle = dark; g.fillRect(-7, 16, 6, 3); g.fillRect(1, 16, 6, 3);
  // body
  rrect(g, -9, -3, 18, 16, 6); g.fillStyle = s; g.fill();
  g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1; g.stroke();
  g.fillStyle = trim; g.fillRect(-4, 2, 8, 3);
  drawMark(g, P, suit.mark, trim, s);
  // back arm
  g.fillStyle = s; rrect(g, -11, 0, 5, 10, 2.5); g.fill();
  // helmet
  glow(g, P, trim, 10);
  circle(g, 0, -10, 11.5); g.fillStyle = s; g.fill();
  noGlow(g);
  g.strokeStyle = trim; g.lineWidth = 1.3; circle(g, 0, -10, 11.5); g.stroke();
  // visor
  const grd = g.createLinearGradient(0, -17, 8, -3);
  grd.addColorStop(0, visor);
  grd.addColorStop(1, "#14082e");
  g.beginPath(); g.ellipse(3.2, -10, 7.4, 6.4, 0, 0, TAU); g.fillStyle = grd; g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.stroke();
  if (suit.visorFx) drawVisorFx(g, P, suit.visorFx);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath(); g.ellipse(5.6, -13, 2.2, 1.3, -0.5, 0, TAU); g.fill();
  drawHat(g, P, suit.hat);
}

// ---------- suit emblems: a small mark on the chest in the trim colour (catalog.js picks one per suit) ----------
function drawMark(g, P, mark, col, bg) {
  const x = 3, y = 8.4;
  glow(g, P, col, 6);
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.9;
  if (mark === "moon") {
    circle(g, x, y, 2.5); g.fill(); noGlow(g);
    g.fillStyle = bg; circle(g, x + 1.3, y - 0.9, 2.1); g.fill();
  } else if (mark === "core") {
    circle(g, x, y, 2.6); g.stroke(); circle(g, x, y, 1.2); g.fill();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.fillRect(x + Math.cos(a) * 3.3 - 0.4, y + Math.sin(a) * 3.3 - 0.4, 0.8, 0.8); }
  } else if (mark === "coin") {
    circle(g, x, y, 2.6); g.fill(); noGlow(g);
    g.strokeStyle = bg; g.lineWidth = 0.6; circle(g, x, y, 1.7); g.stroke();
    g.fillStyle = bg; g.fillRect(x - 0.35, y - 1.3, 0.7, 2.6);
  } else if (mark === "heart") {
    g.save(); g.translate(x, y + 0.2); heartPath(g, 2.5); g.fill(); g.restore();
  } else if (mark === "flame") {
    g.beginPath(); g.moveTo(x, y - 3.2); g.quadraticCurveTo(x + 3, y + 0.2, x, y + 2.8); g.quadraticCurveTo(x - 3, y + 0.2, x, y - 3.2); g.fill();
    noGlow(g); g.fillStyle = "#ffd45c";
    g.beginPath(); g.moveTo(x, y - 0.6); g.quadraticCurveTo(x + 1.4, y + 1, x, y + 2.2); g.quadraticCurveTo(x - 1.4, y + 1, x, y - 0.6); g.fill();
  } else if (mark === "crown") {
    shapeFromPoints(g, [x - 2.7, y + 1.9, x - 2.7, y - 1.3, x - 1.3, y + 0.1, x, y - 2.4, x + 1.3, y + 0.1, x + 2.7, y - 1.3, x + 2.7, y + 1.9]); g.fill();
  } else if (mark === "eye") {
    g.beginPath(); g.ellipse(x, y, 2.9, 1.6, 0, 0, TAU); g.fill(); noGlow(g);
    g.fillStyle = "#14082e"; circle(g, x, y, 0.95); g.fill();
    g.fillStyle = "#ffffff"; circle(g, x - 0.35, y - 0.4, 0.3); g.fill();
  } else if (mark === "star") {
    g.save(); g.translate(x, y); starPath(g, 2.8, 1.15); g.fill(); g.restore();
  } else if (mark === "spark") {
    g.beginPath(); g.moveTo(x, y - 3.2);
    g.quadraticCurveTo(x + 0.5, y - 0.5, x + 3.2, y); g.quadraticCurveTo(x + 0.5, y + 0.5, x, y + 3.2);
    g.quadraticCurveTo(x - 0.5, y + 0.5, x - 3.2, y); g.quadraticCurveTo(x - 0.5, y - 0.5, x, y - 3.2); g.fill();
  } else if (mark === "swirl") {
    g.lineWidth = 0.8; g.lineCap = "round";
    g.beginPath(); g.arc(x, y, 2.6, 0.2, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.arc(x + 0.5, y + 0.3, 1.3, Math.PI * 0.8, Math.PI * 2.4); g.stroke();
    g.lineCap = "butt";
    circle(g, x + 0.4, y + 0.2, 0.5); g.fill();
  } else {
    circle(g, x, y, 1.4); g.fill();      // the original glow dot
  }
  noGlow(g);
}

// ---------- visor effects (catalog.js visors with fx) ----------
function drawVisorFx(g, P, fxId) {
  g.save();
  g.beginPath(); g.ellipse(3.2, -10, 7.4, 6.4, 0, 0, TAU); g.clip();
  if (fxId === "stars") {
    const neb = g.createRadialGradient(6, -7, 0, 6, -7, 6);
    neb.addColorStop(0, "rgba(255,66,208,0.45)"); neb.addColorStop(1, "rgba(255,66,208,0)");
    g.fillStyle = neb; g.fillRect(-5, -17, 16, 14);
    g.fillStyle = "#ffffff";
    for (const [sx, sy, r] of [[0, -12.5, 0.55], [5.2, -8, 0.45], [2, -5.6, 0.35], [7, -12.8, 0.4], [-1.6, -8.6, 0.3], [8.6, -7.4, 0.3]]) { circle(g, sx, sy, r); g.fill(); }
  } else if (fxId === "crack") {
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(5.6, -8.2); g.lineTo(9.6, -11.6); g.moveTo(5.6, -8.2); g.lineTo(1.6, -4.4);
    g.moveTo(5.6, -8.2); g.lineTo(1.4, -11.6); g.lineTo(-1.2, -11.2); g.moveTo(5.6, -8.2); g.lineTo(8.4, -3.8);
    g.moveTo(3.2, -6.6); g.lineTo(2.2, -8.4);
    g.stroke();
  } else if (fxId === "rim") {
    g.fillStyle = "rgba(99,244,255,0.22)";
    g.beginPath(); g.ellipse(1, -12.5, 7, 1.6, -0.35, 0, TAU); g.fill();
  }
  g.restore();
  if (fxId === "rim") {
    glow(g, P, "#63f4ff", 6);
    g.strokeStyle = "#63f4ff"; g.lineWidth = 1.1;
    g.beginPath(); g.ellipse(3.2, -10, 7.4, 6.4, 0, 0, TAU); g.stroke();
    noGlow(g);
  }
}

// ---------- hats (bought with Sigils; the crown is everyone's). The helmet is a circle at (0, -10), r 11.5;
// everything stays inside the sprite's box (y >= -32). ----------
const HAT_ART = {
  crown(g, P) {
    glow(g, P, C.amber, 10);
    g.fillStyle = C.amber;
    shapeFromPoints(g, [-6, -21, -6, -27, -3, -24, 0, -29, 3, -24, 6, -27, 6, -21]);
    g.fill();
    noGlow(g);
    g.fillStyle = C.magenta; circle(g, 0, -23.6, 1.3); g.fill();
  },
  none() {},
  nightcap(g, P) {
    // a floppy cap that slumps over the back of the helmet, pom-pom and all
    g.fillStyle = SIN.sloth;
    g.beginPath();
    g.moveTo(8, -20);
    g.quadraticCurveTo(6, -30.5, -3, -30);
    g.quadraticCurveTo(-12, -29.5, -15, -22);
    g.lineTo(-12.4, -21.4);
    g.quadraticCurveTo(-10, -25.5, -6, -24.2);
    g.lineTo(-8.6, -20);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(60,64,110,0.35)";
    g.beginPath(); g.moveTo(2.5, -29.6); g.quadraticCurveTo(-1, -26, -6.5, -26.8); g.lineTo(-6, -24.2); g.quadraticCurveTo(-1, -23.6, 4.6, -27.8); g.closePath(); g.fill();
    g.fillStyle = "#8a90b8"; rrect(g, -9.5, -22.6, 18.5, 3.6, 1.8); g.fill();
    glow(g, P, "#ffffff", 6);
    g.fillStyle = "#ffffff"; circle(g, -15.4, -21, 2.6); g.fill();
    noGlow(g);
  },
  toque(g, P) {
    // the chef's hat: puffy top, a band in Gluttony's pink
    glow(g, P, "#ffffff", 6);
    g.fillStyle = "#f4f6ff";
    circle(g, -4.4, -25.6, 3.8); g.fill();
    circle(g, 4.4, -25.6, 3.8); g.fill();
    circle(g, 0, -27.4, 4.2); g.fill();
    rrect(g, -6.2, -25.6, 12.4, 5.2, 1.4); g.fill();
    noGlow(g);
    g.strokeStyle = "rgba(20,24,60,0.22)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-2.1, -25.2); g.lineTo(-2.1, -21.6); g.moveTo(2.1, -25.2); g.lineTo(2.1, -21.6); g.stroke();
    g.fillStyle = SIN.glutton; g.fillRect(-6.2, -22.2, 12.4, 1.7);
  },
  tophat(g, P) {
    // black silk with a gold band: Greed dresses for the occasion
    g.fillStyle = "#1a1530";
    rrect(g, -6, -31, 12, 10.2, 1.2); g.fill();
    g.beginPath(); g.ellipse(0, -21, 10.5, 2.2, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,212,92,0.5)"; g.lineWidth = 0.8;
    rrect(g, -6, -31, 12, 10.2, 1.2); g.stroke();
    g.beginPath(); g.ellipse(0, -21, 10.5, 2.2, 0, 0, TAU); g.stroke();
    glow(g, P, SIN.greed, 8);
    g.fillStyle = SIN.greed; g.fillRect(-6, -24.8, 12, 2.4);
    noGlow(g);
    g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(2.4, -30, 1.6, 4.6);
  },
  boppers(g, P) {
    // a headband with two hearts on springs
    g.strokeStyle = SIN.lust; g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, -10, 12.4, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = "#f2b8d8"; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-4.4, -21.6); g.quadraticCurveTo(-5.6, -25.5, -8.6, -26.6);
    g.moveTo(4.4, -21.6); g.quadraticCurveTo(5.6, -25.5, 8.6, -26.6);
    g.stroke();
    glow(g, P, SIN.lust, 8);
    g.fillStyle = "#ff6fb5";
    for (const x of [-8.8, 8.8]) { g.save(); g.translate(x, -27.6); heartPath(g, 3); g.fill(); g.restore(); }
    noGlow(g);
  },
  horns(g, P) {
    // Wrath's horns, curling up off the helmet
    glow(g, P, "#ff3b3b", 8);
    g.fillStyle = "#ff4a3d";
    g.beginPath(); g.moveTo(-8.5, -17.5); g.quadraticCurveTo(-12.8, -24, -10.6, -30.6); g.quadraticCurveTo(-8.4, -24.6, -3.8, -20.6); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(3.8, -20.6); g.quadraticCurveTo(8.4, -24.6, 10.6, -30.6); g.quadraticCurveTo(12.8, -24, 8.5, -17.5); g.closePath(); g.fill();
    noGlow(g);
    g.strokeStyle = "rgba(255,214,190,0.6)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-7.4, -19.6); g.quadraticCurveTo(-10, -24, -10, -28); g.moveTo(7.4, -19.6); g.quadraticCurveTo(10, -24, 10, -28); g.stroke();
  },
  laurels(g, P) {
    // a victor's wreath around the top of the helmet, a Pride gem where the branches meet
    const R = 12.2;
    g.strokeStyle = "#c9962e"; g.lineWidth = 0.9;
    g.beginPath(); g.arc(0, -10, R, Math.PI * 1.13, Math.PI * 1.45); g.stroke();
    g.beginPath(); g.arc(0, -10, R, Math.PI * 1.55, Math.PI * 1.87); g.stroke();
    glow(g, P, C.amber, 5);
    g.fillStyle = "#ffd45c";
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        // pairs of leaves along each stem, angled up toward the front of the wreath
        const a = -Math.PI / 2 + side * (0.2 + k * 0.3);
        const x = Math.cos(a) * R, y = -10 + Math.sin(a) * R, t = a - side * Math.PI / 2;
        for (const off of [-0.55, 0.55]) {
          g.beginPath();
          g.ellipse(x + Math.cos(t + off * 2) * 1.6, y + Math.sin(t + off * 2) * 1.6, 2.2, 0.95, t + off, 0, TAU);
          g.fill();
        }
      }
    }
    noGlow(g);
    g.fillStyle = SIN.pride; circle(g, 0, -23.2, 1.6); g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)"; circle(g, -0.5, -23.7, 0.5); g.fill();
  },
  serpent(g, P) {
    // Envy's snake: a tapering tail down the back of the helmet, one coil over the top, then the neck rears
    // up in an S to a wedge head over the visor, slit-eyed with its tongue out. The body is a smooth tube
    // along that spine (thin at the tail) with a diamond-back pattern and a lit top edge.
    const R = 12.3, pts = [];
    for (let i = 0; i < 10; i++) {                                        // the tail
      const t = i / 10, u = 1 - t;
      pts.push([u * u * -12.6 + 2 * u * t * -14.8 + t * t * -R, u * u * -2.2 + 2 * u * t * -6.4 + t * t * -10]);
    }
    for (let i = 0; i < 30; i++) {                                        // the coil
      const a = Math.PI * (1 + 0.78 * i / 30);
      pts.push([Math.cos(a) * R, -10 + Math.sin(a) * R]);
    }
    const a1 = Math.PI * 1.78, x1 = Math.cos(a1) * R, y1 = -10 + Math.sin(a1) * R;
    const hx = 10.6, hy = -27.9;
    for (let i = 0; i <= 18; i++) {                                       // the neck's S
      const t = i / 18, u = 1 - t;
      pts.push([u * u * u * x1 + 3 * u * u * t * 13.8 + 3 * u * t * t * 6.6 + t * t * t * hx,
        u * u * u * y1 + 3 * u * u * t * -21.2 + 3 * u * t * t * -24 + t * t * t * hy]);
    }
    const n = pts.length;
    const rad = (i) => { const s = i / (n - 1); return s < 0.3 ? 0.4 + (s / 0.3) * 1.5 : 1.9 - (s - 0.3) * 0.55; };
    const tube = (extra, col, dx, dy, k) => {
      g.strokeStyle = col; g.lineCap = "round";
      for (let i = 1; i < n; i++) {
        g.lineWidth = Math.max(0.3, (rad(i) * k + extra) * 2);
        g.beginPath(); g.moveTo(pts[i - 1][0] + dx * rad(i), pts[i - 1][1] + dy * rad(i)); g.lineTo(pts[i][0] + dx * rad(i), pts[i][1] + dy * rad(i)); g.stroke();
      }
    };
    tube(0.55, "#1d2160", 0, 0, 1);                                       // outline
    tube(0, SIN.envy, 0, 0, 1);                                           // body
    tube(0, "rgba(190,200,255,0.55)", -0.25, -0.4, 0.38);                 // light along the top
    // diamond-back: a dark rhombus every few units along the body, turned with it
    g.fillStyle = "#2f379c";
    let len = 0, next = 2.4;
    for (let i = 1; i < n - 3; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      len += Math.hypot(dx, dy);
      if (len < next) continue;
      next += 2.4;
      const r = rad(i), a = Math.atan2(dy, dx);
      g.save(); g.translate(pts[i][0], pts[i][1]); g.rotate(a);
      g.beginPath(); g.moveTo(-r * 0.75, 0); g.lineTo(0, -r * 0.62); g.lineTo(r * 0.75, 0); g.lineTo(0, r * 0.62); g.closePath(); g.fill();
      g.restore();
    }
    g.lineCap = "butt";
    // the head
    g.beginPath();
    g.moveTo(hx - 1.2, hy - 2.1);
    g.quadraticCurveTo(hx + 2.8, hy - 3.3, hx + 6.2, hy - 0.2);
    g.quadraticCurveTo(hx + 2.8, hy + 2.6, hx - 1.2, hy + 2.0);
    g.closePath();
    g.lineWidth = 1.1; g.strokeStyle = "#1d2160"; g.stroke();
    g.fillStyle = SIN.envy; g.fill();
    g.fillStyle = "#2f379c";
    g.beginPath(); g.moveTo(hx + 0.2, hy - 1.2); g.lineTo(hx + 1.4, hy - 1.9); g.lineTo(hx + 1.4, hy - 0.5); g.closePath(); g.fill();
    g.fillStyle = "#a9b4ff";
    g.beginPath(); g.moveTo(hx, hy + 0.8); g.quadraticCurveTo(hx + 3, hy + 1.9, hx + 5.6, hy + 0.3); g.quadraticCurveTo(hx + 3, hy + 1.0, hx, hy + 0.8); g.fill();
    g.fillStyle = "#ffe45c"; circle(g, hx + 2.6, hy - 0.9, 0.95); g.fill();
    g.fillStyle = "#14082e"; g.beginPath(); g.ellipse(hx + 2.7, hy - 0.9, 0.28, 0.8, 0, 0, TAU); g.fill();
    g.fillStyle = "#14082e"; circle(g, hx + 5.2, hy - 0.6, 0.3); g.fill();      // nostril
    g.strokeStyle = "#ff4f8b"; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(hx + 6, hy); g.lineTo(hx + 8.2, hy + 0.1); g.lineTo(hx + 9.3, hy - 0.8); g.moveTo(hx + 8.2, hy + 0.1); g.lineTo(hx + 9.3, hy + 0.9); g.stroke();
  },
  antenna(g, P) {
    // one of theirs: a bent robot antenna with a glowing tip
    g.fillStyle = "#8a93c2"; rrect(g, -3.4, -23, 4.6, 2.4, 1); g.fill();
    g.strokeStyle = "#8a93c2"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-1.1, -22); g.lineTo(-1.1, -25.6); g.lineTo(2.6, -28.6); g.stroke();
    glow(g, P, C.cyan, 10);
    g.fillStyle = C.cyan; circle(g, 2.8, -29.2, 2.3); g.fill();
    noGlow(g);
    g.fillStyle = "#ffffff"; circle(g, 2.2, -29.8, 0.8); g.fill();
  },
  starcap(g, P) {
    // a cap worn backwards: the brim sticks out behind, a star logo up front
    g.fillStyle = "#232c5e";
    g.beginPath(); g.arc(0, -10, 12.1, Math.PI * 1.15, Math.PI * 1.85); g.closePath(); g.fill();
    g.strokeStyle = "rgba(201,210,240,0.35)"; g.lineWidth = 0.7;
    g.beginPath(); g.arc(0, -10, 12.1, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(-1.6, -18.6, -1.2, -15.6); g.stroke();
    g.fillStyle = C.magenta;
    g.beginPath(); g.ellipse(-12.4, -14.8, 6, 1.7, 0.35, 0, TAU); g.fill();
    circle(g, 0, -22.1, 1); g.fill();
    glow(g, P, C.cyan, 6);
    g.fillStyle = C.cyan; g.save(); g.translate(6.2, -17.6); starPath(g, 2.3, 0.95); g.fill(); g.restore();
    noGlow(g);
  },
  bandit(g, P) {
    // a space outlaw's hat: a wide brim curling up at both ends, a dented crown, a cyan band with a star buckle
    g.fillStyle = "#3b2752";
    g.beginPath();
    g.moveTo(-15.5, -22.6);
    g.quadraticCurveTo(-11.5, -18.4, 0, -18.9);
    g.quadraticCurveTo(11.5, -18.4, 15.5, -22.6);
    g.quadraticCurveTo(11, -20.4, 0, -20.9);
    g.quadraticCurveTo(-11, -20.4, -15.5, -22.6);
    g.fill();
    g.fillStyle = "#4a3166";
    g.beginPath();
    g.moveTo(-7, -20.6); g.lineTo(-6.2, -28);
    g.quadraticCurveTo(-3.2, -31, 0, -28.6);
    g.quadraticCurveTo(3.2, -31, 6.2, -28);
    g.lineTo(7, -20.6); g.closePath(); g.fill();
    g.strokeStyle = "#1d1430"; g.lineWidth = 0.7; g.stroke();
    glow(g, P, C.cyan, 6);
    g.fillStyle = C.cyan; g.fillRect(-6.9, -23.6, 13.8, 2.1);
    noGlow(g);
    g.fillStyle = C.amber; g.save(); g.translate(0, -22.55); starPath(g, 1.6, 0.7); g.fill(); g.restore();
  },
  voidhalo(g, P) {
    glow(g, P, C.violet2, 10);
    g.strokeStyle = "#1a0f2e"; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, -27, 8.6, 2.7, 0, 0, TAU); g.stroke();
    noGlow(g);
    g.strokeStyle = C.violet2; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(0, -27, 10.1, 3.6, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(0, -27, 7.1, 1.8, 0, 0, TAU); g.stroke();
    g.fillStyle = "#e3d1ff";
    circle(g, -9.8, -29.6, 0.7); g.fill(); circle(g, 9, -24.4, 0.6); g.fill(); circle(g, 3, -30.6, 0.5); g.fill();
  },
  brokenhalo(g, P) {
    // the halo in pieces, each knocked a little out of line
    glow(g, P, "#fff3c4", 10);
    g.strokeStyle = "#ffe9a8"; g.lineWidth = 2.1; g.lineCap = "round";
    const parts = [[0.15, 1.05, 0, 0, 0], [1.35, 2.25, 0.7, -0.8, 0.06], [2.55, 3.5, -0.5, 0.7, -0.05], [3.85, 4.85, 0.9, 0.5, 0.08], [5.15, 6.0, -0.8, -0.6, -0.06]];
    for (const [a0, a1, dx, dy, rot] of parts) { g.beginPath(); g.ellipse(dx, -27 + dy, 8.5, 2.6, rot, a0, a1); g.stroke(); }
    noGlow(g);
    g.lineCap = "butt";
    g.fillStyle = "#fff3c4";
    shapeFromPoints(g, [-12, -30.4, -10.6, -31.4, -10.9, -29.4]); g.fill();
    shapeFromPoints(g, [11.4, -23.6, 12.8, -22.6, 11.2, -22]); g.fill();
  },
  overlord(g, P) {
    // a machine crown: plated blades, a dark band, a red eye across the front
    g.fillStyle = "#2a3366";
    shapeFromPoints(g, [-8.5, -19.8, -9.4, -27.6, -5, -24, 0, -31.5, 5, -24, 9.4, -27.6, 8.5, -19.8]);
    g.fill();
    g.strokeStyle = "#8a93c2"; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = "#141a3c"; rrect(g, -8.7, -23.4, 17.4, 3.7, 1); g.fill();
    glow(g, P, "#ff3b3b", 9);
    g.fillStyle = "#ff3b3b"; rrect(g, -4, -22.3, 8, 1.5, 0.7); g.fill();
    noGlow(g);
    g.fillStyle = "#ffd0d0"; circle(g, 0, -21.55, 0.55); g.fill();
    g.fillStyle = "#c9d0f2"; circle(g, -7, -21.55, 0.6); g.fill(); circle(g, 7, -21.55, 0.6); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.3)"; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(-0.6, -29.6); g.lineTo(-2.6, -24.6); g.moveTo(-8.3, -26.2); g.lineTo(-7.6, -24.2); g.stroke();
  },
  astral(g, P) {
    // floats just above the helmet: a crown in cyan fading to violet, a white star set in it, a star in orbit
    g.strokeStyle = "rgba(159,232,255,0.45)"; g.lineWidth = 0.6;
    g.beginPath(); g.ellipse(0, -26, 12.5, 3.2, -0.12, Math.PI, TAU); g.stroke();
    const grd = g.createLinearGradient(0, -31.5, 0, -23);
    grd.addColorStop(0, "#9fe8ff"); grd.addColorStop(1, "#a57bff");
    glow(g, P, C.cyan, 12);
    g.fillStyle = grd;
    shapeFromPoints(g, [-7.5, -23.2, -8.4, -29, -4.4, -26, 0, -31.6, 4.4, -26, 8.4, -29, 7.5, -23.2]);
    g.fill();
    noGlow(g);
    g.fillStyle = "#e9f1ff"; rrect(g, -7.6, -24.6, 15.2, 1.6, 0.8); g.fill();
    glow(g, P, "#ffffff", 8);
    g.fillStyle = "#ffffff"; g.save(); g.translate(0, -26.8); starPath(g, 2, 0.85); g.fill(); g.restore();
    noGlow(g);
    g.strokeStyle = "rgba(159,232,255,0.45)"; g.lineWidth = 0.6;
    g.beginPath(); g.ellipse(0, -26, 12.5, 3.2, -0.12, 0, Math.PI); g.stroke();
    glow(g, P, "#ffe08a", 6);
    g.fillStyle = "#ffe08a"; g.save(); g.translate(11.6, -24.4); starPath(g, 1.5, 0.65); g.fill(); g.restore();
    noGlow(g);
  },
  blackhole(g, P) {
    // a tiny singularity: a hot disk, the dark at its middle, light bent over the top
    g.save(); g.translate(0, -26.6); g.rotate(-0.18);
    const disk = g.createRadialGradient(0, 0, 2, 0, 0, 10.5);
    disk.addColorStop(0, "#ffe2c4"); disk.addColorStop(0.35, "#ff8a3d"); disk.addColorStop(0.75, "#ff42d0"); disk.addColorStop(1, "rgba(255,66,208,0)");
    glow(g, P, "#ff8a3d", 10);
    g.fillStyle = disk;
    g.beginPath(); g.ellipse(0, 0, 10.5, 2.8, 0, 0, TAU); g.fill();
    noGlow(g);
    g.strokeStyle = "rgba(255,226,196,0.85)"; g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(0, -0.4, 5.2, 4.3, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.fillStyle = "#000000"; g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill();
    g.strokeStyle = "#ffd9b0"; g.lineWidth = 0.8; g.beginPath(); g.arc(0, 0, 3.8, 0, TAU); g.stroke();
    g.fillStyle = disk; g.beginPath(); g.ellipse(0, 0, 10.5, 2.8, 0, 0, Math.PI); g.closePath(); g.fill();
    g.restore();
  },
  // 4.5 level hats: each one more than the last
  cadet(g, P) {
    g.fillStyle = "#1b2a5c"; g.beginPath(); g.ellipse(0, -22.4, 9.6, 4.6, 0, Math.PI, TAU); g.fill();
    g.fillStyle = "#2c4290"; g.beginPath(); g.ellipse(2.2, -21.4, 12.4, 1.9, 0, 0, TAU); g.fill();
    glow(g, P, "#63f4ff", 9);
    g.fillStyle = "#63f4ff";
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 7.5, -24.4); g.lineTo(s * 17.5, -29.6); g.lineTo(s * 15.4, -26.2); g.lineTo(s * 18.4, -25.6); g.lineTo(s * 9.2, -22.4); g.closePath(); g.fill(); }
    noGlow(g);
    g.strokeStyle = "#ffe14d"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-2.6, -24.6); g.lineTo(0, -26.8); g.lineTo(2.6, -24.6); g.stroke();
  },
  comet(g, P) {
    g.strokeStyle = "#8f9cc7"; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(-3, -21); g.quadraticCurveTo(-5, -26, -2.5, -29); g.moveTo(3, -21); g.quadraticCurveTo(5, -25, 3.5, -28); g.stroke();
    glow(g, P, "#bff7ff", 10);
    g.strokeStyle = "rgba(191,247,255,0.7)"; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(0, -27.5, 10, 3.2, -0.25, Math.PI * 0.15, Math.PI * 0.95); g.stroke();
    g.fillStyle = "#ffffff"; circle(g, -8.6, -29.3, 2.4); g.fill();
    g.fillStyle = "#63f4ff"; circle(g, -2.5, -29.2, 1.3); g.fill(); circle(g, 3.5, -28.2, 1.3); g.fill();
    noGlow(g);
  },
  ringed(g, P) {
    const sph = g.createRadialGradient(-1.6, -29, 0.6, 0, -27.4, 5.4);
    sph.addColorStop(0, "#efe6ff"); sph.addColorStop(0.45, "#a57bff"); sph.addColorStop(1, "#3c1f86");
    glow(g, P, "#a57bff", 8);
    g.fillStyle = sph; circle(g, 0, -26.6, 5); g.fill();
    noGlow(g);
    g.strokeStyle = "#73ffce"; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(0, -26.6, 10.5, 2.4, -0.3, 0, TAU); g.stroke();
    g.fillStyle = sph; g.beginPath(); g.ellipse(0, -26.6, 5, 5, 0, Math.PI * 1.04, Math.PI * 1.96); g.fill();
    glow(g, P, "#ffffff", 5); g.fillStyle = "#ffffff"; circle(g, 9.8, -30, 1.2); g.fill(); noGlow(g);
  },
  nebula(g, P) {
    const grad = g.createLinearGradient(0, -31, 0, -21);
    grad.addColorStop(0, "#63f4ff"); grad.addColorStop(0.45, "#ff42d0"); grad.addColorStop(1, "#8e44ff");
    glow(g, P, "#ff42d0", 12);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(-8.5, -21);
    const tips = [[-8, -27], [-4, -30.6], [0, -27.6], [0, -31.6], [4, -30.6], [8, -27]];
    g.quadraticCurveTo(-9.5, -24, tips[0][0], tips[0][1]); g.quadraticCurveTo(-5.5, -25, tips[1][0], tips[1][1]);
    g.quadraticCurveTo(-1.6, -26, tips[3][0], tips[3][1]); g.quadraticCurveTo(1.6, -26, tips[4][0], tips[4][1]);
    g.quadraticCurveTo(5.5, -25, tips[5][0], tips[5][1]); g.quadraticCurveTo(9.5, -24, 8.5, -21); g.closePath(); g.fill();
    noGlow(g);
    g.fillStyle = "#ffffff";
    for (const [x, y, r] of [[-4, -26, 0.9], [3.2, -24.6, 0.7], [0.6, -28.4, 0.8], [-6.6, -23.2, 0.6]]) { g.save(); g.translate(x, y); starPath(g, r * 1.8, r * 0.7); g.fill(); g.restore(); }
  },
  pulsar(g, P) {
    glow(g, P, "#9fe8ff", 14);
    const beam = g.createLinearGradient(0, -32, 0, -21);
    beam.addColorStop(0, "rgba(159,232,255,0)"); beam.addColorStop(0.5, "rgba(159,232,255,0.85)"); beam.addColorStop(1, "rgba(159,232,255,0)");
    g.fillStyle = beam; g.beginPath(); g.moveTo(-1.2, -32); g.lineTo(1.2, -32); g.lineTo(0.6, -21); g.lineTo(-0.6, -21); g.closePath(); g.fill();
    g.save(); g.translate(0, -26.6); g.rotate(0.9);
    g.fillStyle = beam; g.fillRect(-0.9, -9, 1.8, 18);
    g.restore();
    g.strokeStyle = "rgba(191,247,255,0.9)"; g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, -26.6, 9.5, 2, 0.15, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(0, -26.6, 6.5, 1.4, -0.4, 0, TAU); g.stroke();
    g.fillStyle = "#ffffff"; circle(g, 0, -26.6, 2.8); g.fill();
    noGlow(g);
    g.fillStyle = "#e9fdff"; circle(g, 0, -26.6, 1.4); g.fill();
  },
  corona(g, P) {
    glow(g, P, "#ffb347", 14);
    for (let i = 0; i < 13; i++) {
      const a = Math.PI + (i / 12) * Math.PI, long = i % 2 === 0;
      const r0 = 5.2, r1 = long ? 11.5 : 8.2;
      g.fillStyle = long ? "#ffd45c" : "#ff8a3d";
      g.beginPath();
      g.moveTo(Math.cos(a - 0.12) * r0, -21.5 + Math.sin(a - 0.12) * r0);
      g.lineTo(Math.cos(a) * r1, -21.5 + Math.sin(a) * r1 * 0.95);
      g.lineTo(Math.cos(a + 0.12) * r0, -21.5 + Math.sin(a + 0.12) * r0);
      g.closePath(); g.fill();
    }
    const core = g.createRadialGradient(0, -24.5, 0.5, 0, -24.5, 5.4);
    core.addColorStop(0, "#ffffff"); core.addColorStop(0.5, "#fff1b8"); core.addColorStop(1, "rgba(255,179,71,0)");
    g.fillStyle = core; g.beginPath(); g.ellipse(0, -23.5, 6, 3.8, 0, Math.PI, TAU); g.fill();
    noGlow(g);
  },
  ascended(g, P) {
    // the prismatic halo
    const halo = g.createLinearGradient(-11, 0, 11, 0);
    ["#ff3b5c", "#ffd45c", "#73ffce", "#63f4ff", "#a57bff", "#ff42d0"].forEach((c, i) => halo.addColorStop(i / 5, c));
    glow(g, P, "#ffffff", 12);
    g.strokeStyle = halo; g.lineWidth = 1.8;
    g.beginPath(); g.ellipse(0, -30, 10.5, 1.8, 0, 0, TAU); g.stroke();
    // a gold crown, seven points
    const gold = g.createLinearGradient(0, -29, 0, -21);
    gold.addColorStop(0, "#fff6d1"); gold.addColorStop(0.5, "#ffd45c"); gold.addColorStop(1, "#c98a1a");
    g.fillStyle = gold;
    shapeFromPoints(g, [-8, -21, -8.6, -26.2, -6, -24, -4.4, -28, -2.2, -24.4, 0, -29, 2.2, -24.4, 4.4, -28, 6, -24, 8.6, -26.2, 8, -21]);
    g.fill();
    noGlow(g);
    g.fillStyle = "rgba(120,70,0,0.45)"; g.fillRect(-8, -22.6, 16, 1.4);
    // the black hole gem
    g.fillStyle = "#ff8a3d"; g.beginPath(); g.ellipse(0, -23.6, 3.6, 1.1, 0, 0, TAU); g.fill();
    g.fillStyle = "#000000"; circle(g, 0, -23.6, 1.6); g.fill();
    g.strokeStyle = "#ffe2c4"; g.lineWidth = 0.5; circle(g, 0, -23.6, 1.9); g.stroke();
    g.fillStyle = "#ffffff";
    for (const [x, y] of [[-10.5, -27], [10.5, -27.5], [0, -31.6]]) { g.save(); g.translate(x, y); starPath(g, 1.5, 0.55); g.fill(); g.restore(); }
  },
  halo(g, P) {
    glow(g, P, "#fff3c4", 12);
    g.strokeStyle = "#ffe9a8"; g.lineWidth = 2.2;
    g.beginPath(); g.ellipse(0, -27, 8.5, 2.6, 0, 0, TAU); g.stroke();
    noGlow(g);
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(0, -27, 8.5, 2.6, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  },
};
function drawHat(g, P, id) {
  (HAT_ART[id] || HAT_ART.crown)(g, P);
}

// ---------- pickups + bullets ----------
function starPath(g, r, inner) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? inner : r;
    const a = -Math.PI / 2 + (i / 10) * TAU;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}
function heartPath(g, s) {
  g.beginPath();
  g.moveTo(0, s * 0.85);
  g.bezierCurveTo(-s * 1.2, -s * 0.05, -s * 0.6, -s * 0.95, 0, -s * 0.38);
  g.bezierCurveTo(s * 0.6, -s * 0.95, s * 1.2, -s * 0.05, 0, s * 0.85);
  g.closePath();
}

export function glowDot(color, px) {
  const c = canvas(px, px);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.18, color);
  grd.addColorStop(0.45, color + "66");
  grd.addColorStop(1, color + "00");
  g.fillStyle = grd;
  g.fillRect(0, 0, px, px);
  return c;
}

export const sprites = {
  P: 0,
  robots: {},          // type → { base, flash, ally }
  player: null, playerFlash: null,
  star: null, gold: null, heart: null, covet: null, sigil: null,
  bullet: null, bulletCrit: null, bulletEnvy: null,
  shots: [],           // player shots by bullet kind (0 blaster, 1 crit, 2 charged orb, 3 envy, 4.. one per gun)
  orbs: {},            // color → sprite
  orbsHC: {},          // high-contrast versions (settings)
  buddy: null,
  bolt: null,
  dots: [],            // glow dots by palette index
  orbital: null,

  build(P, suit) {
    this.P = P;
    for (const type in ROBOT_ART) {
      const art = ROBOT_ART[type];
      const base = make(art.size, P, (g) => art.draw(g, P, art.accent));
      this.robots[type] = {
        base,
        flash: tinted(base, "#ffffff", 0.9),
        ally: tinted(base, C.magenta, 0.45),
        size: art.size,
        accent: art.accent,
      };
    }
    this.buildPlayer(P, suit);
    this.buildDigits(P);
    this.star = make(26, P, (g) => {
      glow(g, P, C.cyan, 10); g.fillStyle = C.cyan; starPath(g, 8, 3.6); g.fill(); noGlow(g);
      g.fillStyle = "#e8fdff"; starPath(g, 4, 1.8); g.fill();
    });
    this.gold = make(28, P, (g) => {
      glow(g, P, C.amber, 10); g.fillStyle = C.amber; starPath(g, 9, 4); g.fill(); noGlow(g);
      g.fillStyle = "#fff7e0"; starPath(g, 4.5, 2); g.fill();
    });
    this.covet = make(28, P, (g) => {        // a Covetous King star: stolen mint, a gold heart
      glow(g, P, C.mint, 10); g.fillStyle = C.mint; starPath(g, 9, 4); g.fill(); noGlow(g);
      g.fillStyle = C.amber; starPath(g, 4.5, 2); g.fill();
    });
    this.sigil = make(34, P, (g) => {        // a Sigil shard (4.5): a bright cyan gem
      glow(g, P, C.cyan, 14);
      g.fillStyle = C.cyan;
      g.beginPath(); g.moveTo(0, -11); g.lineTo(9, -3); g.lineTo(0, 11); g.lineTo(-9, -3); g.closePath(); g.fill();
      noGlow(g);
      g.fillStyle = "#e8fdff";
      g.beginPath(); g.moveTo(0, -11); g.lineTo(4, -3); g.lineTo(0, 6); g.lineTo(-4, -3); g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(-9, -3.6, 18, 1.2);
    });
    this.heart = make(34, P, (g) => {
      glow(g, P, C.heart, 12); g.fillStyle = C.heart; heartPath(g, 11); g.fill(); noGlow(g);
      g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.ellipse(-4, -3, 2.4, 1.6, -0.6, 0, TAU); g.fill();
    });
    const capsule = (col, len, wid) => make(len + 16, P, (g) => {
      glow(g, P, col, 10);
      g.fillStyle = col; rrect(g, -len / 2, -wid / 2, len, wid, wid / 2); g.fill();
      noGlow(g);
      g.fillStyle = "#fff"; rrect(g, -len / 2 + 3, -wid / 4, len - 6, wid / 2, wid / 4); g.fill();
    });
    this.bullet = capsule(C.cyan, 18, 5.5);
    this.bulletCrit = capsule(C.amber, 22, 7);
    this.bulletEnvy = capsule(C.mint, 20, 6);
    this.bolt = capsule(C.red, 34, 5);
    const ball = (col, r, size) => make(size, P, (g) => {
      glow(g, P, col, 14);
      g.fillStyle = col; circle(g, 0, 0, r); g.fill();
      noGlow(g);
      g.fillStyle = "#fff"; circle(g, 0, 0, r * 0.55); g.fill();
    });
    const hearty = (col, s) => make(30, P, (g) => {
      glow(g, P, col, 10); g.fillStyle = col; heartPath(g, s); g.fill(); noGlow(g);
      g.fillStyle = "#fff"; heartPath(g, s * 0.49); g.fill();
    });
    const zappy = (col) => make(30, P, (g) => {
      glow(g, P, col, 12);
      g.strokeStyle = col; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(-4, -4); g.lineTo(0, 3); g.lineTo(4, -3); g.lineTo(9, 0); g.stroke();
      noGlow(g);
      g.fillStyle = "#e6ecff"; circle(g, 0, 0, 3); g.fill();
    });
    const heartShot = hearty("#ff6fb5", 7);
    const arcShot = zappy(C.blue);
    const EV = BALANCE.evolution;
    this.shots = [
      this.bullet, this.bulletCrit, ball(C.cyan, 7, 34), this.bulletEnvy,
      capsule(C.amber, 10, 5),          // scatter pellet
      capsule(C.mint, 13, 4),           // smg bolt
      capsule(C.violet2, 34, 5),        // rail bolt
      ball(C.orange, 6.5, 30),          // nova grenade
      arcShot,                          // arc bolt
      heartShot,                        // heartseeker
      // 10-23: evolved guns (evolve.js: 9 + evolution code)
      capsule(EV.blaster.a.col, 22, 6.2), capsule(EV.blaster.b.col, 19, 5.6),
      capsule(EV.scatter.a.col, 11, 5.6), capsule(EV.scatter.b.col, 10, 4.6),
      capsule(EV.smg.a.col, 15, 4.6), capsule(EV.smg.b.col, 13, 4.6),
      capsule(EV.rail.a.col, 38, 5.6), capsule(EV.rail.b.col, 36, 5.2),
      ball(EV.nova.a.col, 7, 32), ball(EV.nova.b.col, 7, 32),
      zappy(EV.arc.a.col), zappy(EV.arc.b.col),
      hearty(EV.heart.a.col, 7.4), hearty(EV.heart.b.col, 7.4),
      // 24-27: spectral bolt, blood dart, shrapnel, bomblet
      capsule(EV.blaster.b.col, 17, 7.5), capsule(EV.heart.a.col, 12, 4), capsule("#ffa3a3", 7, 3.4), ball(EV.nova.a.col, 4, 22),
    ];
    const orb = (col) => make(28, P, (g) => {
      glow(g, P, col, 12);
      g.fillStyle = col; circle(g, 0, 0, 7); g.fill();
      noGlow(g);
      g.fillStyle = "#fff"; circle(g, 0, 0, 3.6); g.fill();
    });
    // high contrast: a dark rim and a white edge so robot shots pop on any background
    const orbHC = (col) => make(32, P, (g) => {
      g.fillStyle = "#030518"; circle(g, 0, 0, 10); g.fill();
      glow(g, P, col, 10);
      g.fillStyle = col; circle(g, 0, 0, 7.6); g.fill();
      noGlow(g);
      g.strokeStyle = "#ffffff"; g.lineWidth = 1.6; circle(g, 0, 0, 8.6); g.stroke();
      g.fillStyle = "#fff"; circle(g, 0, 0, 3.6); g.fill();
    });
    const ORB_COLS = { pink: "#ff4f9a", amber: C.amber, violet: C.violet2, mint: C.mint, red: C.red, magenta: C.magenta, green: C.green,
      sloth: SIN.sloth, glutton: SIN.glutton, wrath: SIN.wrath, pride: SIN.pride, envy: SIN.envy };
    this.orbs = {};
    this.orbsHC = {};
    for (const k in ORB_COLS) { this.orbs[k] = orb(ORB_COLS[k]); this.orbsHC[k] = orbHC(ORB_COLS[k]); }
    // Greed's coins and Lust's hearts are their own shapes, still with the bright core every robot shot has.
    this.orbs.coin = make(30, P, (g) => {
      glow(g, P, SIN.greed, 12);
      g.fillStyle = "#e8a820"; circle(g, 0, 0, 8); g.fill();
      noGlow(g);
      g.fillStyle = SIN.greed; circle(g, 0, 0, 6.2); g.fill();
      g.fillStyle = "#fff6d6"; g.font = "700 9px Rajdhani, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", 0, 0.5);
    });
    this.orbs.heart = make(32, P, (g) => {
      glow(g, P, SIN.lust, 12);
      g.fillStyle = SIN.lust; heartPath(g, 9); g.fill();
      noGlow(g);
      g.fillStyle = "#fff"; heartPath(g, 4.5); g.fill();
    });
    this.orbsHC.coin = this.orbs.coin;
    this.orbsHC.heart = make(36, P, (g) => {
      g.fillStyle = "#030518"; heartPath(g, 12); g.fill();
      glow(g, P, SIN.lust, 10);
      g.fillStyle = SIN.lust; heartPath(g, 9.4); g.fill();
      noGlow(g);
      g.strokeStyle = "#fff"; g.lineWidth = 1.4; heartPath(g, 10.4); g.stroke();
      g.fillStyle = "#fff"; heartPath(g, 4.5); g.fill();
    });
    this.buddy = make(30, P, (g) => {
      poly(g, 6, 8, Math.PI / 6); bodyStroke(g, P, C.cyan, 1.6);
      eye(g, P, 2, 0, 2.4, C.cyan);
      g.strokeStyle = C.cyan; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-6, -8); g.lineTo(-10, -12); g.moveTo(6, -8); g.lineTo(10, -12); g.stroke();
    });
    this.orbital = make(30, P, (g) => {
      glow(g, P, C.cyan, 12);
      g.fillStyle = "#0b2a3a"; circle(g, 0, 0, 7.5); g.fill();
      g.strokeStyle = C.cyan; g.lineWidth = 2; g.stroke();
      noGlow(g);
      g.fillStyle = C.cyan; circle(g, 0, 0, 3); g.fill();
    });
    const dpx = Math.max(16, Math.min(48, Math.round(18 * P)));
    this.dots = PAL.map((col) => glowDot(col, dpx));
  },

  /** Damage-number digits, pre-rendered with their outline (drawing text every frame was costly). */
  buildDigits(P) {
    const make1 = (ch, size, col) => {
      const px = Math.max(8, Math.ceil(size * P * 1.4));
      const c = canvas(px * 0.75, px);
      const g = c.getContext("2d");
      g.font = "700 " + Math.round(size * P) + "px Rajdhani, 'Plus Jakarta Sans', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = Math.max(2, 3 * P);
      g.strokeStyle = "rgba(3,5,24,0.9)";
      g.strokeText(ch, c.width / 2, c.height / 2);
      g.fillStyle = col;
      g.fillText(ch, c.width / 2, c.height / 2);
      const w = g.measureText(ch).width / P + 1.5;
      return { c, w, h: c.height / P, cw: c.width / P };
    };
    const set = (size, col) => "0123456789!".split("").map((ch) => make1(ch, size, col));
    this.digits = { normal: set(13, "#ffffff"), crit: set(19, "#ffc861") };
  },

  /** An astronaut in any suit (co-op teammates), without touching your own sprites. */
  astronaut(P, suit) {
    const player = make(64, P, (g) => drawAstronaut(g, P, suit));
    return { player, flash: tinted(player, "#ffffff", 0.85) };
  },

  buildPlayer(P, suit) {
    this.player = make(64, P, (g) => drawAstronaut(g, P, suit));
    this.playerFlash = tinted(this.player, "#ffffff", 0.85);
    this.envy = tinted(this.player, SIN.envy, 0.6);
  },

  /** Rock sprites are made per asteroid (few of them, varied shapes). */
  rock(r, seed) {
    const P = this.P;
    const size = r * 2 + 16;
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    return make(size, P, (g) => {
      const n = 9 + Math.floor(rnd() * 4);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = r * (0.78 + rnd() * 0.24);
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      shapeFromPoints(g, pts);
      const grd = g.createLinearGradient(-r, -r, r, r);
      grd.addColorStop(0, "#4a3f6e");
      grd.addColorStop(0.55, C.rock);
      grd.addColorStop(1, "#141026");
      g.fillStyle = grd; g.fill();
      glow(g, P, "rgba(165,123,255,0.6)", 6);
      g.strokeStyle = "rgba(165,123,255,0.55)"; g.lineWidth = 1.5; g.stroke();
      noGlow(g);
      for (let i = 0; i < 3 + Math.floor(r / 14); i++) {
        const a = rnd() * TAU, d = rnd() * r * 0.55, cr = r * (0.08 + rnd() * 0.12);
        g.fillStyle = "rgba(10,8,24,0.55)"; circle(g, Math.cos(a) * d, Math.sin(a) * d, cr); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, cr, Math.PI * 0.9, Math.PI * 1.8); g.stroke();
      }
    });
  },
};

// Shared path helpers for live drawing (bosses, telegraphs).
export const draw = { poly, rrect, circle, shapeFromPoints, starPath, heartPath, glow, noGlow };
