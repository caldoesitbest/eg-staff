/* Upgrade cards: the seven sins (stacking paths) plus general cards.
   Stats are recomputed from levels whenever a card is taken. */

import { G, diff } from "./state.js";
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
    levels: ["Every 18 kills heals ½💜 (3 a wave)", "Every 14 kills (4 a wave)", "Every 11 kills (5 a wave). Overheal becomes a shield (2 max)", "Every 8 kills (6 a wave). Shield holds 4"] },
  { id: "greed", name: "Greed", kind: "sin", max: 4, img: emoji("greed"), color: C.amber,
    tag: "More stars, bigger pull",
    levels: ["+40% star drops, +60% magnet", "+80% drops, +120% magnet. 10% interest on banked stars each wave", "Stars are worth 2. 20% interest", "Jackpot: 5% of kills burst into a star shower. 25% interest"] },
  { id: "wrath", name: "Wrath", kind: "sin", max: 4, img: emoji("wrath"), color: C.red,
    tag: "Hit harder, shoot faster",
    levels: ["+15% damage, +10% fire rate", "+30% damage, +20% fire rate", "+45% damage, +30% fire rate", "+60% damage, +40% fire rate. Kills explode"] },
  { id: "pride", name: "Pride", kind: "sin", max: 4, img: emoji("pride"), color: C.violet2,
    tag: "Critical hits",
    levels: ["10% crit chance (2× damage)", "15% crit. Kill streak adds +1% crit per kill (up to +12%) until you're hit", "20% crit, crits deal 2.25×, streak up to +18%", "25% crit, crits deal 2.5× and pierce, streak up to +25%"] },
  { id: "sloth", name: "Sloth", kind: "sin", max: 4, img: emoji("sloth"), color: "#c9b8ff",
    tag: "Slow time around you",
    levels: ["Robots and shots near you move 22% slower", "Bigger field, 30% slower", "36% slower. Boosting leaves a sticky slowing trail", "Huge field, 42% slower. Perfect boosts freeze time"] },
  { id: "envy", name: "Envy", kind: "sin", max: 4, img: emoji("envy"), color: C.mint,
    tag: "Steal robot powers",
    levels: ["10% of kills steal that robot's power for 6s", "16% chance, 8s", "22% chance, 10s, hold 2 powers", "30% chance, 12s, hold 3 powers"] },
  { id: "lust", name: "Lust", kind: "sin", max: 4, img: emoji("lust"), color: C.magenta,
    tag: "Seduce robots to your side",
    levels: ["5% of hits charm a robot for 4s (2 at once). It fights for you, then pops", "8% chance, 5s, 3 at once", "11% chance, 6s, 4 at once, bigger pop", "15% chance, 7s, 6 at once, huge pop"] },

  { id: "multishot", name: "Twin Barrel", kind: "gear", max: U.multishot.max, icon: "layers", color: C.cyan,
    levels: ["+1 projectile (they share the damage: +60% per extra)", "+1 projectile (3 total)", "+1 projectile (4 total)", "+1 projectile (5 total)"] },
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
  { id: "overcharge", name: "Overcharge", kind: "gear", max: U.overcharge.max, icon: "sparkle", color: C.amber,
    tag: "Charged shots (right-click)",
    levels: ["Charged shots +35% damage, charge 20% faster", "+70% damage, 35% faster", "+100% damage, 50% faster. Full charges burst twice as wide"] },
  { id: "capacitor", name: "Capacitor", kind: "gear", max: U.capacitor.max, icon: "hourglass", color: C.amber,
    tag: "Charged shots (right-click)",
    levels: ["Keep firing your gun while you charge", "Perfect boosts fully charge your next shot"] },
];
export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

const lvl = (id) => G.up[id] || 0;
const at = (arr, id) => (lvl(id) ? arr[lvl(id) - 1] : 0);

const I = BALANCE.items;
const it = (id) => (G.items && G.items[id]) || 0;

export function computeStats() {
  const B = BALANCE.player, D = BALANCE.drops, T = BALANCE.gunTiers, CH = BALANCE.charge;
  const s = G.stats || {};
  const slot = (G.guns && (G.guns[G.gunSlot] || G.guns[0])) || { id: "blaster", tier: 1 };
  const gun = BALANCE.guns[slot.id] || BALANCE.guns.blaster;
  const tier = Math.max(0, Math.min(3, slot.tier - 1));
  s.gunId = slot.id;
  s.gunTier = tier + 1;
  s.gun = gun;
  const dmgBonus = 1 + at(U.wrath.damage, "wrath") + it("hollow") * I.hollow.dmg + it("glass") * I.glass.dmg;
  s.baseDamage = B.gun.damage * dmgBonus;           // without the gun's own multiplier (drones, thorns, mines)
  s.damage = s.baseDamage * gun.dmg * T.dmg[tier];
  s.rate = B.gun.rate * gun.rate * T.rate[tier] * (1 + at(U.wrath.rate, "wrath") + it("battery") * I.battery.rate);
  s.projectiles = gun.pellets + lvl("multishot");
  s.multiDmg = (gun.pellets + U.multishot.extra * lvl("multishot")) / s.projectiles;   // extra barrels share the damage
  s.fan = gun.fan;
  s.spread = gun.spread;
  s.knock = B.gun.knock * gun.knock;
  s.pierce = lvl("pierce") + (gun.pierce || 0);
  s.bulletSpeed = B.gun.speed * gun.speed * (1 + U.velocity.speed * lvl("velocity"));
  s.bulletLife = B.gun.life * gun.life * (1 + U.velocity.range * lvl("velocity") + it("scope") * I.scope.range);
  s.bounces = lvl("ricochet");
  s.cardHoming = lvl("homing") ? U.homing.turn[lvl("homing") - 1] : 0;
  s.homing = s.cardHoming + (gun.homing || 0);
  s.explode = gun.explode || 0;
  s.splash = gun.splash || 0;
  s.chain = gun.chain || 0;
  s.chainRange = gun.chainRange || 0;
  s.chainDmg = gun.chainDmg || 0;
  s.rear = lvl("rear") > 0;
  s.crit = at(U.pride.crit, "pride") + it("scope") * I.scope.crit;
  s.critMul = lvl("pride") ? U.pride.critMul[lvl("pride") - 1] : 2;
  s.streakPer = at(U.pride.streak, "pride");
  s.streakCap = at(U.pride.streakCap, "pride");
  s.critPierce = lvl("pride") >= 4;
  s.moveSpeed = B.speed * (1 + U.thrusters.speed * lvl("thrusters"));
  s.boostSpeed = B.boost.speed * (1 + U.boost.distance * Math.min(2, lvl("boost")));
  s.boostCd = B.boost.cooldown * (1 - U.boost.cooldown * Math.min(2, lvl("boost"))) * (1 - it("fuel") * I.fuel.boostCd);
  s.boostRam = lvl("boost") >= 3 ? U.boost.ramDmg : 0;
  s.magnet = D.magnet * (1 + at(U.greed.magnet, "greed") + it("magnet") * I.magnet.magnet);
  s.starMul = 1 + at(U.greed.drops, "greed");
  s.starValue = lvl("greed") ? U.greed.value[lvl("greed") - 1] : 1;
  s.interest = at(U.greed.interest, "greed");
  s.jackpot = lvl("greed") >= 4 ? U.greed.jackpot : 0;
  s.feast = at(U.gluttony.feast, "gluttony");
  s.feastCap = at(U.gluttony.cap, "gluttony");
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
  s.lustMost = at(U.lust.most, "lust");
  s.orbitals = lvl("orbit");
  s.maxHp = Math.max(2, B.hp + U.suit.hp * lvl("suit") + it("nanoweave") * I.nanoweave.hp + it("glass") * I.glass.hp);
  // charged shot
  s.chargeTime = CH.time / (1 + at(U.overcharge.speed, "overcharge")) * (1 - it("coolant") * I.coolant.chargeTime);
  s.chargeMul = (1 + at(U.overcharge.dmg, "overcharge")) * (1 + it("capbank") * I.capbank.chargeDmg);
  s.chargeWide = lvl("overcharge") >= 3;
  s.chargeFire = lvl("capacitor") >= 1;
  s.perfectCharge = lvl("capacitor") >= 2;
  s.chargeTwice = it("overdrive") > 0;
  // gear
  s.thorns = it("thorns");
  s.mines = it("mines");
  s.turrets = it("turret");
  s.fang = it("fang") ? I.fang.every[it("fang") - 1] : 0;
  s.bubble = it("bubble") > 0;
  s.cards = it("clover") ? 4 : 3;
  G.stats = s;
  return s;
}

/** Rough damage per second your build can put on one big target (used to size boss fights). */
export function estimateDps() {
  const s = G.stats;
  const hit = s.damage * (1 + s.crit * (s.critMul - 1));
  let dps = hit * s.rate * Math.min(s.projectiles * s.multiDmg, 3.5) * 0.8;     // not every shot of a wide fan lands
  if (s.wrathBoom) dps *= 1.15;
  if (s.explode) dps *= 1 + s.splash * 0.3;
  dps += s.turrets * BALANCE.items.turret.rate * BALANCE.items.turret.dmg * s.baseDamage;
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
export function offerCards(n = (G.stats && G.stats.cards) || 3) {
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

  if (s.feast && (P.feastN || 0) < s.feastCap) {
    P.feast++;
    if (P.feast >= Math.ceil(s.feast / diff().heal)) {
      P.feast = 0;
      P.feastN = (P.feastN || 0) + 1;
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

/** How many robots this player has charmed right now (Lust holds only so many at once). */
function charmed(P) {
  let n = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && o.ally > 0 && o.allyBy === P) n++; }
  return n;
}

export function onHit(e) {
  const s = G.stats;
  if (s.lustChance && !e.boss && e.type !== "gem" && e.type !== "decoy" && e.ally <= 0 && !e.dead && chance(s.lustChance) && charmed(G.player) < s.lustMost) {
    e.ally = s.lustTime;
    e.allyBy = G.player;
    e.allyMax = s.lustTime;
    e.state = 0; e.t = 0;
    fx.text(e.x, e.y - e.r - 8, "♥", C.magenta, 20, 0.8);
    fx.burst(e.x, e.y, 8, P_HEART, 140, 0.6, 1.4);
    audio.play("charm", e.x, e.y);
  }
}

export function onWaveEnd() {
  const s = G.stats;
  let gain = 0;
  if (s.interest > 0 && G.stars > 0) gain += Math.min(U.greed.interestCap, Math.floor(G.stars * s.interest));
  if (it("piggy") && G.stars > 0) gain += Math.min(I.piggy.cap, Math.floor(G.stars * I.piggy.interest));
  if (gain > 0) {
    G.stars += gain;
    G.emit("interest", gain);
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
