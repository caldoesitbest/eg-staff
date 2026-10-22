/* Game feel: particles, sparks, debris, shockwave rings, damage numbers, screen shake,
   hit-stop, slow motion and screen flashes. All pooled; nothing allocates per frame. */

import { Pool, TAU, rand, clamp } from "./util.js";
import { sprites, PAL, P_WHITE } from "./sprites.js";
import { BALANCE } from "./balance.js";

const DOT = 0, SPARK = 1, SHARD = 2, SMOKE = 3;

function makeParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: 0, colStr: "", kind: 0, rot: 0, vr: 0, drag: 0, dead: false };
}
function makeRing() { return { x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, col: "#fff", w: 2, dead: false }; }
function makeNumber() { return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, text: "", col: "#fff", size: 14, dead: false }; }

export const fx = {
  parts: new Pool(makeParticle, BALANCE.fx.particles.high),
  rings: new Pool(makeRing, 80),
  nums: new Pool(makeNumber, 90),
  trauma: 0,
  shakeX: 0, shakeY: 0,
  shakeOn: true,
  reduced: false,
  density: 1,                // quality: fraction of particles actually spawned
  flash: { col: "#fff", a: 0, decay: 4 },

  setQuality(level) {
    // level: 2 high, 1 medium, 0 low
    const p = BALANCE.fx.particles;
    this.parts.limit = level === 2 ? p.high : level === 1 ? Math.round((p.high + p.low) / 2) : p.low;
    this.density = level === 2 ? 1 : level === 1 ? 0.7 : 0.4;
  },

  clear() {
    this.parts.clear(); this.rings.clear(); this.nums.clear();
    this.trauma = 0; this.flash.a = 0;
  },

  // ---------- spawning ----------
  p(kind, x, y, vx, vy, life, size, col, drag) {
    const q = this.parts.get();
    if (!q) return null;
    q.kind = kind; q.x = x; q.y = y; q.vx = vx; q.vy = vy;
    q.life = q.max = life; q.size = size; q.col = col; q.drag = drag || 0;
    q.rot = rand(0, TAU); q.vr = rand(-12, 12); q.dead = false;
    return q;
  },

  burst(x, y, n, col, speed, life, size) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      this.p(DOT, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life * 0.5, life), rand(size * 0.6, size), col, 3);
    }
  },

  sparks(x, y, angle, spread, n, col, speed = 420, life = 0.28) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread, spread), s = rand(speed * 0.4, speed);
      this.p(SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life * 0.5, life), rand(0.6, 1.1), col, 5);
    }
  },

  debris(x, y, n, colStr, speed = 260) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      const q = this.p(SHARD, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.1), rand(2, 4.5), 0, 2.2);
      if (q) q.colStr = colStr;
    }
  },

  smoke(x, y, n, size = 18) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(10, 70);
      this.p(SMOKE, x + rand(-6, 6), y + rand(-6, 6), Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.0), rand(size * 0.6, size), 10, 2);
    }
  },

  ring(x, y, r0, r1, life, col, w = 3) {
    const q = this.rings.get();
    if (!q) return;
    q.x = x; q.y = y; q.r0 = r0; q.r1 = r1; q.life = q.max = life; q.col = col; q.w = w; q.dead = false;
  },

  number(x, y, value, crit, col) {
    const q = this.nums.get();
    if (!q) return;
    q.x = x + rand(-6, 6); q.y = y - 8; q.vx = rand(-20, 20); q.vy = crit ? -110 : -80;
    q.life = q.max = crit ? 0.8 : 0.6;
    q.text = crit ? Math.round(value) + "!" : String(Math.round(value));
    q.col = col || (crit ? "#ffc861" : "#ffffff");
    q.size = crit ? 19 : 13;
    q.dead = false;
  },

  text(x, y, str, col, size = 16, life = 1) {
    const q = this.nums.get();
    if (!q) return;
    q.x = x; q.y = y; q.vx = 0; q.vy = -45; q.life = q.max = life; q.text = str; q.col = col; q.size = size; q.dead = false;
  },

  /** A full robot explosion: flash, ring, sparks, debris, smoke. size ~ robot radius. */
  explode(x, y, size, col, colStr) {
    const k = size / 14;
    this.p(DOT, x, y, 0, 0, 0.16, 4 * k, P_WHITE, 0);
    this.p(DOT, x, y, 0, 0, 0.26, 7 * k, col, 0);
    this.ring(x, y, size * 0.5, size * 3.2, 0.32, colStr, 3);
    this.sparks(x, y, 0, Math.PI, 10 * Math.min(2.4, k), col, 380 * Math.min(1.6, 0.7 + k * 0.3), 0.32);
    this.burst(x, y, 6 * Math.min(2.5, k), col, 160, 0.5, 1.6);
    this.debris(x, y, 5 * Math.min(2.5, k), colStr, 240);
    if (size > 16) this.smoke(x, y, 3 * k, 14 * k);
  },

  shake(amount) {
    if (!this.shakeOn) return;
    this.trauma = Math.min(1, this.trauma + amount);
  },

  screenFlash(col, a, decay = 4) {
    if (this.reduced) a *= 0.35;
    this.flash.col = col; this.flash.a = Math.max(this.flash.a, a); this.flash.decay = decay;
  },

  // ---------- update ----------
  update(dt) {
    const ps = this.parts;
    for (let i = 0; i < ps.count; i++) {
      const q = ps.items[i];
      q.life -= dt;
      if (q.life <= 0) { q.dead = true; continue; }
      const d = 1 - Math.min(1, q.drag * dt);
      q.vx *= d; q.vy *= d;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.rot += q.vr * dt;
    }
    ps.sweep();
    const rs = this.rings;
    for (let i = 0; i < rs.count; i++) { const q = rs.items[i]; q.life -= dt; if (q.life <= 0) q.dead = true; }
    rs.sweep();
    const ns = this.nums;
    for (let i = 0; i < ns.count; i++) {
      const q = ns.items[i];
      q.life -= dt;
      if (q.life <= 0) { q.dead = true; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy *= 1 - Math.min(1, 3 * dt);
    }
    ns.sweep();
  },

  /** Real-time (not slowed by hit-stop) decay of shake and screen flash. */
  tickScreen(dt) {
    const max = BALANCE.fx.shake.max;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const t = this.trauma * this.trauma;
      this.shakeX = (Math.random() * 2 - 1) * max * t;
      this.shakeY = (Math.random() * 2 - 1) * max * t;
    } else { this.shakeX = 0; this.shakeY = 0; }
    if (this.flash.a > 0) this.flash.a = Math.max(0, this.flash.a - dt * this.flash.decay);
  },

  // ---------- drawing (world transform already applied) ----------
  drawBelow(g) {
    // smoke + debris (normal blending)
    const ps = this.parts;
    const dots = sprites.dots;
    for (let i = 0; i < ps.count; i++) {
      const q = ps.items[i];
      if (q.kind === SMOKE) {
        const t = q.life / q.max;
        const s = q.size * (1.6 - t * 0.6);
        g.globalAlpha = t * 0.35;
        g.drawImage(dots[q.col], q.x - s, q.y - s, s * 2, s * 2);
      } else if (q.kind === SHARD) {
        const t = q.life / q.max;
        g.globalAlpha = clamp(t * 1.5, 0, 1);
        g.fillStyle = q.colStr || "#aab";
        const c = Math.cos(q.rot), s = Math.sin(q.rot), z = q.size;
        g.beginPath();
        g.moveTo(q.x + c * z, q.y + s * z);
        g.lineTo(q.x - s * z * 0.6, q.y + c * z * 0.6);
        g.lineTo(q.x - c * z * 0.8, q.y - s * z * 0.8);
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 1;
  },

  drawAdditive(g, P) {
    const ps = this.parts;
    const dots = sprites.dots;
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < ps.count; i++) {
      const q = ps.items[i];
      const t = q.life / q.max;
      if (q.kind === DOT) {
        const s = q.size * (0.4 + t * 0.6) * 4;
        g.globalAlpha = t;
        g.drawImage(dots[q.col], q.x - s, q.y - s, s * 2, s * 2);
      } else if (q.kind === SPARK) {
        const sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy);
        const len = Math.max(4, sp * 0.045) * q.size;
        const w = 3.2 * q.size;
        const c = q.vx / (sp || 1), s = q.vy / (sp || 1);
        g.globalAlpha = t;
        g.setTransform(c * P, s * P, -s * P, c * P, (q.x - fx.camX) * P + fx.offX, (q.y - fx.camY) * P + fx.offY);
        g.drawImage(dots[q.col], -len, -w, len * 2, w * 2);
      }
    }
    g.setTransform(P, 0, 0, P, -fx.camX * P + fx.offX, -fx.camY * P + fx.offY);
    // rings
    const rs = this.rings;
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < rs.count; i++) {
      const q = rs.items[i];
      const t = 1 - q.life / q.max;
      const r = q.r0 + (q.r1 - q.r0) * (1 - (1 - t) * (1 - t));
      g.globalAlpha = (1 - t) * 0.9;
      g.strokeStyle = q.col;
      g.lineWidth = q.w * (1 - t * 0.6);
      g.beginPath();
      g.arc(q.x, q.y, r, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  },

  drawNumbers(g) {
    const ns = this.nums;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    for (let i = 0; i < ns.count; i++) {
      const q = ns.items[i];
      const t = q.life / q.max;
      const pop = t > 0.8 ? 1 + (t - 0.8) * 2.5 : 1;
      g.globalAlpha = Math.min(1, t * 2.2);
      g.font = "700 " + Math.round(q.size * pop) + "px Rajdhani, 'Plus Jakarta Sans', sans-serif";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(3,5,24,0.85)";
      g.strokeText(q.text, q.x, q.y);
      g.fillStyle = q.col;
      g.fillText(q.text, q.x, q.y);
    }
    g.globalAlpha = 1;
  },

  // camera values the spark transform needs (set by the renderer each frame)
  camX: 0, camY: 0, offX: 0, offY: 0,
};

export const FX_KIND = { DOT, SPARK, SHARD, SMOKE };
