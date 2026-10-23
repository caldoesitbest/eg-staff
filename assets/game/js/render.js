/* Camera, background (parallax stars, nebula, the cyan ringed planet) and drawing.
   Everything bright is a pre-rendered sprite; no shadowBlur in the frame loop. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { sprites, C, P_CYAN } from "./sprites.js";
import { fx } from "./fx.js";
import { input } from "./input.js";
import { TAU, clamp, smooth, rand } from "./util.js";
import { rebuildRockSprites } from "./world.js";
import { ROSTER } from "./enemies/roster.js";
import { BOSSES } from "./enemies/bosses.js";
import { ENVY_POWERS, hasEnvy } from "./upgrades.js";
import { GUN_COL } from "./armory.js";
import { gunPal } from "./player.js";
import { SUITS } from "./storage.js";
import { SLOT_COL } from "./coop.js";
import { reviveRange } from "./world.js";

// Teammates' astronauts, in their own suits (built on demand, rebuilt when the zoom changes).
const suitCache = new Map();
function suitSprites(id) {
  let e = suitCache.get(id);
  if (!e || e.P !== sprites.P) {
    const suit = SUITS.find((x) => x.id === id) || SUITS[0];
    e = { P: sprites.P, ...sprites.astronaut(sprites.P, suit) };
    suitCache.set(id, e);
  }
  return e;
}

const A = BALANCE.arena;
let canvas = null, g = null;
let W = 1, H = 1, dpr = 1;
const bg = { tiles: [], nebula: null, planet: null, vignette: null, tileDpr: 0, tileSize: 512, sky: null, skyKey: "" };

// Most pixels the canvas may have, per quality level. A 4K or high-DPI screen at full resolution
// is 8M+ pixels per frame, which is where the late-game lag came from; this keeps it sharp but sane.
const PIXEL_BUDGET = [900000, 1500000, 2400000];
let suit = null;

function mk(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// ---------- background art (built once per pixel ratio) ----------
function buildStarTile(size, count, minR, maxR, colors, seed) {
  const c = mk(size, size);
  const x = c.getContext("2d");
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < count; i++) {
    const px = rnd() * size, py = rnd() * size;
    const r = (minR + rnd() * (maxR - minR)) * dpr;
    const col = colors[Math.floor(rnd() * colors.length)];
    const a = 0.35 + rnd() * 0.65;
    if (r > 1.3 * dpr) {
      const grd = x.createRadialGradient(px, py, 0, px, py, r * 3);
      grd.addColorStop(0, col);
      grd.addColorStop(0.3, col + "55");
      grd.addColorStop(1, col + "00");
      x.globalAlpha = a;
      x.fillStyle = grd;
      x.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
    }
    x.globalAlpha = a;
    x.fillStyle = col;
    x.beginPath(); x.arc(px, py, r * 0.6, 0, TAU); x.fill();
  }
  return c;
}

function buildNebula() {
  const c = mk(480, 300);
  const x = c.getContext("2d");
  const blob = (cx, cy, r, col, a) => {
    const grd = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, col);
    grd.addColorStop(1, "rgba(3,5,24,0)");
    x.globalAlpha = a;
    x.fillStyle = grd;
    x.fillRect(0, 0, 480, 300);
  };
  blob(380, 30, 230, "rgb(124,58,237)", 0.45);
  blob(60, 160, 210, "rgb(88,28,170)", 0.4);
  blob(250, 320, 220, "rgb(34,211,238)", 0.16);
  blob(140, 40, 150, "rgb(255,66,208)", 0.14);
  blob(440, 230, 160, "rgb(255,66,208)", 0.1);
  return c;
}

function buildPlanet(px) {
  const c = mk(px, px);
  const x = c.getContext("2d");
  const cx = px / 2, cy = px / 2, R = px * 0.26;
  // atmosphere
  let grd = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.5);
  grd.addColorStop(0, "rgba(99,244,255,0.35)");
  grd.addColorStop(1, "rgba(99,244,255,0)");
  x.fillStyle = grd;
  x.beginPath(); x.arc(cx, cy, R * 1.5, 0, TAU); x.fill();
  const ring = (front) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(-0.38);
    x.scale(1, 0.26);
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = i === 1 ? "rgba(99,244,255,0.75)" : "rgba(99,244,255," + (0.18 + i * 0.05) + ")";
      x.lineWidth = px * (i === 1 ? 0.014 : 0.024);
      x.beginPath();
      x.arc(0, 0, R * (1.45 + i * 0.16), front ? 0 : Math.PI, front ? Math.PI : TAU);
      x.stroke();
    }
    x.restore();
  };
  ring(false);
  // sphere
  grd = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  grd.addColorStop(0, "#b8fbff");
  grd.addColorStop(0.35, "#38c8ef");
  grd.addColorStop(0.75, "#1f4fa3");
  grd.addColorStop(1, "#0d1a4a");
  x.fillStyle = grd;
  x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
  // bands
  x.save();
  x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
  x.translate(cx, cy);
  x.rotate(-0.38);
  for (let i = -3; i <= 3; i++) {
    x.fillStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(13,26,74,0.18)";
    x.beginPath(); x.ellipse(0, i * R * 0.24, R * 1.2, R * 0.07, 0, 0, TAU); x.fill();
  }
  // night side
  grd = x.createLinearGradient(-R, -R, R, R);
  grd.addColorStop(0.45, "rgba(3,5,24,0)");
  grd.addColorStop(1, "rgba(3,5,24,0.65)");
  x.fillStyle = grd;
  x.fillRect(-R, -R, R * 2, R * 2);
  x.restore();
  ring(true);
  return c;
}

function buildVignette() {
  const c = mk(256, 256);
  const x = c.getContext("2d");
  const grd = x.createRadialGradient(128, 128, 60, 128, 128, 182);
  grd.addColorStop(0, "rgba(255,30,80,0)");
  grd.addColorStop(1, "rgba(255,30,80,0.85)");
  x.fillStyle = grd;
  x.fillRect(0, 0, 256, 256);
  return c;
}

// ---------- helpers ----------
const lerp = (a, b, t) => a + (b - a) * t;
function lerpAng(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

export const renderer = {
  get ctx() { return g; },

  init(c, suitDef) {
    canvas = c;
    g = c.getContext("2d", { alpha: false }) || c.getContext("2d");
    suit = suitDef;
    bg.nebula = buildNebula();
    bg.vignette = buildVignette();
  },

  setSuit(s) {
    suit = s;
    if (sprites.P) sprites.buildPlayer(sprites.P, s);
  },

  resize() {
    const host = canvas.parentElement;
    const rect = host.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    let coarse = false;
    try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) { /* ignore */ }
    const capBase = coarse ? 1.5 : 2;
    const cap = G.quality === 0 ? 1 : G.quality === 1 ? Math.min(capBase, 1.5) : capBase;
    const budget = Math.sqrt(PIXEL_BUDGET[G.quality] / (W * H));
    // graphics setting: render resolution (the browser scales the canvas back up)
    dpr = Math.max(0.4, Math.min(window.devicePixelRatio || 1, cap, budget) * (G.gfx.resScale || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const long = Math.max(W, H), short = Math.min(W, H);
    const z = Math.min(long / BALANCE.view.long, short / BALANCE.view.short);
    const cam = G.cam;
    cam.z = z; cam.dpr = dpr; cam.cssW = W; cam.cssH = H;
    cam.viewW = W / z; cam.viewH = H / z;
    const P = z * dpr;
    if (!sprites.player || Math.abs(P - sprites.P) > 0.02) {
      sprites.build(P, suit);
      rebuildRockSprites();
    }
    cam.P = P;
    if (bg.tileDpr !== dpr) {
      bg.tileDpr = dpr;
      const T = Math.round(bg.tileSize * dpr);
      bg.tiles = [
        buildStarTile(T, 110, 0.5, 0.9, ["#ffffff", "#c9d0f2", "#9aa4cf"], 7),
        buildStarTile(T, 55, 0.7, 1.3, ["#ffffff", "#bfe9ff", "#d8c8ff"], 31),
        buildStarTile(T, 18, 1.2, 2.1, ["#ffffff", "#63f4ff", "#a57bff", "#ff42d0"], 97),
      ];
      bg.planet = buildPlanet(Math.round(420 * dpr));
    }
    bg.skyKey = "";
  },

  /** Nebula + planet + the farthest stars, composited once into one screen-sized layer
      (it used to be three full-screen draws every frame). Rebuilt on resize / menu ↔ play. */
  buildSky(cw, ch, menu, quality) {
    const bgMode = G.gfx.background;
    const key = cw + "x" + ch + (menu ? "m" : "p") + quality + bgMode;
    if (bg.skyKey === key) return;
    bg.skyKey = key;
    const mw = Math.round(cw * 1.06), mh = Math.round(ch * 1.06);
    const c = bg.sky && bg.sky.width === mw && bg.sky.height === mh ? bg.sky : mk(mw, mh);
    const x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.fillStyle = "#030518";
    x.fillRect(0, 0, mw, mh);
    if (bgMode === "off" && !menu) { bg.sky = c; return; }
    if (quality > 0 && bgMode === "full") {
      const nw = Math.max(mw, mh * 1.6) * 1.1, nh = nw * 0.625;
      x.drawImage(bg.nebula, (mw - nw) / 2, (mh - nh) / 2, nw, nh);
      const T = bg.tiles[0].width;
      for (let ty = 0; ty < mh; ty += T) for (let tx = 0; tx < mw; tx += T) x.drawImage(bg.tiles[0], tx, ty);
    }
    const ps = Math.min(mw, mh) * (menu ? 0.95 : 0.62);
    x.globalAlpha = menu ? 0.9 : 0.55;
    x.drawImage(bg.planet, mw * (menu ? 0.8 : 0.86) - ps / 2, mh * (menu ? 0.2 : 0.14) - ps / 2, ps, ps);
    x.globalAlpha = 1;
    bg.sky = c;
  },

  /** Follows the (interpolated) player with a little look-ahead toward the aim. */
  updateCamera(alpha, dt) {
    const cam = G.cam;
    const P = G.player;
    let tx = A.w / 2, ty = A.h / 2;
    if (P) {
      const px = lerp(P.px, P.x, alpha), py = lerp(P.py, P.y, alpha);
      let lx = 0, ly = 0;
      if (!P.dead && G.settings.lookahead) {
        if (input.aimMode === "mouse") {
          lx = clamp((G.aimWorld.x - px) * 0.18, -110, 110);
          ly = clamp((G.aimWorld.y - py) * 0.18, -80, 80);
        } else {
          lx = Math.cos(P.aimAng) * 60; ly = Math.sin(P.aimAng) * 45;
        }
      }
      cam.leadX += (lx - cam.leadX) * smooth(4, dt);
      cam.leadY += (ly - cam.leadY) * smooth(4, dt);
      tx = px + cam.leadX; ty = py + cam.leadY;
    }
    const k = G.state === "menu" ? smooth(1.5, dt) : smooth(9, dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    // keep the arena filling the screen when it can
    // a little room past the edges (more at the top, where the HUD sits) so you're never under it
    const m = 110, mTop = 60 + 110 / cam.z;
    const hw = cam.viewW / 2, hh = cam.viewH / 2;
    if (cam.viewW > A.w + m * 2) cam.x = A.w / 2; else cam.x = clamp(cam.x, hw - m, A.w - hw + m);
    if (cam.viewH > A.h + m + mTop) cam.y = A.h / 2; else cam.y = clamp(cam.y, hh - mTop, A.h - hh + m);
    // mouse → world for aiming
    if (input.mouse.seen) {
      G.aimWorld.x = cam.x + (input.mouse.x - W / 2) / cam.z;
      G.aimWorld.y = cam.y + (input.mouse.y - H / 2) / cam.z;
    }
  },

  draw(alpha, dt) {
    const cam = G.cam;
    const P = cam.P;
    const quality = G.quality;
    const cw = canvas.width, ch = canvas.height;
    const camX = cam.x, camY = cam.y;
    const offX = cw / 2 + fx.shakeX * dpr, offY = ch / 2 + fx.shakeY * dpr;
    fx.camX = camX; fx.camY = camY; fx.offX = offX; fx.offY = offY;
    if (G.hitMark > 0) G.hitMark -= dt;
    if (G.killMark > 0) G.killMark -= dt;

    // ---------- background ----------
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    this.buildSky(cw, ch, G.state === "menu", quality);
    {
      // the cached sky drifts a touch with the camera (parallax), inside its 6% margin
      const sky = bg.sky;
      const mx = (sky.width - cw) / 2, my = (sky.height - ch) / 2;
      const px = clamp(-(camX - A.w / 2) / (A.w / 2), -1, 1) * mx, py = clamp(-(camY - A.h / 2) / (A.h / 2), -1, 1) * my;
      g.drawImage(sky, -mx + px, -my + py);
    }
    const T = bg.tiles.length ? bg.tiles[0].width : 1;
    const factors = [0.1, 0.22, 0.42];
    const bgMode = G.gfx.background;
    const firstLayer = bgMode === "full" || G.state === "menu" ? (quality > 0 ? 1 : 2) : bgMode === "simple" ? 2 : 9;
    for (let L = firstLayer; L < bg.tiles.length; L++) {
      const f = factors[L];
      let ox = -((camX * f * cam.z * dpr) % T); if (ox > 0) ox -= T;
      let oy = -((camY * f * cam.z * dpr) % T); if (oy > 0) oy -= T;
      for (let ty = oy; ty < ch; ty += T) for (let tx = ox; tx < cw; tx += T) g.drawImage(bg.tiles[L], tx, ty);
    }

    // ---------- world ----------
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);
    const vx0 = camX - cam.viewW / 2 - 40, vx1 = camX + cam.viewW / 2 + 40;
    const vy0 = camY - cam.viewH / 2 - 40, vy1 = camY + cam.viewH / 2 + 40;

    // outside the arena: darker
    g.fillStyle = "rgba(2,3,12,0.6)";
    if (vx0 < 0) g.fillRect(vx0, vy0, -vx0, vy1 - vy0);
    if (vx1 > A.w) g.fillRect(A.w, vy0, vx1 - A.w, vy1 - vy0);
    if (vy0 < 0) g.fillRect(Math.max(0, vx0), vy0, Math.min(A.w, vx1) - Math.max(0, vx0), -vy0);
    if (vy1 > A.h) g.fillRect(Math.max(0, vx0), A.h, Math.min(A.w, vx1) - Math.max(0, vx0), vy1 - A.h);
    // floor grid
    if (G.gfx.grid) {
      g.strokeStyle = "rgba(99,244,255,0.05)";
      g.lineWidth = 1 / cam.z;
      g.beginPath();
      for (let x = Math.max(0, Math.ceil(vx0 / 100) * 100); x <= Math.min(A.w, vx1); x += 100) { g.moveTo(x, Math.max(0, vy0)); g.lineTo(x, Math.min(A.h, vy1)); }
      for (let y = Math.max(0, Math.ceil(vy0 / 100) * 100); y <= Math.min(A.h, vy1); y += 100) { g.moveTo(Math.max(0, vx0), y); g.lineTo(Math.min(A.w, vx1), y); }
      g.stroke();
    }
    // border
    g.strokeStyle = "rgba(99,244,255,0.1)";
    g.lineWidth = 12;
    g.strokeRect(-6, -6, A.w + 12, A.h + 12);
    g.strokeStyle = "rgba(99,244,255,0.7)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, A.w, A.h);
    g.strokeStyle = C.magenta;
    g.lineWidth = 3;
    const cl = 46;
    g.beginPath();
    g.moveTo(0, cl); g.lineTo(0, 0); g.lineTo(cl, 0);
    g.moveTo(A.w - cl, 0); g.lineTo(A.w, 0); g.lineTo(A.w, cl);
    g.moveTo(A.w, A.h - cl); g.lineTo(A.w, A.h); g.lineTo(A.w - cl, A.h);
    g.moveTo(cl, A.h); g.lineTo(0, A.h); g.lineTo(0, A.h - cl);
    g.stroke();

    const Pl = G.player;
    const s = G.stats;
    const plx = Pl ? lerp(Pl.px, Pl.x, alpha) : 0, ply = Pl ? lerp(Pl.py, Pl.y, alpha) : 0;

    // sloth: trail + field
    const pd = G.puddles;
    if (pd.count) {
      g.fillStyle = "#a57bff";
      for (let i = 0; i < pd.count; i++) {
        const q = pd.items[i];
        g.globalAlpha = 0.16 * (q.life / q.max);
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    for (let i = 0; i < G.players.length; i++) {
      const Q = G.players[i];
      const R = Q === G.me && s ? s.slowRadius : Q.slowR;
      if (Q.dead || Q.gone || !(R > 0)) continue;
      const qx = Q === Pl ? plx : lerp(Q.px, Q.x, alpha), qy = Q === Pl ? ply : lerp(Q.py, Q.y, alpha);
      g.fillStyle = "rgba(165,123,255,0.06)";
      g.beginPath(); g.arc(qx, qy, R, 0, TAU); g.fill();
      g.strokeStyle = "rgba(201,184,255,0.3)";
      g.lineWidth = 1.5;
      g.setLineDash([3, 9]);
      g.lineDashOffset = G.time * 8;
      g.stroke();
      g.setLineDash([]);
    }

    // mines (shop gear)
    const mn = G.mines;
    for (let i = 0; i < mn.count; i++) {
      const q = mn.items[i];
      const armed = q.t > 0.35;
      g.fillStyle = "#1a1030";
      g.beginPath(); g.arc(q.x, q.y, 9, 0, TAU); g.fill();
      g.strokeStyle = C.orange; g.lineWidth = 2;
      g.stroke();
      const blink = armed && Math.floor(G.time * (q.life - q.t < 2 ? 12 : 4)) % 2 === 0;
      g.fillStyle = blink ? "#ffffff" : C.orange;
      g.beginPath(); g.arc(q.x, q.y, 3.4, 0, TAU); g.fill();
      if (armed) { g.globalAlpha = 0.12; g.beginPath(); g.arc(q.x, q.y, 36, 0, TAU); g.fill(); g.globalAlpha = 1; }
    }

    // spawn warnings
    const ws = G.warnings;
    for (let i = 0; i < ws.count; i++) {
      const w = ws.items[i];
      const kind = ROSTER[w.type] || BOSSES[w.type];
      const col = kind ? kind.accent : C.danger;
      const p = 1 - w.t / w.max;
      const R = w.spread + 18;
      g.globalAlpha = 0.12 + p * 0.18;
      g.fillStyle = col;
      g.beginPath(); g.arc(w.x, w.y, R * (0.4 + p * 0.6), 0, TAU); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath(); g.arc(w.x, w.y, R, -Math.PI / 2, -Math.PI / 2 + p * TAU); g.stroke();
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const a = k * (Math.PI / 2) + G.time * 2;
        const rr = R + 12 - p * 10;
        const cx = w.x + Math.cos(a) * rr, cy = w.y + Math.sin(a) * rr;
        const ca = Math.cos(a), sa = Math.sin(a);
        g.beginPath();
        g.moveTo(cx + ca * 6 - sa * 6, cy + sa * 6 + ca * 6);
        g.lineTo(cx, cy);
        g.lineTo(cx + ca * 6 + sa * 6, cy + sa * 6 - ca * 6);
        g.stroke();
      }
      if (w.count > 1) {
        g.fillStyle = "#ffffff";
        g.font = "700 15px Rajdhani, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("×" + w.count, w.x, w.y);
      }
      g.globalAlpha = 1;
    }

    // pickups
    const pk = G.pickups;
    for (let i = 0; i < pk.count; i++) {
      const q = pk.items[i];
      if (q.life < 3 && Math.floor(q.life * 8) % 2 === 0) continue;
      const x = lerp(q.px, q.x, alpha), y = lerp(q.py, q.y, alpha);
      const spr = q.kind === 2 ? sprites.heart : q.kind === 1 ? sprites.gold : sprites.star;
      const pulse = 1 + Math.sin(G.time * 6 + i) * 0.1;
      const sz = spr.w * pulse * (q.t < 0.15 ? q.t / 0.15 : 1);
      g.drawImage(spr.c, x - sz / 2, y - sz / 2, sz, sz);
    }

    // asteroids
    const as = G.asteroids;
    for (let i = 0; i < as.count; i++) {
      const a = as.items[i];
      const x = lerp(a.px, a.x, alpha), y = lerp(a.py, a.y, alpha);
      if (x < vx0 - a.r || x > vx1 + a.r || y < vy0 - a.r || y > vy1 + a.r) continue;
      const rot = lerp(a.prot, a.rot, alpha);
      const c = Math.cos(rot), sn = Math.sin(rot);
      g.setTransform(c * P, sn * P, -sn * P, c * P, offX + (x - camX) * P, offY + (y - camY) * P);
      g.drawImage(a.spr.c, -a.spr.w / 2, -a.spr.h / 2, a.spr.w, a.spr.h);
      if (a.flash > 0) {
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.5;
        g.drawImage(a.spr.c, -a.spr.w / 2, -a.spr.h / 2, a.spr.w, a.spr.h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = "source-over";
      }
    }
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    // telegraphs (under the robots)
    const en = G.enemies;
    for (let i = 0; i < en.count; i++) {
      const e = en.items[i];
      if (e.dead || e.ally > 0 || !e.kind.drawUnder) continue;
      e.kind.drawUnder(g, e, lerp(e.px, e.x, alpha), lerp(e.py, e.y, alpha));
    }

    fx.drawBelow(g);

    // robots
    for (let i = 0; i < en.count; i++) {
      const e = en.items[i];
      if (e.dead || e.boss) continue;
      let x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha);
      if (x < vx0 - 60 || x > vx1 + 60 || y < vy0 - 60 || y > vy1 + 60) continue;
      const art = e.art;
      if (!art) { e.kind.draw(g, e, x, y); continue; }
      const spr = e.flash > 0 ? art.flash : e.ally > 0 ? art.ally : art.base;
      let sc = e.scale;
      if (e.spawnT > 0) { const t = 1 - e.spawnT / 0.35; sc *= Math.max(0.05, t * t); }
      if (e.kind.shakeAmt) { const sh = e.kind.shakeAmt(e); if (sh) { x += rand(-sh, sh); y += rand(-sh, sh); } }
      const ang = lerpAng(e.pang, e.ang, alpha);
      const c = Math.cos(ang) * sc * P, sn = Math.sin(ang) * sc * P;
      g.setTransform(c, sn, -sn, c, offX + (x - camX) * P, offY + (y - camY) * P);
      g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      if (e.spawnT > 0) {
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = e.spawnT / 0.35;
        g.drawImage(art.flash.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = "source-over";
      }
      if (e.kind.drawOver || e.elite || e.ally > 0 || e.shield > 0 || (e.hp < e.maxHp && e.maxHp >= 80)) {
        g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);
        if (e.kind.drawOver) e.kind.drawOver(g, e, x, y);
        const R = e.r * e.scale;
        if (e.elite) {
          g.strokeStyle = C.amber;
          g.globalAlpha = 0.85;
          g.lineWidth = 2;
          g.setLineDash([5, 5]);
          g.lineDashOffset = G.time * 20;
          g.beginPath(); g.arc(x, y, R + 6, 0, TAU); g.stroke();
          g.setLineDash([]);
          const t = e.traits;
          if (t & 2) {        // hasted: speed streaks behind it
            const c = Math.cos(e.ang), sn = Math.sin(e.ang);
            g.strokeStyle = "#ffffff"; g.globalAlpha = 0.6; g.lineWidth = 2;
            g.beginPath();
            for (let k = -1; k <= 1; k += 2) {
              const ox = x - c * (R + 6) - sn * k * 6, oy = y - sn * (R + 6) + c * k * 6;
              g.moveTo(ox, oy); g.lineTo(ox - c * 12, oy - sn * 12);
            }
            g.stroke();
          }
          if (t & 4) {        // volatile: a pulsing orange halo
            g.strokeStyle = C.orange; g.globalAlpha = 0.5 + Math.sin(G.time * 10) * 0.3; g.lineWidth = 2;
            g.beginPath(); g.arc(x, y, R + 11, 0, TAU); g.stroke();
          }
          if (t & 8) {        // regenerating: a green plus
            g.fillStyle = C.green; g.globalAlpha = 0.9;
            g.fillRect(x + R + 2, y - R - 9, 8, 2.5); g.fillRect(x + R + 4.75, y - R - 11.75, 2.5, 8);
          }
          g.globalAlpha = 1;
        }
        if (e.shield > 0 && e.shieldMax > 0) {
          g.strokeStyle = C.cyan; g.globalAlpha = 0.9; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, R + 3, -Math.PI / 2, -Math.PI / 2 + TAU * (e.shield / e.shieldMax)); g.stroke();
          g.globalAlpha = 1;
        }
        if (e.ally > 0) {
          g.strokeStyle = C.magenta;
          g.lineWidth = 2;
          g.globalAlpha = 0.9;
          g.beginPath(); g.arc(x, y, R + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (e.ally / e.allyMax)); g.stroke();
          g.globalAlpha = 1;
        }
        if (e.hp < e.maxHp && (e.maxHp >= 80 || e.elite)) {
          const bw = Math.max(26, R * 1.8), bx = x - bw / 2, by = y - R - 12;
          g.fillStyle = "rgba(3,5,24,0.8)";
          g.fillRect(bx - 1, by - 1, bw + 2, 5);
          g.fillStyle = e.kind.accent;
          g.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3);
        }
      }
    }
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    // bosses
    for (let i = 0; i < en.count; i++) {
      const e = en.items[i];
      if (e.dead || !e.boss) continue;
      e.kind.draw(g, e, lerp(e.px, e.x, alpha), lerp(e.py, e.y, alpha), lerpAng(e.pang, e.ang, alpha));
    }
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    // auto-aim reticle (and a lighter one for aim assist)
    const tgt = G.autoTarget || G.assistTarget;
    if (tgt && !tgt.dead && Pl && !Pl.dead && G.state !== "menu") {
      const x = lerp(tgt.px, tgt.x, alpha), y = lerp(tgt.py, tgt.y, alpha);
      const R = tgt.r * tgt.scale + 9;
      g.strokeStyle = G.autoTarget ? "rgba(99,244,255,0.75)" : "rgba(99,244,255,0.4)";
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const a = G.time * 2 + k * (Math.PI / 2);
        g.beginPath(); g.arc(x, y, R, a, a + 0.6); g.stroke();
      }
    }

    // player shots
    const pb = G.pb;
    for (let i = 0; i < pb.count; i++) {
      const b = pb.items[i];
      const x = lerp(b.px, b.x, alpha), y = lerp(b.py, b.y, alpha);
      const spr = sprites.shots[b.kind] || sprites.bullet;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const k = b.special ? (b.r / 7) * (1 + Math.sin(G.time * 30) * 0.08) : b.kind === 7 ? b.r / 7.5 : 1;
      const c = (b.vx / sp) * P * k, sn = (b.vy / sp) * P * k;
      g.setTransform(c, sn, -sn, c, offX + (x - camX) * P, offY + (y - camY) * P);
      g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      if (b.special && b.full) {
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.5;
        g.drawImage(spr.c, -spr.w * 0.7, -spr.h * 0.7, spr.w * 1.4, spr.h * 1.4);
        g.globalAlpha = 1;
        g.globalCompositeOperation = "source-over";
      }
    }
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    // teammates (co-op), then you on top
    const coop = G.net.role !== "off";
    for (let i = 0; i < G.players.length; i++) {
      const Q = G.players[i];
      if (Q === Pl || Q.gone) continue;
      const qx = lerp(Q.px, Q.x, alpha), qy = lerp(Q.py, Q.y, alpha);
      if (Q.dead) this.drawDowned(Q, qx, qy, P, offX, offY, camX, camY);
      else this.drawPlayer(Q, qx, qy, alpha, P, offX, offY, camX, camY);
      g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);
      this.drawTag(Q, qx, qy);
    }
    if (Pl && coop && Pl.dead && G.state !== "over") this.drawDowned(Pl, plx, ply, P, offX, offY, camX, camY);
    else if (Pl && (!Pl.dead || Pl.deathT < 0.02)) this.drawPlayer(Pl, plx, ply, alpha, P, offX, offY, camX, camY);
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);
    if (Pl && coop) {
      // your colour, under you
      g.strokeStyle = SLOT_COL[Pl.slot] || "#fff";
      g.globalAlpha = 0.55;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(plx, ply + 21, 15, 5, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }

    // robot shots (on top: always readable)
    const eb = G.eb;
    const hc = G.settings.contrastShots;
    for (let i = 0; i < eb.count; i++) {
      const b = eb.items[i];
      const x = lerp(b.px, b.x, alpha), y = lerp(b.py, b.y, alpha);
      if (b.bolt) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const c = (b.vx / sp) * P, sn = (b.vy / sp) * P;
        g.setTransform(c, sn, -sn, c, offX + (x - camX) * P, offY + (y - camY) * P);
        const spr = sprites.bolt;
        g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      } else {
        const set = hc ? sprites.orbsHC : sprites.orbs;
        const spr = set[b.look] || set.pink;
        const sz = spr.w * (b.r / 6) * (hc ? 1.12 : 1) * (1 + Math.sin(G.time * 18 + i) * 0.06);
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        g.drawImage(spr.c, x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    fx.drawAdditive(g, P);
    fx.drawNumbers(g);

    // ---------- screen space ----------
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawIndicators(alpha);

    if (Pl && !Pl.dead && Pl.hp <= 2 && G.state !== "menu") {
      const pulse = 0.5 + Math.sin(G.time * (Pl.hp <= 1 ? 9 : 5)) * 0.5;
      g.globalAlpha = (Pl.hp <= 1 ? 0.55 : 0.32) * (0.6 + pulse * 0.4) * (G.settings.reducedMotion ? 0.6 : 1);
      g.drawImage(bg.vignette, 0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (fx.flash.a > 0.001) {
      g.globalAlpha = Math.min(1, fx.flash.a);
      g.fillStyle = fx.flash.col;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (input.mode === "kbm" && input.mouse.inside && (G.state === "playing" || G.state === "clear")) this.drawCrosshair();
  },

  /** A teammate's name and colour (co-op). */
  drawTag(Q, x, y) {
    const col = SLOT_COL[Q.slot] || "#fff";
    g.strokeStyle = col;
    g.globalAlpha = 0.55;
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y + 21, 15, 5, 0, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    g.font = "700 12px Rajdhani, 'Plus Jakarta Sans', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(3,5,24,0.85)";
    g.strokeText(Q.name || "Player", x, y - 38);
    g.fillStyle = col;
    g.fillText(Q.name || "Player", x, y - 38);
  },

  /** Down (co-op): a ghost, and the ring a teammate stands in to revive them. */
  drawDowned(Q, x, y, P, offX, offY, camX, camY) {
    const col = SLOT_COL[Q.slot] || "#fff";
    g.globalAlpha = 0.35 + Math.sin(G.time * 4) * 0.1;
    const spr = Q === G.me ? sprites.player : suitSprites(Q.suit).player;
    g.setTransform(P * 0.9, 0, 0, P * 0.9, offX + (x - camX) * P, offY + (y - camY) * P);
    g.rotate(Math.PI / 2.4);
    g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    g.globalAlpha = 1;
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.setLineDash([6, 8]);
    g.lineDashOffset = -G.time * 20;
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(x, y, reviveRange, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    if (Q.reviveT > 0) {
      g.strokeStyle = C.mint;
      g.lineWidth = 5;
      g.beginPath(); g.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, Q.reviveT)); g.stroke();
    }
    g.font = "800 11px 'Plus Jakarta Sans', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = C.danger;
    g.fillText(Q === G.me ? "DOWN · a teammate can revive you" : "REVIVE", x, y + 44);
  },

  drawPlayer(Pl, x, y, alpha, P, offX, offY, camX, camY) {
    const s = G.stats;
    const me = Pl === G.me;
    const look = me ? null : suitSprites(Pl.suit);
    const bob = Math.sin(G.time * 3 + Pl.slot) * 1.5;
    // boost afterimages
    for (let k = G.gfx.trails ? Pl.trailN - 1 : -1; k >= 0; k--) {
      const tx = Pl.trailX[k], ty = Pl.trailY[k];
      g.setTransform(Pl.facing * P, 0, 0, P, offX + (tx - camX) * P, offY + (ty - camY) * P);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.28 * (1 - k / 6) * Math.min(1, Pl.ghostT / 0.18 + 0.3);
      const spr = me ? sprites.playerFlash : look.flash;
      g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    // boost cooldown arc
    if (me && Pl.boostCdT > 0 && Pl.boostT <= 0 && !Pl.dead) {
      const max = s.boostCd;
      g.strokeStyle = "rgba(99,244,255,0.55)";
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y + bob, 25, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - Pl.boostCdT / max));
      g.stroke();
    }

    const blink = Pl.iframes > 0 && Pl.boostT <= 0 && Pl.grace <= 0 && Math.floor(G.time * 18) % 2 === 0;
    const t = Pl.tilt;
    const c = Math.cos(t), sn = Math.sin(t), f = Pl.facing;
    g.globalAlpha = blink ? 0.35 : 1;

    // gun behind or in front depending on aim
    const gunId = (me ? s.gunId : Pl.gunId) || "blaster";
    const gcol = GUN_COL[gunId] || C.cyan;
    const gpal = gunPal(gunId);
    const drawGun = () => {
      const a = Pl.aimAng;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.setTransform(ca * P, sa * P, -sa * P, ca * P, offX + (x - camX) * P, offY + (y + 3 + bob - camY) * P);
      const G2 = GUN_SHAPE[gunId] || GUN_SHAPE.blaster;
      const len = G2.len - Pl.recoil * G2.kick;
      const hw = G2.w / 2;
      g.fillStyle = "#c9d0f2";
      g.fillRect(4, -hw, len, G2.w);
      g.fillStyle = "#232c5e";
      g.fillRect(4, -hw, 5, G2.w);
      if (G2.mag) g.fillRect(9, hw, 4, G2.mag);
      if (G2.coils) { g.fillStyle = gcol; for (let k = 0; k < 3; k++) g.fillRect(10 + k * 3.5, -hw - 1, 1.6, G2.w + 2); }
      g.fillStyle = gcol;
      g.fillRect(4 + len - 3, -hw, 3, G2.w);
      // charged shot: a growing orb at the muzzle
      if (Pl.charging) {
        const c2 = Pl.charge, pulse = Pl.chargeFull || Pl.charge >= 1 ? 1 + Math.sin(G.time * 28) * 0.15 : 1;
        const r = (5 + c2 * 13) * pulse;
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.55 + c2 * 0.45;
        g.drawImage(sprites.dots[gpal], len + 6 - r, -r, r * 2, r * 2);
        g.globalAlpha = 1;
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "#ffffff";
        g.beginPath(); g.arc(len + 6, 0, 1.5 + c2 * 3.2, 0, TAU); g.fill();
      }
      if (Pl.muzzle > 0) {
        g.globalCompositeOperation = "lighter";
        const d = sprites.dots[gpal];
        g.drawImage(d, len + 2, -9, 18, 18);
        g.globalCompositeOperation = "source-over";
      }
    };
    const aimUp = Math.sin(Pl.aimAng) < -0.3;
    if (aimUp) drawGun();
    const spr = me ? (Pl.hurtT > 0.3 ? sprites.playerFlash : sprites.player) : (Pl.hurtT > 0.3 ? look.flash : look.player);
    g.setTransform(c * f * P, sn * f * P, -sn * P, c * P, offX + (x - camX) * P, offY + (y + bob - camY) * P);
    g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    if (!aimUp) drawGun();
    g.globalAlpha = 1;
    g.setTransform(P, 0, 0, P, offX - camX * P, offY - camY * P);

    // shield
    if (Pl.shield > 0) {
      g.strokeStyle = "rgba(99,244,255,0.7)";
      g.lineWidth = 2;
      for (let k = 0; k < Pl.shield; k++) {
        const a0 = -Math.PI / 2 + (k / Math.max(1, Pl.maxShield)) * TAU + 0.08;
        g.beginPath(); g.arc(x, y + bob, 29, a0, a0 + TAU / Math.max(1, Pl.maxShield) - 0.16); g.stroke();
      }
    }
    // charge meter around you
    if (Pl.charging && !Pl.dead) {
      g.strokeStyle = Pl.chargeFull ? "#ffffff" : gcol;
      g.globalAlpha = Pl.chargeFull ? 0.65 + Math.sin(G.time * 24) * 0.3 : 0.85;
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y + bob, 31, -Math.PI / 2, -Math.PI / 2 + TAU * Pl.charge); g.stroke();
      g.globalAlpha = 1;
    }
    // Bubble Shield
    if (Pl.bubble && !Pl.dead) {
      g.strokeStyle = "rgba(99,244,255,0.55)";
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y + bob, 27 + Math.sin(G.time * 3) * 1.5, 0, TAU); g.stroke();
      g.fillStyle = "rgba(99,244,255,0.06)";
      g.fill();
    }
    // buddy drones
    const drones = Pl.drones;
    if (drones.length && sprites.buddy) {
      const spr3 = sprites.buddy;
      for (let i = 0; i < drones.length; i++) {
        const d = drones[i];
        g.drawImage(spr3.c, d.x - spr3.w / 2, d.y - spr3.h / 2 + Math.sin(G.time * 4 + i) * 2, spr3.w, spr3.h);
      }
    }
    // stolen bulwark shield
    if (me && Pl.envy.length && hasEnvy("bulwark")) {
      const arc = ENVY_POWERS.bulwark.arc;
      g.strokeStyle = C.mint;
      g.lineWidth = 5;
      g.globalAlpha = 0.8;
      g.beginPath(); g.arc(x, y, 34, Pl.aimAng - arc, Pl.aimAng + arc); g.stroke();
      g.globalAlpha = 1;
    }
    // moons
    const nMoons = me ? s.orbitals : Pl.orbN;
    if (nMoons) {
      const O = BALANCE.upgrades.orbit;
      const spr2 = sprites.orbital;
      for (let i = 0; i < nMoons; i++) {
        const a = G.time * O.speed + (i / nMoons) * TAU;
        const ox = x + Math.cos(a) * O.radius, oy = y + Math.sin(a) * O.radius;
        g.drawImage(spr2.c, ox - spr2.w / 2, oy - spr2.h / 2, spr2.w, spr2.h);
      }
    }
  },

  drawIndicators(alpha) {
    const cam = G.cam;
    const z = cam.z;
    const inset = 22;
    const hw = W / 2 - inset, hh = H / 2 - inset;
    let drawn = 0;
    const arrow = (sx, sy, col, size, a) => {
      const ang = Math.atan2(sy, sx);
      // project onto the screen-edge rectangle
      const k = Math.min(hw / Math.abs(sx || 1e-6), hh / Math.abs(sy || 1e-6));
      const px = W / 2 + sx * k, py = H / 2 + sy * k;
      g.globalAlpha = a;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(px + Math.cos(ang) * size, py + Math.sin(ang) * size);
      g.lineTo(px + Math.cos(ang + 2.5) * size * 0.8, py + Math.sin(ang + 2.5) * size * 0.8);
      g.lineTo(px + Math.cos(ang - 2.5) * size * 0.8, py + Math.sin(ang - 2.5) * size * 0.8);
      g.closePath();
      g.fill();
      return [px, py];
    };
    const en = G.enemies;
    for (let i = 0; i < en.count && drawn < 24 && G.settings.arrows; i++) {
      const e = en.items[i];
      if (e.dead || e.ally > 0) continue;
      const sx = (e.x - cam.x) * z, sy = (e.y - cam.y) * z;
      if (Math.abs(sx) < W / 2 + e.r * z && Math.abs(sy) < H / 2 + e.r * z) continue;
      const d = Math.hypot(sx, sy) / z;
      const a = Math.max(0.25, Math.min(0.95, 1.4 - d / 900));
      arrow(sx, sy, e.kind.accent, e.boss ? 16 : 8, a);
      drawn++;
    }
    for (let i = 0; i < G.players.length; i++) {
      const Q = G.players[i];
      if (Q === G.me || Q.gone) continue;
      const sx = (Q.x - cam.x) * z, sy = (Q.y - cam.y) * z;
      if (Math.abs(sx) < W / 2 && Math.abs(sy) < H / 2) continue;
      arrow(sx, sy, SLOT_COL[Q.slot] || "#fff", Q.dead ? 15 : 12, Q.dead ? 0.6 + Math.sin(G.time * 10) * 0.4 : 0.9);
    }
    const ws = G.warnings;
    for (let i = 0; i < ws.count; i++) {
      const w = ws.items[i];
      const sx = (w.x - cam.x) * z, sy = (w.y - cam.y) * z;
      if (Math.abs(sx) < W / 2 && Math.abs(sy) < H / 2) continue;
      const pulse = 0.6 + Math.sin(G.time * 14) * 0.4;
      const kind = ROSTER[w.type];
      const p = arrow(sx, sy, kind ? kind.accent : "#fff", 11, pulse);
      g.fillStyle = "#030518";
      g.font = "800 10px 'Plus Jakarta Sans', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.globalAlpha = pulse;
      g.fillText("!", p[0] - Math.cos(Math.atan2(sy, sx)) * 2, p[1] - Math.sin(Math.atan2(sy, sx)) * 2);
    }
    g.globalAlpha = 1;
  },

  drawCrosshair() {
    const x = input.mouse.x, y = input.mouse.y;
    const spin = G.time * 1.5;
    g.strokeStyle = "rgba(3,5,24,0.7)";
    g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, 10, 0, TAU); g.stroke();
    g.strokeStyle = C.cyan;
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 10, 0, TAU); g.stroke();
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = spin + k * (Math.PI / 2);
      g.moveTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      g.lineTo(x + Math.cos(a) * 19, y + Math.sin(a) * 19);
    }
    g.stroke();
    g.fillStyle = C.magenta;
    g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
    const Pl = G.player;
    if (Pl && Pl.charging) {
      g.strokeStyle = Pl.chargeFull ? "#ffffff" : C.amber;
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * Pl.charge); g.stroke();
    }
    // hit markers: white X on a hit, red on a kill
    const hm = Math.max(G.hitMark, G.killMark);
    if (hm > 0) {
      const kill = G.killMark > 0;
      const r0 = 7, r1 = kill ? 15 : 12;
      g.strokeStyle = kill ? "#ff3b5c" : "#ffffff";
      g.globalAlpha = Math.min(1, hm * 8);
      g.lineWidth = kill ? 3 : 2;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * (Math.PI / 2);
        g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
  },
};

// How each gun looks in your hands: length, thickness, recoil, extras.
const GUN_SHAPE = {
  blaster: { len: 17, w: 5.2, kick: 4 },
  scatter: { len: 15, w: 7.4, kick: 7 },
  smg:     { len: 13, w: 4.6, kick: 2, mag: 5 },
  rail:    { len: 25, w: 4, kick: 6 },
  nova:    { len: 16, w: 8, kick: 6 },
  arc:     { len: 18, w: 5.2, kick: 3, coils: true },
  heart:   { len: 15, w: 5.6, kick: 3 },
};

