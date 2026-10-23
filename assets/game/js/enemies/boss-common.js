/* Shared boss machinery: entrance, minions, the death payoff, endless-lap pacing,
   and the attack patterns several sins share (Envy steals them all). */

import { G } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, rand, randInt } from "../util.js";
import { sprites, C, PAL, P_CYAN, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { fireEnemyBullet, killEnemy, dropPickup, addScore, haptic, hitStop } from "../world.js";
import { waves } from "../waves.js";

export const A = BALANCE.arena;
export const BB = BALANCE.bosses;
const INTRO = 2.2;

/** Cooldown multiplier for endless laps (each lap a bit faster). */
export const pace = () => Math.pow(BALANCE.ladder.lapPace, G.lap || 0);

/** Palette index for a boss's main colour (glow dots, particles). */
export function sinPal(type) {
  const col = BB[type] && BB[type].c1;
  const i = PAL.indexOf(col);
  return i >= 0 ? i : P_CYAN;
}

export function bossInit(e, cx, cy) {
  e.state = -1; e.t = INTRO; e.invuln = true;
  e.tx = cx; e.ty = cy;
  e.x = e.px = A.w / 2; e.y = e.py = -140;
  e.spawnT = 0;
  e.cd = 2; e.t2 = 3; e.t3 = 1.5; e.c = 1.5; e.a = 0; e.b = 0;
  G.boss = e;
  audio.play("bossIntro");
  fx.shake(0.5);
}

/** Glides in from outside the top edge to its start point; invulnerable meanwhile. */
export function introUpdate(e, dt) {
  e.t -= dt;
  const k = Math.min(1, 2.2 * dt);
  e.x += (e.tx - e.x) * k;
  e.y += (e.ty - e.y) * k;
  e.vx = e.vy = 0;
  if (e.t <= 0) { e.state = 0; e.invuln = false; G.emit("bossFight", e); }
  return true;
}

export function minionTick(e, dt, every, max, pool) {
  e.c -= dt;
  if (e.c > 0) return;
  e.c = every * pace();
  let alive = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss && o.ally <= 0 && o.type !== "gem") alive++; }
  if (alive + G.warnings.count * 2 >= max) return;
  const type = pool[randInt(0, pool.length - 1)];
  const count = type === "swarm" ? randInt(5, 7) : randInt(1, type === "drone" ? 3 : 2);
  waves.spawnGroup(type, count);
}

export function startBossDeath(e) {
  G.bossFx = { x: e.x, y: e.y, r: e.r * e.scale, t: 0, next: 0, def: e.def, type: e.type, pal: sinPal(e.type), col: e.def.c1 };
  G.slowmo = 1.3; G.slowScale = 0.4;
  e.invuln = true;
  audio.play("bigExplode", e.x, e.y);
  haptic([40, 40, 40, 40, 120]);
  // the minions go down with it
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss) killEnemy(o, o.type === "gem"); }
  G.eb.clear();
  G.warnings.clear();
}

export function updateBossFx(dt) {
  const f = G.bossFx;
  if (!f) return;
  f.t += dt;
  f.next -= dt;
  if (f.t < 1.25) {
    if (f.next <= 0) {
      f.next = 0.12;
      const a = rand(0, TAU), d = rand(0, f.r);
      const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
      fx.explode(x, y, rand(18, 30), Math.random() < 0.5 ? f.pal : P_WHITE, f.col);
      fx.shake(0.25);
      audio.play("explode", x, y);
    }
    return;
  }
  // final blast
  fx.explode(f.x, f.y, 70, P_WHITE, C.white);
  fx.ring(f.x, f.y, 20, 520, 0.9, f.col, 6);
  fx.ring(f.x, f.y, 10, 340, 0.7, C.white, 4);
  fx.burst(f.x, f.y, 40, f.pal, 520, 1.2, 2.4);
  fx.burst(f.x, f.y, 24, P_CYAN, 420, 1.0, 2.2);
  fx.screenFlash("#ffffff", 0.7, 1.4);
  fx.shake(BALANCE.fx.shake.boss);
  hitStop(BALANCE.fx.hitstop.boss, true);
  audio.play("bossDown");
  const stars = 30 + (f.type === "greed" ? 30 : 0);
  for (let i = 0; i < stars; i++) dropPickup(0, f.x, f.y, G.stats.starValue);
  for (let i = 0; i < 6; i++) dropPickup(1, f.x, f.y, 5);
  dropPickup(2, f.x, f.y, 2);
  dropPickup(2, f.x, f.y, 2);
  addScore(f.def.score * (1 + (G.lap || 0)));
  G.bossesKilled++;
  G.bossFx = null;
  G.boss = null;
  G.emit("bossDown", f);
}

export function glowBall(g, x, y, r, pal, a) {
  if (!G.gfx.glow) return;              // graphics setting: glow off
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = a;
  g.drawImage(sprites.dots[pal], x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

/** Expanding telegraph ring that fills as it charges (used by slams and wake-ups). */
export function chargeRing(g, x, y, R, p, col) {
  g.save();
  g.globalAlpha = 0.1 + p * 0.25;
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, R * p, 0, TAU); g.fill();
  g.globalAlpha = 0.85;
  g.strokeStyle = col;
  g.lineWidth = 3;
  g.setLineDash([14, 10]);
  g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
  g.restore();
}

// ---------------------------------------------------------------------------
// Shared patterns (each sin's signature move; Envy borrows them)
// ---------------------------------------------------------------------------
export const moves = {
  /** Sloth's yawn: slow, wide rings with gaps you can step through. */
  ring(e, count, speed, look, offset) {
    const off = offset === undefined ? rand(0, TAU) : offset;
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * TAU;
      fireEnemyBullet(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8, Math.cos(a) * speed, Math.sin(a) * speed, 1, look, 7);
    }
  },
  /** An aimed fan (Gluttony's spit, Greed's coins). */
  fan(e, P, count, arc, speed, look, r) {
    const base = Math.atan2(P.y - e.y, P.x - e.x);
    const shots = [];
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? base : base - arc / 2 + (arc * i) / (count - 1);
      const b = fireEnemyBullet(e.x + Math.cos(base) * e.r * 0.8, e.y + Math.sin(base) * e.r * 0.8, Math.cos(a) * speed, Math.sin(a) * speed, 1, look, r || 7);
      if (b) shots.push(b);
    }
    return shots;
  },
  /** Lust's heartbreak: a heart-shaped burst. */
  heart(e, count, speed, look) {
    for (let i = 0; i < count; i++) {
      const t = (i / count) * TAU;
      // classic heart curve, normalised
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const m = Math.hypot(hx, hy) / 16 || 1;
      const a = Math.atan2(hy, hx);
      const sp = speed * (0.55 + m * 0.45);
      fireEnemyBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 1, look, 7);
    }
  },
  /** Lust's kisses: slow homing hearts that home for a while (and can be shot down). */
  kiss(e, P, count, speed, turn, life, home) {
    const base = Math.atan2(P.y - e.y, P.x - e.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.5;
      const b = fireEnemyBullet(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, 1, "heart", 8);
      if (b) { b.turn = turn; b.life = life; b.home = home || 2.5; b.hp = 1; }
    }
  },
  /** Wrath's spiral arm. */
  spiral(e, ang, arms, speed, look) {
    for (let k = 0; k < arms; k++) {
      const a = ang + (k / arms) * TAU;
      fireEnemyBullet(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, Math.cos(a) * speed, Math.sin(a) * speed, 1, look, 6);
    }
  },
};
