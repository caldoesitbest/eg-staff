/* Upgrade cards: the seven sins (stacking paths) plus general cards.
   Stats are recomputed from levels whenever a card is taken. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { rng, chance } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { C, P_MAGENTA, P_HEART, P_MINT, P_GREEN } from "./sprites.js";
import { queueBlast, dropPickup, healPlayer } from "./world.js";

const U = BALANCE.upgrades;
const emoji = (name) => "/assets/home/emoji/" + name + ".webp";

/* Each card: id, name, kind ("sin" | "gear"), max level, art, colour, and the text for every level. */
export const CARDS = [
  { id: "gluttony", name: "Gluttony", kind: "sin", max: 4, img: emoji("gluttony"), color: C.magenta,
    tag: "Kills feed you",
    levels: ["Every 14 kills heals ½💜", "Every 10 kills heals ½💜", "Every 7 kills heals. Overheal becomes a shield (2 max)", "Every 5 kills heals. Shield holds 4"] },
  { id: "greed", name: "Greed", kind: "sin", max: 4, img: emoji("greed"), color: C.amber,
    tag: "More stars, bigger pull",
    levels: ["+40% star drops, +60% magnet", "+80% drops, +120% magnet. 10% interest on banked stars each wave", "Stars are worth 2. 20% interest", "Jackpot: 5% of kills burst into a star shower. 25% interest"] },
  { id: "wrath", name: "Wrath", kind: "sin", max: 4, img: emoji("wrath"), color: C.red,
    tag: "Hit harder, shoot faster",
    levels: ["+15% damage, +12% fire rate", "+30% damage, +24% fire rate", "+45% damage, +36% fire rate", "+60% damage, +48% fire rate. Kills explode"] },
  { id: "pride", name: "Pride", kind: "sin", max: 4, img: emoji("pride"), color: C.violet2,
    tag: "Critical hits",
    levels: ["10% crit chance (2× damage)", "15% crit. Kill streak adds +1% crit per kill until you're hit", "20% crit, crits deal 2.5×, streak up to +40%", "25% crit, crits deal 3× and pierce"] },
  { id: "sloth", name: "Sloth", kind: "sin", max: 4, img: emoji("sloth"), color: "#c9b8ff",
    tag: "Slow time around you",
    levels: ["Robots and shots near you move 25% slower", "Bigger field, 35% slower", "Boosting leaves a sticky slowing trail", "Huge field, 50% slower. Perfect boosts freeze time"] },
  { id: "envy", name: "Envy", kind: "sin", max: 4, img: emoji("envy"), color: C.mint,
    tag: "Steal robot powers",
    levels: ["10% of kills steal that robot's power for 6s", "16% chance, 8s", "22% chance, 10s, hold 2 powers", "30% chance, 12s, hold 3 powers"] },
  { id: "lust", name: "Lust", kind: "sin", max: 4, img: emoji("lust"), color: C.magenta,
    tag: "Seduce robots to your side",
    levels: ["5% of hits charm a robot for 4s. It fights for you, then pops", "8% chance, 5s", "11% chance, 6s, bigger pop", "15% chance, 7s, huge pop"] },

  { id: "multishot", name: "Twin Barrel", kind: "gear", max: U.multishot.max, icon: "layers", color: C.cyan,
    levels: ["+1 projectile", "+1 projectile (3 total)", "+1 projectile (4 total)", "+1 projectile (5 total)"] },
  { id: "pierce", name: "Piercing Rounds", kind: "gear", max: U.pierce.max, icon: "arrow-right", color: C.cyan,
    levels: ["Shots pass through 1 robot", "Pass through 2", "Pass through 3"] },
  { id: "boost", name: "Big Boost", kind: "gear", max: U.boost.max, icon: "zap", color: C.cyan,
    levels: ["Boost goes 25% further, recharges 15% faster", "Further again, faster again", "Boosting through robots hurts them"] },
  { id: "suit", name: "Thick Suit", kind: "gear", max: U.suit.max, icon: "heart", color: C.heart,
    levels: ["+1 💜 max (and fills it)", "+1 💜 max", "+1 💜 max", "+1 💜 max"] },
  { id: "orbit", name: "Moons", kind: "gear", max: U.orbit.max, icon: "orbit", color: C.cyan,
    levels: ["A moon orbits you: hurts robots, blocks shots", "2 moons", "3 moons"] },
  { id: "velocity", name: "Velocity Rounds", kind: "gear", max: U.velocity.max, icon: "chevrons-up", color: C.cyan,
    levels: ["+25% shot speed, +20% range", "+50% speed, +40% range", "+75% speed, +60% range"] },
  { id: "ricochet", name: "Ricochet", kind: "gear", max: U.ricochet.max, icon: "refresh-cw", color: C.cyan,
    levels: ["Shots bounce off walls and rocks once", "Bounce twice"] },
  { id: "thrusters", name: "Thrusters", kind: "gear", max: U.thrusters.max, icon: "rocket", color: C.cyan,
    levels: ["+12% move speed", "+24% move speed", "+36% move speed"] },
  { id: "homing", name: "Seeker Rounds", kind: "gear", max: U.homing.max, icon: "radar", color: C.cyan,
    levels: ["Shots curve toward robots", "Stronger homing"] },
  { id: "rear", name: "Rear Guard", kind: "gear", max: U.rear.max, icon: "arrow-left", color: C.cyan,
    levels: ["Also fire one shot backwards"] },
];
export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

const lvl = (id) => G.up[id] || 0;
const at = (arr, id) => (lvl(id) ? arr[lvl(id) - 1] : 0);

export function computeStats() {
  const B = BALANCE.player, D = BALANCE.drops;
  const s = G.stats || {};
  s.damage = B.gun.damage * (1 + at(U.wrath.damage, "wrath"));
  s.rate = B.gun.rate * (1 + at(U.wrath.rate, "wrath"));
  s.projectiles = 1 + lvl("multishot");
  s.fan = B.gun.fan;
  s.pierce = lvl("pierce");
  s.bulletSpeed = B.gun.speed * (1 + U.velocity.speed * lvl("velocity"));
  s.bulletLife = B.gun.life * (1 + U.velocity.range * lvl("velocity"));
  s.bounces = lvl("ricochet");
  s.homing = lvl("homing") ? U.homing.turn[lvl("homing") - 1] : 0;
  s.rear = lvl("rear") > 0;
  s.crit = at(U.pride.crit, "pride");
  s.critMul = lvl("pride") ? U.pride.critMul[lvl("pride") - 1] : 2;
  s.streakPer = at(U.pride.streak, "pride");
  s.streakCap = at(U.pride.streakCap, "pride");
  s.critPierce = lvl("pride") >= 4;
  s.moveSpeed = B.speed * (1 + U.thrusters.speed * lvl("thrusters"));
  s.boostSpeed = B.boost.speed * (1 + U.boost.distance * Math.min(2, lvl("boost")));
  s.boostCd = B.boost.cooldown * (1 - U.boost.cooldown * Math.min(2, lvl("boost")));
  s.boostRam = lvl("boost") >= 3 ? U.boost.ramDmg : 0;
  s.magnet = D.magnet * (1 + at(U.greed.magnet, "greed"));
  s.starMul = 1 + at(U.greed.drops, "greed");
  s.starValue = lvl("greed") ? U.greed.value[lvl("greed") - 1] : 1;
  s.interest = at(U.greed.interest, "greed");
  s.jackpot = lvl("greed") >= 4 ? U.greed.jackpot : 0;
  s.feast = at(U.gluttony.feast, "gluttony");
  s.shieldCap = at(U.gluttony.shield, "gluttony");
  s.wrathBoom = lvl("wrath") >= 4;
  s.slowRadius = at(U.sloth.radius, "sloth");
  s.slowMul = lvl("sloth") ? U.sloth.slow[lvl("sloth") - 1] : 1;
  s.slothTrail = lvl("sloth") ? U.sloth.trail[lvl("sloth") - 1] : false;
  s.bulletTime = lvl("sloth") >= 4;
  s.envyChance = at(U.envy.chance, "envy");
  s.envyTime = at(U.envy.time, "envy");
  s.envySlots = at(U.envy.slots, "envy");
  s.lustChance = at(U.lust.chance, "lust");
  s.lustTime = at(U.lust.time, "lust");
  s.lustBurst = at(U.lust.burst, "lust");
  s.orbitals = lvl("orbit");
  s.maxHp = B.hp + U.suit.hp * lvl("suit");
  G.stats = s;
  return s;
}

/** Rough damage per second your build can put on one big target (used to size boss fights). */
export function estimateDps() {
  const s = G.stats;
  const hit = s.damage * (1 + s.crit * (s.critMul - 1));
  let dps = hit * s.rate * Math.min(s.projectiles, 3.5) * 0.8;     // not every shot of a wide fan lands
  if (s.wrathBoom) dps *= 1.15;
  dps += s.orbitals * BALANCE.upgrades.orbit.dmg * 2;
  return dps;
}

export function resetUpgrades() {
  G.up = {};
  computeStats();
}

/** Takes a card (or a level of it). Returns the new level. */
export function applyCard(id) {
  const card = CARD_BY_ID[id];
  if (!card) return 0;
  const before = G.stats ? G.stats.maxHp : BALANCE.player.hp;
  G.up[id] = Math.min(card.max, lvl(id) + 1);
  computeStats();
  const P = G.player;
  if (P) {
    const gained = G.stats.maxHp - before;
    P.maxHp = G.stats.maxHp;
    if (gained > 0) P.hp = Math.min(P.maxHp, P.hp + gained);
    P.maxShield = G.stats.shieldCap;
  }
  return G.up[id];
}

/** Three distinct cards. Paths you already started are a bit more likely, so builds come together. */
export function offerCards(n = 3) {
  const avail = CARDS.filter((c) => lvl(c.id) < c.max);
  const picks = [];
  const weight = (c) => {
    let w = c.kind === "sin" ? 1.05 : 0.9;
    if (lvl(c.id) > 0) w *= 1.4;
    if (c.id === "suit" && G.player && G.player.hp <= 2) w *= 1.6;
    return w;
  };
  // At least one sin in every hand while any are left.
  const sins = avail.filter((c) => c.kind === "sin");
  if (sins.length) picks.push(weightedPick(sins, weight));
  while (picks.length < n) {
    const left = avail.filter((c) => picks.indexOf(c) === -1);
    if (!left.length) break;
    picks.push(weightedPick(left, weight));
  }
  // Shuffle so the sin isn't always first.
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = picks[i]; picks[i] = picks[j]; picks[j] = t; }
  return picks.map((c) => c.id);
}

function weightedPick(list, wf) {
  let total = 0;
  for (const c of list) total += wf(c);
  let r = rng() * total;
  for (const c of list) { r -= wf(c); if (r <= 0) return c; }
  return list[list.length - 1];
}

/** A short line naming the build, for the game-over screen. */
export function buildSummary() {
  const owned = CARDS.filter((c) => lvl(c.id) > 0).sort((a, b) => lvl(b.id) - lvl(a.id));
  return owned.map((c) => ({ id: c.id, name: c.name, level: lvl(c.id), max: c.max, kind: c.kind, img: c.img, icon: c.icon, color: c.color }));
}

export function buildTitle() {
  const sins = CARDS.filter((c) => c.kind === "sin" && lvl(c.id) > 0).sort((a, b) => lvl(b.id) - lvl(a.id));
  if (!sins.length) return "Pure of heart";
  if (sins.length === 1) return "Disciple of " + sins[0].name;
  return sins[0].name + " × " + sins[1].name;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

const ENVY = BALANCE.envyPowers;

export function hasEnvy(type) {
  const list = G.player.envy;
  for (let i = 0; i < list.length; i++) if (list[i].type === type && list[i].t > 0) return true;
  return false;
}
export function hasSplitEnvy() { return hasEnvy("splitter") || hasEnvy("mini"); }

function steal(e) {
  const P = G.player;
  const s = G.stats;
  const type = e.type;
  if (!ENVY[type]) return;
  for (const p of P.envy) if (p.type === type || (ENVY[p.type] && ENVY[p.type].name === ENVY[type].name)) { p.t = s.envyTime; p.max = s.envyTime; return; }
  if (P.envy.length >= s.envySlots) P.envy.shift();
  P.envy.push({ type, t: s.envyTime, max: s.envyTime, tick: 0 });
  fx.text(P.x, P.y - 34, "STOLE " + ENVY[type].name.toUpperCase(), C.mint, 15, 1.2);
  fx.burst(e.x, e.y, 10, P_MINT, 200, 0.5, 1.4);
  audio.play("steal", e.x, e.y);
  G.emit("envy");
}

export function onKill(e) {
  const s = G.stats, P = G.player;
  if (!P || e.ally > 0) return;

  if (s.feast) {
    P.feast++;
    if (P.feast >= s.feast) {
      P.feast = 0;
      healPlayer(1, true);
      fx.burst(P.x, P.y, 6, P_MAGENTA, 120, 0.5, 1.2);
    }
  }
  if (s.streakPer && P.streak < s.streakCap / s.streakPer) P.streak++;

  if (s.wrathBoom) queueBlast(e.x, e.y, U.wrath.boomRadius, s.damage * U.wrath.boomDmg, true, false, 0, C.red, 8);

  if (s.jackpot && !e.boss && chance(s.jackpot)) {
    for (let i = 0; i < 8; i++) dropPickup(0, e.x, e.y, s.starValue);
    dropPickup(1, e.x, e.y, 5);
    fx.text(e.x, e.y - 20, "JACKPOT", C.amber, 16, 1);
    audio.play("newBest", e.x, e.y, 0.6);
  }

  if (s.envyChance && !e.boss && chance(s.envyChance)) steal(e);
}

export function onHit(e) {
  const s = G.stats;
  if (s.lustChance && !e.boss && e.type !== "gem" && e.ally <= 0 && !e.dead && chance(s.lustChance)) {
    e.ally = s.lustTime;
    e.allyMax = s.lustTime;
    e.state = 0; e.t = 0;
    fx.text(e.x, e.y - e.r - 8, "♥", C.magenta, 20, 0.8);
    fx.burst(e.x, e.y, 8, P_HEART, 140, 0.6, 1.4);
    audio.play("charm", e.x, e.y);
  }
}

export function onWaveEnd() {
  const s = G.stats;
  if (s.interest > 0 && G.stars > 0) {
    const gain = Math.min(U.greed.interestCap, Math.floor(G.stars * s.interest));
    if (gain > 0) {
      G.stars += gain;
      G.emit("interest", gain);
    }
  }
}

/** Envy powers tick (Repair heals over time). */
export function tickEnvy(dt) {
  const P = G.player;
  for (let i = P.envy.length - 1; i >= 0; i--) {
    const p = P.envy[i];
    p.t -= dt;
    if (p.type === "patch") {
      p.tick += dt;
      if (p.tick >= ENVY.patch.every) { p.tick = 0; healPlayer(1, false); fx.burst(P.x, P.y, 6, P_GREEN, 100, 0.5, 1.2); }
    }
    if (p.t <= 0) { P.envy.splice(i, 1); G.emit("envy"); }
  }
}

export const ENVY_POWERS = ENVY;
