/* Robot spawning, the shared update loop (slow fields, knockback, charm), separation
   and the steering helpers every robot uses. */

import { G } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, turnTowards, rand } from "../util.js";
import { sprites, C, P_HEART } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { ROSTER } from "./roster.js";
import { BOSSES, BOSS_MINIONS } from "./bosses.js";
import { damageEnemy, killEnemy, queueBlast, TRAIT, flushDamage } from "../world.js";
import { estimateDps } from "../upgrades.js";

const A = BALANCE.arena;
const W = BALANCE.waves;
const E = BALANCE.elite;

// ---------- steering helpers ----------
export function seek(e, tx, ty, speed, accel, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const k = Math.min(1, accel * dt);
  e.vx += ((dx / d) * speed - e.vx) * k;
  e.vy += ((dy / d) * speed - e.vy) * k;
  return d;
}
export function brake(e, rate, dt) {
  const k = 1 - Math.min(1, rate * dt);
  e.vx *= k; e.vy *= k;
}
export function face(e, ang, rate, dt) { e.ang = turnTowards(e.ang, ang, rate * dt); }
export function faceVel(e, rate, dt) {
  if (Math.abs(e.vx) + Math.abs(e.vy) > 8) face(e, Math.atan2(e.vy, e.vx), rate, dt);
}
export function angleToPlayer(e) { const P = G.player; return Math.atan2(P.y - e.y, P.x - e.x); }
export function distToPlayer(e) { const P = G.player; return Math.hypot(P.x - e.x, P.y - e.y); }
/** True when the robot is inside the camera view (ranged robots only shoot then). */
export function visible(e, pad = 0) {
  const c = G.cam;
  return Math.abs(e.x - c.x) < c.viewW / 2 - pad && Math.abs(e.y - c.y) < c.viewH / 2 - pad;
}

// ---------- spawning ----------
export function spawnEnemy(type, x, y, opts) {
  const kind = ROSTER[type] || BOSSES[type] || BOSS_MINIONS[type];
  if (!kind) return null;
  const e = G.enemies.get();
  if (!e) return null;
  const boss = !!BOSSES[type];
  const def = boss ? BALANCE.bosses[type] : BALANCE.enemies[type];
  const n = Math.max(1, G.wave);
  const elite = !boss && type !== "gem" && !!(opts && opts.elite);
  // Bosses (and Pride's gems): tougher higher up the ladder, and again on every endless lap.
  const lapWave = ((n - 1) % 35) + 1;
  const lapMul = (1 + (G.lap || 0) * BALANCE.ladder.lapHp) * (1 + Math.max(0, lapWave - 5) * BALANCE.ladder.rungHp);
  const hpMul = boss || type === "gem" ? lapMul : 1 + (n - 1) * W.hpPerWave + (n - 1) * (n - 1) * W.hpCurve;
  const spMul = boss ? 1 : 1 + Math.min(W.speedCap, (n - 1) * W.speedPerWave);

  e.dead = false;
  e.id = G.nextId++;
  e.type = type; e.def = def; e.kind = kind; e.boss = boss; e.elite = elite;
  e.art = boss ? null : sprites.robots[type] || null;    // null: the kind draws itself (Lust's fakes)
  e.x = e.px = x; e.y = e.py = y;
  e.vx = e.vy = e.kx = e.ky = 0;
  e.r = def.r; e.scale = 1;
  e.maxHp = e.hp = def.hp * hpMul * (elite ? E.hp : 1);
  if (boss && def.fightSecs && G.stats) {
    const floor = estimateDps() * def.fightSecs;
    if (floor > e.maxHp) { e.maxHp = e.hp = floor; e.scaledToYou = true; } else e.scaledToYou = false;
  }
  e.speed = (def.speed || 0) * spMul * (elite ? E.speed : 1);
  e.mass = def.mass || (boss ? 50 : 1);
  e.contact = def.contact === undefined ? 1 : def.contact;
  e.score = def.score * (elite ? E.score : 1);
  e.stars = (def.stars || 0) * (elite ? E.stars : 1);
  const P = G.player;
  e.ang = e.pang = P ? Math.atan2(P.y - y, P.x - x) : 0;
  e.state = 0; e.t = e.t2 = e.t3 = e.cd = 0; e.a = e.b = e.c = 0; e.tx = e.ty = 0;
  e.flash = 0; e.spawnT = (opts && opts.spawnT !== undefined) ? opts.spawnT : 0.35;
  e.ally = 0; e.slowMul = 1; e.dmgMul = 1; e.orbCd = 0; e.invuln = false; e.warnPlayed = false;
  e.ramStamp = 0; e.target = null;
  e.mark = boss ? (G.lap || 0) : G.mark;
  e.traits = 0; e.shield = e.shieldMax = 0; e.haste = 1; e.numAcc = 0; e.numCd = 0; e.parent = null; e.parentId = 0; e.slot = 0;
  if (elite) rollTraits(e, n);
  if (kind.init) kind.init(e, opts);
  return e;
}

const TRAIT_KEYS = ["shielded", "hasted", "volatile", "regen"];
function rollTraits(e, wave) {
  const T = E.traits;
  const want = wave >= E.twoTraitsFrom ? 2 : 1;
  for (let k = 0; k < 8 && countBits(e.traits) < want; k++) {
    const key = TRAIT_KEYS[Math.floor(Math.random() * TRAIT_KEYS.length)];
    e.traits |= TRAIT[key];
  }
  if (e.traits & TRAIT.shielded) e.shield = e.shieldMax = e.maxHp * T.shielded.share;
  if (e.traits & TRAIT.hasted) { e.haste = T.hasted.attack; e.speed *= T.hasted.speed; }
}
function countBits(v) { let n = 0; while (v) { n += v & 1; v >>= 1; } return n; }

/** Robots that still count toward finishing the wave. */
export function hostileCount() {
  let n = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const e = items[i]; if (!e.dead && e.ally <= 0) n++; }
  return n;
}

// ---------- charmed robots (Lust) ----------
function popAlly(e) {
  const s = G.stats;
  queueBlast(e.x, e.y, (s.lustBurst || 40) + e.r, 22 + G.wave * 3, true, false, 0, C.magenta, P_HEART);
  fx.burst(e.x, e.y, 10, P_HEART, 200, 0.6, 1.6);
  killEnemy(e, true);
}
export function popAllAllies() {
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const e = items[i]; if (!e.dead && e.ally > 0) popAlly(e); }
}

function updateAlly(e, dt, realDt) {
  e.ally -= realDt;
  if (e.ally <= 0) { popAlly(e); return; }
  e.t -= dt;
  if (!e.target || e.target.dead || e.target.id !== e.targetId || e.target.ally > 0 || e.t <= 0) {
    e.t = 0.5;
    let best = null, bd = 520 * 520;
    const items = G.enemies.items;
    for (let i = 0; i < G.enemies.count; i++) {
      const o = items[i];
      if (o.dead || o.ally > 0 || o === e) continue;
      const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
      if (d2 < bd) { bd = d2; best = o; }
    }
    e.target = best;
    e.targetId = best ? best.id : 0;
  }
  const P = G.player;
  if (e.target) {
    const d = seek(e, e.target.x, e.target.y, Math.max(140, e.speed * 1.3), 5, dt);
    e.cd -= dt;
    if (d < e.r * e.scale + e.target.r * e.target.scale + 4 && e.cd <= 0) {
      e.cd = 0.35;
      const o = e.target;
      const dx = o.x - e.x, dy = o.y - e.y, dd = Math.hypot(dx, dy) || 1;
      damageEnemy(o, 10 + e.maxHp * 0.3 + G.wave * 1.5, false, dx / dd, dy / dd, 200);
      fx.burst(o.x, o.y, 4, P_HEART, 140, 0.3, 1.2);
      audio.play("hit", o.x, o.y, 0.5);
    }
  } else if (P) {
    seek(e, P.x + Math.cos(e.id) * 70, P.y + Math.sin(e.id) * 70, 160, 3, dt);
  }
  faceVel(e, 10, dt);
}

// ---------- the loop ----------
export function updateEnemies(dt) {
  const pool = G.enemies;
  const items = pool.items;
  const P = G.player;
  const s = G.stats;
  const freeze = G.freezeT > 0 ? 0.15 : 1;
  const slowR2 = s.slowRadius * s.slowRadius;
  const puddles = G.puddles;
  const trailSlow = BALANCE.upgrades.sloth.trailSlow;
  const as = G.asteroids;
  let maxR = 24;

  for (let i = 0; i < pool.count; i++) {
    const e = items[i];
    if (e.dead) continue;
    e.px = e.x; e.py = e.y; e.pang = e.ang;
    if (e.flash > 0) e.flash -= dt;
    if (e.orbCd > 0) e.orbCd -= dt;
    if (e.numCd > 0) { e.numCd -= dt; if (e.numCd <= 0 && e.numAcc > 0) flushDamage(e); }
    if ((e.traits & TRAIT.regen) && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * E.traits.regen.perSec * dt);

    let m = freeze;
    if (P && !P.dead && e.ally <= 0) {
      if (slowR2 && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < slowR2) m *= s.slowMul;
      for (let k = 0; k < puddles.count; k++) {
        const q = puddles.items[k];
        if ((e.x - q.x) ** 2 + (e.y - q.y) ** 2 < q.r * q.r) { m *= trailSlow; break; }
      }
    }
    if (e.boss) m = Math.max(m, 0.5);       // bosses resist slows a bit
    e.slowMul = m;
    const edt = dt * m;

    if (e.spawnT > 0) {
      e.spawnT -= dt;
    } else if (e.ally > 0) {
      updateAlly(e, edt, dt);
      if (e.dead) continue;
    } else if (P) {
      e.kind.update(e, edt * e.haste, P);
      if (e.dead) continue;
    }

    const kd = 1 - Math.min(1, 7 * dt);
    e.kx *= kd; e.ky *= kd;
    e.x += (e.vx + e.kx) * edt;
    e.y += (e.vy + e.ky) * edt;

    const r = e.r * e.scale;
    if (e.x < r) { e.x = r; if (e.vx < 0) e.vx = 0; }
    else if (e.x > A.w - r) { e.x = A.w - r; if (e.vx > 0) e.vx = 0; }
    if (e.y < r) { e.y = r; if (e.vy < 0) e.vy = 0; }
    else if (e.y > A.h - r) { e.y = A.h - r; if (e.vy > 0) e.vy = 0; }

    if (!e.boss) {
      for (let k = 0; k < as.count; k++) {
        const a = as.items[k];
        if (a.dead) continue;
        const dx = e.x - a.x, dy = e.y - a.y, rr = a.r * 0.9 + r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0) {
          const d = Math.sqrt(d2);
          e.x = a.x + (dx / d) * rr; e.y = a.y + (dy / d) * rr;
          if (e.kind.onRock) e.kind.onRock(e, a);
        }
      }
    }
    if (r > maxR) maxR = r;
  }
  G.maxR = maxR;

  G.hash.build(pool);
  separate();
}

function separate() {
  const items = G.enemies.items;
  const hash = G.hash, res = hash.results;
  const count = G.enemies.count;
  for (let i = 0; i < count; i++) {
    const e = items[i];
    if (e.dead) continue;
    const er = e.r * e.scale;
    const n = hash.query(e.x, e.y, er + G.maxR);
    for (let j = 0; j < n; j++) {
      const idx = res[j];
      if (idx <= i) continue;
      const o = items[idx];
      if (o.dead) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      const rr = (er + o.r * o.scale) * 0.85;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      let nx, ny;
      if (d < 0.01) { const a = rand(0, TAU); nx = Math.cos(a); ny = Math.sin(a); d = 0.01; }
      else { nx = dx / d; ny = dy / d; }
      const overlap = rr - d;
      let we, wo;
      if (e.boss && !o.boss) { we = 0; wo = 1; }
      else if (o.boss && !e.boss) { we = 1; wo = 0; }
      else { const t = e.mass + o.mass; we = o.mass / t; wo = e.mass / t; }
      e.x -= nx * overlap * we * 0.6; e.y -= ny * overlap * we * 0.6;
      o.x += nx * overlap * wo * 0.6; o.y += ny * overlap * wo * 0.6;
    }
  }
}
