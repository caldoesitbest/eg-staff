/* Elite mutations: rarer than overcharged elites (never both on one robot), and each one changes how you
   fight that robot. Volatile bursts where it dies, Berserker snaps at half health, Armored is plated in
   front, Shockwave sends out rings, Phantom blinks to your side, Vampiric heals off your pain, Replicator
   copies itself. Each telegraphs what it's about to do, and none of them run while a robot is charmed. */

import { G, diff } from "./state.js";
import { BALANCE } from "./balance.js";
import { rand, randRange, chance, rng } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { P_WHITE } from "./sprites.js";
import { addZone, Z } from "./zones.js";

const MU = BALANCE.mutations;
export const MUT_IDS = Object.keys(MU.types);                 // id 1.. = index + 1
export const M = Object.fromEntries(MUT_IDS.map((k, i) => [k.toUpperCase(), i + 1]));
export const mutDef = (m) => MU.types[MUT_IDS[m - 1]] || null;
export const mutKey = (m) => MUT_IDS[m - 1] || "";

/** How many mutated robots are out right now (a few at a time at most). */
function mutatedAlive() {
  let n = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const e = items[i]; if (!e.dead && e.mut && e.ally <= 0) n++; }
  return n;
}

/** A mutation for a robot about to land (or 0). Rolled by waves.js as spawn markers land. */
export function rollMutation(type, wave) {
  const list = MU.on[type];
  if (!list || G.state === "menu") return 0;
  const shift = Math.floor((diff().mark || 0) / 2);
  const open = list.filter((k) => wave >= MU.types[k].from - shift);
  if (!open.length) return 0;
  const first = Math.min(...open.map((k) => MU.types[k].from)) - shift;
  const p = Math.min(MU.max, MU.chance + (wave - first) * MU.perWave) * Math.pow(diff().elite || 1, 0.6);
  if (!chance(p) || mutatedAlive() >= MU.maxAlive) return 0;
  let total = 0;
  for (const k of open) total += MU.types[k].weight;
  let r = rng() * total;
  for (const k of open) { r -= MU.types[k].weight; if (r <= 0) return M[k.toUpperCase()]; }
  return M[open[open.length - 1].toUpperCase()];
}

/** A robot just spawned with a mutation (enemies/index.js spawnEnemy). */
export function mutate(e, m) {
  e.mut = m;
  e.maxHp *= MU.hp; e.hp = e.maxHp;
  e.score *= MU.score; e.stars *= MU.stars;
  e.mutT = 0; e.mutN = 0; e.mutHeal = 0; e.phased = false; e.berserk = false;
  const d = mutDef(m);
  fx.text(e.x, e.y - e.r - 16, d.name.toUpperCase(), d.col, 13, 1.6);       // you always know what just landed
  if (m === M.SHOCKWAVE) e.mutCd = randRange(d.every) * 0.6;
  else if (m === M.PHANTOM) e.mutCd = randRange(d.every) * 0.7;
  else e.mutCd = 0;
  G.emit("mutSpawn", e);
}

// ---------------------------------------------------------------------------
// every step (enemies/index.js, the robot's target player's build live)
// ---------------------------------------------------------------------------
/** True while the robot is busy with its mutation (Phantom phasing: it skips its normal update). */
export function mutBusy(e) { return e.phased; }

export function mutTick(e, dt, P) {
  const m = e.mut;
  const d = mutDef(m);
  if (m === M.BERSERKER) {
    if (!e.berserk && e.hp < e.maxHp * d.at) {
      e.berserk = true;
      e.speed *= d.speed;
      e.haste *= d.attack;
      fx.ring(e.x, e.y, e.r, e.r * 3.2, 0.4, d.col, 4);
      fx.text(e.x, e.y - e.r - 12, "BERSERK", d.col, 15, 0.9);
      fx.burst(e.x, e.y, 10, 8, 220, 0.5, 1.5);
      audio.play("charge", e.x, e.y, 0.8);
    }
    if (e.berserk && Math.random() < dt * 8) fx.p(0, e.x + rand(-e.r, e.r) * 0.6, e.y - e.r * 0.4, rand(-20, 20), -70, 0.4, 1.4, P_WHITE, 3);
  } else if (m === M.SHOCKWAVE) {
    if (e.mutT > 0) {
      // winding up: it glows brighter until the ring goes out
      e.mutT -= dt;
      if (e.mutT <= 0) {
        const z = addZone(Z.SHOCK, e.x, e.y, d.reach, (d.reach - e.r) / d.speed);
        if (z) { z.r0 = e.r * e.scale; z.k = d.dmg; z.col = d.col; z.pal = 0; z.src = "shockwave"; }
        fx.ring(e.x, e.y, e.r, e.r * 1.8, 0.2, "#ffffff", 3);
        audio.play("zap", e.x, e.y, 0.7);
        e.mutCd = randRange(d.every);
      }
    } else {
      e.mutCd -= dt;
      const near = P && (P.x - e.x) ** 2 + (P.y - e.y) ** 2 < 640 * 640;
      if (e.mutCd <= 0 && near) { e.mutT = d.windup; audio.play("warn", e.x, e.y, 0.5); }
    }
  } else if (m === M.PHANTOM) {
    if (e.phased) {
      // slipping through the dark toward its new spot
      e.mutT -= dt;
      const k = Math.min(1, 9 * dt);
      e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
      e.vx = e.vy = 0;
      if (Math.random() < 0.6) fx.p(0, e.x + rand(-8, 8), e.y + rand(-8, 8), 0, 0, 0.3, 1.6, 1, 0);
      if (e.mutT <= 0) {
        e.phased = false;
        e.mutCd = randRange(d.every);
        fx.ring(e.x, e.y, e.r * 2.6, e.r, 0.25, d.col, 3);
        audio.play("swap", e.x, e.y, 0.5);
      }
    } else if (e.mutN === 1) {
      // the shimmer: you can see it's about to go
      e.mutT -= dt;
      if (e.mutT <= 0) {
        e.mutN = 0;
        e.phased = true;
        e.mutT = d.phase;
        // reappear at your side: swing round you, about as far away as it was
        const ang = Math.atan2(e.y - P.y, e.x - P.x) + (Math.random() < 0.5 ? 1 : -1) * rand(1.0, 1.9);
        const dist = Math.max(140, Math.min(420, Math.hypot(e.x - P.x, e.y - P.y))) * rand(0.8, 1);
        const A = BALANCE.arena;
        e.tx = Math.max(40, Math.min(A.w - 40, P.x + Math.cos(ang) * dist));
        e.ty = Math.max(40, Math.min(A.h - 40, P.y + Math.sin(ang) * dist));
      }
    } else {
      e.mutCd -= dt;
      if (e.mutCd <= 0 && P) { e.mutN = 1; e.mutT = d.shimmer; }
    }
  }
}

// ---------------------------------------------------------------------------
// damage, hurting you, death
// ---------------------------------------------------------------------------
/** Armored: a hit from the front glances off, a hit from behind finds the weak spot. dirX/dirY: the shot's direction. */
export function armorMul(e, dirX, dirY) {
  if (!dirX && !dirY) return 1;
  const d = MU.types.armored;
  const fx2 = Math.cos(e.ang), fy2 = Math.sin(e.ang);
  const dot = dirX * fx2 + dirY * fy2;                 // shot travelling the way it faces = from behind
  if (dot < -Math.cos(d.frontArc)) return d.front;
  if (dot > Math.cos(d.backArc)) return d.back;
  return 1;
}

/** Replicator: true when a hit took it past its next health threshold (it copies itself, twice at most). */
export function replicateAt(e) {
  const d = MU.types.replicator;
  if (e.mutN >= d.at.length || e.hp > e.maxHp * d.at[e.mutN]) return false;
  e.mutN++;
  return true;
}

/** Vampiric: it hurt you, so it heals (capped across its life). */
export function vampHeal(e, P) {
  if (!e || e.dead || e.mut !== M.VAMPIRIC) return;
  const d = MU.types.vampiric;
  const room = e.maxHp * d.healCap - e.mutHeal;
  if (room <= 0) return;
  const h = Math.min(room, e.maxHp * d.heal, e.maxHp - e.hp);
  if (h <= 0) return;
  e.hp += h; e.mutHeal += h;
  fx.bolt(P.x, P.y, e.x, e.y, d.col);
  fx.text(e.x, e.y - e.r - 10, "+" + Math.round(h), d.col, 13, 0.7);
  fx.burst(e.x, e.y, 6, 8, 120, 0.4, 1.3);
}

/** Volatile: where it dies, a ring fills and then bursts, hurting you and other robots (not bosses). */
export function volatileDeath(e, hpMul) {
  const d = MU.types.volatile;
  const z = addZone(Z.DELAY, e.x, e.y, d.r, d.fuse);
  if (!z) return;
  z.dmg = d.robotDmg * hpMul; z.y2 = d.dmg; z.col = d.col; z.pal = 7; z.big = true; z.src = "volatile mutant"; z.by = null;
  audio.play("warn", e.x, e.y, 0.8);
}

/** How far along a telegraph is (0..1): a Shockwave winding up, a Phantom's shimmer. Co-op clients get it from the host. */
export function mutVis(e) {
  if (G.net.role === "client") return e.mutVisNet || 0;
  if (e.mut === M.SHOCKWAVE && e.mutT > 0) return 1 - e.mutT / MU.types.shockwave.windup;
  if (e.mut === M.PHANTOM && e.mutN === 1) return 1 - e.mutT / MU.types.phantom.shimmer;
  return 0;
}

/** The first time you meet each mutation: what to do about it. */
export function mutHint(m) { const d = mutDef(m); return d ? d.name + ": " + d.hint : ""; }

