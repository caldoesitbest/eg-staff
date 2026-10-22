/* The nine robots. Each one: a distinct silhouette (sprites.js), an accent colour,
   and a telegraph you can read by shape and motion before it attacks. */

import { G } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, rand, randRange, angDiff } from "../util.js";
import { C, P_DANGER, P_VIOLET, P_AMBER, P_MAGENTA, P_BLUE, P_ORANGE, P_RED, P_GREEN, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, face, faceVel, angleToPlayer, visible } from "./index.js";
import { spawnEnemy } from "./index.js";
import { fireEnemyBullet, queueBlast, killEnemy } from "../world.js";

const D = BALANCE.enemies;
const A = BALANCE.arena;

function chase(e, P, dt, wobAmp, wobFreq, accel) {
  const dx = P.x - e.x, dy = P.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const k = Math.min(1, d / 220);
  const wob = Math.sin(G.time * wobFreq + e.id * 1.7) * wobAmp * k;
  seek(e, P.x + (-dy / d) * wob, P.y + (dx / d) * wob, e.speed, accel, dt);
  faceVel(e, 9, dt);
}

function wander(e, dt) {
  seek(e, A.w / 2 + Math.cos(e.id + G.time * 0.3) * 400, A.h / 2 + Math.sin(e.id + G.time * 0.3) * 300, e.speed * 0.5, 1, dt);
  faceVel(e, 4, dt);
}

/** Dashed path line for straight-line attacks. */
function dashedLine(g, x, y, ang, len, col, alpha, width, dash) {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = col;
  g.lineWidth = width;
  g.setLineDash(dash);
  g.lineDashOffset = -G.time * 120;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  g.stroke();
  g.restore();
}

function lineToWall(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let t = 3000;
  if (c > 0) t = Math.min(t, (A.w - x) / c); else if (c < 0) t = Math.min(t, -x / c);
  if (s > 0) t = Math.min(t, (A.h - y) / s); else if (s < 0) t = Math.min(t, -y / s);
  return Math.max(0, t);
}

export const ROSTER = {
  // 1. Scrap Drone: basic chaser, comes in numbers.
  drone: {
    pal: P_DANGER, accent: C.danger,
    update(e, dt, P) { if (P.dead) return wander(e, dt); chase(e, P, dt, 50, 2.2, 3); },
  },

  // 9. Swarmlings: tiny, fast, zig-zagging packs.
  swarm: {
    pal: P_VIOLET, accent: "#c86bff",
    update(e, dt, P) { if (P.dead) return wander(e, dt); chase(e, P, dt, 85, 5.5, 5); },
  },

  // Splitter children.
  mini: {
    pal: P_MAGENTA, accent: C.magenta,
    update(e, dt, P) { if (P.dead) return wander(e, dt); chase(e, P, dt, 40, 3.2, 4); },
  },

  // 2. Ripper: stops, shakes + shows its path, then charges in a straight line.
  ripper: {
    pal: P_AMBER, accent: C.amber,
    init(e) { e.cd = rand(0.6, 1.4); },
    update(e, dt, P) {
      const d = D.ripper;
      if (P.dead) return wander(e, dt);
      e.t -= dt;
      if (e.state === 0) {                       // approach
        e.cd -= dt;
        chase(e, P, dt, 30, 1.6, 3);
        const dist = Math.hypot(P.x - e.x, P.y - e.y);
        if (e.cd <= 0 && dist < d.range && visible(e, 10)) {
          e.state = 1; e.t = d.windup; e.a = angleToPlayer(e);
          audio.play("warn", e.x, e.y, 0.7);
        }
      } else if (e.state === 1) {                // windup: brake, track the player, lock for the last 35%
        brake(e, 10, dt);
        if (e.t > d.windup * 0.35) e.a = angleToPlayer(e);
        face(e, e.a, 14, dt);
        if (e.t <= 0) {
          e.state = 2; e.t = d.chargeTime;
          e.vx = Math.cos(e.a) * d.chargeSpeed; e.vy = Math.sin(e.a) * d.chargeSpeed;
          e.contact = d.chargeDmg;
          fx.sparks(e.x, e.y, e.a + Math.PI, 0.4, 8, P_AMBER, 360, 0.25);
          audio.play("charge", e.x, e.y);
        }
      } else if (e.state === 2) {                // charge
        e.vx = Math.cos(e.a) * d.chargeSpeed; e.vy = Math.sin(e.a) * d.chargeSpeed;
        if (Math.random() < 0.6) fx.p(0, e.x, e.y, -e.vx * 0.1, -e.vy * 0.1, 0.25, 1.6, P_AMBER, 4);
        const r = e.r;
        const hitWall = e.x <= r + 2 || e.x >= A.w - r - 2 || e.y <= r + 2 || e.y >= A.h - r - 2;
        if (e.t <= 0 || hitWall) {
          if (hitWall) { fx.sparks(e.x, e.y, e.a + Math.PI, 0.8, 8, P_AMBER, 300, 0.25); fx.shake(0.08); audio.play("clank", e.x, e.y, 0.6); }
          e.state = 3; e.t = randRange(d.rest); e.contact = d.contact;
        }
      } else {                                    // rest
        brake(e, 3, dt);
        if (e.t <= 0) { e.state = 0; e.cd = rand(0.2, 0.8); }
      }
    },
    onRock(e) { if (e.state === 2) { e.state = 3; e.t = 0.8; e.contact = D.ripper.contact; fx.shake(0.06); } },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      const d = D.ripper;
      const p = 1 - e.t / d.windup;
      const len = Math.min(d.chargeSpeed * d.chargeTime, lineToWall(x, y, e.a));
      const locked = e.t <= d.windup * 0.35;
      dashedLine(g, x, y, e.a, len, locked ? "#ffffff" : C.amber, 0.35 + p * 0.5, locked ? 3 : 2, [10, 8]);
      // chevrons along the path
      g.save();
      g.globalAlpha = 0.4 + p * 0.5;
      g.strokeStyle = C.amber;
      g.lineWidth = 2.5;
      const c = Math.cos(e.a), s = Math.sin(e.a);
      for (let i = 1; i <= 3; i++) {
        const t = ((i / 3.5) + (G.time * 1.5) % (1 / 3.5)) * len;
        const cx = x + c * t, cy = y + s * t;
        g.beginPath();
        g.moveTo(cx - c * 7 - s * 8, cy - s * 7 + c * 8);
        g.lineTo(cx, cy);
        g.lineTo(cx - c * 7 + s * 8, cy - s * 7 - c * 8);
        g.stroke();
      }
      g.restore();
    },
    shakeAmt(e) { return e.state === 1 ? 1.6 + (1 - e.t / D.ripper.windup) * 2 : 0; },
  },

  // 3. Gunner: keeps its distance, glows at the barrel, then fires slow, dodgeable orbs.
  gunner: {
    pal: P_VIOLET, accent: C.violet2,
    init(e) { e.cd = rand(1.0, 2.0); e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.gunner;
      if (P.dead) return wander(e, dt);
      const dx = P.x - e.x, dy = P.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      let tx, ty;
      if (dist > d.keep[1]) { tx = nx; ty = ny; }
      else if (dist < d.keep[0]) { tx = -nx; ty = -ny; }
      else { tx = -ny * e.b; ty = nx * e.b; }
      const k = Math.min(1, 3 * dt);
      const sp = e.state === 1 ? e.speed * 0.25 : e.speed;
      e.vx += (tx * sp - e.vx) * k; e.vy += (ty * sp - e.vy) * k;
      face(e, Math.atan2(dy, dx), 5, dt);
      if (Math.random() < dt * 0.3) e.b = -e.b;
      if (e.state === 0) {
        e.cd -= dt;
        if (e.cd <= 0 && visible(e, 20)) { e.state = 1; e.t = d.windup; audio.play("warn", e.x, e.y, 0.5); }
      } else {
        e.t -= dt;
        if (e.t <= 0) {
          const shots = G.wave >= 12 ? 3 : 1;
          const a0 = e.ang;
          for (let i = 0; i < shots; i++) {
            const a = a0 + (i - (shots - 1) / 2) * 0.28;
            fireEnemyBullet(e.x + Math.cos(a0) * 20, e.y + Math.sin(a0) * 20, Math.cos(a) * d.shotSpeed, Math.sin(a) * d.shotSpeed, d.shotDmg, "violet", 7);
          }
          fx.sparks(e.x + Math.cos(a0) * 20, e.y + Math.sin(a0) * 20, a0, 0.4, 4, P_VIOLET, 240, 0.18);
          audio.play("enemyShot", e.x, e.y, 0.7);
          e.state = 0; e.cd = randRange(d.reload);
          e.kx -= Math.cos(a0) * 60; e.ky -= Math.sin(a0) * 60;
        }
      }
    },
    drawOver(g, e, x, y) {
      if (e.state !== 1) return;
      const p = 1 - e.t / D.gunner.windup;
      const bx = x + Math.cos(e.ang) * 22, by = y + Math.sin(e.ang) * 22;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.5 + p * 0.5;
      g.fillStyle = C.violet2;
      g.beginPath(); g.arc(bx, by, 3 + p * 6, 0, TAU); g.fill();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(bx, by, 14 - p * 9, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    },
  },

  // 4. Splitter: breaks into minis on death.
  splitter: {
    pal: P_MAGENTA, accent: C.magenta,
    update(e, dt, P) {
      if (P.dead) return wander(e, dt);
      chase(e, P, dt, 30, 1.4, 2);
      e.ang += dt * 1.5;
    },
    onDeath(e, silent) {
      if (silent) return;
      const n = D.splitter.splits;
      for (let i = 0; i < n; i++) {
        const a = e.ang + (i / n) * TAU;
        const m = spawnEnemy("mini", e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, { spawnT: 0.08, elite: e.elite });
        if (m) { m.kx = Math.cos(a) * 260; m.ky = Math.sin(a) * 260; m.ang = a; }
      }
    },
  },

  // 5. Bulwark: frontal shield, turns slowly. Flank it or boost past it.
  bulwark: {
    pal: P_BLUE, accent: C.blue,
    update(e, dt, P) {
      const d = D.bulwark;
      if (P.dead) return wander(e, dt);
      const want = angleToPlayer(e);
      face(e, want, d.turn, dt);
      // walks the way it faces (so circling it works)
      const k = Math.min(1, 2 * dt);
      e.vx += (Math.cos(e.ang) * e.speed - e.vx) * k;
      e.vy += (Math.sin(e.ang) * e.speed - e.vy) * k;
    },
    blocks(e, bx, by) {
      const a = Math.atan2(by - e.y, bx - e.x);
      return Math.abs(angDiff(e.ang, a)) < D.bulwark.shieldArc / 2;
    },
  },

  // 6. Boomer: rushes in, then a red ring shows the blast radius before it detonates.
  boomer: {
    pal: P_ORANGE, accent: C.orange,
    update(e, dt, P) {
      const d = D.boomer;
      if (P.dead) return wander(e, dt);
      if (e.state === 0) {
        chase(e, P, dt, 20, 1.5, 4);
        if (Math.hypot(P.x - e.x, P.y - e.y) < d.trigger) {
          e.state = 1; e.t = d.fuse;
          audio.play("warn", e.x, e.y);
        }
      } else {
        brake(e, 8, dt);
        e.t -= dt;
        e.scale = 1 + (1 - e.t / d.fuse) * 0.25 + Math.sin(G.time * 40) * 0.04;
        if (e.t <= 0) {
          e.a = 1;          // detonated (not shot down)
          queueBlast(e.x, e.y, d.blast, d.blastEnemyDmg, false, true, d.blastDmg, C.red, P_RED);
          fx.explode(e.x, e.y, 26, P_ORANGE, C.orange);
          killEnemy(e, true);
        }
      }
    },
    onDeath(e, silent) {
      if (e.a === 1 || silent) return;
      // Shot down early: it still pops, but only robots get hurt. Use it.
      queueBlast(e.x, e.y, D.boomer.blast * 0.85, D.boomer.blastEnemyDmg, true, false, 0, C.orange, P_ORANGE);
    },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      const d = D.boomer;
      const p = 1 - e.t / d.fuse;
      g.save();
      g.globalAlpha = 0.12 + p * 0.22;
      g.fillStyle = C.red;
      g.beginPath(); g.arc(x, y, d.blast, 0, TAU); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = C.red;
      g.lineWidth = 3;
      g.setLineDash([12, 8]);
      g.lineDashOffset = G.time * 60;
      g.beginPath(); g.arc(x, y, d.blast, 0, TAU); g.stroke();
      g.setLineDash([]);
      // shrinking timer ring: detonates when it meets the robot
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.globalAlpha = 0.8;
      g.beginPath(); g.arc(x, y, d.blast * (1 - p) + e.r, 0, TAU); g.stroke();
      g.restore();
    },
  },

  // 7. Sniper: laser sight for ~1s (locks for the last 0.3s), then a fast shot.
  sniper: {
    pal: P_RED, accent: C.red,
    init(e) { e.cd = rand(1.5, 2.5); e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.sniper;
      if (P.dead) return wander(e, dt);
      const dx = P.x - e.x, dy = P.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (e.state === 0) {
        const nx = dx / dist, ny = dy / dist;
        let tx = -ny * e.b * 0.6, ty = nx * e.b * 0.6;
        if (dist > d.keep[1]) { tx = nx; ty = ny; } else if (dist < d.keep[0]) { tx = -nx; ty = -ny; }
        const k = Math.min(1, 2 * dt);
        e.vx += (tx * e.speed - e.vx) * k; e.vy += (ty * e.speed - e.vy) * k;
        face(e, Math.atan2(dy, dx), 4, dt);
        e.cd -= dt;
        if (e.cd <= 0 && visible(e, 30)) {
          e.state = 1; e.t = d.aim; e.a = Math.atan2(dy, dx);
          audio.play("laser", e.x, e.y, 0.8);
        }
      } else {
        brake(e, 8, dt);
        e.t -= dt;
        if (e.t > 0.3) e.a = Math.atan2(dy, dx);
        face(e, e.a, 10, dt);
        if (e.t <= 0) {
          const c = Math.cos(e.a), s = Math.sin(e.a);
          fireEnemyBullet(e.x + c * 30, e.y + s * 30, c * d.shotSpeed, s * d.shotSpeed, d.shotDmg, "red", 6, true);
          fx.sparks(e.x + c * 30, e.y + s * 30, e.a, 0.3, 6, P_RED, 500, 0.2);
          fx.p(0, e.x + c * 30, e.y + s * 30, 0, 0, 0.1, 3, P_WHITE, 0);
          audio.play("snipe", e.x, e.y);
          e.kx -= c * 140; e.ky -= s * 140;
          e.state = 0; e.cd = randRange(d.reload);
        }
      }
    },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      const p = 1 - e.t / D.sniper.aim;
      const locked = e.t <= 0.3;
      const len = lineToWall(x, y, e.a);
      g.save();
      g.globalCompositeOperation = "lighter";
      const flicker = locked ? 1 : 0.5 + Math.random() * 0.5;
      g.globalAlpha = (0.25 + p * 0.6) * flicker;
      g.strokeStyle = locked ? "#ffffff" : C.red;
      g.lineWidth = locked ? 2.4 : 1 + p;
      g.beginPath();
      g.moveTo(x + Math.cos(e.a) * 30, y + Math.sin(e.a) * 30);
      g.lineTo(x + Math.cos(e.a) * len, y + Math.sin(e.a) * len);
      g.stroke();
      if (locked) {
        g.globalAlpha = 0.25;
        g.strokeStyle = C.red;
        g.lineWidth = 8;
        g.stroke();
      }
      g.restore();
    },
  },

  // 8. Patch Bot: heals robots near it. Priority target (auto-aim prefers it).
  patch: {
    pal: P_GREEN, accent: C.green, priority: 0.45,
    init(e) { e.cd = 1; e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.patch;
      if (P.dead) return wander(e, dt);
      // hang back behind the pack
      const dx = P.x - e.x, dy = P.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      let tx = -ny * e.b, ty = nx * e.b;
      if (dist > d.keep + 120) { tx = nx; ty = ny; } else if (dist < d.keep) { tx = -nx; ty = -ny; }
      const k = Math.min(1, 2 * dt);
      e.vx += (tx * e.speed - e.vx) * k; e.vy += (ty * e.speed - e.vy) * k;
      face(e, Math.atan2(dy, dx), 3, dt);
      e.cd -= dt;
      e.t2 -= dt;
      if (e.cd <= 0) {
        e.cd = d.healEvery;
        const items = G.enemies.items;
        let healed = 0;
        for (let i = 0; i < G.enemies.count; i++) {
          const o = items[i];
          if (o.dead || o === e || o.ally > 0 || o.hp >= o.maxHp) continue;
          const ox = o.x - e.x, oy = o.y - e.y;
          if (ox * ox + oy * oy > d.healRadius * d.healRadius) continue;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.boss ? 0.015 : d.healPct));
          const len = Math.hypot(ox, oy) || 1;
          for (let k2 = 0; k2 < 3; k2++) fx.p(0, e.x, e.y, (ox / len) * len * 3, (oy / len) * len * 3, 0.33, 1.4, P_GREEN, 0);
          fx.text(o.x, o.y - o.r - 6, "+", C.green, 16, 0.6);
          healed++;
        }
        if (healed) { e.t2 = 0.35; audio.play("heal", e.x, e.y, 0.6); }
      }
    },
    drawUnder(g, e, x, y) {
      const d = D.patch;
      g.save();
      g.globalAlpha = 0.1 + (e.t2 > 0 ? e.t2 : 0);
      g.strokeStyle = C.green;
      g.lineWidth = 2;
      g.setLineDash([4, 10]);
      g.lineDashOffset = -G.time * 30;
      g.beginPath(); g.arc(x, y, d.healRadius, 0, TAU); g.stroke();
      g.restore();
    },
  },
};
