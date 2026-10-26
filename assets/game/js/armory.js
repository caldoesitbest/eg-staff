/* The Armory: your two gun slots, the shop between waves and the gear you buy there.
   Brotato-style: four offers a wave, lock the ones you like, reroll, and buy a gun you already
   hold to raise its tier (I → IV). Also runs the gear that acts on its own (mines, buddy drones). */

import { G, usePlayer, diff } from "./state.js";
import { BALANCE } from "./balance.js";
import { rng, TAU } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { C, P_CYAN, P_ORANGE, P_MAGENTA } from "./sprites.js";
import { computeStats, applyCard, CARDS } from "./upgrades.js";
import { firePlayerBullet, queueBlast, healPlayer } from "./world.js";
import { evoCode, evoName, evoCol } from "./evolve.js";

const GUNS = BALANCE.guns, ITEMS = BALANCE.items, SH = BALANCE.shop, T = BALANCE.gunTiers;
// Corrupted relics (the Corrupted Armory event) are gear too, but the shop never sells them.
for (const id in BALANCE.relics) ITEMS[id] = { ...BALANCE.relics[id], r: 4, max: 1, price: 0, corrupt: true };
export const GUN_IDS = Object.keys(GUNS);
export const ITEM_IDS = Object.keys(ITEMS);
export const RARITY = [
  { name: "Common", col: "#c9d2f0" },
  { name: "Rare", col: "#63f4ff" },
  { name: "Epic", col: "#c86bff" },
  { name: "Legendary", col: "#ffc861" },
  { name: "Corrupted", col: "#ff2a55" },
];
export const TIER_NAMES = ["I", "II", "III", "IV"];
// Which shot sprite each gun fires (index into sprites.shots) and its colour + bullet size.
export const SHOT_KIND = { blaster: 0, scatter: 4, smg: 5, rail: 6, nova: 7, arc: 8, heart: 9 };
export const GUN_COL = { blaster: C.cyan, scatter: C.amber, smg: C.mint, rail: C.violet2, nova: C.orange, arc: C.blue, heart: "#ff6fb5" };
export const GUN_R = { blaster: 5, scatter: 4.2, smg: 4, rail: 4.5, nova: 7.5, arc: 5, heart: 6 };

// ---------------------------------------------------------------------------
// Art: gun silhouettes and gear icons (Lucide names where the site has one)
// ---------------------------------------------------------------------------
const GUN_SVG = {
  blaster: '<path d="M5 8h25l3-2h8v5h-8l-3 1H21l-3 8h-6l2-8H5z"/><rect x="41" y="7" width="3" height="3" rx="1"/>',
  scatter: '<path d="M3 9h30V7h11v3H33v1h11v3H33v-1H18l-3 7H9l2-7H3z"/>',
  smg: '<path d="M6 9h22l2-2h12v4H31v2h-6l-2 8h-5l1-8h-4l-1 3h-4l1-3H6z"/>',
  rail: '<path d="M2 10h12l2-3h16l2 2h12v4H34l-2 2H16l-2-3H2z"/><rect x="18" y="9" width="12" height="2" fill="#fff" opacity=".7"/>',
  nova: '<path d="M4 7h28a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4H22l-2 5h-6l2-5H4z"/><rect x="37" y="6" width="5" height="11" rx="2"/>',
  arc: '<path d="M5 9h20V6h4v3h3V6h4v3h6v5h-6v1H20l-3 7h-6l2-7H5z"/><path d="M43 8l3 2-3 1 3 2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  heart: '<path d="M6 9h20l2 2h4v3h-4l-2 1H18l-3 7H9l2-7H6z"/><path d="M38 9.4c-1.6-2.4-5-1.4-5 1.3 0 2.2 3 4.2 5 5.7 2-1.5 5-3.5 5-5.7 0-2.7-3.4-3.7-5-1.3z"/>',
};
const ITEM_ICON = {
  battery: "#battery", hollow: "circle-dot", fuel: "rocket", coolant: "hourglass", magnet: "#magnet", nanoweave: "heart",
  capbank: "zap", scope: "search", fang: "#fang", thorns: "sparkle", coupon: "tag", piggy: "coins", bubble: "shield-check",
  mines: "#mine", turret: "satellite-dish", glass: "gem", crown: "crown", clover: "#clover", overdrive: "infinity",
  c_blood: "flame", c_overclock: "zap", c_greedy: "coins", c_crown: "crown", c_halo: "sparkle", c_lead: "shield-half",
};
const CUSTOM_ICON = {
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 10v4M10 10v4"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/><path d="M10 3v8a2 2 0 0 0 4 0V3"/>',
  fang: '<path d="M4 4h16l-2 6-3-2-3 10-3-10-3 2z"/>',
  mine: '<circle cx="12" cy="13" r="6"/><path d="M12 3v4M4.5 6.5l2.8 2.8M19.5 6.5l-2.8 2.8"/><circle cx="12" cy="13" r="1.5" fill="currentColor"/>',
  clover: '<path d="M12 12c-4-6-9-2-6 1.5C3 17 8 20 12 12zM12 12c6-4 2-9-1.5-6C7 3 4 8 12 12zM12 12c4 6 9 2 6-1.5C21 7 16 4 12 12zM12 12c-6 4-2 9 1.5 6C17 21 20 16 12 12z"/>',
};

function svg(viewBox, inner, cls, filled) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", viewBox);
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", cls || "i");
  if (filled) s.setAttribute("fill", "currentColor");
  else {
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  }
  s.innerHTML = inner;
  return s;
}
export function gunArt(id, cls) { return svg("0 0 48 24", GUN_SVG[id] || GUN_SVG.blaster, "gun-art" + (cls ? " " + cls : ""), true); }
export function itemArt(id) {
  const name = ITEM_ICON[id] || "star";
  if (name[0] === "#") return svg("0 0 24 24", CUSTOM_ICON[name.slice(1)]);
  return window.egIcon ? window.egIcon(name) : svg("0 0 24 24", "");
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// Buddy drones live on each player (P.drones: { x, y, cd, a }); the renderer draws them.

export function resetArmory() {
  G.guns = [{ id: "blaster", tier: 1 }, null];
  G.gunSlot = 0;
  G.items = {};
  G.shop = { offers: [], rerolls: 0 };
  G.mines.clear();
  if (G.player) G.player.drones.length = 0;
}
export const itemLvl = (id) => (G.items && G.items[id]) || 0;
export function activeGun() { return (G.guns && (G.guns[G.gunSlot] || G.guns[0])) || { id: "blaster", tier: 1 }; }
/** "Rail Lance III", or an evolved gun's own name ("Annihilator"). */
export const gunName = (g) => (g.evo ? evoName(evoCode(g.id, g.evo)) : GUNS[g.id].name + " " + TIER_NAMES[g.tier - 1]);
/** A gun's colour (evolved guns wear their evolution's). */
export const gunCol = (g) => (g && g.evo ? evoCol(evoCode(g.id, g.evo)) : GUN_COL[(g && g.id) || "blaster"]);

/** The gun ready to evolve: Tier IV, not evolved yet (the one in your hands first). Its slot, or -1. */
export function evoCandidate() {
  const guns = G.guns || [];
  for (const i of [G.gunSlot, 1 - G.gunSlot]) {
    const g = guns[i];
    if (g && g.tier >= 4 && !g.evo && BALANCE.evolution[g.id]) return i;
  }
  return -1;
}
/** Evolves the gun in slot i down path "a" or "b" (one path per gun per run). */
export function evolveGun(i, path) {
  const g = G.guns[i];
  if (!g || g.evo || (path !== "a" && path !== "b")) return false;
  g.evo = path;
  computeStats();
  G.emit("evolve", g);
  return true;
}

/** Swaps to the other slot (or a given one). Returns true if the gun changed. */
export function swapGun(to) {
  const next = to === undefined ? 1 - G.gunSlot : to;
  if (next === G.gunSlot || !G.guns[next]) return false;
  G.gunSlot = next;
  computeStats();
  const P = G.player;
  if (P && !P.dead) {
    P.fireCd = Math.max(P.fireCd, 0.12);
    const g = activeGun();
    fx.text(P.x, P.y - 40, gunName(g).toUpperCase(), gunCol(g), 15, 0.8);
    audio.play("swap", P.x, P.y);
  }
  G.emit("gun");
  return true;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
export function priceOf(base) {
  const k = 1 + SH.priceGrowth * Math.max(0, G.wave - 1);
  const d = 1 - ITEMS.coupon.discount * itemLvl("coupon");
  return Math.max(1, Math.round(base * k * d));
}
function heldGun(id) { return G.guns.find((g) => g && g.id === id) || null; }
export function offerPrice(o) {
  if (o.kind === "gun") {
    const held = heldGun(o.id);
    const base = GUNS[o.id].price || 40;
    return priceOf(held ? base * T.upgradeCost[held.tier] : base);
  }
  return priceOf(ITEMS[o.id].price);
}

/** Strongest sin you haven't maxed (the Crown of Sins raises it). */
export function crownTarget() {
  const sins = CARDS.filter((c) => c.kind === "sin" && (G.up[c.id] || 0) < c.max);
  if (!sins.length) return null;
  sins.sort((a, b) => (G.up[b.id] || 0) - (G.up[a.id] || 0));
  return sins[0].id;
}

function rollRarity() {
  const w = G.wave, R = SH.rarity, lean = itemLvl("clover") ? 1.5 : 1;
  const p = (cfg) => (w < cfg[0] ? 0 : Math.min(cfg[2], (w - cfg[0] + 1) * cfg[1]) * lean);
  const leg = p(R.legendary), epic = p(R.epic), rare = p(R.rare);
  const r = rng();
  if (r < leg) return 3;
  if (r < leg + epic) return 2;
  if (r < leg + epic + rare) return 1;
  return 0;
}

const itemOpen = (id) => !ITEMS[id].corrupt && itemLvl(id) < ITEMS[id].max && (id !== "crown" || crownTarget());

function rollOffer(taken) {
  const has = (kind, id) => taken.some((o) => o && o.kind === kind && o.id === id);
  const gun = () => {
    const list = GUN_IDS.filter((id) => {
      if (has("gun", id)) return false;
      const held = heldGun(id);
      return held ? held.tier < 4 : id !== "blaster";
    });
    if (!list.length) return null;
    // guns you already carry come up more often, so a gun you invest in can reach Tier IV (and evolve)
    let total = 0;
    for (const id of list) total += heldGun(id) ? SH.heldWeight : 1;
    let r = rng() * total;
    for (const id of list) { r -= heldGun(id) ? SH.heldWeight : 1; if (r <= 0) return { kind: "gun", id, locked: false, sold: false }; }
    return { kind: "gun", id: list[list.length - 1], locked: false, sold: false };
  };
  if (G.wave >= 2 && rng() < SH.gunChance) { const o = gun(); if (o) return o; }
  // the rolled rarity, then cheaper, then dearer (late in endless whole rarities run out)
  const r0 = rollRarity();
  for (let k = 0; k < 4; k++) {
    const r = k <= r0 ? r0 - k : k;
    const list = ITEM_IDS.filter((id) => ITEMS[id].r === r && itemOpen(id) && !has("item", id));
    if (list.length) return { kind: "item", id: list[Math.floor(rng() * list.length)], locked: false, sold: false };
  }
  return G.wave >= 2 ? gun() : null;     // gear sold out: a gun rather than an empty slot
}

/** Nothing left to buy: both guns at Tier IV and every piece of gear maxed (long endless runs get here). */
export function armorySoldOut() {
  if (!G.guns || G.guns.some((g) => !g || g.tier < 4)) return false;
  return !ITEM_IDS.some(itemOpen);
}

/** The Armory opens after waves 2 and 4 of each chapter and after its boss; waves 1 and 3 are a quick card. */
export function armoryAfter(wave) { return SH.openAfter.indexOf(((wave - 1) % 5) + 1) !== -1; }
export function nextArmoryWave(wave) { for (let w = wave + 1; w < wave + 6; w++) if (armoryAfter(w)) return w; return wave + 1; }

/** New offers (locked ones stay). */
export function rollShop() {
  const old = G.shop.offers;
  const offers = [];
  for (let i = 0; i < SH.slots; i++) offers.push(old[i] && old[i].locked && !old[i].sold ? old[i] : null);
  for (let i = 0; i < SH.slots; i++) if (!offers[i]) offers[i] = rollOffer(offers);
  G.shop.offers = offers;
}
/** bounty: after a boss, one offer is guaranteed Epic or better and the first reroll is free. */
export function openShop(bounty) {
  G.shop.rerolls = 0;
  G.shop.free = bounty ? 1 : 0;
  rollShop();
  if (bounty) {
    const i = G.shop.offers.findIndex((o) => !o || (!o.locked && o.kind === "item"));
    const pool = ITEM_IDS.filter((id) => ITEMS[id].r >= 2 && itemOpen(id) &&
      !G.shop.offers.some((o) => o && o.kind === "item" && o.id === id));
    if (i >= 0 && pool.length) G.shop.offers[i] = { kind: "item", id: pool[Math.floor(rng() * pool.length)], locked: false, sold: false, bounty: true };
    // and an upgrade for the gun in your hands, until it's Tier IV
    const g = activeGun();
    if (g.tier < 4 && !G.shop.offers.some((o) => o && o.kind === "gun" && o.id === g.id)) {
      const j = G.shop.offers.findIndex((o) => !o || (!o.locked && !o.bounty));
      if (j >= 0) G.shop.offers[j] = { kind: "gun", id: g.id, locked: false, sold: false };
    }
  }
}
export function rerollCost() {
  if (G.shop.free > 0) return 0;
  const R = SH.reroll;
  return Math.round(R.base + R.perWave * G.wave) + R.step * G.shop.rerolls;
}
export function canReroll() { return G.stars >= rerollCost(); }
export function rerollShop() {
  const c = rerollCost();
  if (G.stars < c) return false;
  G.stars -= c;
  if (G.runStats) G.runStats.spent += c;
  if (G.shop.free > 0) G.shop.free--; else G.shop.rerolls++;
  rollShop();
  return true;
}
export function toggleLock(i) {
  const o = G.shop.offers[i];
  if (!o || o.sold) return;
  o.locked = !o.locked;
}
export const patchCost = () => SH.patch + SH.patchStep * G.patches;

/** What buying a gun would do, for the card. */
export function gunNote(id) {
  const held = heldGun(id);
  if (held) return "Upgrade to Tier " + TIER_NAMES[held.tier];
  const empty = G.guns.findIndex((g) => !g);
  if (empty >= 0) return "Goes in your empty slot";
  return "You pick which gun it replaces";
}

/** Buying this offer needs you to pick which gun it replaces: a gun you don't have, with both slots full. */
export function needsSlotPick(o) {
  return !!o && o.kind === "gun" && !heldGun(o.id) && !!G.guns[0] && !!G.guns[1];
}

/** A piece of gear, for the build screen: name, what it does (and what it costs, for relics). */
export function itemInfo(id) {
  const it = ITEMS[id];
  if (!it) return null;
  return { name: it.name, text: it.text, cost: it.cost || "", col: RARITY[it.r].col, rarity: RARITY[it.r].name, max: it.max || 1 };
}

/** Buys offer i. slot: which gun a new gun replaces when both slots are full (default: the one in hand). */
export function buy(i, slot) {
  const o = G.shop.offers[i];
  if (!o || o.sold) return false;
  const price = offerPrice(o);
  if (G.stars < price) return false;
  G.stars -= price;
  if (G.runStats && G.player === G.me) G.runStats.spent += price;
  o.sold = true;
  o.locked = false;
  if (o.kind === "gun") giveGun(o.id, slot); else giveItem(o.id);
  G.emit("buy", o);
  return true;
}

export function giveGun(id, slot) {
  const slots = G.guns;
  let i = slots.findIndex((g) => g && g.id === id);
  if (i >= 0) slots[i].tier = Math.min(4, slots[i].tier + 1);
  else {
    i = slots.findIndex((g) => !g);
    if (i < 0) i = slot === 0 || slot === 1 ? slot : G.gunSlot;
    slots[i] = { id, tier: 1 };
  }
  G.gunSlot = i;
  computeStats();
}

export function giveItem(id) {
  const before = G.stats.maxHp;
  G.items[id] = itemLvl(id) + 1;
  if (id === "crown") { const t = crownTarget(); if (t) applyCard(t); }
  computeStats();
  const P = G.player;
  if (P) {
    const now = G.stats.maxHp;
    P.maxHp = now;
    if (now > before) P.hp = Math.min(now, P.hp + (now - before));
    if (P.hp > now) P.hp = now;
    P.maxShield = G.stats.shieldCap;
  }
}

/** Card text for an offer. */
export function offerInfo(o) {
  if (o.kind === "gun") {
    const g = GUNS[o.id], held = heldGun(o.id);
    const tier = held ? held.tier + 1 : 1;
    return {
      name: g.name, kicker: "Weapon · Tier " + TIER_NAMES[tier - 1], col: GUN_COL[o.id], text: g.blurb, note: gunNote(o.id),
      tier, gun: true,
    };
  }
  const it = ITEMS[o.id], n = itemLvl(o.id);
  let text = it.text;
  if (o.bounty) text = "Boss bounty. " + text;
  if (o.id === "crown") { const t = crownTarget(); if (t) text += " (" + CARDS.find((c) => c.id === t).name + ")"; }
  return {
    name: it.name, kicker: RARITY[it.r].name + " equipment" + (it.max > 1 ? " · " + (n + 1) + "/" + it.max : ""), col: RARITY[it.r].col, text,
    note: n ? "You have " + n : "", rarity: it.r,
  };
}

/** Owned gear, for the loadout panel and the pause / game-over screens. */
export function ownedItems() {
  return ITEM_IDS.filter((id) => itemLvl(id) > 0).map((id) => ({ id, name: ITEMS[id].name, n: itemLvl(id), col: RARITY[ITEMS[id].r].col }));
}

// ---------------------------------------------------------------------------
// Gear that acts on its own
// ---------------------------------------------------------------------------
const hpMul = () => { const n = Math.max(0, G.wave - 1); return 1 + n * BALANCE.waves.hpPerWave + n * n * BALANCE.waves.hpCurve; };

function dropMines() {
  const P = G.player, n = G.stats.mines;
  for (let k = 0; k < n; k++) {
    const q = G.mines.get();
    if (!q) return;
    const a = (k / Math.max(1, n)) * TAU + P.boostDX;
    q.dead = false;
    q.x = P.x + (n > 1 ? Math.cos(a) * 22 : 0); q.y = P.y + (n > 1 ? Math.sin(a) * 22 : 0);
    q.t = 0; q.life = 12; q.by = P;
  }
}

function blowMine(q) {
  q.dead = true;
  if (q.by && q.by !== G.player) usePlayer(q.by);
  const M = ITEMS.mines;
  queueBlast(q.x, q.y, M.radius, M.dmg * BALANCE.player.gun.damage * hpMul(), true, false, 0, C.orange, P_ORANGE);
}

function nearestHostile(x, y, range) {
  const n = G.hash.query(x, y, range + G.maxR);
  const res = G.hash.results, items = G.enemies.items;
  let best = null, bd = range * range;
  for (let j = 0; j < n; j++) {
    const e = items[res[j]];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

export function updateGear(dt) {
  // mines
  const ms = G.mines;
  for (let i = 0; i < ms.count; i++) {
    const q = ms.items[i];
    if (q.dead) continue;
    q.t += dt;
    if (q.t >= q.life) { blowMine(q); continue; }
    if (q.t > 0.35 && nearestHostile(q.x, q.y, 36)) blowMine(q);
  }
  ms.sweep();
  for (let i = 0; i < G.players.length; i++) { const P = G.players[i]; usePlayer(P); updateDrones(P, G.stats, dt); }
  usePlayer(G.me);
}

/** Buddy drones follow their owner and shoot. On a co-op client they only fly (the host shoots). */
export function updateDrones(P, s, dt) {
  const drones = P.drones;
  const want = !P.dead ? s.turrets : 0;
  while (drones.length < want) drones.push({ x: P.x, y: P.y, cd: 0.5 + drones.length * 0.2, a: drones.length * Math.PI });
  if (drones.length > want) drones.length = want;
  if (!want) return;
  const T2 = ITEMS.turret;
  const fighting = G.state === "playing";
  for (let i = 0; i < drones.length; i++) {
    const d = drones[i];
    d.a += dt * 1.4;
    const ox = P.x + Math.cos(d.a) * 44, oy = P.y - 30 + Math.sin(d.a) * 16;
    const k = Math.min(1, dt * 7);
    d.x += (ox - d.x) * k; d.y += (oy - d.y) * k;
    d.cd -= dt;
    if (d.cd <= 0 && fighting && G.net.role !== "client") {
      const e = nearestHostile(d.x, d.y, 520);
      if (e) {
        d.cd = 1 / T2.rate;
        const dist = Math.hypot(e.x - d.x, e.y - d.y), t = dist / s.bulletSpeed;
        const ang = Math.atan2(e.y + e.vy * t * 0.8 - d.y, e.x + e.vx * t * 0.8 - d.x);
        const b = firePlayerBullet(d.x, d.y, ang, 0, 1, T2.dmg * s.baseDamage);
        if (b) b.r = 4;
        fx.sparks(d.x, d.y, ang, 0.3, 2, P_CYAN, 220, 0.1);
        audio.play("shoot", d.x, d.y, 0.25);
      } else d.cd = 0.2;
    }
  }
}

// Gear hooks
G.on("boost", () => { if (G.stats.mines && G.net.role !== "client" && (G.state === "playing" || G.state === "clear")) dropMines(); });
G.on("hurt", (absorbed) => {
  const s = G.stats, P = G.player;
  if (!s.thorns || !P || P.dead || G.net.role === "client") return;
  const n = ITEMS.thorns.count[s.thorns - 1];
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) firePlayerBullet(P.x, P.y, off + (i / n) * TAU, 3, 1, ITEMS.thorns.dmg * s.baseDamage);
  fx.ring(P.x, P.y, 12, 80, 0.3, C.mint, 3);
});
G.on("kill", (e) => {
  const s = G.stats, P = G.player;
  if (!s.fang || !P || P.dead || e.ally > 0 || e.boss) return;
  P.fangN = (P.fangN || 0) + 1;
  if (P.fangN >= Math.ceil(s.fang / diff().heal)) { P.fangN = 0; healPlayer(1, false); fx.burst(P.x, P.y, 6, P_MAGENTA, 120, 0.5, 1.2); }
});
