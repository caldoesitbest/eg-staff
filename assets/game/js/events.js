/* Special events on the Sin Ladder: now and then something unusual happens. At most one per chapter
   (from chapter 2), on one of its first three waves, so most waves are just waves.
     Cosmic Cache     drifts through mid-wave; crack it before it leaves for stars or a free rare item
     Corrupted Armory three powerful relics, each with a price you can see; take one or walk away
     Sin Altar        trade a sin level, buy one, or force a Sin Fusion within reach
     Elite Ambush     opt in: three mutated hunters open the next wave; kill them in time for a reward
   Stars are the only currency. Co-op: the host rolls the event and everyone gets their own choice
   (the Ambush is solo only). */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { rand, randInt, rng, chance, TAU } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { C, P_AMBER, P_VIOLET } from "./sprites.js";
import { CARDS, CARD_BY_ID, applyCard, computeStats, fusionsOpen } from "./upgrades.js";
import { ITEM_IDS, itemLvl, giveItem, RARITY } from "./armory.js";
import { spawnEnemy } from "./enemies/index.js";
import { M } from "./mutations.js";
import { dropPickup, killEnemy } from "./world.js";

const EV = BALANCE.events;
const SINS = ["gluttony", "greed", "wrath", "pride", "sloth", "envy", "lust"];
const lvl = (id) => G.up[id] || 0;

// ---------------------------------------------------------------------------
// which event, when
// ---------------------------------------------------------------------------
/** At the start of each chapter: maybe an event on one of its first three waves (Ladder only). */
export function rollChapterEvent(n) {
  if (G.mode !== "ladder" || n < EV.from || (n - 1) % 5 !== 0 || G.net.role === "client") return;
  G.event = null;
  if (!chance(EV.chance)) return;
  const types = Object.keys(EV.weight).filter((t) => t !== "ambush" || G.net.role === "off");
  let total = 0;
  for (const t of types) total += EV.weight[t];
  let r = rng() * total, type = types[0];
  for (const t of types) { r -= EV.weight[t]; if (r <= 0) { type = t; break; } }
  G.event = { type, wave: n + randInt(0, 2), done: false, spawnAt: -1 };
}

/** A new wave started (host): schedule the cache, spring an ambush. */
export function eventWaveStart(n) {
  const e = G.event;
  if (e && e.type === "cache" && e.wave === n) e.spawnAt = G.time + rand(EV.cache.at[0], EV.cache.at[1]);
  if (G.ambush && G.ambush.pending) springAmbush();
}

/** Every step (host): the cache arrives, the ambush clock runs. */
export function eventTick(dt) {
  const e = G.event;
  if (e && e.spawnAt > 0 && G.time >= e.spawnAt && G.state === "playing") { e.spawnAt = -1; spawnCache(); }
  const a = G.ambush;
  if (a && a.t > 0) {
    a.t -= dt;
    let left = 0;
    for (let i = 0; i < a.foes.length; i++) if (!a.foes[i].dead && a.foes[i].id === a.ids[i]) left++;
    a.left = left;
    if (!left) ambushWon();
    else if (a.t <= 0) { a.t = 0; G.emit("ambushLost"); }
  }
}

/** Between waves: the screen event due after this wave, if any ("corrupt" | "altar" | "ambush" | "cache"). */
export function pendingEvent() {
  if (G.cacheCracked) return "cache";
  const e = G.event;
  if (!e || e.done || e.wave !== G.wave || e.type === "cache") return null;
  return e.type;
}
export function eventDone(type) {
  if (type === "cache") G.cacheCracked = false;
  else if (G.event) G.event.done = true;
}

// ---------------------------------------------------------------------------
// the Cosmic Cache (a drifting relic; it never attacks)
// ---------------------------------------------------------------------------
function spawnCache() {
  const A = BALANCE.arena;
  const side = randInt(0, 3);
  // it crosses the arena, passing near the middle
  const from = side === 0 ? [rand(200, A.w - 200), -30] : side === 1 ? [A.w + 30, rand(200, A.h - 200)] : side === 2 ? [rand(200, A.w - 200), A.h + 30] : [-30, rand(200, A.h - 200)];
  const to = [A.w - from[0] + rand(-200, 200), A.h - from[1] + rand(-150, 150)];
  const e = spawnEnemy("cache", Math.max(30, Math.min(A.w - 30, from[0])), Math.max(30, Math.min(A.h - 30, from[1])), { spawnT: 0.5 });
  if (!e) return;
  e.tx = to[0]; e.ty = to[1];
  fx.text(e.x, e.y - 40, "COSMIC CACHE", C.amber, 18, 1.6);
  G.emit("cacheSpawn", e);
  audio.play("evoReady", e.x, e.y);
}

/** The cache kind (registered with the boss helpers in enemies/bosses.js). */
export const cache = {
  pal: P_AMBER, accent: C.amber,  // its burst and health bar
  priority: 4,                   // auto-aim prefers robots that shoot back
  init(e) { e.passive = true; e.contact = 0; e.t = EV.cache.life; e.a = rand(0, TAU); },
  update(e, dt) {
    e.t -= dt;
    e.a += dt * 1.4;
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy) || 1;
    e.vx = (dx / d) * EV.cache.speed; e.vy = (dy / d) * EV.cache.speed;
    if (Math.random() < dt * 14) fx.p(0, e.x + rand(-14, 14), e.y + rand(-14, 14), -e.vx * 0.3, -e.vy * 0.3, 0.6, 1.6, Math.random() < 0.5 ? P_AMBER : P_VIOLET, 2);
    if (e.t <= 0 || d < 30) leaveCache(e);
  },
  onDeath(e, silent) {
    if (silent) return;
    const s = G.stats;
    for (let i = 0; i < EV.cache.stars; i++) dropPickup(1, e.x, e.y, Math.max(2, s.starValue * 2));
    fx.ring(e.x, e.y, 10, 160, 0.5, C.amber, 5);
    fx.burst(e.x, e.y, 30, P_AMBER, 380, 0.9, 2);
    fx.text(e.x, e.y - 30, "CACHE CRACKED", C.amber, 18, 1.4);
    audio.play("newBest", e.x, e.y, 0.7);
    G.cacheCracked = true;
  },
  draw(g, e, x, y) {
    // a slowly turning crystal box: gold seams, violet glow
    const R = e.r * (e.spawnT > 0 ? Math.max(0.1, 1 - e.spawnT / 0.5) : 1);
    g.save();
    g.translate(x, y);
    if (G.gfx.glow) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.35 + Math.sin(G.time * 4) * 0.1;
      g.fillStyle = "rgba(255,200,97,0.5)";
      g.beginPath(); g.arc(0, 0, R * 1.9, 0, TAU); g.fill();
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
    }
    g.rotate(e.a);
    g.fillStyle = e.flash > 0 ? "#ffffff" : "#2a1f4f";
    g.strokeStyle = C.amber;
    g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = "#a57bff"; g.lineWidth = 2;
    g.beginPath(); for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; g.moveTo(0, 0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); } g.stroke();
    g.fillStyle = "#fff4d6";
    g.beginPath(); g.arc(0, 0, R * 0.22, 0, TAU); g.fill();
    g.restore();
  },
};
function leaveCache(e) {
  fx.text(e.x, e.y - 30, "The cache drifted away", C.amber, 14, 1.2);
  fx.ring(e.x, e.y, e.r, e.r * 3, 0.4, C.amber, 2);
  killEnemy(e, true);
}
/** The wave ended: a cache still out there drifts off. */
export function cacheAway() {
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const e = items[i]; if (!e.dead && e.type === "cache") leaveCache(e); }
}

/** What cracking the cache gives you: stars, or a free rare+ item (one of each to choose from). */
export function cacheOptions() {
  const stars = EV.cache.reward[0] + EV.cache.reward[1] * G.wave;
  const pool = ITEM_IDS.filter((id) => { const it = BALANCE.items[id]; return it.r >= 1 && it.r <= 3 && !it.corrupt && itemLvl(id) < it.max && id !== "crown"; });
  const item = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  const opts = [{ id: "stars", name: "★ " + stars, text: "Pocket the hoard.", stars }];
  if (item) { const it = BALANCE.items[item]; opts.push({ id: "item", name: it.name, text: RARITY[it.r].name + " · " + it.text, item, col: RARITY[it.r].col }); }
  return opts;
}

// ---------------------------------------------------------------------------
// the Corrupted Armory
// ---------------------------------------------------------------------------
export function relicOptions() {
  const ids = Object.keys(BALANCE.relics).filter((id) => !itemLvl(id));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, 3).map((id) => { const r = BALANCE.relics[id]; return { id, name: r.name, text: r.text, cost: r.cost }; });
}
/** Takes a relic (Hollow Crown also raises your two lowest sins). */
export function takeRelic(id) {
  giveItem(id);
  if (id === "c_crown") {
    const owned = SINS.filter((s) => lvl(s) > 0 && lvl(s) < 4).sort((a, b) => lvl(a) - lvl(b));
    const pick = owned.length >= 2 ? owned.slice(0, 2) : owned.concat(SINS.filter((s) => !lvl(s)).slice(0, 2 - owned.length));
    for (const s of pick) applyCard(s);
  }
  G.emit("relic", id);
}

// ---------------------------------------------------------------------------
// the Sin Altar
// ---------------------------------------------------------------------------
/** A sin pair one step from a fusion: [the sin at 3+, the one below 3] (or null). */
function nearFusion() {
  const need = BALANCE.fusions.need;
  if (fusionsOpen().length) return null;
  const owned = CARDS.filter((c) => c.kind === "fusion" && lvl(c.id)).length;
  if (owned >= (G.won || G.lap > 0 ? BALANCE.fusions.maxEndless : BALANCE.fusions.max)) return null;
  let best = null;
  for (const c of CARDS) {
    if (c.kind !== "fusion") continue;
    const [a, b] = c.need;
    if (lvl(a) >= need && lvl(b) > 0 && lvl(b) < need) best = best || [a, b, c];
    if (lvl(b) >= need && lvl(a) > 0 && lvl(a) < need) best = best || [b, a, c];
  }
  return best;
}
export function altarOptions() {
  const A = EV.altar, w = G.wave;
  const opts = [];
  const unfinished = SINS.filter((s) => lvl(s) < 4).sort((a, b) => lvl(b) - lvl(a));
  const top = unfinished[0];
  if (top) opts.push({ id: "offer", name: "Offering", text: "+1 " + CARD_BY_ID[top].name + " (to level " + (lvl(top) + 1) + ")", price: A.offering[0] + A.offering[1] * w, sin: top });
  const near = nearFusion();
  if (near) {
    const [, low, card] = near;
    opts.push({ id: "fuse", name: "Fuse", text: "Raise " + CARD_BY_ID[low].name + " to level " + BALANCE.fusions.need + ": " + card.name + " is offered next", price: A.fuse[0] + A.fuse[1] * w, sin: low });
  }
  // transmute: a level from your weakest sin into the one that matters most
  const owned = SINS.filter((s) => lvl(s) > 0).sort((a, b) => lvl(a) - lvl(b));
  const target = near ? near[1] : top;
  const from = owned.find((s) => s !== target && !(near && s === near[0]));
  if (from && target) opts.push({ id: "transmute", name: "Transmute", text: "−1 " + CARD_BY_ID[from].name + ", +1 " + CARD_BY_ID[target].name, price: 0, from, sin: target });
  return opts;
}
export function takeAltar(o) {
  if (o.price && G.stars < o.price) return false;
  G.stars -= o.price || 0;
  if (G.runStats && o.price) G.runStats.spent += o.price;
  if (o.id === "transmute") {
    G.up[o.from] = Math.max(0, lvl(o.from) - 1);
    if (!G.up[o.from]) delete G.up[o.from];
    computeStats();
    applyCard(o.sin);
  } else if (o.id === "fuse") {
    while (lvl(o.sin) < BALANCE.fusions.need) applyCard(o.sin);
    if (G.player) G.player.fuseShown = false;          // the fusion card shows up in your next hand
  } else applyCard(o.sin);
  G.emit("card", o.sin);
  return true;
}

// ---------------------------------------------------------------------------
// the Elite Ambush (solo)
// ---------------------------------------------------------------------------
export const ambushReward = () => EV.ambush.reward[0] + EV.ambush.reward[1] * (G.wave + 1);
export function acceptAmbush() { G.ambush = { pending: true }; }
function springAmbush() {
  const P = G.me, D = EV.ambush;
  const foes = [], ids = [];
  for (let k = 0; k < D.count; k++) {
    const type = D.types[Math.floor(rng() * D.types.length)];
    const list = BALANCE.mutations.on[type] || [];
    const mk = list[Math.floor(rng() * list.length)];
    const a = (k / D.count) * TAU + rand(-0.4, 0.4);
    const A = BALANCE.arena;
    const x = Math.max(60, Math.min(A.w - 60, P.x + Math.cos(a) * 400)), y = Math.max(60, Math.min(A.h - 60, P.y + Math.sin(a) * 340));
    const e = spawnEnemy(type, x, y, { spawnT: 0.6, mut: mk ? M[mk.toUpperCase()] : 0 });
    if (e) { foes.push(e); ids.push(e.id); fx.ring(x, y, 60, 10, 0.6, C.red, 3); }
  }
  G.ambush = { pending: false, t: D.time, foes, ids, left: foes.length };
  G.emit("ambushStart");
  audio.play("bossIntro", P.x, P.y, 0.5);
}
function ambushWon() {
  const a = G.ambush;
  a.t = 0;
  const gain = ambushReward();
  G.stars += gain;
  G.bonusPick = (G.bonusPick || 0) + 1;
  G.emit("ambushWon", gain);
  const P = G.me;
  if (P) { fx.text(P.x, P.y - 50, "AMBUSH SURVIVED  ★+" + gain, C.amber, 18, 1.6); fx.ring(P.x, P.y, 10, 200, 0.6, C.amber, 4); }
  audio.play("newBest");
}

