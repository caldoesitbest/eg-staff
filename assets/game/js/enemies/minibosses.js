/* Mini-bosses (4.5): three heavy robots that turn up now and then in ordinary waves (sooner and more often on
   Hard and Nightmare, never on boss waves). Each has its own silhouette (sprites.js), a name on a health bar, two
   or three attacks with their own telegraphs, and a worthwhile drop. They're built to be fought, not chipped at:
   enough health to take some skill, a cap on burst so a strong build kills one in seconds rather than one frame.

   The Warden: a shield that turns toward you (slower than you can circle it) blocks shots; it vents after each
   volley. Seeker volleys curve after you; a telegraphed ram.
   The Lancer: draws a line across the arena, then dashes along it, and the line bursts behind it; ends with a fan.
   On Hard and Nightmare it chains two or three lances.
   The Siege Engine: lobs mortars where you are and where you're heading (rings fill first), pulses a shock ring
   if you hug it, and on Nightmare calls in drones. */

import { G, diff, endless } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, rand, randRange, angDiff, turnTowards } from "../util.js";
import { C, P_AMBER, P_MAGENTA, P_ORANGE, P_WHITE, P_RED } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, face, faceVel, visible } from "./index.js";
import { fireEnemyBullet } from "../world.js";
import { addZone, Z } from "../zones.js";
import { leadAngle, lineToWall } from "./roster.js";
import { waves } from "../waves.js";

const D = BALANCE.enemies;
const A = BALANCE.arena;
const MB = BALANCE.miniboss;
const hard = () => (G.difficulty === "nightmare" ? 2 : G.difficulty === "hard" ? 1 : 0);
const cool = (s) => s * diff().aggro * endless("aggro");

function ringAt(x, y, r, fuse, col, src) {
  const z = addZone(Z.DELAY, x, y, r, fuse);
  if (!z) return;
  z.dmg = 0; z.y2 = 1; z.col = col; z.pal = 0; z.src = src; z.by = null;
}
function dashedLine(g, x, y, ang, len, col, alpha, width) {
  g.save();
  g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = width;
  g.setLineDash([12, 8]); g.lineDashOffset = -G.time * 140;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  g.restore();
}
function chargeGlow(g, x, y, p, col) {
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.35 + p * 0.5; g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 4 + p * 12, 0, TAU); g.fill();
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
}
/** Keeps a range from the player, sliding sideways. */
function hold(e, P, dt, near, far, side) {
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  let tx = 0, ty = 0;
  if (d < near) { tx = -dx / d; ty = -dy / d; }
  else if (d > far) { tx = dx / d; ty = dy / d; }
  else { tx = (-dy / d) * side; ty = (dx / d) * side; }
  const k = Math.min(1, 2.2 * dt);
  e.vx += (tx * e.speed - e.vx) * k; e.vy += (ty * e.speed - e.vy) * k;
  return d;
}

export const MINIBOSSES = {
  // ------------------------------------------------------------------ the Warden
  warden: {
    miniboss: true, name: "The Warden", pal: P_AMBER, accent: C.amber,
    init(e) { e.miniboss = true; e.scale = MB.scale; e.cd = 2.2; e.t2 = 5; e.a = e.ang; e.c = 0; e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.warden;
      // the shield turns toward you, slower than you can get round it
      e.a = turnTowards(e.a, Math.atan2(P.y - e.y, P.x - e.x), d.shieldTurn * (1 + hard() * 0.15) * dt);
      if (e.c > 0) e.c -= dt;                         // venting
      if (e.state === 1) {                            // seeker volley windup
        brake(e, 6, dt); e.t -= dt;
        if (e.t <= 0) {
          const n = d.seekers + hard();
          for (let i = 0; i < n; i++) {
            const a = e.a + (i - (n - 1) / 2) * 0.42;
            const b = fireEnemyBullet(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, Math.cos(a) * d.seekSpeed, Math.sin(a) * d.seekSpeed, 1, "amber", 9);
            if (b) { b.turn = d.seekTurn; b.home = d.seekHome; b.life = 5; }
          }
          audio.play("enemyShot", e.x, e.y, 0.9);
          e.state = 0; e.c = d.vent; e.cd = cool(randRange(d.reload));
        }
        return;
      }
      if (e.state === 2) {                            // ram windup
        brake(e, 8, dt); e.t -= dt; face(e, e.tx, 4, dt);
        if (e.t <= 0) { e.state = 3; e.t = d.ramTime; e.contact = 2; audio.play("charge", e.x, e.y, 0.8); }
        return;
      }
      if (e.state === 3) {                            // ram
        e.vx = Math.cos(e.tx) * d.ramSpeed; e.vy = Math.sin(e.tx) * d.ramSpeed; e.t -= dt;
        if (Math.random() < 0.6) fx.p(0, e.x - Math.cos(e.tx) * 30, e.y - Math.sin(e.tx) * 30, rand(-60, 60), rand(-60, 60), 0.35, 2, P_AMBER, 3);
        if (e.t <= 0) { e.state = 0; e.contact = 1; e.vx *= 0.2; e.vy *= 0.2; e.t2 = cool(randRange(d.ramEvery)); if (hard() >= 2 && !e.again) { e.again = true; e.t2 = 0.6; } else e.again = false; }
        return;
      }
      const dist = hold(e, P, dt, 230, 380, e.b);
      faceVel(e, 3, dt);
      if (Math.random() < dt * 0.25) e.b = -e.b;
      e.cd -= dt; e.t2 -= dt;
      if (e.t2 <= 0 && dist < 520) { e.state = 2; e.t = d.ramWindup; e.tx = Math.atan2(P.y - e.y, P.x - e.x); audio.play("warn", e.x, e.y, 0.8); return; }
      if (e.cd <= 0 && visible(e, 20)) { e.state = 1; e.t = d.windup; audio.play("warn", e.x, e.y, 0.7); }
    },
    blocks(e, bx, by) {
      if (e.c > 0 || e.state === 1) return false;     // venting (and while it fires): hit it anywhere
      return Math.abs(angDiff(e.a, Math.atan2(by - e.y, bx - e.x))) < D.warden.shieldArc / 2;
    },
    drawUnder(g, e, x, y) {
      if (e.state === 2) dashedLine(g, x, y, e.tx, 260, C.amber, 0.85, 4);
    },
    drawOver(g, e, x, y) {
      const R = e.r * e.scale + 12, half = D.warden.shieldArc / 2;
      g.save();
      if (e.c > 0 || e.state === 1) { g.globalAlpha = 0.25 + Math.random() * 0.2; g.strokeStyle = "#5b6694"; }
      else { g.globalAlpha = 0.95; g.strokeStyle = C.amber; }
      g.lineWidth = 7;
      g.beginPath(); g.arc(x, y, R, e.a - half, e.a + half); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, R, e.a - half + 0.1, e.a + half - 0.1); g.stroke();
      g.restore();
      if (e.state === 1) chargeGlow(g, x + Math.cos(e.a) * 26, y + Math.sin(e.a) * 26, 1 - e.t / D.warden.windup, C.amber);
    },
    shakeAmt(e) { return e.state === 2 ? 2.2 : 0; },
  },

  // ------------------------------------------------------------------ the Lancer
  lancer: {
    miniboss: true, name: "The Lancer", pal: P_MAGENTA, accent: C.magenta,
    init(e) { e.miniboss = true; e.scale = MB.scale; e.cd = 2; e.c = 0; e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.lancer;
      if (e.state === 1) {                            // aiming the lance: a line across the arena
        brake(e, 9, dt); e.t -= dt;
        if (e.t > d.lock) { e.tx = leadAngle(e.x, e.y, P, d.dashSpeed, 0.35); e.tl = lineToWall(e.x, e.y, e.tx); }
        face(e, e.tx, 10, dt);
        if (e.t <= 0) { e.state = 2; e.contact = 2; e.sx = e.x; e.sy = e.y; audio.play("charge", e.x, e.y, 0.9); }
        return;
      }
      if (e.state === 2) {                            // the dash, to the wall
        e.vx = Math.cos(e.tx) * d.dashSpeed; e.vy = Math.sin(e.tx) * d.dashSpeed;
        fx.p(0, e.x, e.y, rand(-40, 40), rand(-40, 40), 0.4, 2.2, P_MAGENTA, 3);
        const m = e.r + 4;
        if (e.x < m || e.y < m || e.x > A.w - m || e.y > A.h - m || Math.hypot(e.x - e.sx, e.y - e.sy) > e.tl - 10) {
          // the path bursts behind it
          const len = Math.hypot(e.x - e.sx, e.y - e.sy), steps = Math.max(2, Math.floor(len / d.burstGap));
          for (let i = 1; i < steps; i++) ringAt(e.sx + (e.x - e.sx) * (i / steps), e.sy + (e.y - e.sy) * (i / steps), d.burstR, d.burstFuse + i * 0.03, C.magenta, "lancer");
          e.vx *= 0.1; e.vy *= 0.1; e.contact = 1;
          e.c++;
          if (e.c < 1 + hard()) { e.state = 1; e.t = d.chainWindup; return; }
          // the fan
          const a0 = leadAngle(e.x, e.y, P, d.fanSpeed, 0.4), n = d.fan + hard() * 2;
          for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.17; fireEnemyBullet(e.x, e.y, Math.cos(a) * d.fanSpeed, Math.sin(a) * d.fanSpeed, 1, "magenta", 7); }
          audio.play("enemyShot", e.x, e.y, 0.9);
          e.state = 0; e.c = 0; e.cd = cool(randRange(d.reload));
        }
        return;
      }
      // circles you at a distance, fast
      const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
      const want = 330, ta = Math.atan2(-dy, -dx) + e.b * 0.9;
      seek(e, P.x + Math.cos(ta) * want, P.y + Math.sin(ta) * want, e.speed, 2.4, dt);
      face(e, Math.atan2(dy, dx), 6, dt);
      if (Math.random() < dt * 0.3) e.b = -e.b;
      e.cd -= dt;
      if (e.cd <= 0 && visible(e, 40) && dist < 760) { e.state = 1; e.t = d.windup; e.c = 0; audio.play("warn", e.x, e.y, 0.9); }
    },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      const locked = e.t <= D.lancer.lock;
      dashedLine(g, x, y, e.tx, e.tl || 900, locked ? C.red : C.magenta, locked ? 0.95 : 0.6, locked ? 5 : 3);
    },
    drawOver(g, e, x, y) { if (e.state === 1) chargeGlow(g, x + Math.cos(e.ang) * 22, y + Math.sin(e.ang) * 22, 1 - Math.max(0, e.t) / D.lancer.windup, C.magenta); },
    shakeAmt(e) { return e.state === 1 && e.t <= D.lancer.lock ? 2 : 0; },
  },

  // ------------------------------------------------------------------ the Siege Engine
  siege: {
    miniboss: true, name: "The Siege Engine", pal: P_ORANGE, accent: C.orange,
    init(e) { e.miniboss = true; e.scale = MB.scale; e.cd = 2.5; e.t2 = 3; e.t3 = 9; e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.siege;
      const dist = Math.hypot(P.x - e.x, P.y - e.y);
      if (e.state === 1) {                            // loading the mortar
        brake(e, 7, dt); e.t -= dt; face(e, Math.atan2(P.y - e.y, P.x - e.x), 3, dt);
        if (e.t <= 0) {
          const n = d.shells + hard();
          const fuse = d.fuse * (1 - hard() * 0.06);
          // where you are, where you're heading, and around you
          ringAt(P.x, P.y, d.blast, fuse, C.orange, "siege engine");
          ringAt(P.x + P.vx * d.lead, P.y + P.vy * d.lead, d.blast, fuse + 0.15, C.orange, "siege engine");
          for (let i = 2; i < n; i++) { const a = rand(0, TAU), r = rand(90, 190); ringAt(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, d.blast, fuse + 0.1 * i, C.orange, "siege engine"); }
          fx.sparks(e.x + Math.cos(e.ang) * 30, e.y + Math.sin(e.ang) * 30, e.ang, 0.5, 8, P_ORANGE, 300, 0.3);
          fx.ring(e.x, e.y, e.r, e.r + 40, 0.25, C.orange, 3);
          audio.play("explode", e.x, e.y, 0.5);
          e.state = 0; e.cd = cool(randRange(d.reload));
        }
        return;
      }
      if (e.state === 2) {                            // too close: it plants and pulses
        brake(e, 12, dt); e.t -= dt;
        if (e.t <= 0) {
          const z = addZone(Z.SHOCK, e.x, e.y, d.pulseReach, (d.pulseReach - e.r) / d.pulseSpeed);
          if (z) { z.r0 = e.r; z.k = 1; z.col = C.orange; z.pal = 0; z.src = "siege engine"; z.by = null; }
          audio.play("zap", e.x, e.y, 0.9);
          e.state = 0; e.t2 = cool(d.pulseEvery);
        }
        return;
      }
      hold(e, P, dt, 360, 540, e.b);
      faceVel(e, 2.5, dt);
      if (Math.random() < dt * 0.2) e.b = -e.b;
      e.cd -= dt; e.t2 -= dt; e.t3 -= dt;
      if (dist < d.pulseRange && e.t2 <= 0) { e.state = 2; e.t = d.pulseWindup; audio.play("warn", e.x, e.y, 0.8); return; }
      if (e.cd <= 0 && visible(e, 10)) { e.state = 1; e.t = d.windup; audio.play("warn", e.x, e.y, 0.6); return; }
      if (hard() >= 2 && e.t3 <= 0) { e.t3 = d.callEvery; waves.spawnGroup("drone", 2); }
    },
    drawUnder(g, e, x, y) {
      if (e.state !== 2) return;
      const p = 1 - e.t / D.siege.pulseWindup;
      g.save(); g.globalAlpha = 0.3 + p * 0.5; g.strokeStyle = C.orange; g.lineWidth = 3;
      g.setLineDash([10, 8]); g.beginPath(); g.arc(x, y, e.r + 20 + p * 30, 0, TAU); g.stroke(); g.restore();
    },
    drawOver(g, e, x, y) { if (e.state === 1) chargeGlow(g, x + Math.cos(e.ang) * 30, y + Math.sin(e.ang) * 30, 1 - e.t / D.siege.windup, C.orange); },
    shakeAmt(e) { return e.state === 2 ? 1.6 : 0; },
  },
};
export const MINI_TYPES = Object.keys(MINIBOSSES);

/** Which mini-boss (if any) joins this wave: rarer early, more often later and on harder difficulties. */
export function rollMiniboss(n) {
  const from = diff().miniFrom || 7;
  if (n < from || G.mode !== "ladder" || G.tutorial) return null;
  const deep = endless("mini");
  if (G.lastMini && n - G.lastMini < 2 && !deep) return null;     // never two waves running (except in endless)
  const p = Math.min(deep ? 0.95 : MB.chanceMax, (MB.chance + (n - from) * MB.chancePerWave) * (diff().mini || 1) + deep);
  if (Math.random() >= p) return null;
  const pool = MINI_TYPES.filter((t) => n >= from + MB.unlock[t]);
  const list = [pool[Math.floor(Math.random() * pool.length)]];
  if ((G.difficulty === "nightmare" && n >= MB.pairFrom && Math.random() < MB.pair) || (deep && Math.random() < 0.25 + deep)) list.push(pool[Math.floor(Math.random() * pool.length)]);
  if (deep > 0.5 && Math.random() < deep - 0.5) list.push(pool[Math.floor(Math.random() * pool.length)]);   // deep in endless: three
  G.lastMini = n;
  return list;
}
