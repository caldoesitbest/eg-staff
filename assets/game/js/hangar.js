/* The Cosmic Hangar (4.3): the pre-run lobby. Five tabs share one screen (#screen-menu): Play (your
   astronaut on its platform, the modes, PLAY), Locker (wear what you own, try on what you don't, three
   saved outfits), Item Shop (a daily featured row, every item by kind, collections, buying with Sigils),
   Challenges (daily contracts, the Daily Challenge, achievements close to done) and Profile (your stats
   and every achievement). The big astronauts are drawn by Stage from the same sprite code as the game,
   so what you see here is what you fly. Nothing here runs the game: only the open tab's stage animates. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { store } from "./storage.js";
import {
  RARITY, KINDS, KIND_BY_ID, SETS, SET_BY_ID, item, itemsOf, shopItems, owns, source, equipped, equip, buy, look,
  trailPalOf, trailStyleOf, finishColOf, featured, dayKey, savePreset, applyPreset, setItems, ownedCount, ITEMS, DEFAULTS, parseLook,
} from "./catalog.js";
import { contracts, contractText, contractTier, contractReward, contractsResetIn } from "./contracts.js";
import { achvSigils } from "./catalog.js";
import { ACHIEVEMENTS, ACH_BY_ID } from "./progress.js";
import { sprites, PAL, C } from "./sprites.js";
import { GUN_COL } from "./armory.js";
import { formatScore } from "./util.js";
import { friendsUI, portalSlots, placePortals } from "./friends.js";
import { party } from "./party.js";
import { levelOf, tierOf, LEVEL_HATS, nextHat } from "./xp.js";
import { levelBadge } from "./ui.js";
import { cloud } from "./cloud.js";
import { online } from "./online.js";

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const icon = (name, cls) => (window.egIcon ? window.egIcon(name, cls) : document.createElement("span"));
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const sigilTag = (n, cls) => { const s = el("span", "sig" + (cls ? " " + cls : "")); s.append(icon("gem"), document.createTextNode(String(n))); return s; };
const reduced = () => !!store.data.settings.reducedMotion;
const fmtTime = (s) => { const m = Math.floor(s / 60); return m + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };
const MODES = {
  ladder: { name: "The Sin Ladder", sub: "Seven sins, one climb" },
  daily: { name: "Daily Challenge", sub: "One seed for everyone today" },
  rush: { name: "Boss Rush", sub: "The seven sins, back to back" },
};
/** The mode the Play tab shows: yours, or in a party you're not leading, the leader's pick. */
function modeNow() {
  if (party.on && !party.leading && party.pick) return party.pick.mode;
  const m = store.data.settings.mode;
  return MODES[m] ? m : "ladder";
}

// ---------------------------------------------------------------------------
// the stage: a big astronaut on a lit platform, aiming at your pointer
// ---------------------------------------------------------------------------
class Stage {
  constructor(cv) {
    this.cv = cv;
    this.g = cv.getContext("2d");
    this.over = null;               // a try-on: { hat: "halo" } and so on
    this.victory = "";              // a victory effect to preview over the astronaut
    this.W = 0; this.H = 0;
    this.dirty = true;
    this.t = Math.random() * 10;
    this.face = 1; this.flip = 1; this.aim = 0.2;
    this.spr = null; this.flash = null; this.sprKey = "";
    this.lastKey = ""; this.swap = 0; this.swapCol = "#63f4ff";
    this.puffs = []; this.puffT = 0;
    this.bursts = []; this.burstT = 0;
    if (window.ResizeObserver) new ResizeObserver(() => { this.dirty = true; }).observe(cv);
  }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (W !== this.cv.width || H !== this.cv.height) { this.cv.width = W; this.cv.height = H; }
    this.W = W; this.H = H; this.dirty = false;
  }
  /** Try something on (null: back to what you're wearing). col: the shimmer's colour. */
  tryOn(over, col) {
    this.over = over;
    this.victory = over && over.victory !== undefined ? over.victory : "";
    if (col) this.swapCol = col;
  }
  pointer() {
    if (!ptr.seen) return null;
    const r = this.cv.getBoundingClientRect();
    if (!r.width) return null;
    return { x: (ptr.x - r.left) / r.width, y: (ptr.y - r.top) / r.height };
  }
  frame(dt) {
    if (this.dirty) this.resize();
    const g = this.g, W = this.W, H = this.H;
    if (W < 8 || H < 8) return;
    const calm = reduced();
    this.t += dt;
    const t = this.t;
    const o = this.over || {};
    const L = look(this.over || undefined);
    const tr = o.trail !== undefined ? item("trail", o.trail) || equipped("trail") : equipped("trail");
    const fin = o.finish !== undefined ? item("finish", o.finish) || equipped("finish") : equipped("finish");
    const key = L.key + "|" + tr.id + "|" + fin.id + "|" + this.victory;
    if (key !== this.lastKey) { if (this.lastKey && !calm) this.swap = 1; this.lastKey = key; }
    const portals = this.cv.id === "stage-play" ? portalSlots() : null;           // 4.4: party portals either side of you
    const u = Math.min(H / 94, W / (portals ? 84 : 70), 7.2 * (window.devicePixelRatio || 1));      // pixels per sprite unit (capped on big screens)
    const P = Math.max(1, Math.round(u * 2) / 2);
    const sk = L.key + "@" + P;
    if (sk !== this.sprKey && sprites.P) { const a = sprites.astronaut(P, L); this.spr = a.player; this.flash = a.flash; this.sprKey = sk; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!this.spr) return;

    // where you're pointing (or a slow look around when there's no mouse)
    const p = this.pointer();
    const px = p ? p.x : 0.5 + Math.sin(t * 0.37) * 0.32, py = p ? p.y : 0.42 + Math.sin(t * 0.53) * 0.12;
    const cx = W / 2 + (calm ? 0 : (px - 0.5) * -6 * u * 0.5), cy = H * 0.45;
    const floorY = cy + 21 * u;
    const bob = calm ? 0 : Math.sin(t * 2.1) * 2 * u;
    const tilt = calm ? 0 : Math.sin(t * 1.3) * 0.04;
    if (px < 0.46) this.face = -1; else if (px > 0.54) this.face = 1;
    this.flip += (this.face - this.flip) * Math.min(1, dt * 14);
    const fl = Math.abs(this.flip) < 0.12 ? (this.flip < 0 ? -0.12 : 0.12) : this.flip;
    const pivX = cx, pivY = cy + bob + 3 * u;
    let a = Math.atan2(py * H - pivY, Math.max(18 * u, (px * W - pivX) * this.face));
    a = Math.max(-1.05, Math.min(0.85, a));
    this.aim += (a - this.aim) * Math.min(1, dt * 10);
    const aimScreen = this.face === 1 ? this.aim : Math.PI - this.aim;
    const trim = L.trim;

    // the light behind you
    const back = g.createRadialGradient(cx, cy, 0, cx, cy, 48 * u);
    back.addColorStop(0, hexA(trim, 0.16)); back.addColorStop(1, hexA(trim, 0));
    g.fillStyle = back; g.fillRect(0, 0, W, H);
    // the party's portals: two beside you, a third behind once they're full (where they sit goes to the buttons)
    let spots = null;
    if (portals) {
      const base = W / 2, dpr = W / Math.max(1, this.cv.clientWidth);
      const geo = [{ x: base - 29 * u, fy: floorY, s: 1 }, { x: base + 29 * u, fy: floorY, s: 1 }, { x: base + 14 * u, fy: floorY - 10 * u, s: 0.62 }];
      spots = geo.map((q, i) => (portals[i] ? { x: q.x / dpr, top: (q.fy - 34 * u * q.s) / dpr, w: 20 * u * q.s / dpr, h: 34 * u * q.s / dpr } : null));
      if (portals[2]) this.portal(portals[2], geo[2], u, t, calm, 2, base);
      for (let i = 0; i < 2; i++) if (portals[i]) this.portal(portals[i], geo[i], u, t, calm, i, base);
    }
    // the platform: a lit disc, rings turning, a beam of light up
    g.save(); g.translate(cx, floorY);
    const beam = g.createLinearGradient(0, 0, 0, -70 * u);
    beam.addColorStop(0, "rgba(99,244,255,0.13)"); beam.addColorStop(1, "rgba(99,244,255,0)");
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(-24 * u, 0); g.lineTo(-11 * u, -70 * u); g.lineTo(11 * u, -70 * u); g.lineTo(24 * u, 0); g.closePath(); g.fill();
    const disc = g.createRadialGradient(0, 0, 0, 0, 0, 32 * u);
    disc.addColorStop(0, "rgba(99,244,255,0.32)"); disc.addColorStop(0.6, "rgba(142,68,255,0.14)"); disc.addColorStop(1, "rgba(142,68,255,0)");
    g.fillStyle = disc;
    g.beginPath(); g.ellipse(0, 0, 34 * u, 8 * u, 0, 0, TAU); g.fill();
    g.lineWidth = Math.max(1, u * 0.45);
    g.setLineDash([u * 5, u * 3.4]);
    g.lineDashOffset = calm ? 0 : -t * u * 7;
    g.strokeStyle = "rgba(99,244,255,0.55)";
    g.beginPath(); g.ellipse(0, 0, 24 * u, 5.4 * u, 0, Math.PI, TAU); g.stroke();
    g.lineDashOffset = calm ? 0 : t * u * 5;
    g.strokeStyle = "rgba(165,123,255,0.45)";
    g.beginPath(); g.ellipse(0, 0, 31 * u, 7.1 * u, 0, Math.PI, TAU); g.stroke();
    g.setLineDash([]);
    // your shadow
    g.fillStyle = "rgba(0,0,0," + (0.42 - bob / u * 0.03).toFixed(3) + ")";
    g.beginPath(); g.ellipse(0, 0, 11 * u, 2.4 * u, 0, 0, TAU); g.fill();
    g.restore();

    // a faint reflection in the platform
    const S = 64 * u;
    g.save();
    g.beginPath(); g.rect(0, floorY, W, H - floorY); g.clip();
    g.globalAlpha = 0.07;
    g.translate(cx, 2 * floorY - (cy + bob) - 4 * u); g.scale(fl, -0.5);
    g.drawImage(this.spr.c, -S / 2, -S / 2, S, S);
    g.restore();

    // jetpack puffs, in your trail's colours and style
    const st = trailStyleOf(tr);
    this.puffT -= dt;
    if (this.puffT <= 0 && !calm) {
      this.puffT = 0.05;
      for (let n = 0; n < st.n; n++) {
        if (this.puffs.length > 140) this.puffs.shift();
        this.puffs.push({
          x: cx - 10.5 * u * fl + rnd(-1, 1) * u, y: cy + bob + 16 * u,
          vx: (-fl * st.push * 0.18 + rnd(-st.spread, st.spread) * 0.4) * u * 0.25,
          vy: (st.push * 0.42 + st.rise + rnd(-st.spread, st.spread) * 0.3) * u * 0.25,
          life: st.life * 1.9, max: st.life * 1.9, size: st.size, pal: trailPalOf(tr, t),
        });
      }
    }
    g.globalCompositeOperation = "lighter";
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i];
      q.life -= dt;
      if (q.life <= 0) { this.puffs.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const k = q.life / q.max;
      const r = (q.size * 2.4 + (1 - k) * q.size * 2) * u;
      const d = sprites.dots[q.pal] || sprites.dots[1];
      if (!d) continue;
      g.globalAlpha = k * 0.9;
      g.drawImage(d, q.x - r, q.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    const gun = () => {
      g.save(); g.translate(pivX, pivY); g.rotate(aimScreen); g.scale(u, u);
      g.fillStyle = finishColOf(fin, t); g.fillRect(4, -2.6, 17, 5.2);
      g.fillStyle = "#232c5e"; g.fillRect(4, -2.6, 5, 5.2);
      g.fillStyle = GUN_COL.blaster; g.fillRect(18, -2.6, 3, 5.2);
      g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(9, -2.6, 9, 1.2);
      g.restore();
    };
    const aimUp = Math.sin(aimScreen) < -0.3;
    if (aimUp) gun();
    // the astronaut, its jet flame, and (just after a change) a shimmer
    g.save();
    g.translate(cx, cy + bob); g.rotate(tilt); g.scale(fl, 1);
    g.save(); g.scale(u, u);
    const flameL = 7 + (calm ? 0 : Math.sin(t * 42) * 1.4);
    const dot = sprites.dots[trailPalOf(tr, t)] || sprites.dots[1];
    g.globalCompositeOperation = "lighter";
    if (dot) { g.globalAlpha = 0.6; g.drawImage(dot, -16, 9, 11, flameL * 1.6); }
    g.globalAlpha = 0.75; g.fillStyle = "#f1e6ff";
    g.beginPath(); g.ellipse(-10.5, 14 + flameL * 0.28, 1.6, flameL * 0.32, 0, 0, TAU); g.fill();
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.restore();
    g.drawImage(this.spr.c, -S / 2, -S / 2, S, S);
    if (this.swap > 0 && this.flash) { g.globalAlpha = this.swap * 0.7; g.drawImage(this.flash.c, -S / 2, -S / 2, S, S); g.globalAlpha = 1; }
    // a glint across the visor every few seconds
    const ph = (t * 0.45) % 1;
    if (ph < 0.18 && !calm) {
      const k = ph / 0.18;
      g.save(); g.scale(u, u);
      g.globalCompositeOperation = "lighter"; g.globalAlpha = Math.sin(k * Math.PI) * 0.7; g.fillStyle = "#ffffff";
      g.beginPath(); g.ellipse(-2 + k * 10, -10 - k * 2, 1, 4.6, -0.55, 0, TAU); g.fill();
      g.restore();
    }
    g.restore();
    if (!aimUp) gun();

    // the change shimmer: a scan line down the suit and a ring from the platform
    if (this.swap > 0) {
      const k = this.swap;
      const yy = cy - 30 * u + (1 - k) * 52 * u;
      g.globalCompositeOperation = "lighter";
      const line = g.createLinearGradient(cx - 22 * u, 0, cx + 22 * u, 0);
      line.addColorStop(0, hexA(this.swapCol, 0)); line.addColorStop(0.5, hexA(this.swapCol, 0.9 * k)); line.addColorStop(1, hexA(this.swapCol, 0));
      g.fillStyle = line; g.fillRect(cx - 22 * u, yy - u * 0.8, 44 * u, u * 1.6);
      g.strokeStyle = hexA(this.swapCol, 0.8 * k); g.lineWidth = Math.max(1, u * 0.7);
      g.beginPath(); g.ellipse(cx, floorY, (10 + (1 - k) * 30) * u, (2.4 + (1 - k) * 7) * u, 0, 0, TAU); g.stroke();
      g.globalCompositeOperation = "source-over";
      this.swap = Math.max(0, this.swap - dt / 0.6);
    }
    if (this.victory !== "") this.victoryPreview(dt, cx, cy - 30 * u, u);
    if (spots) placePortals(spots);
  }
  /** One party portal: a glowing well on a lit disc, and whoever's standing in it. */
  portal(p, q, u, t, calm, idx, mid) {
    const g = this.g, s = q.s, col = p.col, x = q.x, fy = q.fy;
    const R = 9.5 * u * s, Ry = 15.5 * u * s, py = fy - Ry - 1.2 * u * s;
    const pulse = calm ? 0.5 : Math.sin(t * 2.4 + idx * 1.7) * 0.5 + 0.5;
    const disc = g.createRadialGradient(x, fy, 0, x, fy, 15 * u * s);
    disc.addColorStop(0, hexA(col, p.kind === "empty" ? 0.2 : 0.34)); disc.addColorStop(1, hexA(col, 0));
    g.fillStyle = disc;
    g.beginPath(); g.ellipse(x, fy, 16 * u * s, 3.8 * u * s, 0, 0, TAU); g.fill();
    const well = g.createRadialGradient(x, py, 0, x, py, Ry);
    well.addColorStop(0, hexA(col, p.kind === "member" ? 0.08 : 0.16 + pulse * 0.1)); well.addColorStop(0.72, "rgba(12,8,44,0.5)"); well.addColorStop(1, hexA(col, 0));
    g.fillStyle = well;
    g.beginPath(); g.ellipse(x, py, R, Ry, 0, 0, TAU); g.fill();
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineWidth = Math.max(1, u * 0.55 * s);
    g.strokeStyle = hexA(col, p.kind === "pending" ? 0.45 + pulse * 0.5 : p.kind === "member" ? 0.5 : 0.7);
    g.beginPath(); g.ellipse(x, py, R, Ry, 0, 0, TAU); g.stroke();
    for (let k = 0; k < 3; k++) {
      const kk = 0.8 - k * 0.2;
      g.setLineDash([u * s * (3 + k), u * s * (4 + k * 2)]);
      g.lineDashOffset = calm ? 0 : (k % 2 ? 1 : -1) * t * u * s * (6 + k * 3);
      g.strokeStyle = hexA(k === 1 ? "#ffffff" : col, (p.kind === "member" ? 0.12 : 0.22) + 0.1 * k);
      g.beginPath(); g.ellipse(x, py, R * kk, Ry * kk, 0, 0, TAU); g.stroke();
    }
    g.setLineDash([]);
    g.restore();
    if (p.kind === "empty" || !p.look) return;
    // the teammate (or a faint shape of the friend you've invited), facing you
    const P2 = Math.max(1, Math.round(u * s * 0.9 * 2) / 2);
    const key = p.look + "@" + P2;
    if (!this.mates) this.mates = new Map();
    let spr = this.mates.get(key);
    if (!spr && sprites.P) { spr = sprites.astronaut(P2, look(parseLook(p.look))).player; if (this.mates.size > 12) this.mates.clear(); this.mates.set(key, spr); }
    if (!spr) return;
    const S2 = 64 * u * s * 0.9;
    const bob = calm ? 0 : Math.sin(t * 2.1 + 1.3 + idx) * 1.6 * u * s;
    g.save();
    g.globalAlpha = p.kind === "pending" ? 0.28 + pulse * 0.18 : 1;
    g.translate(x, fy - 21 * u * s * 0.9 + bob);
    g.scale(x < mid ? 1 : -1, 1);
    g.drawImage(spr.c, -S2 / 2, -S2 / 2, S2, S2);
    g.restore();
  }
  /** A small loop of the victory effect over the astronaut's head. */
  victoryPreview(dt, x, y, u) {
    const g = this.g;
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 2.4;
      const v = this.victory;
      if (v === "fireworks") for (let i = 0; i < 5; i++) this.bursts.push({ t: -i * 0.22, x: x + rnd(-26, 26) * u, y: y + rnd(-10, 6) * u, col: ["#b8bfe0", "#ff4f8b", "#ffd45c", "#d77fb0", "#ff9448", "#a98bff", "#6d7bff"][i % 7], r: 10 });
      else if (v === "supernova") for (let i = 0; i < 3; i++) this.bursts.push({ t: -i * 0.2, x, y, col: i % 2 ? "#ffd45c" : "#ffffff", r: 22 + i * 8, ring: true });
      else if (v === "eclipse") this.bursts.push({ t: 0, x, y, col: "#a57bff", r: 26, ring: true, dark: true });
      else if (v === "starburst") for (let i = 0; i < 3; i++) this.bursts.push({ t: -i * 0.18, x, y, col: "#ffd45c", r: 12 + i * 9, stars: 8 + i * 2 });
      else if (v === "singularity") this.bursts.push({ t: 0, x, y, col: "#ff8a3d", r: 26, hole: true });
      else this.bursts.push({ t: 0, x, y, col: "#ff8a3d", r: 14 });
    }
    g.globalCompositeOperation = "lighter";
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      if (b.t < 0) continue;
      const k = b.t / 0.9;
      if (k >= 1) { this.bursts.splice(i, 1); continue; }
      const R = (b.hole ? (k < 0.5 ? 1 - k * 1.6 : (k - 0.5) * 2.4) : k) * b.r * u;
      g.globalAlpha = 1 - k;
      if (b.dark || (b.hole && k < 0.5)) {
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "rgba(10,6,20,0.85)"; g.beginPath(); g.arc(b.x, b.y, Math.max(1, R * 0.7), 0, TAU); g.fill();
        g.globalCompositeOperation = "lighter";
      }
      g.strokeStyle = b.col; g.lineWidth = Math.max(1, u * 0.8);
      if (b.ring || b.hole) { g.beginPath(); g.arc(b.x, b.y, Math.max(1, R), 0, TAU); g.stroke(); }
      const n = b.stars || 12;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * TAU + b.r;
        const rr = b.stars ? R : R * 0.95;
        g.fillStyle = b.col;
        g.beginPath(); g.arc(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, Math.max(1, u * (b.stars ? 1.1 : 0.8)), 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}

function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
}

const ptr = { x: 0, y: 0, seen: false };
window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { ptr.x = e.clientX; ptr.y = e.clientY; ptr.seen = true; } }, { passive: true });
window.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") ptr.seen = false; }, { passive: true });

// ---------------------------------------------------------------------------
// item art for the cards (drawn once per item and size)
// ---------------------------------------------------------------------------
const thumbs = new Map();
function thumb(it, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = it.key + "@" + w + "x" + h + "@" + dpr;
  let c = thumbs.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext("2d");
  const W = c.width, H = c.height;
  if (!sprites.P) return c;              // before the game's sprites exist: try again next time
  const crop = (lk, x0, y0, x1, y1) => {
    const cw = x1 - x0, ch = y1 - y0;
    const P = Math.min(W / cw, H / ch);
    const spr = sprites.astronaut(P, lk).player;
    g.drawImage(spr.c, (32 + x0) * P, (32 + y0) * P, cw * P, ch * P, (W - cw * P) / 2, (H - ch * P) / 2, cw * P, ch * P);
  };
  if (it.kind === "hat") crop(look({ strict: true, hat: it.id }), -18, -33.5, 18, -1);
  else if (it.kind === "suit") crop(look({ strict: true, suit: it.id }), -20, -33, 20, 22);
  else if (it.kind === "visor") crop(look({ strict: true, visor: it.id, hat: "none" }), -14, -24, 14, 2);
  else if (it.kind === "trail") drawTrailArt(g, W, H, it);
  else if (it.kind === "finish") drawFinishArt(g, W, H, it);
  else if (it.kind === "victory") drawVictoryArt(g, W, H, it);
  thumbs.set(key, c);
  return c;
}
/** A whole astronaut in someone's look code (the co-op lobby's player list). */
export function lookArt(code, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement("canvas");
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.width = w + "px"; c.style.height = h + "px";
  if (!sprites.P) return c;
  const g = c.getContext("2d");
  const x0 = -20, y0 = -33, x1 = 20, y1 = 22, cw = x1 - x0, ch = y1 - y0;
  const P = Math.min(c.width / cw, c.height / ch);
  const spr = sprites.astronaut(P, look(parseLook(code))).player;
  g.drawImage(spr.c, (32 + x0) * P, (32 + y0) * P, cw * P, ch * P, (c.width - cw * P) / 2, (c.height - ch * P) / 2, cw * P, ch * P);
  return c;
}
function drawTrailArt(g, W, H, it) {
  const n = 30;
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const x = W * (0.12 + k * 0.76), y = H * (0.68 - Math.sin(k * Math.PI) * 0.36 + (k - 0.5) * 0.1);
    const pal = trailPalOf(it, k * 1.2);
    const d = sprites.dots[pal];
    if (!d) continue;
    const r = Math.min(W, H) * (0.05 + k * 0.11) * (it.style === "dust" || it.style === "zap" ? 0.75 : it.style === "smoke" ? 1.25 : 1);
    g.globalAlpha = 0.35 + k * 0.6;
    g.drawImage(d, x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
}
function drawFinishArt(g, W, H, it) {
  const u = Math.min(W / 30, H / 14);
  g.save(); g.translate(W / 2, H / 2); g.rotate(-0.32); g.scale(u, u);
  let fill = finishColOf(it, 0);
  if (it.prism) {
    fill = g.createLinearGradient(-12, 0, 12, 0);
    ["#ff9aa2", "#ffdac1", "#e2f0cb", "#b5ead7", "#c7ceea", "#f3b0ff"].forEach((c, i) => fill.addColorStop(i / 5, c));
  }
  g.shadowColor = typeof fill === "string" ? fill : "#c7ceea"; g.shadowBlur = 8 * u;
  g.fillStyle = fill; g.fillRect(-11, -3, 22, 6);
  g.shadowBlur = 0;
  g.fillStyle = "#232c5e"; g.fillRect(-11, -3, 6, 6); g.fillRect(-10, 3, 4, 5);
  g.fillStyle = GUN_COL.blaster; g.fillRect(8, -3, 3, 6);
  g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(-5, -3, 12, 1.3);
  g.restore();
}
function drawVictoryArt(g, W, H, it) {
  const x = W / 2, y = H / 2, R = Math.min(W, H) * 0.36;
  const ring = (r, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
  const dots = (r, n, col, s) => { g.fillStyle = col; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, s, 0, TAU); g.fill(); } };
  g.shadowBlur = R * 0.3;
  const v = it.id;
  if (v === "fireworks") {
    ["#b8bfe0", "#ff4f8b", "#ffd45c", "#d77fb0", "#ff9448", "#a98bff", "#6d7bff"].forEach((c, i) => {
      const a = (i / 7) * TAU, bx = x + Math.cos(a) * R * 0.55, by = y + Math.sin(a) * R * 0.5;
      g.shadowColor = c; g.fillStyle = c;
      for (let k = 0; k < 8; k++) { const b = (k / 8) * TAU; g.beginPath(); g.arc(bx + Math.cos(b) * R * 0.24, by + Math.sin(b) * R * 0.24, R * 0.035, 0, TAU); g.fill(); }
    });
  } else if (v === "eclipse") {
    g.shadowColor = "#a57bff"; ring(R * 0.8, "#a57bff", R * 0.08);
    g.shadowBlur = 0; g.fillStyle = "#0a0614"; g.beginPath(); g.arc(x, y, R * 0.62, 0, TAU); g.fill();
  } else if (v === "supernova") {
    g.shadowColor = "#ffd45c"; ring(R * 0.45, "#ffffff", R * 0.08); ring(R * 0.75, "#ffd45c", R * 0.06); ring(R, "#ffffff", R * 0.03);
  } else if (v === "starburst") {
    g.shadowColor = "#ffd45c"; dots(R * 0.45, 8, "#ffd45c", R * 0.06); dots(R * 0.85, 12, "#fff3c4", R * 0.045);
  } else if (v === "singularity") {
    g.shadowColor = "#ff8a3d"; ring(R * 0.85, "#ff42d0", R * 0.05); ring(R * 0.55, "#ff8a3d", R * 0.12);
    g.shadowBlur = 0; g.fillStyle = "#000"; g.beginPath(); g.arc(x, y, R * 0.4, 0, TAU); g.fill();
  } else {
    g.shadowColor = "#ff8a3d"; dots(R * 0.5, 10, "#ff8a3d", R * 0.07); ring(R * 0.85, "#ffc861", R * 0.04);
  }
  g.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// the Hangar
// ---------------------------------------------------------------------------
let ui = null, handlers = null, sfx = () => {}, nameOf = () => "Pilot";
let tabNow = "play";
const stages = {};
let running = false, lastT = 0;
/** What drawing the open stage costs (a running average in ms; debug and perf checks read it). */
export const hangarStats = { frameMs: 0, frames: 0 };
let shopKind = "featured", shopHideOwned = false;
let lockerKind = "hat", lockerOwnedOnly = false, lockerSort = "rarity", lockerRarity = -1, lockerPreview = null, presetSave = false;
let detail = null;          // the item open in the detail panel

function stageFor(id) {
  if (!stages[id]) { const cv = $(id); if (!cv) return null; stages[id] = new Stage(cv); }
  return stages[id];
}
function loop(now) {
  if (!running) return;
  const menu = $("screen-menu");
  if (!menu || menu.hidden) { running = false; return; }        // a run started: sleep until the lobby's back
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  const id = detail ? "stage-detail" : tabNow === "play" ? "stage-play" : tabNow === "locker" ? "stage-locker" : tabNow === "profile" ? "stage-profile" : null;
  const st = id && stageFor(id);
  if (st && st.cv.offsetParent !== null) {
    const t0 = performance.now();
    st.frame(dt);
    hangarStats.frameMs += (performance.now() - t0 - hangarStats.frameMs) * 0.05;
    hangarStats.frames++;
  }
  if (tabNow === "challenges" && Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) updateResetClock();
  requestAnimationFrame(loop);
}
function start() {
  if (running) return;
  running = true; lastT = performance.now();
  requestAnimationFrame(loop);
}

/** A card for one item: art, name, kind, rarity, and whether it's yours, on, or what it costs. */
function itemCard(it, opts) {
  const o = opts || {};
  const b = el("button", "icard r-" + RARITY[it.rarity].id + (o.big ? " big" : ""));
  b.type = "button";
  b.style.setProperty("--r", RARITY[it.rarity].col);
  b.dataset.key = it.key;
  const art = el("span", "icard-art");
  if (it.kind === "title") {
    art.classList.add("title-art");
    art.append(el("span", "title-plate", it.name));
  } else {
    const c = document.createElement("canvas");
    const w = o.big ? 220 : 104, h = o.big ? 190 : 92;
    const src = thumb(it, w, h);
    c.width = src.width; c.height = src.height;
    c.getContext("2d").drawImage(src, 0, 0);
    art.append(c);
  }
  b.append(art);
  b.append(el("span", "icard-name", it.name));
  const meta = el("span", "icard-meta");
  meta.append(el("span", "icard-kind", KIND_BY_ID[it.kind].name), el("span", "icard-rar", RARITY[it.rarity].name));
  b.append(meta);
  b.append(statusTag(it));
  b.setAttribute("aria-label", it.name + ", " + RARITY[it.rarity].name + " " + KIND_BY_ID[it.kind].name.toLowerCase() + ". " + statusText(it));
  return b;
}
function statusText(it) {
  if (equipped(it.kind).id === it.id && owns(it)) return "Equipped";
  if (owns(it)) return "Owned";
  const s = source(it);
  if (s.type === "shop") return it.price + " Sigils";
  if (s.type === "achv") return "Achievement: " + (ACH_BY_ID[s.achv] ? ACH_BY_ID[s.achv].name : s.achv);
  if (s.type === "wave") return "Reach wave " + s.wave;
  if (s.type === "level") return "Reach level " + s.level;
  if (s.type === "set") return "Complete " + SET_BY_ID[s.set].name;
  return "";
}
function statusTag(it) {
  const on = equipped(it.kind).id === it.id && owns(it);
  if (on) { const s = el("span", "icard-state on"); s.append(icon("check"), document.createTextNode("Equipped")); return s; }
  if (owns(it)) return el("span", "icard-state owned", "Owned");
  const src = source(it);
  if (src.type === "shop") { const s = el("span", "icard-state price"); s.append(icon("gem"), document.createTextNode(String(it.price))); if ((store.data.sigils || 0) < it.price) s.classList.add("short"); return s; }
  const s = el("span", "icard-state locked");
  s.append(icon("lock"), document.createTextNode(src.type === "achv" ? (ACH_BY_ID[src.achv] ? ACH_BY_ID[src.achv].name : "Achievement") : src.type === "wave" ? "Wave " + src.wave : src.type === "level" ? "Level " + src.level : src.type === "set" ? "Collection" : ""));
  return s;
}
/** The look slots a try-on of this item changes. */
function tryOnFor(it) {
  if (!it) return null;
  if (it.kind === "title") return { title: it.id };
  return { [it.kind]: it.id };
}

// ---------------------------------------------------------------------------
// panes
// ---------------------------------------------------------------------------
function renderSigils() {
  const box = $("hangar-sigils");
  if (!box) return;
  box.replaceChildren(icon("gem"), el("b", "", String(store.data.sigils || 0)));
  box.title = "Sigils: earn them from sin bosses, wins, Boss Rush, achievements and daily contracts. Spend them in the Item Shop.";
}
function renderDots() {
  const sd = $("shop-dot"); if (sd) sd.hidden = store.data.shopSeen === dayKey();
  const cd = $("contract-dot"); if (cd) { contracts(); cd.hidden = store.data.contractsSeen === dayKey(); }
}

// --- Play ---------------------------------------------------------------------------
function renderPlay() {
  const mode = modeNow();
  const guest = party.on && !party.leading;
  for (const b of document.querySelectorAll(".mode-card, .diff-opt")) b.classList.toggle("party-locked", guest);
  const dailyBtn = $("daily-btn");
  if (dailyBtn) dailyBtn.classList.toggle("solo-only", party.on && party.others.length > 0);
  for (const b of document.querySelectorAll(".mode-card")) {
    const on = b.dataset.mode === mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  }
  const rushOpen = store.rushUnlocked();
  const rb = $("rush-btn");
  if (rb) {
    rb.classList.toggle("locked", !rushOpen);
    const best = store.data.rush.best[store.data.settings.difficulty];
    $("rush-label").textContent = !rushOpen ? "Beat @Envy to open" : best ? "Best " + fmtClock(best.time) + (best.rank ? " · " + best.rank : "") : "Seven sins, back to back";
  }
  const b = store.data.best;
  const ml = $("ladder-label");
  if (ml) ml.textContent = b.wins ? b.wins + (b.wins === 1 ? " win" : " wins") + " · best wave " + b.wave : b.wave ? "Best wave " + b.wave + " · " + (b.rung || 0) + " of 7 sins" : "Seven sins, one climb";
  const daily = store.data.daily;
  const today = dayKey();
  $("daily-label").textContent = daily.date === today && daily.score > 0 ? "Today's best " + formatScore(daily.score) : "Same seed for everyone today";
  const dkey = guest && party.pick ? party.pick.diff : store.data.settings.difficulty;
  const diff = BALANCE.difficulty[dkey] ? BALANCE.difficulty[dkey].name : "Normal";
  $("play-sub").textContent = MODES[mode].name + (mode === "daily" ? " · Normal" : " · " + diff);
  $("play-sub").dataset.base = $("play-sub").textContent;
  if (ui.renderDifficulty) ui.renderDifficulty();          // a party guest sees the leader's difficulty
  friendsUI.decoratePlay();
  const name = nameOf();
  const tt = equipped("title");
  $("stage-name").textContent = name;
  $("stage-title").textContent = tt.id ? tt.name : "";
  $("stage-title").hidden = !tt.id;
  // the shop's headline item today
  const feat = $("hangar-feat");
  if (feat) {
    const it = featured()[0];
    feat.replaceChildren();
    feat.style.setProperty("--r", RARITY[it.rarity].col);
    const c = document.createElement("canvas");
    const src = thumb(it, 88, 76);
    c.width = src.width; c.height = src.height; c.getContext("2d").drawImage(src, 0, 0);
    const txt = el("span", "feat-txt");
    txt.append(el("small", "", "In the Item Shop today"), el("b", "", it.name), el("span", "", RARITY[it.rarity].name + " " + KIND_BY_ID[it.kind].name.toLowerCase()));
    feat.append(c, txt, owns(it) ? el("span", "icard-state owned", "Owned") : sigilTag(it.price, "feat-price"));
    feat.onclick = () => { sfx("click"); setTab("shop"); openDetail(it); };
  }
}
function fmtClock(s) {
  const m = Math.floor(s / 60);
  return m + ":" + (s % 60).toFixed(1).padStart(4, "0");
}

// --- Locker -------------------------------------------------------------------------
function renderLocker() {
  const box = $("hpane-locker");
  if (!box.firstChild) {
    box.innerHTML = '<div class="lk"><nav class="lk-slots" id="lk-slots" aria-label="Slots"></nav>' +
      '<div class="lk-stage"><canvas class="stage-canvas" id="stage-locker" aria-label="Your astronaut"></canvas>' +
      '<div class="stage-plate"><b id="lk-name"></b><span id="lk-title"></span></div>' +
      '<div class="lk-try" id="lk-try" hidden></div>' +
      '<div class="lk-presets" id="lk-presets"></div></div>' +
      '<section class="lk-items"><div class="lk-head"><h3 class="lk-h" id="lk-h"></h3><div class="lk-filters" id="lk-filters"></div></div>' +
      '<div class="lk-grid" id="lk-grid"></div></section></div>';
    renderFilters();
  }
  // the slots: what you're wearing in each
  const slots = $("lk-slots");
  slots.replaceChildren();
  for (const k of KINDS) {
    const it = equipped(k.id);
    const b = el("button", "lk-slot" + (k.id === lockerKind ? " on" : ""));
    b.type = "button";
    b.style.setProperty("--r", RARITY[it.rarity].col);
    b.setAttribute("aria-pressed", k.id === lockerKind ? "true" : "false");
    const art = el("span", "lk-slot-art");
    if (k.id !== "title") { const c = document.createElement("canvas"); const src = thumb(it, 46, 40); c.width = src.width; c.height = src.height; c.getContext("2d").drawImage(src, 0, 0); art.append(c); }
    else art.append(icon("badge-check"));
    const txt = el("span", "lk-slot-txt");
    txt.append(el("small", "", k.name), el("b", "", it.name));
    b.append(art, txt);
    b.addEventListener("click", () => { lockerKind = k.id; lockerPreview = null; sfx("tab"); renderLocker(); });
    slots.append(b);
  }
  $("lk-h").textContent = KIND_BY_ID[lockerKind].plural;
  syncFilters();
  // the items
  const grid = $("lk-grid");
  grid.replaceChildren();
  let list = itemsOf(lockerKind);
  if (lockerOwnedOnly) list = list.filter(owns);
  if (lockerRarity >= 0) list = list.filter((i) => i.rarity === lockerRarity);
  const when = (i) => (i.shop ? store.data.owned[i.key] || 0 : i.achv ? store.data.achv[i.achv] || 0 : 0);
  list = list.slice().sort((a, b) => {
    if (lockerSort === "name") return a.name.localeCompare(b.name);
    if (lockerSort === "new") return when(b) - when(a) || b.rarity - a.rarity;
    return (owns(b) - owns(a)) || b.rarity - a.rarity || a.name.localeCompare(b.name);
  });
  // the default (and "none") always first: that's how you take something off
  const def = item(lockerKind, DEFAULTS[lockerKind]);
  list = [def, ...list.filter((i) => i !== def)];
  if (lockerKind === "hat") { const none = item("hat", "none"); list = [none, ...list.filter((i) => i !== none)]; }
  for (const it of list) {
    const c = itemCard(it);
    if (lockerPreview === it.key) c.classList.add("preview");
    c.addEventListener("click", () => {
      if (owns(it)) {
        lockerPreview = null;
        if (equipped(it.kind).id !== it.id) { equip(it.kind, it.id); sfx("equip"); }
        stageFor("stage-locker").tryOn(null, RARITY[it.rarity].col);
      } else {
        lockerPreview = it.key;
        sfx("preview");
        stageFor("stage-locker").tryOn(tryOnFor(it), RARITY[it.rarity].col);
      }
      renderLocker();
    });
    grid.append(c);
  }
  if (!list.length) grid.append(el("p", "lk-empty", "Nothing here yet."));
  // trying something on that isn't yours
  const tryBox = $("lk-try");
  const pv = lockerPreview && ITEMS.find((i) => i.key === lockerPreview);
  tryBox.hidden = !pv;
  tryBox.replaceChildren();
  if (pv) {
    tryBox.style.setProperty("--r", RARITY[pv.rarity].col);
    tryBox.append(el("span", "lk-try-k", "Trying on"), el("b", "", pv.name), el("span", "lk-try-how", statusText(pv)));
    const row = el("span", "lk-try-row");
    if (pv.shop) { const go = el("button", "btn btn-primary btn-sm", "See it in the shop"); go.type = "button"; go.addEventListener("click", () => { sfx("click"); setTab("shop"); openDetail(pv); }); row.append(go); }
    const back = el("button", "btn btn-ghost btn-sm", "Back to your outfit"); back.type = "button";
    back.addEventListener("click", () => { lockerPreview = null; sfx("click"); stageFor("stage-locker").tryOn(null); renderLocker(); });
    row.append(back);
    tryBox.append(row);
  }
  $("lk-name").textContent = nameOf();
  const tt = pv && pv.kind === "title" ? pv : equipped("title");
  $("lk-title").textContent = tt.id ? tt.name : "";
  $("lk-title").hidden = !tt.id;
  renderPresets();
}
function renderFilters() {
  const f = $("lk-filters");
  f.innerHTML = '<div class="seg" role="group" aria-label="Show"><button type="button" data-own="0">All</button><button type="button" data-own="1">Owned</button></div>' +
    '<label class="sel"><span>Rarity</span><select id="lk-rarity"><option value="-1">Any</option>' + RARITY.map((r, i) => '<option value="' + i + '">' + r.name + "</option>").join("") + "</select></label>" +
    '<label class="sel"><span>Sort</span><select id="lk-sort"><option value="rarity">Rarity</option><option value="name">Name</option><option value="new">Newest</option></select></label>';
  for (const b of f.querySelectorAll("[data-own]")) b.addEventListener("click", () => { lockerOwnedOnly = b.dataset.own === "1"; sfx("click"); renderLocker(); });
  $("lk-rarity").addEventListener("change", (e) => { lockerRarity = Number(e.target.value); renderLocker(); });
  $("lk-sort").addEventListener("change", (e) => { lockerSort = e.target.value; renderLocker(); });
}
function syncFilters() {
  for (const b of document.querySelectorAll("#lk-filters [data-own]")) b.setAttribute("aria-pressed", (b.dataset.own === "1") === lockerOwnedOnly ? "true" : "false");
  $("lk-rarity").value = String(lockerRarity);
  $("lk-sort").value = lockerSort;
}
function renderPresets() {
  const box = $("lk-presets");
  box.replaceChildren();
  box.classList.toggle("saving", presetSave);
  box.append(el("span", "lk-presets-k", presetSave ? "Save your outfit to…" : "Loadouts"));
  store.data.presets.forEach((p, i) => {
    const b = el("button", "preset" + (p ? "" : " empty"));
    b.type = "button";
    if (p) {
      const s = item("suit", p.suit) || item("suit", "classic");
      b.style.setProperty("--sw", s.trim);
      const h = item("hat", p.hat);
      b.title = (h ? h.name : "") + " · " + s.name;
    }
    b.append(el("i", "preset-sw"), el("span", "", String(i + 1)));
    b.setAttribute("aria-label", presetSave ? "Save to loadout " + (i + 1) : p ? "Wear loadout " + (i + 1) : "Loadout " + (i + 1) + " is empty");
    b.addEventListener("click", () => {
      if (presetSave) { savePreset(i); presetSave = false; sfx("equip"); ui.toast("Loadout " + (i + 1) + " saved"); renderLocker(); return; }
      if (!p) { sfx("deny"); ui.toast("Loadout " + (i + 1) + " is empty: use Save to keep your outfit here"); return; }
      const missing = applyPreset(i);
      lockerPreview = null;
      stageFor("stage-locker").tryOn(null);
      sfx("equip");
      ui.toast("Loadout " + (i + 1) + " on" + (missing > 0 ? " (" + missing + " item" + (missing === 1 ? "" : "s") + " you don't own any more left as they were)" : ""));
      renderLocker();
    });
    box.append(b);
  });
  const sv = el("button", "btn btn-ghost btn-sm preset-save", presetSave ? "Cancel" : "Save");
  sv.type = "button";
  sv.addEventListener("click", () => { presetSave = !presetSave; sfx("click"); renderPresets(); });
  box.append(sv);
}

// --- Item Shop ----------------------------------------------------------------------
const SHOP_TABS = [["featured", "Featured"], ["hat", "Hats"], ["suit", "Suits"], ["visor", "Visors"], ["trail", "Trails"], ["finish", "Finishes"], ["victory", "Victory"], ["title", "Titles"], ["sets", "Collections"]];
function renderShop() {
  const box = $("hpane-shop");
  if (!box.firstChild) {
    box.innerHTML = '<div class="shop2"><header class="hs-head"><div><h2 class="hs-h">Item Shop</h2>' +
      '<p class="shop-note" id="shop-note"></p></div><div class="shop-bal" id="shop-bal"></div></header>' +
      '<div class="shop-tabs" id="shop-tabs" role="tablist"></div><div class="hs-body" id="shop-body"></div></div>';
    const tabs = $("shop-tabs");
    for (const [id, name] of SHOP_TABS) {
      const b = el("button", "shop-tab", name);
      b.type = "button"; b.dataset.kind = id; b.setAttribute("role", "tab");
      b.addEventListener("click", () => { shopKind = id; sfx("tab"); renderShop(); });
      tabs.append(b);
    }
    const hide = el("label", "shop-hide");
    const cb = el("input"); cb.type = "checkbox"; cb.id = "shop-hide";
    cb.addEventListener("change", () => { shopHideOwned = cb.checked; renderShop(); });
    hide.append(cb, el("span", "", "Hide owned"));
    tabs.append(hide);
  }
  store.data.shopSeen = dayKey(); store.save();
  renderDots();
  for (const b of document.querySelectorAll("#shop-tabs .shop-tab")) b.setAttribute("aria-selected", b.dataset.kind === shopKind ? "true" : "false");
  $("shop-hide").checked = shopHideOwned;
  const bal = $("shop-bal");
  bal.replaceChildren(sigilTag(store.data.sigils || 0, "big"), el("span", "", "Sigils"));
  const earn = el("button", "btn btn-ghost btn-sm", "How to earn");
  earn.type = "button";
  earn.addEventListener("click", () => { sfx("click"); setTab("challenges"); });
  bal.append(earn);
  const ms = contractsResetIn();
  $("shop-note").textContent = shopKind === "featured" ? "Today's picks · new ones at 00:00 UTC (in " + Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m). Everything is always in the full catalog too." : "Everything here is for Sigils you earn in play. Nothing is for real money.";
  const body = $("shop-body");
  body.replaceChildren();
  const visible = (it) => !(shopHideOwned && owns(it));
  if (shopKind === "featured") {
    const f = featured();
    const row = el("div", "shop-feat");
    f.forEach((it, i) => { const c = itemCard(it, { big: i === 0 }); c.addEventListener("click", () => { sfx("preview"); openDetail(it); }); row.append(c); });
    body.append(row);
    // every collection, briefly
    body.append(el("h3", "shop-sub", "Collections"));
    body.append(setStrip());
  } else if (shopKind === "sets") {
    body.append(setStrip(true));
  } else {
    const grid = el("div", "shop-grid");
    const list = itemsOf(shopKind).filter((i) => i.shop && visible(i)).sort((a, b) => a.rarity - b.rarity || a.price - b.price || a.name.localeCompare(b.name));
    for (const it of list) { const c = itemCard(it); c.addEventListener("click", () => { sfx("preview"); openDetail(it); }); grid.append(c); }
    if (!list.length) grid.append(el("p", "lk-empty", "You own everything here."));
    body.append(grid);
    const earned = itemsOf(shopKind).filter((i) => !i.shop && (i.achv || i.wave || i.fromSet));
    if (earned.length) {
      body.append(el("h3", "shop-sub", "Earned, not sold"));
      const g2 = el("div", "shop-grid earned");
      for (const it of earned) { if (!visible(it)) continue; const c = itemCard(it); c.addEventListener("click", () => { sfx("preview"); openDetail(it); }); g2.append(c); }
      body.append(g2);
    }
  }
}
/** The collections: each one's items, how many you own, and the title it gives. */
function setStrip(full) {
  const wrap = el("div", "sets" + (full ? " full" : ""));
  for (const s of SETS) {
    const items = setItems(s.id);
    const have = items.filter(owns).length;
    const card = el("section", "set-card" + (have === items.length ? " done" : ""));
    card.style.setProperty("--c", s.col);
    const head = el("div", "set-head");
    const title = ITEMS.find((i) => i.kind === "title" && i.fromSet === s.id);
    head.append(el("b", "", s.name), el("span", "set-n", have + " / " + items.length));
    card.append(head);
    if (full) card.append(el("p", "set-desc", s.desc));
    const row = el("div", "set-items");
    for (const it of items) {
      const c = itemCard(it);
      c.classList.add("mini");
      c.addEventListener("click", () => { sfx("preview"); openDetail(it); });
      row.append(c);
    }
    card.append(row);
    if (title) card.append(el("p", "set-reward", (have === items.length ? "Title earned: " : "Own all " + items.length + " for the title ") + "“" + title.name + "”"));
    wrap.append(card);
  }
  return wrap;
}

// --- the item panel (shop and locker): try it on, buy it, wear it ---------------------
function openDetail(it) {
  detail = it;
  const box = $("item-detail");
  box.hidden = false;
  box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
  renderDetail();
  const st = stageFor("stage-detail");
  st.dirty = true;
  st.tryOn(tryOnFor(it), RARITY[it.rarity].col);
  setTimeout(() => { const b = box.querySelector(".idet-buy, .idet-equip, .idet-close"); if (b) b.focus({ preventScroll: true }); }, 30);
}
function closeDetail() {
  if (!detail) return false;
  detail = null;
  $("item-detail").hidden = true;
  if (tabNow === "shop") renderShop();
  if (tabNow === "locker") renderLocker();
  renderSigils();
  return true;
}
function renderDetail(confirming) {
  const it = detail;
  const panel = $("idet-panel");
  panel.style.setProperty("--r", RARITY[it.rarity].col);
  panel.className = "idet-panel r-" + RARITY[it.rarity].id;
  const set = it.set ? SET_BY_ID[it.set] : null;
  $("idet-kicker").textContent = RARITY[it.rarity].name + " · " + KIND_BY_ID[it.kind].name + (set ? " · " + set.name : "");
  $("idet-name").textContent = it.name;
  $("idet-desc").textContent = it.desc || defaultDesc(it);
  $("idet-plate").textContent = it.kind === "title" ? it.name : equipped("title").id ? equipped("title").name : "";
  $("idet-plate").hidden = !$("idet-plate").textContent;
  const src = $("idet-src");
  src.replaceChildren();
  const acts = $("idet-actions");
  acts.replaceChildren();
  const have = store.data.sigils || 0;
  if (owns(it)) {
    src.append(el("span", "idet-owned", equipped(it.kind).id === it.id ? "Yours, and you're wearing it" : "Yours"));
    if (equipped(it.kind).id !== it.id) {
      const b = el("button", "btn btn-primary idet-equip", "Wear it");
      b.type = "button";
      b.addEventListener("click", () => { equip(it.kind, it.id); sfx("equip"); renderDetail(); renderSigils(); });
      acts.append(b);
    } else {
      const b = el("button", "btn btn-ghost idet-equip", "Equipped");
      b.type = "button"; b.disabled = true; b.prepend(icon("check"));
      acts.append(b);
    }
  } else if (it.shop) {
    const p = el("span", "idet-price"); p.append(sigilTag(it.price, "big"), el("span", "", " Sigils"));
    src.append(p);
    if (confirming) {
      const yes = el("button", "btn btn-primary idet-buy", "Buy for " + it.price);
      yes.type = "button"; yes.prepend(icon("gem"));
      yes.addEventListener("click", () => doBuy(it));
      const no = el("button", "btn btn-ghost", "Not now"); no.type = "button";
      no.addEventListener("click", () => { sfx("click"); renderDetail(); });
      acts.append(el("span", "idet-confirm", "Spend " + it.price + " of your " + have + " Sigils?"), yes, no);
      setTimeout(() => yes.focus({ preventScroll: true }), 20);
    } else {
      const b = el("button", "btn btn-primary idet-buy", have >= it.price ? "Buy" : "Need " + (it.price - have) + " more");
      b.type = "button";
      if (have >= it.price) b.prepend(icon("gem"));
      b.disabled = have < it.price;
      b.addEventListener("click", () => { sfx("click"); renderDetail(true); });
      acts.append(b);
    }
  } else {
    const s = source(it);
    src.append(el("span", "idet-how", s.type === "achv" ? "Earned with the achievement “" + (ACH_BY_ID[s.achv] ? ACH_BY_ID[s.achv].name : s.achv) + "”: " + (ACH_BY_ID[s.achv] ? ACH_BY_ID[s.achv].desc : "") :
      s.type === "wave" ? "Earned by reaching wave " + s.wave + " on the Ladder." :
      s.type === "level" ? "Earned by reaching level " + s.level + ". It can't be bought." :
      s.type === "set" ? "Earned by owning all of " + SET_BY_ID[s.set].name + "." : ""));
  }
  $("idet-bal").replaceChildren(document.createTextNode("You have "), sigilTag(have), document.createTextNode(" Sigils"));
}
function defaultDesc(it) {
  if (it.kind === "suit") return "A full suit for your astronaut.";
  if (it.kind === "trail") return "Your jetpack's puffs, in a new colour and style.";
  if (it.kind === "finish") return "A new finish on every gun you carry.";
  if (it.kind === "victory") return "Plays over the last sin when it falls.";
  if (it.kind === "title") return "Shown under your name.";
  return "";
}
function doBuy(it) {
  if (!buy(it)) { sfx("deny"); ui.toast("Not enough Sigils"); renderDetail(); return; }
  reveal(it);
  renderDetail();
  renderSigils();
}

// --- the reveal: a short, skippable moment when something's yours --------------------
function reveal(it) {
  const box = $("reveal");
  const r = RARITY[it.rarity];
  box.className = "reveal r-" + r.id;
  box.style.setProperty("--r", r.col);
  $("reveal-k").textContent = "New " + KIND_BY_ID[it.kind].name.toLowerCase() + " · " + r.name;
  $("reveal-name").textContent = it.name;
  const art = $("reveal-art");
  art.replaceChildren();
  if (it.kind === "title") art.append(el("span", "title-plate big", it.name));
  else { const c = document.createElement("canvas"); const src = thumb(it, 220, 190); c.width = src.width; c.height = src.height; c.getContext("2d").drawImage(src, 0, 0); art.append(c); }
  box.hidden = false;
  box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
  sfx("reveal");
  const wear = $("reveal-wear");
  wear.onclick = (e) => { e.stopPropagation(); equip(it.kind, it.id); sfx("equip"); closeReveal(); renderDetail(); };
  setTimeout(() => wear.focus({ preventScroll: true }), 40);
}
function closeReveal() {
  const box = $("reveal");
  if (box.hidden) return false;
  box.hidden = true;
  return true;
}

// --- Challenges ---------------------------------------------------------------------
function renderChallenges() {
  store.data.contractsSeen = dayKey(); store.save();
  renderDots();
  const box = $("hpane-challenges");
  box.replaceChildren();
  const wrap = el("div", "chal");
  const sec = el("section", "chal-sec chal-contracts");
  const head = el("div", "chal-head");
  head.append(el("h2", "chal-h", "Daily contracts"), el("span", "chal-reset", ""));
  sec.append(head);
  sec.append(el("p", "chal-note", "Three a day, new at 00:00 UTC. They fill in as you play (solo or co-op) and pay Sigils the moment they're done."));
  const list = el("div", "contract-list");
  for (const c of contracts()) {
    const card = el("div", "contract t" + c.tier + (c.done ? " done" : ""));
    const top = el("div", "contract-top");
    top.append(el("span", "contract-tier", contractTier(c)), sigilTag("+" + contractReward(c)));
    card.append(top, el("b", "contract-name", contractText(c)));
    const bar = el("i", "contract-bar");
    bar.style.setProperty("--p", Math.min(1, c.have / c.need).toFixed(3));
    card.append(bar, el("span", "contract-n", c.done ? "Done · paid" : Math.min(c.have, c.need) + " / " + c.need));
    list.append(card);
  }
  sec.append(list);
  wrap.append(sec);
  // the Daily Challenge
  const daily = el("section", "chal-sec chal-daily");
  const d = store.data.daily, today = dayKey();
  daily.append(el("h2", "chal-h", "Daily Challenge"), el("p", "chal-note", "One seed for everyone today, always on Normal. " + (d.date === today && d.score > 0 ? "Your best today: " + formatScore(d.score) + " (wave " + d.wave + ")." : "You haven't played today's yet.")));
  const go = el("button", "btn btn-primary", "Play today's Daily");
  go.type = "button"; go.prepend(icon("calendar-days"));
  go.addEventListener("click", () => { sfx("click"); handlers.onDaily(); });
  daily.append(go);
  wrap.append(daily);
  // achievements you're close to
  const near = el("section", "chal-sec chal-near");
  near.append(el("h2", "chal-h", "Almost there"));
  const open = ACHIEVEMENTS.filter((a) => !store.data.achv[a.id]);
  const scored = open.map((a) => ({ a, p: a.goal ? Math.min(0.99, a.goal()[0] / a.goal()[1]) : 0 })).sort((x, y) => y.p - x.p).slice(0, 4);
  for (const { a, p } of scored) {
    const row = el("div", "near-row");
    const badge = el("span", "badge"); badge.style.setProperty("--b", a.col); badge.append(icon(a.icon));
    const txt = el("span", "near-txt");
    txt.append(el("b", "", a.name), el("span", "", a.desc));
    if (a.goal) { const bar = el("i", "contract-bar"); bar.style.setProperty("--p", p.toFixed(3)); txt.append(bar); }
    row.append(badge, txt, sigilTag("+" + achvSigils(a.id)));
    near.append(row);
  }
  if (!scored.length) near.append(el("p", "chal-note", "Every achievement is yours. Impressive."));
  const all = el("button", "btn btn-ghost btn-sm", "All achievements");
  all.type = "button"; all.addEventListener("click", () => { sfx("click"); setTab("profile"); });
  near.append(all);
  wrap.append(near);
  // where Sigils come from
  const earn = el("section", "chal-sec chal-earn");
  const S = BALANCE.sigils;
  earn.append(el("h2", "chal-h", "Earning Sigils"));
  const dl = el("dl", "earn-list");
  const row = (k, v) => { const x = el("div"); x.append(el("dt", "", k), el("dd", "", v)); dl.append(x); };
  row("Each sin boss on the Ladder", "+" + S.boss);
  row("Beating the Ladder", "+" + S.win);
  row("Clearing Boss Rush", "+" + S.rush + " (S rank +" + S.rank.S + ", A +" + S.rank.A + ")");
  row("Hard / Nightmare", "all of the above x" + S.diff.hard + " / x" + S.diff.nightmare);
  row("Each achievement", "+" + S.achievement);
  row("Daily contracts", "+" + S.contracts.join(", +"));
  earn.append(dl, el("p", "chal-note", "Your Sigils and cosmetics are saved on this device (and in the Windows app's save file). Debug runs don't pay."));
  wrap.append(earn);
  box.append(wrap);
  updateResetClock();
}
function updateResetClock() {
  const n = document.querySelector(".chal-reset");
  if (!n) return;
  const ms = contractsResetIn();
  n.textContent = "New contracts in " + Math.floor(ms / 3600000) + "h " + String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0") + "m";
}

// --- Profile ------------------------------------------------------------------------
function renderProfile() {
  const card = $("prof-stats");
  card.replaceChildren();
  const b = store.data.best, t = store.data.totals, rs = store.data.rush;
  const add = (k, v) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); card.append(d); };
  add("Runs", String(t.runs || 0));
  add("Best score", b.score ? formatScore(b.score) : "—");
  add("Best wave", b.wave ? String(b.wave) : "—");
  add("Ladder wins", String(b.wins || 0));
  if (b.fastestWin) add("Fastest win", fmtTime(b.fastestWin));
  add("Best combo", b.combo ? String(b.combo) : "—");
  add("Robots destroyed", formatScore(t.kills || 0));
  add("Boss Rush clears", String(rs.clears || 0));
  add("Achievements", ACHIEVEMENTS.filter((a) => store.data.achv[a.id]).length + " / " + ACHIEVEMENTS.length);
  add("Cosmetics", ownedCount() + " / " + ITEMS.length);
  if (store.data.life.sigils) add("Sigils earned", String(store.data.life.sigils));
  $("prof-name").textContent = nameOf();
  const tt = equipped("title");
  $("prof-title").textContent = tt.id ? tt.name : "No title";
  ui.renderAchievements();
  ui.renderProfileStrip();
  renderLevelCard();
}

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------
function setTab(name, quiet) {
  if (detail) closeDetail();
  tabNow = name;
  for (const b of document.querySelectorAll(".hnav")) {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  friendsUI.tab(name === "friends");
  for (const id of ["play", "locker", "shop", "challenges", "profile", "friends"]) {
    const p = $("hpane-" + id);
    if (!p) continue;
    const on = id === name;
    if (on && p.hidden) { p.hidden = false; p.classList.remove("in"); void p.offsetWidth; p.classList.add("in"); }
    else if (!on) p.hidden = true;
  }
  $("screen-menu").dataset.tab = name;
  if (!quiet) sfx("tab");
  refresh();
  if (stages["stage-" + name]) stages["stage-" + name].dirty = true;
}
/** The top bar's level chip: badge, band, and how far into the level you are. */
function renderLevelChip() {
  const lv = levelOf(store.data.xp || 0), t = tierOf(lv.level);
  const b = $("hl-badge");
  if (!b) return;
  b.textContent = String(lv.level); b.style.setProperty("--lv", t.col);
  $("hl-tier").textContent = t.name;
  $("hl-fill").style.transform = "scaleX(" + (lv.need ? lv.into / lv.need : 1).toFixed(3) + ")";
  $("hangar-level").setAttribute("aria-label", "Level " + lv.level + ", " + t.name + ". " + (lv.need ? lv.into + " of " + lv.need + " XP to the next" : "Max level"));
}
/** Profile: your level, the next hat, and the whole track of level hats. */
function renderLevelCard() {
  const box = $("prof-level");
  if (!box) return;
  const lv = levelOf(store.data.xp || 0), t = tierOf(lv.level), nh = nextHat(lv.level);
  box.replaceChildren();
  box.style.setProperty("--lv", t.col);
  const top = el("div", "pl-top");
  const txt = el("div", "pl-txt");
  txt.append(el("small", "", t.name), el("b", "", "Level " + lv.level), el("span", "", formatScore(lv.total) + " XP in all" + (nh ? " · next hat at level " + nh.level : " · every hat earned")));
  top.append(levelBadge(lv.level, true), txt);
  const bar = el("div", "xp-bar");
  const fill = el("i");
  fill.style.transform = "scaleX(" + (lv.need ? lv.into / lv.need : 1).toFixed(3) + ")";
  bar.append(fill, el("span", "", lv.need ? formatScore(lv.into) + " / " + formatScore(lv.need) + " XP to level " + (lv.level + 1) : "Max level"));
  const track = el("div", "pl-track");
  for (const [l, id] of LEVEL_HATS) {
    const it = item("hat", id);
    const got = lv.level >= l;
    const c = el("button", "pl-hat" + (got ? " got" : ""));
    c.type = "button";
    c.style.setProperty("--r", RARITY[it.rarity].col);
    const cv = document.createElement("canvas");
    const src = thumb(it, 70, 60);
    cv.width = src.width; cv.height = src.height; cv.getContext("2d").drawImage(src, 0, 0);
    c.append(cv, el("b", "", "Lv " + l), el("small", "", it.name));
    if (!got) c.append(el("i", "pl-lock"));
    c.setAttribute("aria-label", it.name + ", level " + l + (got ? ", unlocked" : ", locked"));
    c.addEventListener("click", () => { sfx("click"); setTab("locker"); lockerKind = "hat"; lockerPreview = null; renderLocker(); });
    track.append(c);
  }
  box.append(top, bar, el("h3", "pl-h", "Level hats"), track);
  // cloud saves: your stuff on every device
  const cl = el("div", "pl-cloud");
  const st = cloud.state;
  const line = !online.user ? "Sign in to keep your items, Sigils and level on every device (website, Windows and Android)."
    : st === "missing" ? "Cloud saves switch on with the 4.5 server update. Your items are safe on this device."
    : st === "error" ? "Couldn't reach your cloud save just now." : cloud.last ? "Synced with your account " + agoText(cloud.last) + "." : "Your items, Sigils and level follow your account.";
  cl.append(icon("refresh-cw"), el("span", "", line));
  if (online.user && st !== "missing") {
    const btn = el("button", "btn btn-ghost btn-sm", "Restore my items");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      sfx("click");
      btn.disabled = true; btn.textContent = "Checking your account…";
      const r = await cloud.sync("restore");
      btn.disabled = false; btn.textContent = "Restore my items";
      if (!r) { ui.toast(cloud.state === "missing" ? "Cloud saves need the 4.5 server update" : "Couldn't reach your cloud save. Try again in a moment.", 3000); return; }
      const bits = [];
      if (r.items > 0) bits.push(r.items + " item" + (r.items === 1 ? "" : "s"));
      if (r.sigils > 0) bits.push("+" + r.sigils + " Sigils");
      if (r.xp > 0) bits.push("+" + r.xp + " XP");
      ui.toast(bits.length ? "Restored " + bits.join(", ") : "Everything's already here: you're all synced", 3200);
      refresh();
    });
    cl.append(btn);
  }
  box.append(cl);
}
function agoText(t) { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : Math.floor(s / 3600) + " h ago"; }
function refresh() {
  renderSigils();
  renderLevelChip();
  renderDots();
  if (tabNow === "play") renderPlay();
  else if (tabNow === "locker") renderLocker();
  else if (tabNow === "shop") renderShop();
  else if (tabNow === "challenges") renderChallenges();
  else if (tabNow === "profile") renderProfile();
  else if (tabNow === "friends") friendsUI.tab(true);
}

export const hangar = {
  init(o) {
    ui = o.ui; handlers = o.handlers; sfx = o.sfx || sfx; nameOf = o.name || nameOf;
    for (const b of document.querySelectorAll(".hnav")) b.addEventListener("click", () => setTab(b.dataset.tab));
    for (const b of document.querySelectorAll(".mode-card")) {
      b.addEventListener("click", () => {
        const m = b.dataset.mode;
        if (party.on && !party.leading) { sfx("deny"); ui.toast("Your party leader picks the mode", 2200); return; }
        if (m === "daily" && party.on && party.others.length) { sfx("deny"); ui.toast("The Daily Challenge is solo: leave the party to play it", 2600); return; }
        if (m === "rush" && !store.rushUnlocked() && !G.debug.on) { sfx("deny"); ui.toast("Beat @Envy on the Sin Ladder to open Boss Rush", 2600); return; }
        if (store.data.settings.mode === m) { play(); return; }      // a second tap plays it
        store.data.settings.mode = m; store.save();
        sfx("click");
        party.sendPick();
        renderPlay();
      });
    }
    for (const b of document.querySelectorAll("[data-goto]")) b.addEventListener("click", () => setTab(b.dataset.goto));
    const hl = $("hangar-level");
    if (hl) hl.addEventListener("click", () => { sfx("click"); setTab("profile"); });
    $("idet-close").addEventListener("click", () => { sfx("click"); closeDetail(); });
    $("item-detail").addEventListener("click", (e) => { if (e.target === $("item-detail")) { sfx("click"); closeDetail(); } });
    $("reveal").addEventListener("click", () => closeReveal());
    $("reveal-keep").addEventListener("click", (e) => { e.stopPropagation(); closeReveal(); });
    G.on("look", () => { if (tabNow === "play") renderPlay(); });
    G.on("sigils", () => renderSigils());
    G.on("setDone", (s) => ui.toast(s.name + " complete: its title is yours", 2600));
  },
  /** The menu screen just opened. */
  show() { start(); refresh(); },
  tab: setTab,
  get tabNow() { return tabNow; },
  refresh,
  play,
  /** Esc / Back in the Hangar: closes what's open, then goes back to Play. False when there's nothing to close. */
  back() {
    if (friendsUI.back()) return true;
    if (closeReveal()) return true;
    if (closeDetail()) return true;
    if (tabNow !== "play") { setTab("play"); return true; }
    return false;
  },
  openItem(kind, id) { const it = item(kind, id); if (it) { setTab("shop", true); openDetail(it); } },
};
function play() {
  const mode = modeNow();
  if (handlers.onPartyPlay && handlers.onPartyPlay(mode)) return;          // in a party: guests ready up, the leader starts it for everyone
  if (mode === "daily") handlers.onDaily();
  else if (mode === "rush") handlers.onRush();
  else handlers.onPlay();
}
