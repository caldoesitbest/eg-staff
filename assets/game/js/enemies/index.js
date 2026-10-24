/* Robot spawning, the shared update loop (slow fields, knockback, charm), separation
   and the steering helpers every robot uses. */

import { G, usePlayer } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, turnTowards, rand } from "../util.js";
import { sprites, C, P_HEART, P_WHITE, P_ORANGE, PAL } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { ROSTER } from "./roster.js";
import { BOSSES, BOSS_MINIONS } from "./bosses.js";
import { damageEnemy, killEnemy, queueBlast, TRAIT, flushDamage, hitStop } from "../world.js";
import { evoRobot } from "../evolve.js";
import { bloodRamp, allyHit, allyPop } from "../fusion.js";
import { mutate, mutTick, mutBusy } from "../mutations.js";

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
  const rung = Math.max(0, lapWave - 5), L = BALANCE.ladder;
  const lapMul = (1 + (G.lap || 0) * L.lapHp) * (1 + rung * L.rungHp + rung * rung * L.rungHp2);
  const hpMul = boss || type === "gem" ? lapMul : 1 + (n - 1) * W.hpPerWave + (n - 1) * (n - 1) * W.hpCurve;
  const spMul = boss ? 1 : 1 + Math.min(W.speedCap, (n - 1) * W.speedPerWave);

  e.dead = false;
  e.id = G.nextId++;
  e.type = type; e.def = def; e.kind = kind; e.boss = boss; e.elite = elite;
  e.art = boss ? null : sprites.robots[type] || null;    // null: the kind draws itself (Lust's fakes)
  e.x = e.px = x; e.y = e.py = y;
  e.vx = e.vy = e.kx = e.ky = 0;
  e.r = def.r; e.scale = 1;
  // co-op: bosses get much tougher per extra player, robots a little (most of the extra comes as more robots)
  const crew = Math.max(1, G.net.n || 1);
  const crewMul = boss || type === "gem" ? 1 + 0.7 * (crew - 1) : 1 + 0.1 * (crew - 1);
  // Boss health is fixed by the boss, the chapter, the endless lap and the team size. It never looks
  // at your build: a strong build is supposed to shorten the fight.
  const rushMul = (boss || type === "gem") && G.mode === "rush" ? BALANCE.rush.bossHp : 1;      // Boss Rush: you have fewer cards
  e.maxHp = e.hp = def.hp * hpMul * crewMul * rushMul * (elite ? E.hp : 1);
  e.speed = (def.speed || 0) * spMul * (elite ? E.speed : 1);
  e.mass = def.mass || (boss ? 50 : 1);
  e.contact = def.contact === undefined ? 1 : def.contact;
  e.score = def.score * (elite ? E.score : 1);
  e.stars = (def.stars || 0) * (elite ? E.stars : 1);
  const P = G.player;
  e.ang = e.pang = P ? Math.atan2(P.y - y, P.x - x) : 0;
  e.state = 0; e.t = e.t2 = e.t3 = e.cd = 0; e.a = e.b = e.c = 0; e.tx = e.ty = 0;
  e.flash = 0; e.spawnT = (opts && opts.spawnT !== undefined) ? opts.spawnT : 0.35;
  e.pop = 0; e.popX = 0; e.popY = 0; e.phaseSeen = 0;
  e.ally = 0; e.slowMul = 1; e.dmgMul = 1; e.orbCd = 0; e.invuln = false; e.warnPlayed = false;
  e.ramStamp = 0; e.target = null; e.tgtP = null; e.tgtT = 0; e.allyBy = null;
  e.mark = boss ? (G.lap || 0) : G.mark;
  e.traits = 0; e.shield = e.shieldMax = 0; e.haste = 1; e.numAcc = 0; e.numCd = 0; e.parent = null; e.parentId = 0; e.slot = 0;
  e.tox = 0; e.toxT = 0; e.toxTick = 0; e.toxDmg = 0; e.toxBy = null; e.vuln = 0; e.moon = 0; e.moonBy = null; e.trailCd = 0; e.boomCd = 0;
  e.chill = 0; e.chillMul = 1; e.shatterCd = 0; e.passive = false; e.lastCrit = false;
  e.mut = 0; e.mutT = 0; e.mutCd = 0; e.mutN = 0; e.phased = false; e.mutHeal = 0; e.berserk = false;
  if (elite) rollTraits(e, n);
  if (kind.init) kind.init(e, opts);
  if (opts && opts.mut && !boss) mutate(e, opts.mut);
  if (opts && opts.copy) {
    // a Replicator's copy: smaller, weaker, worth less, and it doesn't copy itself
    e.scale = BALANCE.mutations.types.replicator.copyScale;
    e.maxHp *= BALANCE.mutations.types.replicator.copyHp; e.hp = e.maxHp;
    e.score *= 0.3; e.stars *= 0.3;
  }
  return e;
}

/** Replicator: a copy pops out of it. */
export function spawnCopy(e) {
  const a = rand(0, TAU);
  const c = spawnEnemy(e.type, e.x + Math.cos(a) * e.r * 1.6, e.y + Math.sin(a) * e.r * 1.6, { spawnT: 0.2, copy: true });
  if (!c) return;
  c.kx = Math.cos(a) * 260; c.ky = Math.sin(a) * 260;
  const col = BALANCE.mutations.types.replicator.col;
  fx.ring(e.x, e.y, e.r, e.r * 2.6, 0.3, col, 3);
  fx.text(e.x, e.y - e.r - 10, "REPLICATED", col, 13, 0.8);
  audio.play("spawn", e.x, e.y, 0.7);
}

/** Which player a robot is after: the nearest, re-picked every second or two so a crowd spreads out. */
function targetOf(e) {
  const list = G.players;
  if (list.length === 1) return list[0];
  e.tgtT -= 1 / 60;
  const cur = e.tgtP;
  if (cur && !cur.dead && !cur.gone && e.tgtT > 0) return cur;
  let best = null, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const P = list[i];
    if (P.dead || P.gone) continue;
    const d2 = ((P.x - e.x) ** 2 + (P.y - e.y) ** 2) * (0.75 + Math.random() * 0.5);
    if (d2 < bd) { bd = d2; best = P; }
  }
  e.tgtP = best || cur || G.me;
  e.tgtT = 1 + Math.random() * 1.2;
  return e.tgtP;
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

/** A boss's phase changes land as a moment (a shockwave, a flash in its colour, a beat of stillness,
    a hit in the music), and the more hurt it is the more it sparks and smokes. */
function bossMoments(e, dt) {
  if (e.state === -1) return;
  const phase = (e.b || 0) + (e.phase || 0);
  if (phase > e.phaseSeen) {
    e.phaseSeen = phase;
    const col = e.def.c1, R = e.r * e.scale;
    fx.ring(e.x, e.y, R, R + 300, 0.6, col, 6);
    fx.ring(e.x, e.y, R * 0.6, R + 180, 0.45, "#ffffff", 3);
    fx.burst(e.x, e.y, 26, Math.max(0, PAL.indexOf(col)), 380, 0.8, 2);
    fx.screenFlash(col, 0.22, 3);
    fx.shake(0.45);
    hitStop(0.07, true);
    audio.impact();
  }
  const f = e.hp / e.maxHp;
  if (f < 0.5 && Math.random() < dt * (f < 0.25 ? 9 : 4)) {
    const a = rand(0, TAU), R = e.r * e.scale;
    fx.p(0, e.x + Math.cos(a) * R * 0.85, e.y + Math.sin(a) * R * 0.85, Math.cos(a) * 140, Math.sin(a) * 140, 0.4, 1.5, Math.random() < 0.6 ? P_ORANGE : P_WHITE, 3);
    if (f < 0.25 && Math.random() < 0.35) fx.smoke(e.x + Math.cos(a) * R * 0.6, e.y + Math.sin(a) * R * 0.6, 1, 14);
  }
}

/** Robots that still count toward finishing the wave. */
export function hostileCount() {
  let n = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const e = items[i]; if (!e.dead && e.ally <= 0 && !e.passive) n++; }
  return n;
}

// ---------- charmed robots (Lust) ----------
function popAlly(e) {
  if (e.allyBy && e.allyBy !== G.player) usePlayer(e.allyBy);
  const s = G.stats;
  const blood = allyPop(e);          // Bloodlust: a blood nova; Parasitic Heart: a shield pip
  queueBlast(e.x, e.y, ((s.lustBurst || 40) + e.r) * (blood ? blood.radius : 1), (22 + G.wave * 3) * (blood ? blood.blast : 1), true, false, 0, blood ? C.red : C.magenta, P_HEART);
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
  const P = e.allyBy || G.me;
  if (e.target) {
    const ramp = bloodRamp(e);          // Bloodlust: more vicious the longer the charm lasts
    const d = seek(e, e.target.x, e.target.y, Math.max(140, e.speed * 1.3) * (1 + ramp * 0.4), 5, dt);
    e.cd -= dt;
    if (d < e.r * e.scale + e.target.r * e.target.scale + 4 && e.cd <= 0) {
      e.cd = 0.35 / (1 + ramp * 0.6);
      const o = e.target;
      const dx = o.x - e.x, dy = o.y - e.y, dd = Math.hypot(dx, dy) || 1;
      damageEnemy(o, (10 + e.maxHp * 0.3 + G.wave * 1.5) * (1 + ramp), false, dx / dd, dy / dd, 200);
      allyHit(e);
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
  const list = G.players;
  const freeze = G.freezeT > 0 ? 0.15 : 1;
  // each player's Sloth field
  for (let i = 0; i < list.length; i++) { const Q = list[i]; usePlayer(Q); Q.slowR2 = G.stats.slowRadius * G.stats.slowRadius; Q.slowM = G.stats.slowMul; }
  const alive = list.some((Q) => !Q.dead);
  const puddles = G.puddles;
  const trailSlow = BALANCE.upgrades.sloth.trailSlow;
  const as = G.asteroids;
  let maxR = 24;

  for (let i = 0; i < pool.count; i++) {
    const e = items[i];
    if (e.dead) continue;
    e.px = e.x; e.py = e.y; e.pang = e.ang;
    if (e.flash > 0) e.flash -= dt;
    if (e.pop > 0) e.pop -= dt;
    if (e.orbCd > 0) e.orbCd -= dt;
    evoRobot(e, dt);                 // Neurotoxin, Gravity Well, Blood Moon timers
    if (e.dead) continue;
    if (e.boss) bossMoments(e, dt);
    else if (e.maxHp >= 60 && e.hp < e.maxHp * 0.35 && e.ally <= 0 && Math.random() < dt * 5) {
      // a badly hurt big robot sheds sparks: you can see it's nearly done
      const a = rand(0, TAU);
      fx.p(0, e.x + Math.cos(a) * e.r * 0.7, e.y + Math.sin(a) * e.r * 0.7, Math.cos(a) * 90, Math.sin(a) * 90 - 30, 0.35, 1.3, Math.random() < 0.5 ? P_ORANGE : P_WHITE, 3);
    }
    if (e.numCd > 0) { e.numCd -= dt; if (e.numCd <= 0 && e.numAcc > 0) flushDamage(e); }
    if ((e.traits & TRAIT.regen) && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * E.traits.regen.perSec * dt);

    let m = freeze;
    if (alive && e.ally <= 0) {
      for (let k = 0; k < list.length; k++) {
        const Q = list[k];
        if (!Q.dead && Q.slowR2 && (e.x - Q.x) ** 2 + (e.y - Q.y) ** 2 < Q.slowR2) { m *= Q.slowM; break; }
      }
      for (let k = 0; k < puddles.count; k++) {
        const q = puddles.items[k];
        if ((e.x - q.x) ** 2 + (e.y - q.y) ** 2 < q.r * q.r) { m *= trailSlow; break; }
      }
    }
    if (e.chill > 0) m *= e.boss ? Math.max(0.7, e.chillMul) : e.chillMul;
    if (e.boss) m = Math.max(m, 0.5);       // bosses resist slows a bit
    e.slowMul = m;
    const edt = dt * m;

    if (e.spawnT > 0) {
      e.spawnT -= dt;
    } else if (e.ally > 0) {
      updateAlly(e, edt, dt);
      if (e.dead) continue;
    } else {
      const T = targetOf(e);
      usePlayer(T);
      G.curEnemy = e;            // its shots and blasts remember who fired them
      if (e.mut) mutTick(e, edt, T);
      if (!mutBusy(e)) e.kind.update(e, edt * e.haste, T);
      G.curEnemy = null;
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
  usePlayer(G.me);

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
