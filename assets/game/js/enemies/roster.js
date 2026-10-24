/* The nine robots (plus Pride's crown gems). Each one: a distinct silhouette (sprites.js), an accent
   colour, and a telegraph you can read by shape and motion before it attacks.
   Robots evolve with their Mark (e.mark: 0 = Mk I, 1 = Mk II from wave 12, 2 = Mk III from wave 24,
   higher in endless). Every new behaviour gets its own warning, so harder never means unfair. */

import { G } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, rand, randRange, angDiff, dash, NO_DASH } from "../util.js";
import { C, P_DANGER, P_VIOLET, P_AMBER, P_MAGENTA, P_BLUE, P_ORANGE, P_RED, P_GREEN, P_WHITE, P_PRIDE } from "../sprites.js";
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

export function lineToWall(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let t = 3000;
  if (c > 0) t = Math.min(t, (A.w - x) / c); else if (c < 0) t = Math.min(t, -x / c);
  if (s > 0) t = Math.min(t, (A.h - y) / s); else if (s < 0) t = Math.min(t, -y / s);
  return Math.max(0, t);
}

/** A small glowing "charge-up" dot on a robot's eye/barrel (shared telegraph look). */
function chargeDot(g, x, y, p, col) {
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.5 + p * 0.5;
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 2 + p * 6, 0, TAU); g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, 13 - p * 8, 0, TAU); g.stroke();
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

export const ROSTER = {
  // 1. Scrap Drone: chaser. Mk II lunges when close (it squashes first). Mk III also spits a slow orb.
  drone: {
    pal: P_DANGER, accent: C.danger,
    init(e) { e.cd = rand(1, 3); e.t3 = rand(2, 5); },
    update(e, dt, P) {
      if (P.dead) return wander(e, dt);
      if (e.state === 1) {                         // lunge windup
        brake(e, 10, dt);
        e.t -= dt;
        face(e, e.a, 12, dt);
        if (e.t <= 0) { e.state = 2; e.t = 0.2; e.vx = Math.cos(e.a) * 540; e.vy = Math.sin(e.a) * 540; audio.play("charge", e.x, e.y, 0.4); }
        return;
      }
      if (e.state === 2) { e.t -= dt; if (e.t <= 0) { e.state = 0; e.cd = rand(2.2, 3.4); } return; }
      chase(e, P, dt, 50, 2.2, 3);
      e.cd -= dt;
      const d2 = (P.x - e.x) ** 2 + (P.y - e.y) ** 2;
      if (e.mark >= 1 && e.cd <= 0 && d2 < 175 * 175) { e.state = 1; e.t = 0.38; e.a = angleToPlayer(e); }
      if (e.mark >= 2) {
        e.t3 -= dt;
        if (e.t3 <= 0.4 && e.t3 + dt > 0.4) e.warnPlayed = true;
        if (e.t3 <= 0 && d2 < 460 * 460 && visible(e, 10)) {
          e.t3 = rand(4, 6); e.warnPlayed = false;
          const a = angleToPlayer(e);
          fireEnemyBullet(e.x, e.y, Math.cos(a) * 200, Math.sin(a) * 200, 1, "pink", 6);
        }
      }
    },
    shakeAmt(e) { return e.state === 1 ? 2.2 : 0; },
    drawOver(g, e, x, y) {
      if (e.mark >= 2 && e.warnPlayed && e.t3 > 0) chargeDot(g, x + Math.cos(e.ang) * 6, y + Math.sin(e.ang) * 6, 1 - e.t3 / 0.4, C.danger);
    },
  },

  // 9. Swarmlings: tiny, fast, zig-zagging packs. They get quicker with each Mark.
  swarm: {
    pal: P_VIOLET, accent: "#c86bff",
    init(e) { e.speed *= 1 + Math.min(0.45, e.mark * 0.15); },
    update(e, dt, P) { if (P.dead) return wander(e, dt); chase(e, P, dt, 85 + e.mark * 15, 5.5, 5); },
  },

  // Splitter children.
  mini: {
    pal: P_MAGENTA, accent: C.magenta,
    init(e) { e.speed *= 1 + Math.min(0.3, e.mark * 0.1); },
    update(e, dt, P) { if (P.dead) return wander(e, dt); chase(e, P, dt, 40, 3.2, 4); },
  },

  // 2. Ripper: stops, shakes + shows its path, then charges in a straight line.
  //    Mk II charges twice in a row; Mk III three times and drops orbs along the way.
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
          e.state = 1; e.t = d.windup; e.a = angleToPlayer(e); e.c = Math.min(3, 1 + e.mark);
          audio.play("warn", e.x, e.y, 0.7);
        }
      } else if (e.state === 1) {                // windup: brake, track the player, lock for the last 35%
        brake(e, 10, dt);
        const wind = e.b ? 0.36 : d.windup;
        if (e.t > wind * 0.35) e.a = angleToPlayer(e);
        face(e, e.a, 14, dt);
        if (e.t <= 0) {
          e.state = 2; e.t = d.chargeTime; e.t3 = 0;
          e.vx = Math.cos(e.a) * d.chargeSpeed; e.vy = Math.sin(e.a) * d.chargeSpeed;
          e.contact = d.chargeDmg;
          fx.sparks(e.x, e.y, e.a + Math.PI, 0.4, 8, P_AMBER, 360, 0.25);
          audio.play("charge", e.x, e.y);
        }
      } else if (e.state === 2) {                // charge
        e.vx = Math.cos(e.a) * d.chargeSpeed; e.vy = Math.sin(e.a) * d.chargeSpeed;
        if (Math.random() < 0.6) fx.p(0, e.x, e.y, -e.vx * 0.1, -e.vy * 0.1, 0.25, 1.6, P_AMBER, 4);
        if (e.mark >= 2) {
          e.t3 -= dt;
          if (e.t3 <= 0) {
            e.t3 = 0.16;
            const pa = e.a + Math.PI / 2;
            fireEnemyBullet(e.x, e.y, Math.cos(pa) * 70, Math.sin(pa) * 70, 1, "amber", 6);
            fireEnemyBullet(e.x, e.y, -Math.cos(pa) * 70, -Math.sin(pa) * 70, 1, "amber", 6);
          }
        }
        const r = e.r;
        const hitWall = e.x <= r + 2 || e.x >= A.w - r - 2 || e.y <= r + 2 || e.y >= A.h - r - 2;
        if (e.t <= 0 || hitWall) {
          if (hitWall) { fx.sparks(e.x, e.y, e.a + Math.PI, 0.8, 8, P_AMBER, 300, 0.25); fx.shake(0.08); audio.play("clank", e.x, e.y, 0.6); }
          e.c--;
          e.contact = d.contact;
          if (e.c > 0 && !hitWall) {             // Mk II+: quick re-aim and go again
            e.state = 1; e.b = 1; e.t = 0.36; e.vx *= 0.2; e.vy *= 0.2;
            audio.play("warn", e.x, e.y, 0.5);
          } else { e.state = 3; e.b = 0; e.t = randRange(d.rest); }
        }
      } else {                                    // rest
        brake(e, 3, dt);
        if (e.t <= 0) { e.state = 0; e.cd = rand(0.2, 0.8); }
      }
    },
    onRock(e) { if (e.state === 2) { e.state = 3; e.b = 0; e.t = 0.8; e.contact = D.ripper.contact; fx.shake(0.06); } },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      const d = D.ripper;
      const wind = e.b ? 0.36 : d.windup;
      const p = 1 - e.t / wind;
      const len = Math.min(d.chargeSpeed * d.chargeTime, lineToWall(x, y, e.a));
      const locked = e.t <= wind * 0.35;
      dashedLine(g, x, y, e.a, len, locked ? "#ffffff" : C.amber, 0.35 + p * 0.5, locked ? 3 : 2, dash(10, 8));
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
    shakeAmt(e) { return e.state === 1 ? 1.6 + (1 - e.t / (e.b ? 0.36 : D.ripper.windup)) * 2 : 0; },
  },

  // 3. Gunner: keeps its distance, glows at the barrel, then fires slow orbs.
  //    Mk I: 1 orb · Mk II: fan of 3 · Mk III: fan of 5 · Mk IV+: two volleys.
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
        if (e.cd <= 0 && visible(e, 20)) { e.state = 1; e.t = d.windup; e.c = e.mark >= 3 ? 2 : 1; audio.play("warn", e.x, e.y, 0.5); }
      } else {
        e.t -= dt;
        if (e.t <= 0) {
          const shots = e.mark >= 2 ? 5 : e.mark >= 1 ? 3 : 1;
          const a0 = e.ang;
          for (let i = 0; i < shots; i++) {
            const a = a0 + (i - (shots - 1) / 2) * 0.26;
            fireEnemyBullet(e.x + Math.cos(a0) * 20, e.y + Math.sin(a0) * 20, Math.cos(a) * d.shotSpeed, Math.sin(a) * d.shotSpeed, d.shotDmg, "violet", 7);
          }
          fx.sparks(e.x + Math.cos(a0) * 20, e.y + Math.sin(a0) * 20, a0, 0.4, 4, P_VIOLET, 240, 0.18);
          audio.play("enemyShot", e.x, e.y, 0.7);
          e.kx -= Math.cos(a0) * 60; e.ky -= Math.sin(a0) * 60;
          e.c--;
          if (e.c > 0) { e.t = 0.28; }
          else { e.state = 0; e.cd = randRange(d.reload); }
        }
      }
    },
    drawOver(g, e, x, y) {
      if (e.state !== 1) return;
      chargeDot(g, x + Math.cos(e.ang) * 22, y + Math.sin(e.ang) * 22, Math.max(0, 1 - e.t / D.gunner.windup), C.violet2);
    },
  },

  // 4. Splitter: breaks into minis on death (one more mini per Mark, up to 5).
  splitter: {
    pal: P_MAGENTA, accent: C.magenta,
    update(e, dt, P) {
      if (P.dead) return wander(e, dt);
      chase(e, P, dt, 30, 1.4, 2);
      e.ang += dt * 1.5;
    },
    onDeath(e, silent) {
      if (silent) return;
      const n = Math.min(5, D.splitter.splits + e.mark);
      for (let i = 0; i < n; i++) {
        const a = e.ang + (i / n) * TAU;
        const m = spawnEnemy("mini", e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, { spawnT: 0.08, elite: false });
        if (m) { m.kx = Math.cos(a) * 260; m.ky = Math.sin(a) * 260; m.ang = a; }
      }
    },
  },

  // 5. Bulwark: frontal shield, turns slowly. Flank it or boost past it.
  //    Mk II turns faster. Mk III shield-bashes when you're right in front (it glows first).
  bulwark: {
    pal: P_BLUE, accent: C.blue,
    init(e) { e.cd = rand(2, 4); e.t2 = randRange(D.bulwark.vent.every); e.c = 0; },
    update(e, dt, P) {
      const d = D.bulwark;
      if (P.dead) return wander(e, dt);
      // the shield vents now and then: a short, readable window to shoot it from the front
      if (e.c > 0) { e.c -= dt; if (Math.random() < 0.5) fx.p(0, e.x + Math.cos(e.ang) * 22, e.y + Math.sin(e.ang) * 22, rand(-40, 40), rand(-40, 40), 0.4, 1.2, P_WHITE, 3); }
      else {
        e.t2 -= dt;
        if (e.t2 <= 0) { e.c = d.vent.time; e.t2 = randRange(d.vent.every); audio.play("clank", e.x, e.y, 0.5); }
      }
      const want = angleToPlayer(e);
      if (e.state === 1) {                        // bash windup
        brake(e, 8, dt); e.t -= dt; face(e, want, d.turn * 0.5, dt);
        if (e.t <= 0) { e.state = 2; e.t = 0.26; e.contact = 2; audio.play("charge", e.x, e.y, 0.6); }
        return;
      }
      if (e.state === 2) {                        // bash
        e.vx = Math.cos(e.ang) * 620; e.vy = Math.sin(e.ang) * 620; e.t -= dt;
        if (e.t <= 0) { e.state = 0; e.contact = 1; e.cd = rand(3, 4.5); }
        return;
      }
      face(e, want, d.turn * (1 + Math.min(1.2, e.mark * 0.4)), dt);
      const k = Math.min(1, 2 * dt);
      e.vx += (Math.cos(e.ang) * e.speed - e.vx) * k;
      e.vy += (Math.sin(e.ang) * e.speed - e.vy) * k;
      e.cd -= dt;
      if (e.mark >= 2 && e.cd <= 0 && Math.abs(angDiff(e.ang, want)) < 0.35 && (P.x - e.x) ** 2 + (P.y - e.y) ** 2 < 230 * 230) {
        e.state = 1; e.t = 0.5; audio.play("warn", e.x, e.y, 0.6);
      }
    },
    blocks(e, bx, by) {
      if (e.c > 0) return false;                  // venting
      const a = Math.atan2(by - e.y, bx - e.x);
      return Math.abs(angDiff(e.ang, a)) < D.bulwark.shieldArc / 2;
    },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      dashedLine(g, x, y, e.ang, 170, C.amber, 0.8, 3, dash(8, 6));
    },
    drawOver(g, e, x, y) {
      if (e.c <= 0) return;
      // cover the glowing shield with a dark, flickering one while it vents
      const c = Math.cos(e.ang), s = Math.sin(e.ang);
      g.save();
      g.translate(x - c * 4, y - s * 4);
      g.rotate(e.ang);
      g.strokeStyle = "#232c5e";
      g.lineWidth = 9;
      g.beginPath(); g.arc(0, 0, 27, -0.98, 0.98); g.stroke();
      g.strokeStyle = "rgba(255,200,97," + (0.15 + Math.random() * 0.25) + ")";
      g.lineWidth = 2;
      g.setLineDash(dash(4, 6));
      g.beginPath(); g.arc(0, 0, 27, -0.98, 0.98); g.stroke();
      g.restore();
    },
    shakeAmt(e) { return e.state === 1 ? 1.8 : 0; },
  },

  // 6. Boomer: rushes in, then a red ring shows the blast radius before it detonates.
  //    Mk II+ blasts also throw out a ring of orbs (and the fuse gets a little shorter).
  boomer: {
    pal: P_ORANGE, accent: C.orange,
    update(e, dt, P) {
      const d = D.boomer;
      if (P.dead) return wander(e, dt);
      const fuse = e.mark >= 1 ? d.fuse * 0.87 : d.fuse;
      if (e.state === 0) {
        chase(e, P, dt, 20, 1.5, 4);
        if (Math.hypot(P.x - e.x, P.y - e.y) < d.trigger) {
          e.state = 1; e.t = fuse;
          audio.play("warn", e.x, e.y);
        }
      } else {
        brake(e, 8, dt);
        e.t -= dt;
        e.scale = 1 + (1 - e.t / fuse) * 0.25 + Math.sin(G.time * 40) * 0.04;
        if (e.t <= 0) {
          e.a = 1;          // detonated (not shot down)
          queueBlast(e.x, e.y, d.blast, d.blastEnemyDmg, false, true, d.blastDmg, C.red, P_RED);
          fx.explode(e.x, e.y, 26, P_ORANGE, C.orange);
          if (e.mark >= 1) {
            const n = e.mark >= 2 ? 12 : 8, off = rand(0, TAU);
            for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU; fireEnemyBullet(e.x, e.y, Math.cos(a) * 170, Math.sin(a) * 170, 1, "amber", 6); }
          }
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
      const fuse = e.mark >= 1 ? d.fuse * 0.87 : d.fuse;
      const p = 1 - e.t / fuse;
      g.save();
      g.globalAlpha = 0.12 + p * 0.22;
      g.fillStyle = C.red;
      g.beginPath(); g.arc(x, y, d.blast, 0, TAU); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = C.red;
      g.lineWidth = 3;
      g.setLineDash(dash(12, 8));
      g.lineDashOffset = G.time * 60;
      g.beginPath(); g.arc(x, y, d.blast, 0, TAU); g.stroke();
      g.setLineDash(NO_DASH);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.globalAlpha = 0.8;
      g.beginPath(); g.arc(x, y, d.blast * (1 - p) + e.r, 0, TAU); g.stroke();
      g.restore();
    },
  },

  // 7. Sniper: laser sight (locks for the last 0.3s), then a fast shot.
  //    Mk II fires twice down the same line; Mk III three times.
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
          e.state = 1; e.t = d.aim; e.a = Math.atan2(dy, dx); e.c = Math.min(3, 1 + e.mark);
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
          e.kx -= c * 60; e.ky -= s * 60;
          e.c--;
          if (e.c > 0) e.t = 0.14;                 // follow-up shots down the same (still visible) line
          else { e.state = 0; e.cd = randRange(d.reload); }
        }
      }
    },
    drawUnder(g, e, x, y) {
      if (e.state !== 1) return;
      const p = Math.max(0, 1 - e.t / D.sniper.aim);
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
  //    Mk II+ also wraps the robots it heals in a small shield.
  patch: {
    pal: P_GREEN, accent: C.green, priority: 0.45,
    init(e) { e.cd = 1; e.b = Math.random() < 0.5 ? -1 : 1; },
    update(e, dt, P) {
      const d = D.patch;
      if (P.dead) return wander(e, dt);
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
          if (o.dead || o === e || o.ally > 0 || o.type === "gem") continue;
          const ox = o.x - e.x, oy = o.y - e.y;
          if (ox * ox + oy * oy > d.healRadius * d.healRadius) continue;
          let did = false;
          if (o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.boss ? 0.015 : d.healPct + e.mark * 0.03)); did = true; }
          if (e.mark >= 1 && !o.boss && o.shield < o.maxHp * 0.1) { o.shield = o.maxHp * 0.1; o.shieldMax = Math.max(o.shieldMax, o.shield); did = true; }
          if (!did) continue;
          for (let k2 = 0; k2 < 2; k2++) fx.p(0, e.x, e.y, ox * 3, oy * 3, 0.33, 1.4, P_GREEN, 0);
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
      g.setLineDash(dash(4, 10));
      g.lineDashOffset = -G.time * 30;
      g.beginPath(); g.arc(x, y, d.healRadius, 0, TAU); g.stroke();
      g.restore();
    },
  },

  // Pride's crown gems: they orbit the boss and soak most of the damage while any are left.
  gem: {
    pal: P_PRIDE, accent: "#a98bff",
    update(e, dt) {
      const b = e.parent;
      if (!b || b.dead || b.id !== e.parentId) { killEnemy(e, true); return; }
      const g = BALANCE.bosses.pride.gems;
      const a = G.time * g.spin + (e.slot / g.count) * TAU;
      e.vx = e.vy = 0;
      e.x = b.x + Math.cos(a) * g.radius;
      e.y = b.y + Math.sin(a) * g.radius;
      e.ang = a + Math.PI / 2;
    },
    onDeath(e, silent) {
      if (silent) return;
      fx.burst(e.x, e.y, 14, P_PRIDE, 220, 0.6, 1.6);
      audio.play("clank", e.x, e.y, 0.8);
    },
  },
};
