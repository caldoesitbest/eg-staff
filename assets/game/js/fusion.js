/* Sin Fusions: two sins taken to level 3 unlock a fusion card that makes them work together.
   One fusion per run (a second in endless). Each one is bounded: stack caps, per-wave caps,
   cooldowns, and nothing it spawns can feed it again. The cards live in upgrades.js (kind "fusion");
   this file is what they do, called from the kill, pickup, heal, shot and charm code. */

import { G, usePlayer } from "./state.js";
import { BALANCE } from "./balance.js";
import { TAU, rand } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { C, SIN, P_AMBER, P_WHITE, P_HEART } from "./sprites.js";
import { dropPickup, healPlayer, queueBlast, firePlayerBullet, damageEnemy } from "./world.js";

const F = BALANCE.fusions;
const SIN_OF = { gluttony: "glutton", greed: "greed", wrath: "wrath", pride: "pride", sloth: "sloth", envy: "envy", lust: "lust" };
/** A fusion's colours: its two sins' homepage colours. */
export const fusionCols = (id) => [SIN[SIN_OF[F[id].a]], SIN[SIN_OF[F[id].b]]];
export const FUSION_IDS = ["covetous", "bloodlust", "feast", "judgment", "frenzy", "parasite", "stolen"];

/** Does this player have this fusion? (computeStats keeps P.fusions up to date.) */
const has = (P, id) => !!(P && P.fusions && P.fusions.indexOf(id) !== -1);

/** The little HUD chip pulses whenever your fusion does something. */
function pulse(P) { if (P === G.me) G.emit("fusionPulse"); }

// ---------------------------------------------------------------------------
// taking it
// ---------------------------------------------------------------------------
/** The activation moment: both sins' colours collide on you. */
export function fusionActivated(P, id, name) {
  const [c1, c2] = fusionCols(id);
  fx.ring(P.x, P.y, 140, 10, 0.45, c1, 5);
  fx.ring(P.x, P.y, 10, 170, 0.6, c2, 5);
  fx.ring(P.x, P.y, 20, 240, 0.8, "#ffffff", 2);
  fx.burst(P.x, P.y, 36, P_WHITE, 380, 0.9, 2.2);
  fx.text(P.x, P.y - 48, "SIN FUSION: " + name.toUpperCase(), c1, 20, 1.8);
  if (P === G.me) fx.screenFlash(c2, 0.25, 2.5);
  audio.play("fusion", P.x, P.y);
}

// ---------------------------------------------------------------------------
// per player, every step
// ---------------------------------------------------------------------------
export function fusionTick(P, dt) {
  if (P.judgeT > 0) P.judgeT -= dt;
  if (!has(P, "frenzy")) return;
  const D = F.frenzy;
  if (P.goldT > 0) {
    P.goldT -= dt;
    if (P.goldT <= 0) P.goldCd = D.burst.cd;
  } else if (P.goldCd > 0) P.goldCd -= dt;
  if (P.frenzy > 0) {
    P.frenzyIdle += dt;
    if (P.frenzyIdle > D.idle) P.frenzy = Math.max(0, P.frenzy - D.decay * dt);
  }
}
/** Per-wave caps reset (main.js, each wave). */
export function fusionWave(P) { P.leechN = 0; P.leechS = 0; P.leech = 0; }

// ---------------------------------------------------------------------------
// your shots
// ---------------------------------------------------------------------------
/** Damage multiplier on your shots right now (Golden Frenzy). */
export function fusionDmg(P) {
  if (!has(P, "frenzy")) return 1;
  return (1 + P.frenzy * F.frenzy.per) * (P.goldT > 0 ? 1 + F.frenzy.burst.dmg : 1);
}
/** Fire-rate multiplier right now (Golden Frenzy). */
export function fusionRate(P) { return has(P, "frenzy") ? 1 + P.frenzy * F.frenzy.per : 1; }

/** A shot leaving your gun (world.firePlayerBullet, after the crit roll): gorged crits, Judgment. */
export function fusionShot(P, b, s) {
  if (has(P, "judgment") && P.judging) {
    // Judgment: a guaranteed, piercing crit
    if (!b.crit) { b.crit = true; b.dmg *= s.critMul; b.r *= 1.25; }
    b.dmg *= F.judgment.critMul;
    b.pierce += 99;
    b.kind = 1;
    return;
  }
  if (b.crit && has(P, "feast") && P.gorge > 0) {
    P.gorge--;
    b.dmg *= 1 + F.feast.gorge;
    b.gorged = true;
    pulse(P);
  }
}
/** Before a trigger pull: a readied Judgment goes into this volley. */
export function fusionBeforeFire(P) { P.judging = P.judgeT > 0 && has(P, "judgment"); }
export function fusionAfterFire(P) {
  if (!P.judging) return;
  P.judging = false;
  P.judgeT = 0;
  fx.text(P.x, P.y - 40, "JUDGMENT", "#bfe9ff", 16, 0.8);
  audio.play("crit", P.x, P.y);
  pulse(P);
}

/** One of your shots hit a robot (the shooter's build is live). */
export function fusionHit(P, b, e) {
  if (b.gorged && !e.dead) {
    b.gorged = false;
    queueBlast(e.x, e.y, F.feast.blast, b.dmg * 0.5, true, false, 0, SIN.glutton, P_HEART);
    audio.play("chomp", e.x, e.y, 0.8);
  }
  if (has(P, "judgment") && b.crit && e.slowMul < 0.99 && e.shatterCd <= 0 && !b.kin) shatter(e, b.dmg);
  if (has(P, "stolen") && P.envy.length && !e.boss) chill(e, F.stolen.chill, F.stolen.slow);
}

/** Frozen Judgment: a crit on a slowed robot breaks the ice around it. */
function shatter(e, dmg) {
  const D = F.judgment.shatter;
  e.shatterCd = D.cd;
  const n = G.hash.query(e.x, e.y, D.r + G.maxR);
  const res = G.hash.results, items = G.enemies.items;
  for (let j = 0; j < n; j++) {
    const o = items[res[j]];
    if (o.dead || o.ally > 0 || o.passive || o === e) continue;
    const rr = D.r + o.r * o.scale;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > rr * rr) continue;
    damageEnemy(o, dmg * D.dmg, false, 0, 0, 0);
    if (!o.boss) chill(o, D.chill, D.slow);
  }
  if (!e.boss) chill(e, D.chill, D.slow);
  fx.ring(e.x, e.y, 8, D.r, 0.3, "#bfe9ff", 3);
  fx.debris(e.x, e.y, 8, "#dff4ff", 260);
  fx.sparks(e.x, e.y, 0, Math.PI, 8, P_WHITE, 320, 0.2);
  audio.play("clank", e.x, e.y, 0.8);
  pulse(G.player);
}
/** Slows a robot for a while (Frozen Judgment's frost, Stolen Time). The strongest slow wins. */
export function chill(e, time, slow) {
  if (e.chill <= 0 || slow < e.chillMul) e.chillMul = slow;
  if (time > e.chill) e.chill = time;
}

// ---------------------------------------------------------------------------
// kills, pickups, heals, perfect boosts
// ---------------------------------------------------------------------------
/** A robot you killed (upgrades.onKill: your build is live). crit: was the killing blow a crit. */
export function fusionKill(P, e, crit) {
  if (has(P, "covetous") && P.envy.length && !e.boss && e.type !== "gem") {
    for (let i = 0; i < F.covetous.stars; i++) dropPickup(3, e.x, e.y, G.stats.starValue);
    pulse(P);
  }
  if (has(P, "frenzy") && P.goldT > 0 && !e.boss) {
    queueBlast(e.x, e.y, F.frenzy.burst.blast, G.stats.damage * F.frenzy.burst.blastDmg, true, false, 0, C.amber, P_AMBER);
  }
  return has(P, "feast") && crit ? F.feast.critFeast : 1;      // how many kills this counts as for Gluttony
}
/** Gluttony's heals per wave, with Immortal Feast. */
export const feastCapBonus = (P) => (has(P, "feast") ? F.feast.capBonus : 0);

/** You grabbed a star (world.collect). kind 3: a Covetous King star. */
export function fusionStar(P, kind) {
  if (kind === 3 && has(P, "covetous")) {
    const D = F.covetous;
    let any = false;
    for (const p of P.envy) {
      const room = p.max * D.extendCap - (p.ext || 0);
      if (room <= 0) continue;
      const add = Math.min(D.extend, room);
      p.ext = (p.ext || 0) + add;
      p.t = Math.min(p.max, p.t + add);
      any = true;
    }
    if (any) { fx.ring(P.x, P.y, 12, 34, 0.2, C.mint, 2); pulse(P); }
  }
  if (has(P, "frenzy")) {
    const D = F.frenzy;
    P.frenzy = Math.min(D.cap, P.frenzy + 1);
    P.frenzyIdle = 0;
    if (P.frenzy >= D.cap && P.goldT <= 0 && P.goldCd <= 0) {
      P.goldT = D.burst.time;
      P.frenzy = 0;
      fx.text(P.x, P.y - 44, "GOLDEN FRENZY", C.amber, 20, 1.2);
      fx.ring(P.x, P.y, 10, 150, 0.5, C.amber, 5);
      if (P === G.me) fx.screenFlash("#ffd45c", 0.18, 3);
      audio.play("newBest", P.x, P.y, 0.7);
      pulse(P);
    }
  }
}

/** A heal that found you already full (world.healPlayer): Immortal Feast stores it as a gorge. */
export function fusionOverheal(P) {
  if (!has(P, "feast") || P.gorge >= F.feast.gorgeMax) return false;
  P.gorge++;
  fx.text(P.x, P.y - 36, "GORGED", SIN.glutton, 14, 0.9);
  audio.play("chomp", P.x, P.y, 0.7);
  pulse(P);
  return true;
}

/** A perfect boost (world.perfectBoost): Judgment readies, Stolen Time stretches your powers. */
export function fusionPerfect(P) {
  if (has(P, "judgment")) {
    P.judgeT = F.judgment.ready;
    fx.ring(P.x, P.y, 30, 12, 0.3, "#bfe9ff", 3);
    pulse(P);
  }
  if (has(P, "stolen") && P.envy.length) {
    const D = F.stolen;
    let any = false;
    for (const p of P.envy) {
      if ((p.pext || 0) >= D.extends) continue;
      p.pext = (p.pext || 0) + 1;
      p.t = Math.min(p.max, p.t + D.perfect);
      any = true;
    }
    if (any) { fx.text(P.x, P.y - 52, "TIME STOLEN +" + D.perfect + "s", C.mint, 14, 0.9); fx.ring(P.x, P.y, 50, 14, 0.35, C.mint, 3); G.emit("envy"); pulse(P); }
  }
}

// ---------------------------------------------------------------------------
// charmed robots (enemies/index.js)
// ---------------------------------------------------------------------------
/** How vicious a charmed robot has grown (Bloodlust): 0 → rampCap. */
export function bloodRamp(e) {
  const P = e.allyBy;
  if (!has(P, "bloodlust")) return 0;
  return Math.min(F.bloodlust.rampCap, (e.allyMax - e.ally) * F.bloodlust.ramp);
}
/** A charmed robot landed a hit (Parasitic Heart). */
export function allyHit(e) {
  const P = e.allyBy;
  if (!has(P, "parasite") || P.dead) return;
  const D = F.parasite;
  P.leech = (P.leech || 0) + 1;
  if (P.leech >= D.per && (P.leechN || 0) < D.heals) {
    P.leech = 0;
    P.leechN = (P.leechN || 0) + 1;
    const cur = G.player;
    usePlayer(P);
    healPlayer(1, false);
    fx.bolt(e.x, e.y, P.x, P.y, SIN.lust);
    usePlayer(cur);
    pulse(P);
  }
}
/** A charm ran out (enemies/index.js popAlly; the owner's build is live). Returns the blast multipliers. */
export function allyPop(e) {
  const P = e.allyBy;
  if (has(P, "parasite") && (P.leechS || 0) < F.parasite.shields && P.maxShield > 0 && P.shield < P.maxShield && !P.dead) {
    P.leechS = (P.leechS || 0) + 1;
    P.shield = Math.min(P.maxShield, P.shield + 1);
    fx.text(P.x, P.y - 34, "+SHIELD", C.cyan, 13, 0.8);
    pulse(P);
  }
  if (!has(P, "bloodlust")) return null;
  // the blood nova: a bigger blast and a ring of shots
  const D = F.bloodlust;
  const off = rand(0, TAU), dmg = 22 + G.wave * 3;
  for (let i = 0; i < D.ring; i++) {
    const b = firePlayerBullet(e.x, e.y, off + (i / D.ring) * TAU, 1, 1, dmg * D.ringDmg);
    if (b) { b.kin = 1; b.life = 0.45; b.pierce = 1; }
  }
  fx.ring(e.x, e.y, 6, 110, 0.35, C.red, 4);
  pulse(P);
  return D;
}

/** Fusion state on a fresh player (createPlayer). */
export function fusionReset(P) {
  P.fusions = []; P.gorge = 0; P.judgeT = 0; P.judging = false;
  P.frenzy = 0; P.frenzyIdle = 0; P.goldT = 0; P.goldCd = 0;
  P.leech = 0; P.leechN = 0; P.leechS = 0;
}

