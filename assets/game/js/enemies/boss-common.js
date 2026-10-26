/* Shared boss machinery: entrance, minions, the death payoff, endless-lap pacing,
   and the attack patterns several sins share (Envy steals them all). */

import { G, usePlayer, diff, threat } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, rand, randInt, dash } from "../util.js";
import { sprites, C, PAL, P_CYAN, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { fireEnemyBullet, killEnemy, dropPickup, addScore, haptic, hitStop } from "../world.js";
import { waves } from "../waves.js";

export const A = BALANCE.arena;
export const BB = BALANCE.bosses;
const INTRO = 2.8;            // 4.5: a portal opens in the middle (0.9s), the boss rises out of it (1.1s), then takes its place
const OPEN = 0.9, RISE = 1.1;

/** Runs fn for every player still standing, with their build live (area attacks hit everyone). */
export function eachPlayer(fn) {
  const cur = G.player;
  for (let i = 0; i < G.players.length; i++) {
    const Q = G.players[i];
    if (Q.dead || Q.gone) continue;
    usePlayer(Q);
    fn(Q);
  }
  usePlayer(cur);
}

/** Cooldown multiplier for endless laps (each lap a bit faster). */
export const pace = () => Math.pow(BALANCE.ladder.lapPace, G.lap || 0) * diff().boss * threat("bossPace") * ((G.boss && G.boss.surgePace) || 1);      // 4.5: each surge speeds it up

/** Palette index for a boss's main colour (glow dots, particles). */
export function sinPal(type) {
  const col = BB[type] && BB[type].c1;
  const i = PAL.indexOf(col);
  return i >= 0 ? i : P_CYAN;
}

export function bossInit(e, cx, cy) {
  e.state = -1; e.t = INTRO; e.invuln = true;
  e.tx = cx; e.ty = cy;
  e.x = e.px = A.w / 2; e.y = e.py = A.h / 2;            // out of a portal in the middle of the arena
  e.introK = 0; e.contact0 = e.contact; e.contact = 0;
  G.bossPortal = { x: e.x, y: e.y, t0: G.time, col: e.def.c1, r: e.r * 1.9, life: INTRO + 0.5 };
  e.spawnT = 0;
  e.cd = 2; e.t2 = 3; e.t3 = 1.5; e.c = 1.5; e.a = 0; e.b = 0;
  G.boss = e;
  audio.play("bossIntro");
  fx.shake(0.5);
}

/** Rises out of the portal in the middle, then glides to its start point; invulnerable meanwhile. */
export function introUpdate(e, dt) {
  e.t -= dt;
  const el = INTRO - e.t, p = G.bossPortal;
  e.introK = el < OPEN ? 0 : Math.min(1, (el - OPEN) / RISE);
  e.vx = e.vy = 0;
  if (el >= OPEN + RISE) {
    const k = Math.min(1, 3 * dt);
    e.x += (e.tx - e.x) * k;
    e.y += (e.ty - e.y) * k;
  }
  if (p && el < OPEN + RISE) {
    // the portal's mouth pushes you clear (it doesn't hurt), and it crackles
    const R = p.r * 1.25;
    eachPlayer((Q) => {
      const dx = Q.x - p.x, dy = Q.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < R) { Q.vx += (dx / d) * 1600 * dt; Q.vy += (dy / d) * 1600 * dt; }
    });
    if (Math.random() < 0.7) {
      const a = rand(0, TAU), rr = p.r * rand(0.9, 1.3);
      fx.p(1, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, -Math.cos(a) * 160, -Math.sin(a) * 160, 0.5, 1.4, sinPal(e.type), 0);
    }
    if (el >= OPEN && el - dt < OPEN) { fx.ring(p.x, p.y, 10, p.r * 1.6, 0.5, p.col, 6); fx.shake(0.35); audio.play("bigExplode", p.x, p.y, 0.4); }
  }
  if (e.t <= 0) {
    e.state = 0; e.invuln = false; e.introK = 1; e.contact = e.contact0 === undefined ? e.contact : e.contact0;
    G.emit("bossFight", e);
    // it arrives: a shockwave in its colour
    fx.ring(e.x, e.y, e.r, e.r + 260, 0.55, e.def.c1, 7);
    fx.ring(e.x, e.y, e.r * 0.5, e.r + 140, 0.4, "#ffffff", 3);
    fx.shake(0.4);
  }
  return true;
}

export function minionTick(e, dt, every, max, pool) {
  e.c -= dt;
  if (e.c > 0) return;
  const more = (diff().minions || 1) * threat("bossMinions");
  e.c = (every * pace()) / more;         // more of them, more often (4.2 threat, Boss Rush's Entourage)
  let alive = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss && o.ally <= 0 && o.type !== "gem" && !o.passive) alive++; }
  if (alive + G.warnings.count * 2 >= max * more * (1 + 0.35 * (Math.max(1, G.net.n || 1) - 1))) return;   // co-op: a bigger entourage
  const type = pool[randInt(0, pool.length - 1)];
  const count = type === "swarm" ? randInt(5, 7) : randInt(1, type === "drone" ? 3 : 2);
  waves.spawnGroup(type, count);
}

export function startBossDeath(e) {
  G.bossFx = { x: e.x, y: e.y, r: e.r * e.scale, t: 0, next: 0, def: e.def, type: e.type, pal: sinPal(e.type), col: e.def.c1, healed: e.healed || 0 };
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
  fx.debris(f.x, f.y, 22, f.col, 520);
  fx.ring(f.x, f.y, 40, 900, 1.6, f.col, 2);           // a slow, wide afterglow ring
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

/** The boss portal (world space, under the robots): opens, holds while the boss rises, closes behind it. */
export function drawBossPortal(g) {
  const p = G.bossPortal;
  if (!p) return;
  const t = G.time - p.t0;
  if (t > p.life) { G.bossPortal = null; return; }
  const open = Math.min(1, t / 0.5), close = t > p.life - 0.6 ? Math.max(0, (p.life - t) / 0.6) : 1;
  const k = open * close, R = p.r * k;
  if (R < 2) return;
  g.save();
  const well = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
  well.addColorStop(0, "rgba(3,2,12,0.95)"); well.addColorStop(0.65, "rgba(20,8,40,0.85)"); well.addColorStop(1, "rgba(20,8,40,0)");
  g.fillStyle = well;
  g.beginPath(); g.ellipse(p.x, p.y, R, R * 0.92, 0, 0, TAU); g.fill();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const rr = R * (1 - i * 0.18);
    g.strokeStyle = i % 2 ? "#ffffff" : p.col;
    g.globalAlpha = (0.7 - i * 0.12) * k;
    g.lineWidth = 6 - i;
    g.setLineDash([rr * 0.5, rr * 0.35]);
    g.lineDashOffset = (i % 2 ? 1 : -1) * t * 260;
    g.beginPath(); g.ellipse(p.x, p.y, rr, rr * 0.92, t * (i % 2 ? -1.4 : 1.1), 0, TAU); g.stroke();
  }
  g.setLineDash([]);
  // spiral arms
  g.globalAlpha = 0.45 * k; g.strokeStyle = p.col; g.lineWidth = 3;
  for (let a = 0; a < 3; a++) {
    g.beginPath();
    for (let s = 0; s <= 24; s++) {
      const f = s / 24, ang = a * (TAU / 3) + f * 4.2 - t * 3, rr = R * (0.15 + f * 0.85);
      const x = p.x + Math.cos(ang) * rr, y = p.y + Math.sin(ang) * rr * 0.92;
      if (s) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.restore();
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
  g.setLineDash(dash(14, 10));
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
