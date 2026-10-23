/* The simulation: one fixed step of everything, plus the shared actions
   (damage, kills, scoring, pickups, explosions, asteroids). Co-op: every player is checked in turn
   with usePlayer(), so "the player" in damage/heal/kill code is whoever it's happening to. */

import { G, usePlayer, coop } from "./state.js";
import { BALANCE } from "./balance.js";
import { TAU, rand, randInt, chance, fracRound, clamp } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { sprites, C, P_CYAN, P_AMBER, P_DANGER, P_WHITE, P_HEART, P_ORANGE, P_VIOLET, P_MINT } from "./sprites.js";
import { onKill, onHit, hasEnvy, hasSplitEnvy, ENVY_POWERS, tickEnvy } from "./upgrades.js";
import { updatePlayer, playerHurtRadius } from "./player.js";
import { updateEnemies } from "./enemies/index.js";
import { waves } from "./waves.js";
import { updateBossFx } from "./enemies/bosses.js";
import { SHOT_KIND, GUN_R, updateGear } from "./armory.js";

const A = BALANCE.arena;
const D = BALANCE.drops;
let boostSerial = 0;

// ---------------------------------------------------------------------------
// Scoring + feedback
// ---------------------------------------------------------------------------
export function comboMult() {
  const c = BALANCE.combo;
  return Math.min(c.cap, 1 + G.combo * c.perKill);
}
export function addScore(base) {
  G.score += base * comboMult();
}
// Hit-stop: the tiny freeze that sells a big hit. Kills draw from a small bank that refills slowly
// and skip it entirely in a crowd, so a screen full of explosions never turns into a stutter.
let stopBank = 0.1;
export function hitStop(t, major) {
  const mode = G.settings.hitstop;            // "full" | "light" | "off"
  if (mode === "off") return;
  if (!major) {
    if (G.enemies.count > 14 || stopBank < t) return;
    stopBank -= t;
  }
  G.hitstop = Math.max(G.hitstop, mode === "light" ? t * 0.6 : t);
}

export function haptic(ms) {
  // Phones only, and only after a real tap (Chrome logs an error for vibrate() before that).
  if (!G.settings || !G.settings.haptics || !G.touchActive || !navigator.vibrate) return;
  const ua = navigator.userActivation;
  if (ua && !ua.hasBeenActive) return;
  try { navigator.vibrate(ms); } catch (e) { /* unsupported */ }
}

// ---------------------------------------------------------------------------
// Enemies: damage + death
// ---------------------------------------------------------------------------
export const TRAIT = { shielded: 1, hasted: 2, volatile: 4, regen: 8 };

/** Damage numbers merge per robot (one number every 0.12s, or straight away for a crit). */
function showDamage(e, dmg, crit) {
  const mode = G.settings.dmgNumbers;
  if (mode === "off" || (mode === "crits" && !crit)) return;
  e.numAcc += dmg;
  if (crit || e.numCd <= 0 || e.hp <= 0) {
    if (e.numAcc >= 1) fx.number(e.x, e.y - e.r * e.scale * 0.6, e.numAcc, crit);
    e.numAcc = 0;
    e.numCd = 0.12;
  }
}

export function damageEnemy(e, dmg, crit, dirX, dirY, knock) {
  if (e.dead || e.invuln) return false;
  dmg *= e.dmgMul;
  if (e.shield > 0) {
    // Shielded trait: the cyan shield soaks damage first
    const take = Math.min(e.shield, dmg);
    e.shield -= take;
    dmg -= take;
    e.flash = 0.05;
    if (e.shield <= 0) { fx.ring(e.x, e.y, e.r, e.r * 2.4, 0.3, C.cyan, 3); audio.play("shieldHit", e.x, e.y, 0.6); }
    if (dmg <= 0) return false;
  }
  e.hp -= dmg;
  e.flash = 0.08;
  if (knock && !e.boss) {
    const k = knock / e.mass;
    e.kx += dirX * k;
    e.ky += dirY * k;
  }
  showDamage(e, dmg, crit);
  if (e.hp <= 0) { killEnemy(e); return true; }
  if (e.ally <= 0) onHit(e);
  return false;
}

/** Flushes a merged damage number once its window closes (called from the enemy loop). */
export function flushDamage(e) {
  if (e.numAcc >= 1) fx.number(e.x, e.y - e.r * e.scale * 0.6, e.numAcc, false);
  e.numAcc = 0;
}

export function killEnemy(e, silent) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  const kind = e.kind;
  const ally = e.ally > 0;
  const big = e.r * e.scale > 20 || e.elite;
  if (!ally && !silent) {
    G.kills++;
    G.combo++;
    G.comboTimer = BALANCE.combo.window;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    addScore(e.score);
  }
  if (!e.boss) {
    fx.explode(e.x, e.y, e.r * e.scale, kind.pal, kind.accent);
    if (e.elite) fx.ring(e.x, e.y, 10, 90, 0.4, C.amber, 3);
    fx.shake(big ? BALANCE.fx.shake.explode : 0.07);
    hitStop(big ? BALANCE.fx.hitstop.bigKill : BALANCE.fx.hitstop.kill, false);
    audio.play(big ? "explode" : "die", e.x, e.y, big ? 0.8 : 0.6);
  }
  if (!silent) {
    const s = G.stats;
    const n = fracRound(e.stars * s.starMul);
    for (let i = 0; i < n; i++) dropPickup(0, e.x, e.y, s.starValue);
    if (!ally && !e.boss) {
      const low = G.player && G.player.hp <= 2;
      if (chance(low ? D.heartChanceLow : D.heartChance)) dropPickup(2, e.x, e.y, D.heartHeal);
    }
    if (!ally) onKill(e);
  }
  if ((e.traits & TRAIT.volatile) && !silent && !ally) {
    const V = BALANCE.elite.traits.volatile;
    const off = rand(0, TAU);
    for (let i = 0; i < V.count; i++) {
      const a = off + (i / V.count) * TAU;
      fireEnemyBullet(e.x, e.y, Math.cos(a) * V.speed, Math.sin(a) * V.speed, 1, "amber", 6);
    }
    fx.ring(e.x, e.y, 6, 70, 0.3, C.amber, 3);
  }
  if (kind.onDeath) kind.onDeath(e, silent);
  G.emit("kill", e);
}

// ---------------------------------------------------------------------------
// Player: hurt, heal, perfect boost, death
// ---------------------------------------------------------------------------
export function hurtPlayer(dmg, sx, sy) {
  const P = G.player;
  if (!P || P.dead) return false;
  if (P.boostT > 0 || P.grace > 0) { perfectBoost(); return false; }
  if (P.iframes > 0 || G.debug.god) return false;

  if (P.bubble) {
    // Bubble Shield (shop): the first hit of a wave just pops it
    P.bubble = false;
    P.iframes = 0.8;
    fx.ring(P.x, P.y, 16, 90, 0.35, C.cyan, 4);
    fx.burst(P.x, P.y, 14, P_CYAN, 220, 0.5, 1.5);
    audio.play("shieldHit", P.x, P.y);
    G.emit("hurt", true);
    return true;
  }

  if (P.shield > 0) {
    const take = Math.min(P.shield, dmg);
    P.shield -= take;
    dmg -= take;
    fx.ring(P.x, P.y, 14, 60, 0.3, C.cyan, 3);
    audio.play("shieldHit", P.x, P.y);
    if (dmg <= 0) { P.iframes = 0.6; G.emit("hurt", true); return true; }
  }

  P.hp -= dmg;
  P.iframes = BALANCE.player.iframes;
  P.hurtT = 0.45;
  let dx = P.x - sx, dy = P.y - sy;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  P.vx += dx * BALANCE.player.hurtKnock;
  P.vy += dy * BALANCE.player.hurtKnock;

  if (G.combo >= 5) fx.text(P.x, P.y - 40, "COMBO LOST", C.danger, 14, 1);
  G.combo = 0;
  G.comboTimer = 0;
  P.streak = 0;
  G.waveHits++;
  G.hitsTaken++;

  P.hurtSeq++;                 // co-op: tells that player's own screen to flash
  if (P === G.me) {
    G.personal = true;           // your screen only (not sent to teammates)
    fx.screenFlash("#ff2a55", 0.32, 2.6);
    fx.shake(BALANCE.fx.shake.hurt);
    hitStop(BALANCE.fx.hitstop.hurt, true);
    audio.play("hurt");
    haptic(60);
    G.personal = false;
  }
  fx.burst(P.x, P.y, 14, P_DANGER, 240, 0.5, 1.6);
  fx.sparks(P.x, P.y, Math.atan2(dy, dx), 0.9, 8, P_WHITE, 360, 0.3);
  G.emit("hurt", false);
  if (P.hp <= 0) { P.hp = 0; killPlayer(); }
  return true;
}

export function perfectBoost() {
  const P = G.player;
  if (P.perfectUsed) return;
  P.perfectUsed = true;
  const B = BALANCE.player.boost;
  P.boostCdT *= 1 - B.perfectRefund;
  if (G.stats.bulletTime) { G.freezeT = BALANCE.upgrades.sloth.bulletTime; }
  else if (!coop() && G.time - (G.lastSlowmo || -9) > 2.5 && G.settings.hitstop !== "off") {
    // slow-mo at most every 2.5s: in a bullet storm back-to-back perfects felt like lag
    G.slowmo = B.perfectSlowmo; G.slowScale = 0.35; G.lastSlowmo = G.time;
  }
  G.combo += BALANCE.combo.perfectBonus;
  G.comboTimer = BALANCE.combo.window;
  if (G.combo > G.bestCombo) G.bestCombo = G.combo;
  G.perfects = (G.perfects || 0) + 1;
  P.perfSeq = (P.perfSeq || 0) + 1;
  if (G.stats.perfectCharge) { if (P.charging) P.charge = 1; else P.chargeBank = true; }
  fx.text(P.x, P.y - 38, "PERFECT!", C.cyan, 18, 0.9);
  fx.ring(P.x, P.y, 10, 95, 0.35, C.cyan, 3);
  audio.play("perfect", P.x, P.y);
  if (P === G.me) haptic(15);
  G.emit("perfect");
}

export function healPlayer(amount, allowShield) {
  const P = G.player;
  if (!P || P.dead) return;
  if (P.hp < P.maxHp) {
    P.hp = Math.min(P.maxHp, P.hp + amount);
    fx.text(P.x, P.y - 34, "+" + (amount === 1 ? "½" : amount / 2) + "💜", C.heart, 15, 0.9);
  } else if (allowShield && P.maxShield > 0 && P.shield < P.maxShield) {
    P.shield = Math.min(P.maxShield, P.shield + amount);
    fx.text(P.x, P.y - 34, "+SHIELD", C.cyan, 14, 0.9);
  } else return;
  audio.play("heal", P.x, P.y);
  G.emit("heal");
}

function killPlayer() {
  const P = G.player;
  P.dead = true;
  P.deathT = 0;
  P.reviveT = 0;
  fx.explode(P.x, P.y, 34, P_CYAN, C.cyan);
  fx.burst(P.x, P.y, 30, P_HEART, 320, 1.0, 2);
  fx.ring(P.x, P.y, 20, 260, 0.7, C.white, 4);
  audio.play("bigExplode", P.x, P.y);
  if (P === G.me) { G.personal = true; fx.shake(1); fx.screenFlash("#ffffff", 0.6, 1.6); haptic([80, 60, 160]); G.personal = false; }
  if (coop()) {
    // co-op: you're down, not out, until everyone is
    fx.text(P.x, P.y - 40, (P.name || "Player").toUpperCase() + " IS DOWN", C.danger, 16, 1.4);
    if (G.players.some((o) => !o.dead && !o.gone)) return;
  }
  G.slowmo = 1.1;
  G.slowScale = 0.28;
  G.emit("playerDown");
}

/** Co-op: stand next to a downed teammate to bring them back. */
const REVIVE = { time: 2.4, range: 70, hp: 2 };
export function revivePlayer(P) {
  P.dead = false;
  P.reviveT = 0;
  P.hp = Math.max(P.hp, REVIVE.hp);
  P.iframes = 2;
  fx.ring(P.x, P.y, 10, 120, 0.5, C.mint, 4);
  fx.text(P.x, P.y - 40, "REVIVED", C.mint, 18, 1.2);
  audio.play("heal", P.x, P.y);
}
function updateRevives(dt) {
  const list = G.players;
  for (let i = 0; i < list.length; i++) {
    const P = list[i];
    if (!P.dead || P.gone) continue;
    let near = false;
    for (let j = 0; j < list.length; j++) {
      const o = list[j];
      if (o === P || o.dead || o.gone) continue;
      if ((o.x - P.x) ** 2 + (o.y - P.y) ** 2 < REVIVE.range * REVIVE.range) { near = true; break; }
    }
    P.reviveT = near ? P.reviveT + dt / REVIVE.time : Math.max(0, P.reviveT - dt * 0.3);
    if (P.reviveT >= 1) revivePlayer(P);
  }
}
export const reviveRange = REVIVE.range;

// ---------------------------------------------------------------------------
// Spawning helpers
// ---------------------------------------------------------------------------
/** One player shot from your current gun. absDmg > 0 makes a "plain" shot instead (buddy drones,
    thorns): that damage, the blaster's look, and none of the gun's own effects. */
export function firePlayerBullet(x, y, ang, kind, dmgMul = 1, absDmg = 0) {
  const s = G.stats;
  const b = G.pb.get();
  if (!b) return null;
  const plain = absDmg > 0;
  const PG = BALANCE.player.gun;
  let speed = plain ? PG.speed : s.bulletSpeed;
  let pierce = plain ? s.pierce - (s.gun.pierce || 0) : s.pierce;
  if (hasEnvy("sniper")) { speed *= 1 + ENVY_POWERS.sniper.speed; pierce += ENVY_POWERS.sniper.pierce; }
  const crit = s.crit > 0 && Math.random() < s.crit + G.player.streak * s.streakPer;
  b.dead = false;
  b.id = G.nextId++;
  b.x = b.px = x; b.y = b.py = y;
  b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
  b.r = (plain ? PG.radius : GUN_R[s.gunId] || PG.radius) * (crit ? 1.25 : 1);
  b.dmg = (plain ? absDmg : s.damage * dmgMul) * (crit ? s.critMul : 1);
  b.life = plain ? PG.life * 1.1 : s.bulletLife;
  b.pierce = pierce + (crit && s.critPierce ? 2 : 0);
  b.nh = 0;
  b.bounces = s.bounces;
  b.crit = crit;
  b.homing = plain ? s.cardHoming : s.homing;
  b.kind = plain ? (crit ? 1 : kind || 0) : kind || (crit ? 1 : SHOT_KIND[s.gunId] || 0);
  b.explode = 0; b.explodeDmg = 0;
  if (!plain && s.explode) { b.explode = s.explode; b.explodeDmg = b.dmg * s.splash; }
  else if (hasEnvy("boomer")) { b.explode = ENVY_POWERS.boomer.radius; b.explodeDmg = b.dmg * ENVY_POWERS.boomer.dmg; }
  b.chain = plain ? 0 : s.chain;
  b.special = 0; b.full = false; b.zapT = 0; b.plain = plain;
  b.split = hasSplitEnvy();
  b.knock = plain ? PG.knock : s.knock;
  b.tgt = null; b.tgtId = 0; b.tgtT = 0;
  b.by = G.player;            // whose build gets the kill (co-op)
  return b;
}

/** Rail Lance charged shot: everything on the line takes the hit at once. */
export function fireBeam(x, y, ang, len, width, dmg) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  const items = G.enemies.items;
  let hits = 0;
  for (let i = 0; i < G.enemies.count; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.spawnT > 0.15) continue;
    const dx = e.x - x, dy = e.y - y;
    const along = dx * c + dy * sn;
    if (along < -e.r || along > len) continue;
    const side = Math.abs(-dx * sn + dy * c);
    if (side > width + e.r * e.scale) continue;
    hits++;
    fx.sparks(e.x, e.y, ang, 0.6, 5, P_VIOLET, 360, 0.25);
    if (damageEnemy(e, dmg, true, c, sn, 260)) G.killMark = 0.2;
  }
  for (let k = 0; k < G.asteroids.count; k++) {
    const a = G.asteroids.items[k];
    const dx = a.x - x, dy = a.y - y, along = dx * c + dy * sn;
    if (along > 0 && along < len && Math.abs(-dx * sn + dy * c) < width + a.r) damageAsteroid(a, dmg);
  }
  if (hits) G.hitMark = 0.16;
  fx.beam(x, y, x + c * len, y + sn * len, width, C.violet2, 0.3);
  fx.beam(x, y, x + c * len, y + sn * len, width * 0.35, C.white, 0.22);
  return hits;
}

/** Arc Caster: the bolt jumps to nearby robots it hasn't hit. */
function chainFrom(e, b) {
  const s = G.stats;
  const items = G.enemies.items, res = G.hash.results;
  let from = e;
  for (let j = 0; j < b.chain; j++) {
    const n = G.hash.query(from.x, from.y, s.chainRange + G.maxR);
    let best = null, bd = s.chainRange * s.chainRange;
    for (let k = 0; k < n; k++) {
      const o = items[res[k]];
      if (o.dead || o.ally > 0 || o === from || alreadyHit(b, o.id)) continue;
      const d2 = (o.x - from.x) ** 2 + (o.y - from.y) ** 2;
      if (d2 < bd) { bd = d2; best = o; }
    }
    if (!best) return;
    if (b.nh < 8) b.hits[b.nh++] = best.id;
    fx.bolt(from.x, from.y, best.x, best.y, C.blue);
    const d = Math.sqrt(bd) || 1;
    damageEnemy(best, b.dmg * s.chainDmg, false, (best.x - from.x) / d, (best.y - from.y) / d, 60);
    from = best;
  }
}

/** Storm orb (charged Arc Caster): zaps the closest robots as it flies. */
function stormZap(b) {
  const items = G.enemies.items, res = G.hash.results;
  const n = G.hash.query(b.x, b.y, 220 + G.maxR);
  let zapped = 0;
  for (let k = 0; k < n && zapped < 3; k++) {
    const e = items[res[k]];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > 220 * 220) continue;
    zapped++;
    fx.bolt(b.x, b.y, e.x, e.y, C.blue);
    if (damageEnemy(e, b.dmg * 0.25, false, 0, 0, 0)) G.killMark = 0.18;
  }
  if (zapped) audio.play("zap", b.x, b.y, 0.5);
}

/** A shot that ends (out of range, a wall, a rock, or it burst): grenades and full charges go off. */
function endShot(b) {
  b.dead = true;
  if (b.special === 3) {
    // cluster bomb: one big burst, then grenadelets
    queueBlast(b.x, b.y, 120, b.dmg, true, false, 0, C.orange, P_ORANGE);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + Math.random() * 0.4;
      const c = firePlayerBullet(b.x, b.y, a, 7, 0.55);
      if (c) { c.explode = 60; c.explodeDmg = c.dmg; c.life = 0.35 + Math.random() * 0.2; c.vx *= 0.6; c.vy *= 0.6; c.pierce = 0; }
    }
    return;
  }
  if (b.special === 1 && b.full) {
    const C2 = BALANCE.charge;
    const r = C2.blast * (G.stats.chargeWide ? 2 : 1);
    queueBlast(b.x, b.y, r, b.dmg * C2.blastDmg, true, false, 0, C.cyan, P_CYAN);
    return;
  }
  if (b.explode) queueBlast(b.x, b.y, b.explode, b.explodeDmg, true, false, 0, C.orange, P_ORANGE);
}

export function fireEnemyBullet(x, y, vx, vy, dmg, look, r, bolt) {
  const b = G.eb.get();
  if (!b) return null;
  if (!bolt) {
    const W = BALANCE.waves;
    const k = 1 + Math.min(W.shotSpeedCap, Math.max(0, G.wave - 1) * W.shotSpeedPerWave);
    vx *= k; vy *= k;
  }
  b.dead = false;
  b.x = b.px = x; b.y = b.py = y;
  b.vx = vx; b.vy = vy;
  b.dmg = dmg;
  b.look = look || "pink";
  b.r = r || 6;
  b.bolt = !!bolt;
  b.life = 6;
  b.grazed = false;
  b.age = 0; b.turn = 0; b.back = 0; b.owner = null; b.hp = 0; b.home = 0;
  return b;
}

export function dropPickup(kind, x, y, value) {
  const q = G.pickups.get();
  if (!q) return null;
  const a = rand(0, TAU), s = rand(70, 230);
  q.dead = false;
  q.kind = kind; q.x = q.px = x; q.y = q.py = y;
  q.vx = Math.cos(a) * s; q.vy = Math.sin(a) * s;
  q.life = kind === 2 ? D.heartLife : D.starLife;
  q.value = value; q.t = 0; q.pulled = false;
  return q;
}

/** Explosions are queued and resolved after collisions (so chains never nest). */
export function queueBlast(x, y, r, enemyDmg, friendly, hurtsPlayer, playerDmg, col, pal) {
  const q = G.blasts.get();
  if (!q) return;
  q.dead = false; q.x = x; q.y = y; q.r = r; q.enemyDmg = enemyDmg; q.friendly = friendly;
  q.hurtsPlayer = !!hurtsPlayer; q.dmg = playerDmg || 0; q.col = col || C.orange; q.pal = pal === undefined ? P_ORANGE : pal;
  q.by = G.player;
}

function processBlasts() {
  const bl = G.blasts;
  let processed = 0;
  for (let i = 0; i < bl.count && processed < 60; i++) {
    const q = bl.items[i];
    if (q.dead) continue;
    q.dead = true;
    processed++;
    fx.p(0, q.x, q.y, 0, 0, 0.2, q.r * 0.11, q.pal, 0);
    fx.ring(q.x, q.y, q.r * 0.3, q.r, 0.3, q.col, 4);
    fx.sparks(q.x, q.y, 0, Math.PI, 8, q.pal, 300, 0.3);
    fx.shake(Math.min(0.35, q.r / 400));
    audio.play("explode", q.x, q.y, 0.7);
    if (q.enemyDmg > 0) {
      if (q.by && q.by !== G.player) usePlayer(q.by);
      const n = G.hash.query(q.x, q.y, q.r + G.maxR);
      const res = G.hash.results, items = G.enemies.items;
      for (let j = 0; j < n; j++) {
        const e = items[res[j]];
        if (e.dead || (q.friendly && e.ally > 0)) continue;
        if (!q.friendly && e.boss) continue;
        const dx = e.x - q.x, dy = e.y - q.y;
        const rr = q.r + e.r * e.scale;
        if (dx * dx + dy * dy > rr * rr) continue;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        // bosses shrug off most splash (chain explosions next to a boss used to melt it)
        damageEnemy(e, e.boss ? q.enemyDmg * 0.3 : q.enemyDmg, false, dx / d, dy / d, 160);
      }
    }
    if (q.hurtsPlayer) {
      const rr = q.r + playerHurtRadius();
      for (let k = 0; k < G.players.length; k++) {
        const P = G.players[k];
        if (P.dead || (P.x - q.x) ** 2 + (P.y - q.y) ** 2 >= rr * rr) continue;
        usePlayer(P);
        hurtPlayer(q.dmg, q.x, q.y);
      }
    }
  }
  bl.sweep();
}

// ---------------------------------------------------------------------------
// Asteroids (from the original Envious Glider): drifting cover
// ---------------------------------------------------------------------------
export function spawnAsteroid(x, y, r, vx, vy) {
  const a = G.asteroids.get();
  if (!a) return null;
  a.dead = false;
  a.x = a.px = x; a.y = a.py = y; a.vx = vx; a.vy = vy;
  a.r = r; a.maxHp = a.hp = r * 3.4;
  a.rot = a.prot = rand(0, TAU); a.vr = rand(-0.5, 0.5);
  a.seed = randInt(1, 2147483646);
  a.spr = sprites.rock(r, a.seed);
  a.flash = 0;
  return a;
}
export function rebuildRockSprites() {
  for (let i = 0; i < G.asteroids.count; i++) { const a = G.asteroids.items[i]; a.spr = sprites.rock(a.r, a.seed); }
}

function damageAsteroid(a, dmg) {
  if (a.dead) return;
  a.hp -= dmg;
  a.flash = 0.06;
  if (a.hp <= 0) breakAsteroid(a);
}

function breakAsteroid(a) {
  a.dead = true;
  fx.debris(a.x, a.y, 8 + a.r / 4, "#6a5c96", 220);
  fx.smoke(a.x, a.y, 4, a.r * 0.7);
  fx.burst(a.x, a.y, 6, P_VIOLET, 140, 0.5, 1.4);
  fx.ring(a.x, a.y, a.r * 0.5, a.r * 1.8, 0.3, "#a57bff", 2);
  audio.play("explode", a.x, a.y, 0.5);
  const n = randInt(1, 2) + (a.r > 40 ? 1 : 0);
  for (let i = 0; i < n; i++) dropPickup(0, a.x, a.y, G.stats.starValue);
  if (a.r > 30) {
    const ang = rand(0, TAU);
    for (let k = -1; k <= 1; k += 2) {
      const sp = rand(40, 70);
      spawnAsteroid(a.x + Math.cos(ang) * k * a.r * 0.4, a.y + Math.sin(ang) * k * a.r * 0.4, a.r * 0.62,
        a.vx + Math.cos(ang) * k * sp, a.vy + Math.sin(ang) * k * sp);
    }
  }
}

/** Puts a new rock just outside the camera, drifting inward. */
export function spawnEdgeAsteroid(initial) {
  const r = rand(26, 54);
  let x, y;
  for (let tries = 0; tries < 12; tries++) {
    x = rand(r + 20, A.w - r - 20);
    y = rand(r + 20, A.h - r - 20);
    let far = true;
    for (let k = 0; k < G.players.length; k++) { const P = G.players[k]; if ((x - P.x) ** 2 + (y - P.y) ** 2 < 360 * 360) far = false; }
    let clear = true;
    for (let i = 0; i < G.asteroids.count; i++) {
      const o = G.asteroids.items[i];
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 40) ** 2) { clear = false; break; }
    }
    if (far && clear && (initial || !onScreen(x, y, r))) break;
  }
  const a = rand(0, TAU), s = rand(12, 34);
  return spawnAsteroid(x, y, r, Math.cos(a) * s, Math.sin(a) * s);
}

export function onScreen(x, y, pad) {
  const c = G.cam;
  return Math.abs(x - c.x) < c.viewW / 2 + pad && Math.abs(y - c.y) < c.viewH / 2 + pad;
}

/** Bounces a player off the rocks (a co-op client runs this for its own astronaut). */
export function collideRocks(P, canBreak) {
  if (!P || P.dead) return;
  const as = G.asteroids;
  for (let i = 0; i < as.count; i++) {
    const a = as.items[i];
    if (a.dead) continue;
    const dx = P.x - a.x, dy = P.y - a.y, rr = a.r * 0.92 + P.r * 0.8;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    if (canBreak && P.boostT > 0 && (a.r <= 32 || G.stats.boostRam)) damageAsteroid(a, a.r <= 32 ? 9999 : G.stats.boostRam * 2);
    if (P.input) continue;              // a teammate's own game moves them
    P.x = a.x + nx * rr; P.y = a.y + ny * rr;
    const vn = P.vx * nx + P.vy * ny;
    if (vn < 0) { P.vx -= 1.6 * vn * nx; P.vy -= 1.6 * vn * ny; a.vx += vn * nx * 0.08; a.vy += vn * ny * 0.08; }
  }
}

function updateAsteroids(dt) {
  const as = G.asteroids;
  for (let i = 0; i < as.count; i++) {
    const a = as.items[i];
    if (a.dead) continue;
    a.px = a.x; a.py = a.y; a.prot = a.rot;
    a.x += a.vx * dt; a.y += a.vy * dt;
    a.rot += a.vr * dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.x < a.r) { a.x = a.r; a.vx = Math.abs(a.vx); }
    if (a.x > A.w - a.r) { a.x = A.w - a.r; a.vx = -Math.abs(a.vx); }
    if (a.y < a.r) { a.y = a.r; a.vy = Math.abs(a.vy); }
    if (a.y > A.h - a.r) { a.y = A.h - a.r; a.vy = -Math.abs(a.vy); }
    for (let j = i + 1; j < as.count; j++) {
      const b = as.items[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { a.vx += nx * rel; a.vy += ny * rel; b.vx -= nx * rel; b.vy -= ny * rel; }
    }
  }
  for (let k = 0; k < G.players.length; k++) { const P = G.players[k]; usePlayer(P); collideRocks(P, true); }
  as.sweep();
}

// ---------------------------------------------------------------------------
// Bullets
// ---------------------------------------------------------------------------
function alreadyHit(b, id) {
  for (let k = 0; k < b.nh; k++) if (b.hits[k] === id) return true;
  return false;
}

function updatePlayerBullets(dt) {
  const pb = G.pb;
  const items = G.enemies.items;
  const res = G.hash.results;
  const as = G.asteroids;
  for (let i = 0; i < pb.count; i++) {
    const b = pb.items[i];
    if (b.dead) continue;
    b.px = b.x; b.py = b.y;
    b.life -= dt;
    if ((b.life <= 0 || b.special) && b.by && b.by !== G.player) usePlayer(b.by);
    if (b.life <= 0) { endShot(b); continue; }
    if (b.special === 2) { b.zapT -= dt; if (b.zapT <= 0) { b.zapT = 0.12; stormZap(b); } }

    if (b.homing > 0) {
      // Seeker rounds pick a target every 0.1s (not every tick) and steer toward it in between.
      b.tgtT -= dt;
      let best = b.tgt && !b.tgt.dead && b.tgt.id === b.tgtId && b.tgt.ally <= 0 ? b.tgt : null;
      if (!best || b.tgtT <= 0) {
        b.tgtT = 0.1;
        const n = G.hash.query(b.x, b.y, 280);
        let bd = 280 * 280;
        best = null;
        for (let j = 0; j < n; j++) {
          const e = items[res[j]];
          if (e.dead || e.ally > 0) continue;
          const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (d2 < bd) { bd = d2; best = e; }
        }
        b.tgt = best; b.tgtId = best ? best.id : 0;
      }
      if (best) {
        const sp = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x);
        let d = want - cur;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        const step = b.homing * dt;
        const na = cur + (d > step ? step : d < -step ? -step : d);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }

    b.x += b.vx * dt; b.y += b.vy * dt;

    if (b.x < 0 || b.x > A.w || b.y < 0 || b.y > A.h) {
      if (b.bounces > 0) {
        if (b.x < 0 || b.x > A.w) b.vx = -b.vx;
        if (b.y < 0 || b.y > A.h) b.vy = -b.vy;
        b.x = clamp(b.x, 0, A.w); b.y = clamp(b.y, 0, A.h);
        b.bounces--;
        b.life += 0.2;
        fx.sparks(b.x, b.y, Math.atan2(b.vy, b.vx), 0.5, 3, P_CYAN, 220, 0.15);
      } else { b.x = clamp(b.x, 0, A.w); b.y = clamp(b.y, 0, A.h); endShot(b); continue; }
    }

    for (let k = 0; k < as.count; k++) {
      const a = as.items[k];
      if (a.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r * 0.9 + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      damageAsteroid(a, b.dmg);
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      fx.sparks(b.x, b.y, Math.atan2(dy, dx), 0.7, 3, P_VIOLET, 220, 0.18);
      if (b.bounces > 0) {
        const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
        b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny;
        b.x = a.x + nx * (rr + 1); b.y = a.y + ny * (rr + 1);
        b.bounces--;
      } else endShot(b);
      audio.play("clank", b.x, b.y, 0.35);
      break;
    }
    if (b.dead) continue;

    const n = G.hash.query(b.x, b.y, b.r + G.maxR);
    if (n && b.by && b.by !== G.player) usePlayer(b.by);
    for (let j = 0; j < n; j++) {
      const e = items[res[j]];
      if (e.dead || e.ally > 0 || e.spawnT > 0.15) continue;
      const er = e.r * e.scale;
      const dx = e.x - b.x, dy = e.y - b.y, rr = er + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (alreadyHit(b, e.id)) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dirx = b.vx / sp, diry = b.vy / sp;
      if (e.kind.blocks && e.kind.blocks(e, b.x, b.y)) {
        fx.sparks(b.x, b.y, Math.atan2(-diry, -dirx), 0.8, 5, P_AMBER, 320, 0.2);
        audio.play("clank", b.x, b.y, 0.5);
        if (b.bounces > 0) {
          const nx = -dx / (Math.sqrt(dx * dx + dy * dy) || 1), ny = -dy / (Math.sqrt(dx * dx + dy * dy) || 1);
          const vn = b.vx * nx + b.vy * ny;
          b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; b.bounces--;
          if (b.nh < 8) b.hits[b.nh++] = e.id;
          continue;
        }
        b.dead = true;
        break;
      }
      if (b.nh < 8) b.hits[b.nh++] = e.id;
      fx.sparks(b.x, b.y, Math.atan2(-diry, -dirx), 0.7, b.crit ? 6 : 3, b.crit ? P_AMBER : e.kind.pal, 300, 0.2);
      audio.play(b.crit ? "crit" : "hit", e.x, e.y, 0.55);
      if (damageEnemy(e, b.dmg, b.crit, dirx, diry, b.knock)) G.killMark = 0.18;
      G.hitMark = b.crit ? 0.16 : Math.max(G.hitMark, 0.1);
      if (b.chain) chainFrom(e, b);
      if (b.special) {
        // charged shots plough through robots (a little weaker each time) and burst on bosses
        if (b.special === 3 || e.boss) { endShot(b); break; }
        b.dmg *= 1 - BALANCE.charge.pierceLoss;
        continue;
      }
      if (b.explode) { endShot(b); break; }
      if (b.split) {
        b.split = false;
        const ang = Math.atan2(b.vy, b.vx);
        for (let k = -1; k <= 1; k += 2) {
          const c = firePlayerBullet(b.x, b.y, ang + k * 0.55, b.kind, 0.5);
          if (c) { c.split = false; c.hits[0] = e.id; c.nh = 1; c.life = b.life * 0.7; }
        }
      }
      if (b.pierce > 0) b.pierce--;
      else { b.dead = true; break; }
    }
  }
  pb.sweep();
}

function steerShot(b, tx, ty, step) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(ty - b.y, tx - b.x);
  let d = want - cur;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  const na = cur + (d > step ? step : d < -step ? -step : d);
  b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
}

// Per-player numbers the enemy-shot loop needs, gathered once a tick (no build switching per shot).
const ebInfo = [0, 1, 2, 3].map(() => ({ P: null, slowR2: 0, slowMul: 1, nOrb: 0, bulwark: false }));
function playerInfo() {
  const list = G.players;
  ebInfo.n = Math.min(4, list.length);
  for (let i = 0; i < ebInfo.n; i++) {
    const P = list[i], f = ebInfo[i];
    usePlayer(P);
    const s = G.stats;
    f.P = P; f.slowR2 = s.slowRadius * s.slowRadius; f.slowMul = s.slowMul; f.nOrb = P.dead ? 0 : s.orbitals; f.bulwark = !P.dead && hasEnvy("bulwark");
  }
  return ebInfo;
}
function nearestPlayer(x, y) {
  let best = null, bd = Infinity;
  for (let i = 0; i < G.players.length; i++) {
    const P = G.players[i];
    if (P.dead) continue;
    const d2 = (P.x - x) ** 2 + (P.y - y) ** 2;
    if (d2 < bd) { bd = d2; best = P; }
  }
  return best;
}

function updateEnemyBullets(dt) {
  const eb = G.eb;
  const as = G.asteroids;
  const info = playerInfo();
  const hurtR = playerHurtRadius();
  const k = dt * (G.freezeT > 0 ? 0.15 : 1);
  for (let i = 0; i < eb.count; i++) {
    const b = eb.items[i];
    if (b.dead) continue;
    b.px = b.x; b.py = b.y;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    let m = k;
    for (let q = 0; q < info.n; q++) {
      const f = info[q];
      if (f.slowR2 > 0 && !f.P.dead && (b.x - f.P.x) ** 2 + (b.y - f.P.y) ** 2 < f.slowR2) { m *= f.slowMul; break; }
    }
    b.age += dt;
    if (b.hp > 0) {
      // Lust's kisses can be shot down
      const pb = G.pb;
      for (let j = 0; j < pb.count; j++) {
        const q = pb.items[j];
        if (q.dead) continue;
        const rr = b.r + q.r + 4;
        if ((q.x - b.x) ** 2 + (q.y - b.y) ** 2 > rr * rr) continue;
        b.dead = true;
        if (!q.special) { if (q.pierce > 0) q.pierce--; else q.dead = true; }
        fx.burst(b.x, b.y, 8, P_HEART, 160, 0.4, 1.3);
        fx.text(b.x, b.y - 10, "\u2661", C.magenta, 16, 0.6);
        audio.play("pop", b.x, b.y, 0.7);
        addScore(5);
        G.hitMark = Math.max(G.hitMark, 0.1);
        break;
      }
      if (b.dead) continue;
    }
    const near = b.turn > 0 ? nearestPlayer(b.x, b.y) : null;
    if (near && b.age < (b.home || 3)) {
      // Lust's kisses: curve gently toward the nearest of you (slow enough to outrun or boost through)
      steerShot(b, near.x, near.y, b.turn * dt);
    } else if (b.back > 0 && b.age > b.back) {
      // Greed's coins: fly out, then come home
      const o = b.owner;
      const hx = o && !o.dead ? o.x : b.homeX, hy = o && !o.dead ? o.y : b.homeY;
      steerShot(b, hx, hy, 5 * dt);
      if ((b.x - hx) ** 2 + (b.y - hy) ** 2 < 900) { b.dead = true; continue; }
    }
    b.x += b.vx * m; b.y += b.vy * m;
    if (b.x < -30 || b.x > A.w + 30 || b.y < -30 || b.y > A.h + 30) { b.dead = true; continue; }

    for (let j = 0; j < as.count; j++) {
      const a = as.items[j];
      if (a.dead) continue;
      const rr = a.r * 0.9 + b.r;
      if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 < rr * rr) {
        b.dead = true;
        fx.sparks(b.x, b.y, Math.atan2(b.y - a.y, b.x - a.x), 0.8, 3, P_DANGER, 200, 0.18);
        break;
      }
    }
    if (b.dead) continue;

    for (let q = 0; q < info.n && !b.dead; q++) {
      const f = info[q], P = f.P;
      if (P.dead) continue;
      const orb = P.orbPos;
      for (let o = 0; o < f.nOrb; o++) {
        const ox = orb[o * 2], oy = orb[o * 2 + 1];
        if ((b.x - ox) ** 2 + (b.y - oy) ** 2 < (b.r + 10) ** 2) {
          b.dead = true;
          fx.sparks(b.x, b.y, Math.atan2(b.y - oy, b.x - ox), 0.8, 4, P_CYAN, 220, 0.18);
          audio.play("clank", b.x, b.y, 0.4);
          break;
        }
      }
      if (b.dead) break;
      const dx = b.x - P.x, dy = b.y - P.y;
      const d2 = dx * dx + dy * dy;
      if (f.bulwark && d2 < 44 * 44) {
        const ang = Math.atan2(dy, dx);
        let diff = ang - P.aimAng;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        if (Math.abs(diff) < ENVY_POWERS.bulwark.arc) {
          b.dead = true;
          fx.sparks(b.x, b.y, ang, 0.6, 4, P_MINT, 220, 0.2);
          audio.play("clank", b.x, b.y, 0.4);
          break;
        }
      }
      if (d2 < (b.r + hurtR) ** 2) {
        usePlayer(P);
        if (hurtPlayer(b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05)) {
          b.dead = true;
          fx.burst(b.x, b.y, 6, P_DANGER, 160, 0.3, 1.2);
        }
      }
    }
  }
  eb.sweep();
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
function collect(q) {
  const P = G.player;
  if (q.kind === 2) {
    if (P.hp < P.maxHp || (P.maxShield > 0 && P.shield < P.maxShield)) {
      healPlayer(q.value, P.maxShield > 0);
      audio.play("heart", P.x, P.y);
      fx.burst(q.x, q.y, 10, P_HEART, 160, 0.6, 1.5);
      haptic(12);
    } else {
      addScore(50);
      fx.text(q.x, q.y - 14, "+50", C.heart, 13, 0.7);
      audio.play("star", q.x, q.y, 0.8, { pitch: 7 });
    }
    return;
  }
  G.stars += q.value;
  G.starsTotal += q.value;
  addScore(BALANCE.score.star * q.value);
  G.starChain = G.starChainT > 0 ? Math.min(12, G.starChain + 1) : 0;
  G.starChainT = 0.45;
  audio.play("star", q.x, q.y, 0.6, { pitch: G.starChain });
  fx.burst(q.x, q.y, 3, q.kind === 1 ? P_AMBER : P_CYAN, 90, 0.3, 1);
}

function updatePickups(dt) {
  const ps = G.pickups;
  const list = G.players;
  for (let i = 0; i < list.length; i++) { usePlayer(list[i]); list[i].mag = G.stats.magnet; }
  const pull = D.magnetPull;
  if (G.starChainT > 0) G.starChainT -= dt;
  for (let i = 0; i < ps.count; i++) {
    const q = ps.items[i];
    if (q.dead) continue;
    q.px = q.x; q.py = q.y;
    q.t += dt;
    q.life -= dt;
    if (q.life <= 0) { q.dead = true; continue; }
    const fr = 1 - Math.min(1, 3.5 * dt);
    q.vx *= fr; q.vy *= fr;
    const P = q.t > 0.25 ? nearestPlayer(q.x, q.y) : null;
    if (P) {
      const dx = P.x - q.x, dy = P.y - q.y;
      const d2 = dx * dx + dy * dy;
      const grab = P.r + 10;
      if (d2 < grab * grab) { q.dead = true; usePlayer(P); collect(q); continue; }
      if (q.pulled || d2 < P.mag * P.mag || G.vacuum) {
        q.pulled = true;
        const d = Math.sqrt(d2) || 1;
        const sp = G.vacuum ? pull * 1.8 : pull;
        q.vx += (dx / d) * sp * dt * 2.2; q.vy += (dy / d) * sp * dt * 2.2;
        const v = Math.hypot(q.vx, q.vy), max = G.vacuum ? 1100 : 650;
        if (v > max) { q.vx *= max / v; q.vy *= max / v; }
      }
    }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.x < 10) q.x = 10; else if (q.x > A.w - 10) q.x = A.w - 10;
    if (q.y < 10) q.y = 10; else if (q.y > A.h - 10) q.y = A.h - 10;
  }
  ps.sweep();
}

// ---------------------------------------------------------------------------
// Contact damage, orbitals, boost ram, sloth trail
// ---------------------------------------------------------------------------
function contacts(dt) {
  for (let i = 0; i < G.players.length; i++) {
    const P = G.players[i];
    if (P.dead) continue;
    usePlayer(P);
    contactsFor(P);
  }
}
function contactsFor(P) {
  const items = G.enemies.items, res = G.hash.results;
  const hurtR = playerHurtRadius();
  const s = G.stats;
  const n = G.hash.query(P.x, P.y, P.r + G.maxR + 4);
  for (let j = 0; j < n; j++) {
    const e = items[res[j]];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    const er = e.r * e.scale;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (P.boostT > 0 && s.boostRam && e.ramStamp !== P.boostSerial) {
      const rr = er + P.r + 6;
      if (dx * dx + dy * dy < rr * rr) {
        e.ramStamp = P.boostSerial;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        damageEnemy(e, s.boostRam * (1 + G.wave * 0.05), false, dx / d, dy / d, 380);
        fx.sparks(e.x, e.y, Math.atan2(dy, dx), 0.6, 6, P_CYAN, 320, 0.2);
        audio.play("hit", e.x, e.y, 0.8);
        continue;
      }
    }
    if (e.contact <= 0) continue;
    const rr = er * 0.82 + hurtR;
    if (dx * dx + dy * dy < rr * rr) hurtPlayer(e.contact, e.x, e.y);
  }

  // moons
  const nOrb = s.orbitals;
  if (nOrb) {
    const orb = P.orbPos;
    const dmg = BALANCE.upgrades.orbit.dmg * (1 + G.wave * 0.04) * (s.damage / BALANCE.player.gun.damage);
    for (let o = 0; o < nOrb; o++) {
      const ox = orb[o * 2], oy = orb[o * 2 + 1];
      const m = G.hash.query(ox, oy, 12 + G.maxR);
      for (let j = 0; j < m; j++) {
        const e = items[res[j]];
        if (e.dead || e.ally > 0 || e.orbCd > 0) continue;
        const rr = e.r * e.scale + 10;
        const dx = e.x - ox, dy = e.y - oy;
        if (dx * dx + dy * dy > rr * rr) continue;
        e.orbCd = 0.3;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        damageEnemy(e, dmg, false, dx / d, dy / d, 220);
        fx.sparks(ox, oy, Math.atan2(dy, dx), 0.8, 4, P_CYAN, 260, 0.2);
        audio.play("hit", ox, oy, 0.5);
      }
    }
  }
}

function updatePuddles(dt) {
  const pd = G.puddles;
  for (let i = 0; i < pd.count; i++) {
    const q = pd.items[i];
    q.life -= dt;
    if (q.life <= 0) q.dead = true;
  }
  pd.sweep();
}
export function addPuddle(x, y) {
  const q = G.puddles.get();
  if (!q) return;
  q.dead = false; q.x = x; q.y = y; q.r = 38; q.life = q.max = 2.6;
}
export function newBoostSerial() { return ++boostSerial; }

// ---------------------------------------------------------------------------
// One fixed step
// ---------------------------------------------------------------------------
export function stepWorld(dt) {
  G.time += dt;
  stopBank = Math.min(0.1, stopBank + dt * 0.04);
  if (G.freezeT > 0) G.freezeT -= dt;
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) G.combo = 0;
  }
  const list = G.players;
  for (let i = 0; i < list.length; i++) {
    const P = list[i];
    if (P.gone) continue;
    usePlayer(P);
    G.fxOwner = P.slot;          // co-op: effects this player's own screen already showed
    updatePlayer(dt, P);
    G.fxOwner = -1;
    P.slowMul = 1;             // bosses lower it again this tick if you're in an aura
    if (!P.dead) tickEnvy(dt);
  }
  usePlayer(G.me);
  waves.update(dt);
  updateEnemies(dt);           // also rebuilds the spatial hash
  contacts(dt);
  updatePlayerBullets(dt);
  updateEnemyBullets(dt);
  updateGear(dt);
  processBlasts();
  updateBossFx(dt);
  updatePickups(dt);
  updateAsteroids(dt);
  updatePuddles(dt);
  if (coop()) updateRevives(dt);
  G.enemies.sweep();
  usePlayer(G.me);
  if (G.state === "playing" || G.state === "clear") {
    // keep the rocks topped up
    if (G.asteroids.count < A.asteroids && Math.random() < dt * 0.25) spawnEdgeAsteroid(false);
  }
}

export function clearWorld() {
  G.enemies.clear(); G.pb.clear(); G.eb.clear(); G.pickups.clear();
  G.warnings.clear(); G.asteroids.clear(); G.puddles.clear(); G.blasts.clear(); G.mines.clear();
  fx.clear();
}

