/* Weapon evolutions. A gun at Tier IV evolves once the next sin boss falls, down one of two paths
   (balance.evolution has the numbers). This file is what each path does in a fight: hooks the shot,
   hit, charged-shot and kill code calls. Every effect here is capped (stacks, counts, cooldowns, the
   zone pool), and shots an evolution spawns ("kin" shots) never trigger evolution effects themselves,
   so nothing can feed itself into a loop. */

import { G, usePlayer } from "./state.js";
import { BALANCE } from "./balance.js";
import { TAU, rand, angDiff } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { C, PAL, P_WHITE } from "./sprites.js";
import { damageEnemy, queueBlast, firePlayerBullet, hitStop, trackHit } from "./world.js";
import { addZone, zoneCount, oldestZone, strike, Z } from "./zones.js";

const EV = BALANCE.evolution;
const GT = BALANCE.gunTiers;

// Evolution codes (shots carry one: b.ev). Order: each gun's path A, then B.
export const E = {
  STAR: 1, PHANTOM: 2, SUPERNOVA: 3, SHRED: 4, OVERDRIVE: 5, TOXIN: 6, ANNIHILATOR: 7, SINGULARITY: 8,
  CATACLYSM: 9, WELL: 10, THUNDER: 11, TEMPEST: 12, MOON: 13, SOUL: 14,
};
export const EVO_LIST = [null];        // code → { code, gun, path, key, def }
for (const gun of Object.keys(EV)) for (const path of ["a", "b"]) {
  const code = EVO_LIST.length;
  EVO_LIST.push({ code, gun, path, key: gun + "_" + path, def: EV[gun][path] });
}
export const evoCode = (gun, path) => (path && EV[gun] && EV[gun][path] ? Object.keys(EV).indexOf(gun) * 2 + (path === "a" ? 1 : 2) : 0);
export const evoDef = (code) => (EVO_LIST[code] ? EVO_LIST[code].def : null);
/** Palette index for an evolution's colour (particles, glow dots); added to the palette by sprites.js. */
export const evoPal = (code) => { const d = evoDef(code); const i = d ? PAL.indexOf(d.col) : -1; return i >= 0 ? i : 0; };

/** What each path says on its card (and the stat line on the gun). */
export const EVO_TEXT = {
  blaster_a: ["+1 pierce. A bolt that pierces a robot leaves a burning trail behind it.", "Charged: the orb implodes, dragging robots in, then bursts."],
  blaster_b: ["Hits in a row raise your fire rate (up to +45%). Missing halves the streak.", "Every 5th hit fires a homing spectral bolt."],
  scatter_a: ["Pellets that land at point-blank range burst in a blast.", "Charged: a cone shockwave that flattens robots and erases their shots."],
  scatter_b: ["Each pellet ricochets once to the nearest robot. +10% crit.", "Crits throw 3 fragments at nearby robots."],
  smg_a: ["Sustained fire fills a meter. Full: 3.5s of overdrive (x1.8 fire rate, tighter, +1 pierce).", "Then it overheats for a moment. Charged bursts top up the meter."],
  smg_b: ["Hits stack corruption on a robot (up to 8). It burns, and pulses damage into robots around it.", "Charged bolts add 2 stacks."],
  rail_a: ["Charged: every robot the beam passes takes 25% more than the last. Pierce 5 to annihilate.", "Bolts: +1 pierce, and each robot pierced makes the bolt hit harder."],
  rail_b: ["Charged: the beam's path pulls robots onto it, then fires (x1.35). Line them up.", "Bolts: +1 pierce, and tug robots near the hit toward it."],
  nova_a: ["Every grenade burst throws 3 bomblets.", "Charged: a ring of 8 blasts goes off at once, then a huge core blast."],
  nova_b: ["Bursts leave a gravity well that pulls robots in. Robots inside take 25% more damage.", "Charged: one huge well."],
  arc_a: ["+1 chain jump, and each jump hits 25% harder than the last. +8% crit.", "Crits fork the lightning into 2 more jumps."],
  arc_b: ["Lightning strikes the nearest robot every 1.5s while you hold it.", "Charged: the storm orb leaves a storm that strikes robots inside for 4s."],
  heart_a: ["Darts mark robots for 4s. A marked robot that dies looses 3 blood darts.", "Charged hearts mark too."],
  heart_b: ["Darts hunt the most dangerous robots first. Hits in a row make them track harder and fly faster.", "Charged: 10 hearts, each bound to a different dangerous target."],
};

// ---------------------------------------------------------------------------
// stats (computeStats calls this for the gun in hand)
// ---------------------------------------------------------------------------
export function evoStats(s, code) {
  s.ev = code;
  if (!code) return;
  if (code === E.STAR) s.pierce += EV.blaster.a.pierce;
  if (code === E.SHRED) s.crit += EV.scatter.b.crit;
  if (code === E.ANNIHILATOR) s.pierce += EV.rail.a.boltPierce;
  if (code === E.SINGULARITY) s.pierce += EV.rail.b.boltPierce;
  if (code === E.THUNDER) { s.chain += EV.arc.a.chain; s.crit += EV.arc.a.crit; }
}

// ---------------------------------------------------------------------------
// accuracy: a "volley" is one pull of the trigger; it misses if none of its shots hit a robot
// (Phantom Repeater and Soulbound streaks, the Dead Eye achievement)
// ---------------------------------------------------------------------------
const volLeft = new Int16Array(256), volHit = new Uint8Array(256), volBy = new Array(256);
let volNext = 1;
export function newVolley(P, shots) {
  if (P === G.me) G.waveShots = (G.waveShots || 0) + 1;
  const v = volNext;
  volNext = volNext >= 255 ? 1 : volNext + 1;
  volLeft[v] = shots; volHit[v] = 0; volBy[v] = P;
  return v;
}
export function volleyHit(v) { if (v) volHit[v] = 1; }
/** A player shot is gone (world.js, before the pool sweeps it). */
export function shotGone(b) {
  if (b.kin === 2 && b.by) b.by.bloodN = Math.max(0, (b.by.bloodN || 0) - 1);
  const v = b.vol;
  if (!v) return;
  b.vol = 0;
  if (--volLeft[v] > 0) return;
  const P = volBy[v];
  volBy[v] = null;
  if (volHit[v] || !P) return;
  // a clean miss
  if (P === G.me && G.state === "playing") G.waveMisses = (G.waveMisses || 0) + 1;
  if (P.rep) P.rep = Math.floor(P.rep / 2);
  if (P.soul) P.soul = Math.floor(P.soul / 2);
}

// ---------------------------------------------------------------------------
// firing
// ---------------------------------------------------------------------------
/** Fire-rate multiplier from the evolution (Phantom streak, Overdrive / overheat). */
export function evoRate(P, s) {
  if (s.ev === E.PHANTOM) return 1 + (P.rep || 0) * EV.blaster.b.perHit;
  if (s.ev === E.OVERDRIVE) return P.odT > 0 ? EV.smg.a.rate : P.heat > 0 ? EV.smg.a.heatRate : 1;
  return 1;
}
export function evoSpread(P, s) { return s.ev === E.OVERDRIVE && P.odT > 0 ? EV.smg.a.spread : 1; }

/** After each trigger pull: the Overdrive meter fills. */
export function evoFired(P, s) {
  if (s.ev !== E.OVERDRIVE) return;
  P.odIdle = 0;
  if (P.odT > 0 || P.heat > 0) return;
  P.od = (P.od || 0) + 1;
  if (P.od >= EV.smg.a.fill) startOverdrive(P);
}
function startOverdrive(P) {
  P.od = 0;
  P.odT = EV.smg.a.time;
  fx.text(P.x, P.y - 42, "OVERDRIVE", EV.smg.a.col, 18, 1);
  fx.ring(P.x, P.y, 10, 90, 0.35, EV.smg.a.col, 4);
  audio.play("evoBurst", P.x, P.y);
}
/** A shot from an evolved gun, as it leaves the barrel. */
export function evoShot(P, s, b) {
  if (s.ev === E.OVERDRIVE && P.odT > 0) b.pierce += 1;
  if (s.ev === E.SOUL && P.soul) {
    const k = P.soul;
    b.homing *= 1 + k * EV.heart.b.perHit;
    const sp = 1 + k * EV.heart.b.speed;
    b.vx *= sp; b.vy *= sp;
  }
}

/** Per player, every step: streaks fade, Overdrive runs down, Tempest's static field strikes. */
export function evoTick(P, s, dt) {
  if (P.rep) { P.repIdle = (P.repIdle || 0) + dt; if (P.repIdle > EV.blaster.b.idle) P.rep = Math.max(0, P.rep - EV.blaster.b.decay * dt); }
  if (P.soul) { P.soulIdle = (P.soulIdle || 0) + dt; if (P.soulIdle > EV.heart.b.idle) P.soul = Math.max(0, P.soul - 4 * dt); }
  if (P.odT > 0) {
    P.odT -= dt;
    if (P.odT <= 0) { P.heat = EV.smg.a.heat; fx.text(P.x, P.y - 40, "OVERHEAT", "#ff9b6b", 14, 0.8); audio.play("fizzle", P.x, P.y); }
  } else if (P.heat > 0) P.heat -= dt;
  else if (P.od > 0) { P.odIdle = (P.odIdle || 0) + dt; if (P.odIdle > EV.smg.a.idle) P.od = Math.max(0, P.od - EV.smg.a.drain * dt); }
  if (s.ev === E.TEMPEST && G.state === "playing" && G.net.role !== "client" && !P.dead) {
    P.staticT = (P.staticT || 0) - dt;
    if (P.staticT <= 0) {
      const S = EV.arc.b.static;
      const e = nearestHostile(P.x, P.y, S.range);
      P.staticT = e ? S.every : 0.25;
      if (e) {
        strike(e.x, e.y, EV.arc.b.col);
        const dmg = s.damage * S.dmg;
        if (P === G.me) trackHit(dmg, "arc");
        damageEnemy(e, dmg, false, 0, 0, 0);
        audio.play("zap", e.x, e.y, 0.5);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// charged shots: true when the evolution fired its own version
// ---------------------------------------------------------------------------
export function evoCharged(P, s, amt, ang, dmg, mx, my, k) {
  const ev = s.ev;
  if (ev === E.OVERDRIVE && P.odT <= 0 && P.heat <= 0) {
    P.od = (P.od || 0) + EV.smg.a.fill * EV.smg.a.chargeFill;
    if (P.od >= EV.smg.a.fill) startOverdrive(P);
    return false;
  }
  if (G.net.role === "client") return false;       // the host fires the real thing
  if (ev === E.SUPERNOVA) {
    const W = EV.scatter.a.wave;
    const z = addZone(Z.WAVE, mx, my, W.r * (0.6 + 0.4 * k) * (s.chargeWide ? 1.25 : 1), W.time);
    if (z) {
      z.a = ang; z.r0 = W.arc; z.dmg = dmg * W.dmg; z.y2 = W.knock; z.x2 = 0;
      z.col = EV.scatter.a.col; z.pal = evoPal(ev);
    }
    audio.play("shotgun", P.x, P.y);
    audio.play("evoBurst", P.x, P.y, 0.8);
    return true;
  }
  if (ev === E.SINGULARITY) {
    const S = EV.rail.b;
    const z = addZone(Z.PULL, mx, my, S.pull.width, S.pull.time);
    if (z) {
      z.a = ang; z.x2 = 1500; z.y2 = 14 + 16 * k + (s.chargeWide ? 10 : 0); z.n = S.pull.force;
      z.dmg = dmg * 1.15 * S.near; z.col = S.col; z.pal = evoPal(ev);
    }
    audio.play("evoCharge", P.x, P.y);
    return true;
  }
  if (ev === E.SOUL) {
    // a swarm of hearts, each bound to a different dangerous robot
    const S = EV.heart.b;
    const targets = threatList(P.x, P.y, 900, S.swarm);
    const per = (dmg * 1.5) / S.swarm;
    for (let i = 0; i < S.swarm; i++) {
      const a = ang - 0.75 + (1.5 * i) / (S.swarm - 1) + rand(-0.04, 0.04);
      const b = firePlayerBullet(mx, my, a, undefined, 1);
      if (!b) break;
      b.dmg = per * (b.crit ? s.critMul : 1);
      b.pierce += 1; b.r *= 1.4; b.life *= 1.5; b.homing = S.swarmHoming;
      const t = targets.length ? targets[i % targets.length] : null;
      if (t) { b.tgt = t; b.tgtId = t.id; b.lock = true; }
    }
    audio.play("kissShot", P.x, P.y);
    audio.play("chargeShot", P.x, P.y, 0.6);
    return true;
  }
  return false;
}

/** A charged orb / cluster / storm orb from an evolved gun, as it leaves the barrel. */
export function evoOrb(s, b) {
  if (s.ev === E.STAR && b.amt >= EV.blaster.a.implode.min) b.life = EV.blaster.a.implode.life;   // implodes where you can see it
  if (s.ev === E.TEMPEST) b.life = EV.arc.b.storm.orbLife;                                         // so does the storm
}

/** Robots worth chasing first: elites, mutants, bosses and the shooters, then the rest by distance. */
function threatScore(e, x, y) {
  let w = 1;
  if (e.boss || e.elite || e.mut) w = 0.3;
  else if (e.type === "sniper" || e.type === "patch" || e.type === "gunner") w = 0.5;
  return ((e.x - x) ** 2 + (e.y - y) ** 2) * w;
}
function threatList(x, y, range, n) {
  const out = [];
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1 || e.passive) continue;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 > range * range) continue;
    out.push(e);
  }
  out.sort((a, b) => threatScore(a, x, y) - threatScore(b, x, y));
  return out.slice(0, n);
}
/** Soulbound darts pick targets by threat, not just distance (world.js homing). */
export function soulTarget(b, n) {
  const items = G.enemies.items, res = G.hash.results;
  let best = null, bs = Infinity;
  for (let j = 0; j < n; j++) {
    const e = items[res[j]];
    if (e.dead || e.ally > 0 || e.passive) continue;
    const sc = threatScore(e, b.x, b.y);
    if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}

function nearestHostile(x, y, range) {
  const n = G.hash.query(x, y, range + G.maxR);
  const res = G.hash.results, items = G.enemies.items;
  let best = null, bd = range * range;
  for (let j = 0; j < n; j++) {
    const e = items[res[j]];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1 || e.passive || e.phased) continue;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}
function nearestOther(x, y, range, b, not) {
  const n = G.hash.query(x, y, range + G.maxR);
  const res = G.hash.results, items = G.enemies.items;
  let best = null, bd = range * range;
  for (let j = 0; j < n; j++) {
    const e = items[res[j]];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1 || e === not || e.passive || e.phased) continue;
    if (b) { let seen = false; for (let k = 0; k < b.nh; k++) if (b.hits[k] === e.id) { seen = true; break; } if (seen) continue; }
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// hits
// ---------------------------------------------------------------------------
/** A shot from an evolved gun hit a robot (world.js; the shooter's build is live). */
export function evoHit(b, e, killed) {
  const ev = b.ev;
  const P = G.player, s = G.stats;
  switch (ev) {
    case E.STAR:
      if (!b.special) b.trail = true;          // from here on it burns a trail
      break;
    case E.PHANTOM: {
      const D = EV.blaster.b;
      P.rep = Math.min(D.cap, (P.rep || 0) + 1);
      P.repIdle = 0;
      P.repN = (P.repN || 0) + 1;
      if (P.repN % D.ghostEvery === 0 && G.net.role !== "client") {
        const t = killed ? nearestOther(e.x, e.y, 600, null, e) : e;
        const ang = t ? Math.atan2(t.y - P.y, t.x - P.x) : P.aimAng;
        const g = firePlayerBullet(P.x, P.y, ang, KIND.ghost, 1, s.damage * D.ghost);
        if (g) { g.kin = 1; g.homing = D.ghostHoming; g.pierce = 1; g.life *= 1.3; g.gun = "blaster"; if (t) { g.tgt = t; g.tgtId = t.id; } }
        fx.ring(P.x, P.y, 8, 30, 0.2, D.col, 2);
      }
      break;
    }
    case E.SUPERNOVA: {
      const D = EV.scatter.a;
      if (!b.special && b.life0 - b.life < D.close && e.boomCd <= 0) {
        e.boomCd = D.boom.cd;
        queueBlast(e.x, e.y, D.boom.r, b.dmg * D.boom.dmg, true, false, 0, D.col, evoPal(ev));
      }
      break;
    }
    case E.SHRED:
      if (b.crit && !b.frag) {
        const D = EV.scatter.b.frag;
        const n = G.hash.query(e.x, e.y, D.range + G.maxR);
        const res = G.hash.results, items = G.enemies.items;
        let made = 0;
        for (let j = 0; j < n && made < D.n; j++) {
          const o = items[res[j]];
          if (o.dead || o === e || o.ally > 0 || o.passive || o.phased) continue;
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > D.range * D.range) continue;
          const f = firePlayerBullet(e.x, e.y, Math.atan2(o.y - e.y, o.x - e.x), KIND.frag, 1, b.dmg * D.dmg);
          if (!f) break;
          f.kin = 1; f.frag = true; f.gun = "scatter"; f.hits[0] = e.id; f.nh = 1; f.life = 0.35;
          made++;
        }
        if (made) fx.sparks(e.x, e.y, 0, Math.PI, 6, evoPal(ev), 360, 0.2);
      }
      break;
    case E.TOXIN: {
      const D = EV.smg.b;
      e.tox = Math.min(D.max, e.tox + (b.special ? D.charged : 1));
      e.toxT = D.time;
      e.toxBy = P;
      e.toxDmg = s.damage;
      break;
    }
    case E.ANNIHILATOR:
      if (!b.special) b.dmg *= 1 + EV.rail.a.boltRamp;
      break;
    case E.SINGULARITY:
      if (!b.special) {
        const D = EV.rail.b.snag;
        const n = G.hash.query(e.x, e.y, D.r + G.maxR);
        const res = G.hash.results, items = G.enemies.items;
        for (let j = 0; j < n; j++) {
          const o = items[res[j]];
          if (o.dead || o === e || o.boss || o.ally > 0 || o.passive || o.type === "gem") continue;
          const dx = e.x - o.x, dy = e.y - o.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > D.r || d < 10) continue;
          o.kx += (dx / d) * D.force / Math.sqrt(o.mass || 1); o.ky += (dy / d) * D.force / Math.sqrt(o.mass || 1);
        }
        fx.ring(e.x, e.y, D.r, 12, 0.22, EV.rail.b.col, 2);
      }
      break;
    case E.MOON:
      e.moon = EV.heart.a.mark;
      e.moonBy = P;
      break;
    case E.SOUL:
      P.soul = Math.min(EV.heart.b.cap, (P.soul || 0) + 1);
      P.soulIdle = 0;
      break;
  }
}

/** Shredder: a pellet that would stop ricochets once toward the nearest robot it hasn't hit. */
export function evoRicochet(b, e) {
  const D = EV.scatter.b.bounce;
  const t = nearestOther(e.x, e.y, D.range, b, e);
  if (!t) return false;
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const a = Math.atan2(t.y - b.y, t.x - b.x);
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  b.dmg *= D.dmg;
  b.bounced = true;
  b.life = Math.max(b.life, 0.3);
  fx.sparks(b.x, b.y, a, 0.4, 3, evoPal(E.SHRED), 300, 0.15);
  return true;
}

/** Thunderlord: each jump of the chain hits harder than the last. */
export const chainRamp = (b, j) => (b.ev === E.THUNDER ? Math.pow(EV.arc.a.ramp, j) : 1);

/** Annihilator: the k-th robot on the beam's line takes this much (k from 0). */
export const beamRamp = (k) => Math.min(EV.rail.a.rampCap, Math.pow(EV.rail.a.ramp, k));
/** Annihilator: the beam pierced enough to annihilate. */
export function annihilate(hits, x, y, x2, y2, dmg) {
  const D = EV.rail.a;
  for (const e of hits) queueBlast(e.x, e.y, D.impact.r, dmg * D.impact.dmg, true, false, 0, D.col, evoPal(E.ANNIHILATOR));
  fx.beam(x, y, x2, y2, 40, D.col, 0.55);
  fx.text((x + x2) / 2, (y + y2) / 2 - 30, "ANNIHILATED", D.col, 20, 1.1);
  fx.screenFlash(D.col, 0.2, 3);
  fx.shake(0.6);
  hitStop(0.06, true);
  audio.play("bigExplode", x, y, 0.8);
  audio.impact();
}

// ---------------------------------------------------------------------------
// when a shot ends: true when the evolution replaced the gun's own ending
// ---------------------------------------------------------------------------
export function evoEnd(b) {
  const ev = b.ev;
  if (b.kin) return false;
  if (ev === E.STAR && b.special === 1 && b.amt >= EV.blaster.a.implode.min) {
    const D = EV.blaster.a.implode;
    const wide = G.stats.chargeWide ? 1.4 : 1;
    const z = addZone(Z.IMPLODE, b.x, b.y, D.r * wide, D.time);
    if (z) {
      z.n = D.force; z.x2 = D.blast * wide; z.dmg = b.dmg0 * D.dmg * (b.full ? 1 : 0.7);
      z.col = EV.blaster.a.col; z.pal = evoPal(ev);
    }
    audio.play("evoCharge", b.x, b.y);
    return true;
  }
  if (ev === E.CATACLYSM && b.special === 3) {
    // a ring of blasts that go off together, then the core
    const D = EV.nova.a.cluster;
    for (let k = 0; k < D.n; k++) {
      const a = (k / D.n) * TAU;
      const z = addZone(Z.DELAY, b.x + Math.cos(a) * D.ring, b.y + Math.sin(a) * D.ring, 58, D.delay);
      if (z) { z.dmg = b.dmg * 0.4; z.col = EV.nova.a.col; z.pal = evoPal(ev); }
    }
    const core = addZone(Z.DELAY, b.x, b.y, D.final, D.finalDelay);
    if (core) { core.dmg = b.dmg * D.dmg; core.col = EV.nova.a.col; core.pal = evoPal(ev); core.big = true; }
    fx.ring(b.x, b.y, 10, D.ring, 0.3, EV.nova.a.col, 3);
    audio.play("launch", b.x, b.y);
    return true;
  }
  if (ev === E.WELL && b.special === 3) {
    const D = EV.nova.b.big;
    const z = addZone(Z.WELL, b.x, b.y, D.r, D.life);
    if (z) { z.n = D.force; z.dmg = EV.nova.b.vulnTime; z.big = true; z.col = EV.nova.b.col; z.pal = evoPal(ev); }
    audio.play("evoCharge", b.x, b.y);
    return false;                // the cluster still bursts (into the well)
  }
  if (ev === E.TEMPEST && b.special === 2) {
    const D = EV.arc.b.storm;
    const P = b.by || G.player;
    if (zoneCount(Z.STORM, P) >= D.max) { const old = oldestZone(Z.STORM, P); if (old) old.dead = true; }
    const z = addZone(Z.STORM, b.x, b.y, D.r, D.life);
    if (z) { z.k = D.every; z.dmg = b.dmg0 * D.dmg; z.tick = 0.1; z.col = EV.arc.b.col; z.pal = evoPal(ev); }
    audio.play("evoCharge", b.x, b.y);
    return false;
  }
  if (b.explode && !b.special) {
    if (ev === E.CATACLYSM) {
      const D = EV.nova.a;
      for (let k = 0; k < D.bomblets; k++) {
        const c = firePlayerBullet(b.x, b.y, rand(0, TAU), KIND.bomblet, 1, b.dmg * D.bomb.dmg);
        if (!c) break;
        c.kin = 1; c.explode = D.bomb.r; c.explodeDmg = c.dmg; c.life = rand(D.bomb.life[0], D.bomb.life[1]);
        c.vx *= 0.32; c.vy *= 0.32; c.pierce = 0; c.homing = 0; c.gun = "nova";
      }
    } else if (ev === E.WELL) {
      const D = EV.nova.b.well;
      const P = b.by || G.player;
      if (zoneCount(Z.WELL, P) < D.max) {
        const z = addZone(Z.WELL, b.x, b.y, D.r, D.life);
        if (z) { z.n = D.force; z.dmg = EV.nova.b.vulnTime; z.col = EV.nova.b.col; z.pal = evoPal(ev); }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// robots: Neurotoxin pulses, timers; Blood Moon on death
// ---------------------------------------------------------------------------
/** Every robot, every step (cheap unless something's on it). */
export function evoRobot(e, dt) {
  if (e.trailCd > 0) e.trailCd -= dt;
  if (e.boomCd > 0) e.boomCd -= dt;
  if (e.vuln > 0) e.vuln -= dt;
  if (e.moon > 0) e.moon -= dt;
  if (e.shatterCd > 0) e.shatterCd -= dt;
  if (e.chill > 0) { e.chill -= dt; if (e.chill <= 0) e.chillMul = 1; }
  if (e.tox > 0) {
    e.toxT -= dt;
    if (e.toxT <= 0) { e.tox = 0; e.toxTick = 0; return; }
    e.toxTick += dt;
    if (e.toxTick >= EV.smg.b.every) { e.toxTick -= EV.smg.b.every; toxPulse(e); }
  }
}
function toxPulse(e) {
  const D = EV.smg.b, by = e.toxBy;
  if (!by || G.net.role === "client") return;
  const cur = G.player;
  usePlayer(by);
  const R = D.pulse.r + D.pulse.perStack * e.tox;
  const pulse = e.toxDmg * D.pulse.dmg * e.tox;
  const n = G.hash.query(e.x, e.y, R + G.maxR);
  const res = G.hash.results, items = G.enemies.items;
  const pal = evoPal(E.TOXIN);
  for (let j = 0; j < n; j++) {
    const o = items[res[j]];
    if (o.dead || o === e || o.ally > 0 || o.passive || o.phased) continue;
    const rr = R + o.r * o.scale;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > rr * rr) continue;
    damageEnemy(o, o.boss ? pulse * 0.5 : pulse, false, 0, 0, 0);
  }
  fx.ring(e.x, e.y, e.r * e.scale, R, 0.3, D.col, 2);
  fx.burst(e.x, e.y, 3, pal, 80, 0.4, 1.2);
  damageEnemy(e, e.toxDmg * D.dot * e.tox, false, 0, 0, 0);
  usePlayer(cur);
}

/** A robot died: Blood Moon's mark looses darts (killEnemy calls this). */
export function evoKill(e) {
  if (e.moon <= 0 || !e.moonBy || G.net.role === "client") return;
  const D = EV.heart.a, P = e.moonBy;
  e.moon = 0;
  if (P.dead || (P.bloodN || 0) >= D.maxDarts) return;
  const cur = G.player;
  usePlayer(P);
  const s = G.stats;
  const heart = BALANCE.guns.heart;
  const dmg = s.baseDamage * heart.dmg * GT.dmg[3] * D.dartDmg;
  const off = rand(0, TAU);
  for (let k = 0; k < D.darts && (P.bloodN || 0) < D.maxDarts; k++) {
    const b = firePlayerBullet(e.x, e.y, off + (k / D.darts) * TAU, KIND.blood, 1, dmg);
    if (!b) break;
    b.kin = 2; b.homing = 6.5; b.life = 1.2; b.gun = "heart"; b.pierce = 0;
    P.bloodN = (P.bloodN || 0) + 1;
  }
  fx.burst(e.x, e.y, 8, evoPal(E.MOON), 200, 0.5, 1.5);
  usePlayer(cur);
}

// ---------------------------------------------------------------------------
// shot looks (sprites.js builds them at these indexes)
// ---------------------------------------------------------------------------
export const KIND = { ghost: 24, blood: 25, frag: 26, bomblet: 27 };
/** Sprite index for an evolved gun's normal shots (10 + code - 1). */
export const evoShotKind = (code) => 9 + code;

/** Picks the evolution card's two paths for a gun. */
export function evoChoices(gun) {
  const out = [];
  for (const path of ["a", "b"]) {
    const code = evoCode(gun, path), d = EV[gun][path];
    out.push({ code, gun, path, name: d.name, col: d.col, tag: d.tag, lines: EVO_TEXT[gun + "_" + path] });
  }
  return out;
}

export const evoName = (code) => (EVO_LIST[code] ? EVO_LIST[code].def.name : "");
export const evoCol = (code) => (EVO_LIST[code] ? EVO_LIST[code].def.col : C.cyan);
export { angDiff, P_WHITE };
