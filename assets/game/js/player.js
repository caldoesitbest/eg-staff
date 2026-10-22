/* The crowned astronaut: glide movement (from the original Envious Glider), aiming,
   the blaster and the BOOST dash. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { input } from "./input.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { TAU, rand, smooth } from "./util.js";
import { P_CYAN, P_WHITE, P_DVIOLET, P_VIOLET, C } from "./sprites.js";
import { firePlayerBullet, addPuddle, newBoostSerial, haptic } from "./world.js";
import { hasEnvy, ENVY_POWERS } from "./upgrades.js";

const A = BALANCE.arena;
const B = BALANCE.player;
const TRAIL = 6;

export function createPlayer() {
  const s = G.stats;
  return {
    x: A.w / 2, y: A.h / 2, px: A.w / 2, py: A.h / 2, vx: 0, vy: 0,
    r: B.radius, hp: s.maxHp, maxHp: s.maxHp, shield: 0, maxShield: s.shieldCap,
    iframes: 1.2, hurtT: 0, grace: 0,
    boostT: 0, boostCdT: 0, boostDX: 1, boostDY: 0, perfectUsed: false, boostSerial: 0, boostBuffer: 0, boostWasReady: true,
    aimAng: 0, paim: 0, facing: 1, fireCd: 0, recoil: 0, muzzle: 0,
    tilt: 0, thrustT: 0, puddleT: 0,
    trailX: new Float32Array(TRAIL), trailY: new Float32Array(TRAIL), trailN: 0, trailT: 0, ghostT: 0,
    dead: false, deathT: 0,
    streak: 0, feast: 0, envy: [],
  };
}

/** Hurtbox is smaller than the sprite: grazes don't count. */
export function playerHurtRadius() { return 9; }

function pickAutoTarget(P) {
  const items = G.enemies.items;
  const range = 600;
  let best = null, bd = range * range;
  const cur = G.autoTarget;
  for (let i = 0; i < G.enemies.count; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (Math.abs(dx) > G.cam.viewW / 2 + 40 || Math.abs(dy) > G.cam.viewH / 2 + 40) continue;
    let d2 = dx * dx + dy * dy;
    if (e === cur) d2 *= 0.65;             // sticky: don't flicker between two targets
    if (e.kind.priority) d2 *= e.kind.priority;
    if (d2 < bd) { bd = d2; best = e; }
  }
  G.autoTarget = best;
  return best;
}

function startBoost(P, s) {
  let dx = input.move.x, dy = input.move.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.1) {
    const sp = Math.hypot(P.vx, P.vy);
    if (sp > 50) { dx = P.vx / sp; dy = P.vy / sp; }
    else { dx = Math.cos(P.aimAng); dy = Math.sin(P.aimAng); }
  }
  const l = Math.hypot(dx, dy) || 1;
  P.boostDX = dx / l; P.boostDY = dy / l;
  P.boostT = B.boost.time;
  P.boostCdT = s.boostCd * (hasEnvy("ripper") ? ENVY_POWERS.ripper.boostCd : 1);
  P.perfectUsed = false;
  P.boostSerial = newBoostSerial();
  P.boostBuffer = 0;
  P.boostWasReady = false;
  P.trailN = 0;
  const back = Math.atan2(-P.boostDY, -P.boostDX);
  fx.ring(P.x, P.y, 8, 46, 0.25, C.cyan, 2.5);
  fx.sparks(P.x, P.y, back, 0.5, 10, P_CYAN, 420, 0.3);
  fx.burst(P.x, P.y, 6, P_WHITE, 120, 0.3, 1.2);
  fx.shake(0.06);
  audio.play("boost", P.x, P.y);
  haptic(10);
  G.emit("boost");
}

function fire(P, s) {
  const base = P.aimAng;
  const c = Math.cos(base), sn = Math.sin(base);
  const mx = P.x + c * 20, my = P.y + 3 + sn * 20;
  const n = s.projectiles;
  const spread = B.gun.spread;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * s.fan;
    firePlayerBullet(mx, my, base + off + rand(-spread, spread));
  }
  if (s.rear) firePlayerBullet(P.x - c * 12, P.y + 3 - sn * 12, base + Math.PI + rand(-spread, spread));
  if (hasEnvy("gunner")) {
    const a = ENVY_POWERS.gunner.angle;
    firePlayerBullet(mx, my, base + a, 3);
    firePlayerBullet(mx, my, base - a, 3);
  }
  P.recoil = 1;
  P.muzzle = 0.05;
  P.vx -= c * 10; P.vy -= sn * 10;
  fx.p(0, mx, my, c * 40, sn * 40, 0.07, 2.6, P_WHITE, 0);
  fx.sparks(mx, my, base, 0.35, 2, P_CYAN, 300, 0.1);
  audio.play("shoot", P.x, P.y, 0.45);
}

export function updatePlayer(dt) {
  const P = G.player;
  if (!P) return;
  P.px = P.x; P.py = P.y; P.paim = P.aimAng;
  if (P.dead) {
    P.deathT += dt;
    P.vx *= 0.96; P.vy *= 0.96;
    P.x += P.vx * dt * 0.4; P.y += P.vy * dt * 0.4;
    return;
  }
  const s = G.stats;
  const playing = G.state === "playing" || G.state === "clear";

  if (P.iframes > 0) P.iframes -= dt;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (P.grace > 0) P.grace -= dt;
  if (P.muzzle > 0) P.muzzle -= dt;
  if (P.recoil > 0) P.recoil = Math.max(0, P.recoil - dt * 12);
  if (P.boostCdT > 0) P.boostCdT -= dt;
  if (P.boostBuffer > 0) P.boostBuffer -= dt;

  // ----- boost -----
  if (playing && input.consumeBoost()) P.boostBuffer = 0.16;        // buffered: a slightly early press still counts
  if (P.boostBuffer > 0 && P.boostCdT <= 0 && P.boostT <= 0) startBoost(P, s);
  if (!P.boostWasReady && P.boostCdT <= 0 && P.boostT <= 0) {
    P.boostWasReady = true;
    audio.play("boostReady", P.x, P.y, 0.5);
    fx.ring(P.x, P.y, 20, 30, 0.2, C.cyan, 1.5);
  }

  // ----- movement -----
  const envySpeed = hasEnvy("drone") ? 1 + ENVY_POWERS.drone.speed : 1;
  const speed = s.moveSpeed * envySpeed * (G.playerSlow || 1);
  const mx = input.move.x, my = input.move.y;
  if (P.boostT > 0) {
    P.boostT -= dt;
    P.vx = P.boostDX * s.boostSpeed;
    P.vy = P.boostDY * s.boostSpeed;
    if (s.slothTrail) {
      P.puddleT -= dt;
      if (P.puddleT <= 0) { P.puddleT = 0.035; addPuddle(P.x, P.y); }
    }
    if (Math.random() < 0.8) fx.p(0, P.x + rand(-6, 6), P.y + rand(-6, 6), -P.vx * 0.1, -P.vy * 0.1, 0.3, 1.8, P_CYAN, 4);
    if (P.boostT <= 0) {
      P.grace = B.boost.grace;
      P.vx *= 0.4; P.vy *= 0.4;
    }
  } else {
    const k = (mx || my) ? smooth(B.accel, dt) : smooth(B.glide, dt);
    P.vx += (mx * speed - P.vx) * k;
    P.vy += (my * speed - P.vy) * k;
    // jetpack puffs while steering (the original's trail)
    if (mx || my) {
      P.thrustT -= dt;
      if (P.thrustT <= 0) {
        P.thrustT = 0.03;
        const bx = P.x - P.facing * 10, by = P.y + 4;
        fx.p(0, bx, by, -mx * 120 + rand(-20, 20), -my * 120 + rand(-20, 20), 0.35, 1.5, Math.random() < 0.5 ? P_VIOLET : P_DVIOLET, 3);
      }
    }
  }

  // afterimage trail while boosting
  if (P.boostT > 0 || P.grace > 0) {
    P.trailT -= dt;
    if (P.trailT <= 0) {
      P.trailT = 0.022;
      for (let i = TRAIL - 1; i > 0; i--) { P.trailX[i] = P.trailX[i - 1]; P.trailY[i] = P.trailY[i - 1]; }
      P.trailX[0] = P.x; P.trailY[0] = P.y;
      P.trailN = Math.min(TRAIL, P.trailN + 1);
    }
    P.ghostT = 0.18;
  } else if (P.ghostT > 0) {
    P.ghostT -= dt;
    if (P.ghostT <= 0) P.trailN = 0;
  }

  P.x += P.vx * dt;
  P.y += P.vy * dt;
  const r = P.r;
  if (P.x < r) { P.x = r; P.vx = Math.abs(P.vx) * 0.4; }
  if (P.x > A.w - r) { P.x = A.w - r; P.vx = -Math.abs(P.vx) * 0.4; }
  if (P.y < r) { P.y = r; P.vy = Math.abs(P.vy) * 0.4; }
  if (P.y > A.h - r) { P.y = A.h - r; P.vy = -Math.abs(P.vy) * 0.4; }

  // tilt into the glide, like the original
  const targetTilt = Math.max(-0.4, Math.min(0.4, P.vx / 700));
  P.tilt += (targetTilt - P.tilt) * smooth(10, dt);

  // ----- aim -----
  let target = null;
  const auto = G.settings.autoAim && input.mode !== "kbm";
  if (input.aimMode === "mouse") {
    P.aimAng = Math.atan2(G.aimWorld.y - P.y, G.aimWorld.x - P.x);
  } else if (input.aimMode === "stick") {
    P.aimAng = Math.atan2(input.aimY, input.aimX);
  } else {
    if (auto || input.aimMode === "hold") target = pickAutoTarget(P);
    if (target) {
      // lead the target a little so auto-aim actually lands
      const dx = target.x - P.x, dy = target.y - P.y;
      const t = Math.sqrt(dx * dx + dy * dy) / s.bulletSpeed;
      P.aimAng = Math.atan2(dy + target.vy * t * target.slowMul, dx + target.vx * t * target.slowMul);
    } else if (mx || my) {
      P.aimAng = Math.atan2(my, mx);
    }
  }
  if (input.aimMode !== "none" && input.aimMode !== "hold") G.autoTarget = null;
  P.facing = Math.cos(P.aimAng) >= 0 ? 1 : -1;

  // ----- fire -----
  const wantFire = G.state === "playing" && (input.fire || (auto && target !== null && input.aimMode === "none"));
  if (P.fireCd > 0) P.fireCd -= dt;
  if (wantFire && P.fireCd <= 0) {
    const rate = s.rate * (hasEnvy("swarm") ? 1 + ENVY_POWERS.swarm.rate : 1);
    fire(P, s);
    P.fireCd += 1 / rate;
    if (P.fireCd < 0) P.fireCd = 0;
  }

  // ----- moons -----
  const n = s.orbitals;
  if (n) {
    const O = BALANCE.upgrades.orbit;
    for (let i = 0; i < n; i++) {
      const a = G.time * O.speed + (i / n) * TAU;
      G.orbPos[i * 2] = P.x + Math.cos(a) * O.radius;
      G.orbPos[i * 2 + 1] = P.y + Math.sin(a) * O.radius;
    }
  }
}
