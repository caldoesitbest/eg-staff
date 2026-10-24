/* Debug only (?debug=1&autoplay=1): a simple autopilot for soak and balance testing.
   It sees every robot and shot (so it's better at dodging than a person, worse at planning).
   Runs before every simulation step, so ?speed=N fast-forward doesn't dull its reactions. */

import { G } from "./state.js";
import { input } from "./input.js";
import { BALANCE } from "./balance.js";

// ?bot=dps|tank|cc|weak: what the autopilot builds toward (balance tests). Anything else: random picks.
// Earlier in a list = wanted more. "weak" takes the least useful cards and never shops.
const PROFILES = {
  dps:  ["frenzy", "feast", "judgment", "wrath", "pride", "multishot", "pierce", "overcharge", "velocity", "homing", "glass", "hollow", "battery", "scope", "capbank", "overdrive", "crown", "clover",
         "rail", "heart", "nova", "scatter", "smg", "arc"],
  tank: ["feast", "parasite", "gluttony", "suit", "nanoweave", "wrath", "bubble", "multishot", "fang", "thorns", "boost", "hollow", "battery", "orbit", "thrusters", "fuel", "turret", "scatter", "smg"],
  cc:   ["stolen", "bloodlust", "judgment", "covetous", "sloth", "lust", "envy", "orbit", "turret", "mines", "ricochet", "pierce", "arc", "nova", "hollow", "battery"],
  weak: ["greed", "rear", "magnet", "coupon", "piggy", "velocity", "ricochet"],
};
const rank = (list, id) => { const i = list.indexOf(id); return i < 0 ? 99 : i; };

export const bot = {
  runs: [],
  fights: [],             // [boss, wave, hp, seconds, hits taken in the fight]
  waves: [],              // [wave, hits taken that wave] for the current run
  autoRetry: true,
  onRetry: null,
  onPick: null,
  onEvo: null,
  onEvent: null,
  onBuy: null,
  onShopGo: null,
  chargeT: 0,
  profile: new URLSearchParams(location.search).get("bot") || "random",
  _fight: null, _wave: 0, _wHits: 0,

  record() {
    // per-wave hits and boss fight lengths, for the balance numbers
    if (G.wave !== this._wave) {
      if (this._wave) this.waves.push([this._wave, G.hitsTaken - this._wHits]);
      this._wave = G.wave; this._wHits = G.hitsTaken;
    }
    const b = G.boss && !G.boss.dead && G.boss.state !== -1 ? G.boss : null;
    if (b && (!this._fight || this._fight.e !== b)) this._fight = { e: b, type: b.type, wave: G.wave, hp: Math.round(b.maxHp), t0: G.time, h0: G.hitsTaken };
    const f = this._fight;
    if (f && (f.e.dead || G.boss !== f.e || G.state === "over")) {
      this.fights.push([f.type, f.wave, f.hp, Math.round(G.time - f.t0), G.hitsTaken - f.h0, G.state === "over" ? "died" : "won"]);
      this._fight = null;
    }
  },

  tick() {
    this.record();
    const L = PROFILES[this.profile];
    if (G.state === "event") {
      // events: take an option you can afford (or leave), so balance runs see them
      const opts = [...document.querySelectorAll("#event-opts .event-opt:not([disabled])")];
      if (this.onEvent) this.onEvent(opts.length && Math.random() < 0.8 ? Math.floor(Math.random() * opts.length) : -1);
      return;
    }
    if (G.state === "evolve") {
      // ?evo=a|b forces a path (balance tests); otherwise either
      const want = new URLSearchParams(location.search).get("evo");
      if (this.onEvo) this.onEvo(want === "a" || want === "b" ? want : Math.random() < 0.5 ? "a" : "b");
      return;
    }
    if (G.state === "upgrade") {
      const cards = [...document.querySelectorAll("#cards .card")];
      if (cards.length && this.onPick) {
        let c = cards[Math.floor(Math.random() * cards.length)];
        if (L) c = cards.slice().sort((a, b) => rank(L, a.dataset.id) - rank(L, b.dataset.id))[0];
        this.onPick(c.dataset.id);
      }
      return;
    }
    if (G.state === "shop") {
      // buy what it can afford (a build buys what it wants first), then go
      if (L && this.profile !== "weak") {
        const order = G.shop.offers.map((o, i) => [o, i]).filter(([o]) => o && !o.sold).sort((a, b) => rank(L, a[0].id) - rank(L, b[0].id));
        for (const [o, i] of order) if (rank(L, o.id) < 99 && this.onBuy) this.onBuy(i);
      } else if (!L) {
        for (let k = 0; k < 3; k++) {
          const i = Math.floor(Math.random() * G.shop.offers.length);
          if (this.onBuy) this.onBuy(i);
        }
      }
      if (this.onShopGo) this.onShopGo();
      return;
    }
    if (G.state === "over") {
      if (this.autoRetry && this.onRetry) {
        this.runs.push({ wave: G.wave, time: Math.round(G.time), hits: G.hitsTaken, score: Math.round(G.score), build: JSON.stringify(G.up), guns: G.guns.filter(Boolean).map((g) => g.id + g.tier + (g.evo || "")).join("+"), waves: this.waves,
          byGun: G.runStats ? Object.fromEntries(Object.entries(G.runStats.byGun).map(([k, v]) => [k, Math.round(v)])) : null, items: JSON.stringify(G.items) });
        this.waves = []; this._wave = 0;
        this.onRetry();
      }
      return;
    }
    if (G.state !== "playing" && G.state !== "clear") { input.mouse.down = false; return; }
    const P = G.player;
    if (!P || P.dead) return;
    let best = null, bd = 1e12, ax = 0, ay = 0;
    for (let i = 0; i < G.enemies.count; i++) {
      const e = G.enemies.items[i];
      if (e.dead || e.ally > 0) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d2 = dx * dx + dy * dy;
      const w = e.kind.priority ? d2 * 0.5 : e.boss ? d2 * 0.35 : d2;
      if (w < bd) { bd = w; best = e; }
      const R = 230 + e.r * e.scale;
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1; ax -= (dx / d) * (R - d); ay -= (dy / d) * (R - d); }
    }
    // read telegraphs like a person would: leave rings, step off charge and laser lines
    let near = false;
    for (let i = 0; i < G.enemies.count; i++) {
      const e = G.enemies.items[i];
      if (e.dead || e.ally > 0) continue;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      let ring = 0;
      if (e.type === "glutton" && e.state === 3) ring = BALANCE.bosses.glutton.slamRadius * e.scale + 40;
      if (e.type === "boomer" && e.state === 1) ring = BALANCE.enemies.boomer.blast + 30;
      if (ring && d < ring) { ax += (dx / d) * (ring - d) * 6; ay += (dy / d) * (ring - d) * 6; if (d < ring * 0.8) near = true; }
      const lane = (e.type === "ripper" && e.state === 1) || (e.type === "sniper" && e.state === 1) || (e.type === "overclock" && e.windT > 0);
      if (lane) {
        const a = e.type === "overclock" ? e.dashA : e.a;
        const c = Math.cos(a), s = Math.sin(a);
        const along = dx * c + dy * s, side = -dx * s + dy * c;
        if (along > 0 && Math.abs(side) < 60) { const k = side >= 0 ? 1 : -1; ax += -s * k * 400; ay += c * k * 400; if (Math.abs(side) < 25) near = true; }
      }
    }
    // mutations: boost through a Shockwave ring about to reach you, get out of a Volatile's blast ring
    for (let i = 0; i < G.zones.count; i++) {
      const z = G.zones.items[i];
      if (z.dead) continue;
      const dx = P.x - z.x, dy = P.y - z.y, d = Math.hypot(dx, dy) || 1;
      if (z.type === 8) { const R = z.r0 + (z.r - z.r0) * (z.t / z.life); if (d > R - 8 && d - R < 45) near = true; }
      if (z.type === 7 && z.y2 > 0 && d < z.r + 30) { ax += (dx / d) * (z.r + 30 - d) * 6; ay += (dy / d) * (z.r + 30 - d) * 6; if (d < z.r * 0.7) near = true; }
    }
    for (let i = 0; i < G.eb.count; i++) {
      const b = G.eb.items[i];
      const d2 = (b.x - P.x) ** 2 + (b.y - P.y) ** 2;
      if (d2 < 55 * 55) near = true;
      const d = Math.sqrt(d2) || 1;
      if (d < 140) { ax -= ((b.x - P.x) / d) * (140 - d) * 1.6; ay -= ((b.y - P.y) / d) * (140 - d) * 1.6; }
    }
    // flank shields: circle around a Bulwark toward its back
    if (best && best.type === "bulwark") {
      const dx = P.x - best.x, dy = P.y - best.y, d = Math.hypot(dx, dy) || 1;
      ax += (-dy / d) * 500; ay += (dx / d) * 500;
      if (d > 260) { ax -= (dx / d) * 300; ay -= (dy / d) * 300; }
    }
    ax += (1000 - P.x) * 0.25;
    ay += (650 - P.y) * 0.25;
    input.mode = "kbm";
    input.mouse.seen = true;
    input.mouse.inside = true;
    if (best) {
      const c = G.cam;
      input.mouse.x = (best.x - c.x) * c.z + c.cssW / 2;
      input.mouse.y = (best.y - c.y) * c.z + c.cssH / 2;
      G.aimWorld.x = best.x; G.aimWorld.y = best.y;
      input.mouse.down = true;
      input.fire = true;
    } else { input.mouse.down = false; input.fire = false; }
    input.aimMode = "mouse";
    const l = Math.hypot(ax, ay);
    if (l > 20) { input.move.x = ax / l; input.move.y = ay / l; } else { input.move.x = 0; input.move.y = 0; }
    if (near && P.boostCdT <= 0) input.queued.boost = true;
    // charged shots: hold for about a second now and then (always on bosses)
    if (this.chargeT > 0) { this.chargeT -= 1 / 60; input.charge = this.chargeT > 0; }
    else if (best && (best.boss || Math.random() < 0.004)) { this.chargeT = 1.05; input.charge = true; }
    else input.charge = false;
  },
};

/** Debug only (?debug=1&smoke=1, the Windows app's --selftest): a quick scripted pass through the
    new systems. Reports each step to the launcher (or the console in a browser). */
export async function smoke(h) {
  const say = (msg) => { try { window.chrome.webview.postMessage({ type: "status", msg }); } catch (e) { console.log("[smoke] " + msg); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    h.startRun();
    G.debug.god = true;
    await sleep(2500);
    say("run started: wave " + G.wave + ", " + G.enemies.count + " robots");
    // a full charged shot
    input.mode = "kbm"; input.mouse.seen = true;
    input.mouse.charge = true;
    await sleep(1150);
    const charged = G.player.charge;
    input.mouse.charge = false;
    await sleep(50);
    let orbs = 0;
    for (let i = 0; i < G.pb.count; i++) if (G.pb.items[i].special) orbs++;
    say("charged shot: reached " + Math.round(charged * 100) + "%, orbs in flight " + orbs);
    // the shop
    G.stars = 600;
    h.openArmory();
    await sleep(400);
    let bought = 0;
    for (let i = 0; i < G.shop.offers.length; i++) { const o = G.shop.offers[i]; if (o && !o.sold) { h.shopBuy(i); if (o.sold) bought++; } }
    say("shop: bought " + bought + ", guns " + G.guns.filter(Boolean).map((g) => g.id + g.tier).join("+") + ", gear " + Object.keys(G.items).join(","));
    h.shopGo();
    await sleep(2000);
    say("next wave: " + G.wave + ", state " + G.state);
    // Lust's new look and its fakes
    const b = h.spawnEnemy("lust", 1000, 300, { spawnT: 0 });
    await sleep(2600);
    if (b) { b.hp = b.maxHp * 0.4; b.blinkCd = 0; }
    await sleep(2200);
    let fakes = 0;
    for (let i = 0; i < G.enemies.count; i++) if (!G.enemies.items[i].dead && G.enemies.items[i].type === "decoy") fakes++;
    say("lust: state " + (b ? b.state : "none") + ", fakes " + fakes);
  } catch (e) {
    say("smoke failed: " + (e && e.message));
  }
  say("smoke done");
}

/** Debug only (?cosmoke=1 with cohost / cojoin, the Windows app's co-op self-tests): once a co-op run
    is going, plays for a while, then reports what this side sees. */
export async function coopSmoke() {
  const say = (msg) => { try { window.chrome.webview.postMessage({ type: "status", msg }); } catch (e) { console.log("[coop smoke] " + msg); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 240 && !(G.net.role !== "off" && G.state === "playing"); i++) await sleep(250);
  if (G.net.role === "off") { say("coop: never connected"); say("smoke done"); return; }
  say("coop: " + G.net.role + ", slot " + G.net.slot + ", " + G.players.length + " players");
  const w0 = G.wave;
  await sleep(25000);
  const me = G.me;
  say("coop: wave " + w0 + " -> " + G.wave + ", state " + G.state + ", robots " + G.enemies.count + ", my hp " + me.hp + ", stars " + G.stars +
    ", players " + G.players.map((p) => p.name + "@" + Math.round(p.x) + "," + Math.round(p.y)).join(" "));
  say("smoke done");
}

/** Debug only (?debug=1&scene=combat|greed|wrath|lust): the same frozen moment every time, for
    before/after screenshots and frame timings. Sets up a fixed arena, plays 0.6s, then freezes the
    simulation (rendering keeps going). Leave it with ?scene= removed. */
export async function scene(name, h) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  h.seedRng(4242);
  h.startRun();
  G.debug.god = true;
  await sleep(300);
  G.enemies.clear(); G.eb.clear(); G.pb.clear(); G.warnings.clear(); h.waves.queue.length = 0;
  const P = G.player;
  P.x = P.px = 1000; P.y = P.py = 650; P.vx = 120; P.vy = -40;
  const boss = { greed: [15, "greed"], wrath: [25, "wrath"], lust: [20, "lust"], pride: [30, "pride"] }[name];
  if (boss) {
    G.wave = boss[0]; h.waves.boss = true; h.waves.bossT = 99;
    const b = h.spawnEnemy(boss[1], 1000, 380, { spawnT: 0 });
    b.state = 0; b.invuln = false; b.x = b.px = 1000; b.y = b.py = 380;
    b.hp = b.maxHp * 0.45;
    for (const [t, x, y] of [["drone", 760, 560], ["gunner", 1260, 520], ["drone", 820, 800]]) h.spawnEnemy(t, x, y, { spawnT: 0 });
  } else {
    G.wave = 22; G.mark = 1;
    const list = [["drone", 820, 560], ["drone", 870, 760], ["gunner", 1290, 470], ["gunner", 1250, 830], ["ripper", 700, 420],
      ["bulwark", 1180, 650], ["sniper", 1450, 300], ["boomer", 930, 470], ["splitter", 640, 760], ["swarm", 1370, 760], ["swarm", 1390, 790], ["swarm", 1350, 800], ["patch", 1500, 640]];
    for (const [t, x, y] of list) h.spawnEnemy(t, x, y, { spawnT: 0, elite: t === "bulwark" });
  }
  h.input.mouse.x = innerWidth * 0.66; h.input.mouse.y = innerHeight * 0.42; h.input.mouse.down = true; h.input.mode = "kbm"; h.input.mouse.seen = true;
  await sleep(650);
  h.input.mouse.down = false;
  G.debug.freeze = true;
}

/** Debug only (window.__eg.stage): a weapon-evolution moment for screenshots. Puts a Tier IV gun
    evolved down a path in your hands, lines up a row of tough robots, fires (opts.fire seconds), charges
    (opts.charge), then freezes when opts.until(G) says so (or opts.after seconds later). */
export async function stage(h, gun, path, opts = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { computeStats } = await import("./upgrades.js");
  G.debug.zoom = opts.zoom || 1;
  h.waves.queue.length = 0; h.waves.active = false;
  G.enemies.clear(); G.eb.clear(); G.pb.clear(); G.zones.clear(); G.warnings.clear(); G.asteroids.clear(); G.pickups.clear();
  G.wave = opts.wave || 15; G.debug.god = true;
  G.guns = [{ id: gun, tier: 4, evo: path }, null]; G.gunSlot = 0; computeStats();
  const P = G.player, px = opts.px || 800;
  P.x = P.px = px; P.y = P.py = 650; P.vx = P.vy = 0; P.od = 0; P.odT = 0; P.heat = 0; P.rep = opts.rep || 0; P.soul = opts.soul || 0;
  const types = opts.types || ["gunner", "drone", "splitter", "drone", "sniper", "drone", "gunner", "drone", "splitter"];
  types.forEach((t, i) => {
    const e = h.spawnEnemy(t, px + 180 + (i % 5) * 75, 580 + Math.floor(i / 5) * 140 + (i % 2) * 26, { spawnT: 0 });
    if (e) { e.speed = 0; e.hp = e.maxHp = opts.hp || 4000; }
  });
  const ax = px + 350;
  let phase = 0, t0 = G.time, done = false;
  const orig = G.enemies.sweep.bind(G.enemies);
  G.enemies.sweep = function () {
    const c = G.cam;
    input.mode = "kbm"; input.mouse.seen = true; input.mouse.inside = true; input.aimMode = "mouse";
    input.mouse.x = (ax - c.x) * c.z + c.cssW / 2; input.mouse.y = (640 - c.y) * c.z + c.cssH / 2; G.aimWorld.x = ax; G.aimWorld.y = 640;
    G.player.x = px; G.player.y = 650;
    const el = G.time - t0;
    if (phase === 0) { input.mouse.down = input.fire = el < (opts.fire || 0); if (el >= (opts.fire || 0)) { phase = 1; t0 = G.time; } }
    else if (phase === 1) { input.mouse.charge = el < (opts.charge || 0); if (el >= (opts.charge || 0)) { input.mouse.charge = false; phase = 2; t0 = G.time; } }
    else if (phase === 2 && !done && (opts.until ? opts.until(G) : el >= (opts.after || 0.1))) { done = true; G.debug.freeze = true; input.mouse.down = input.fire = false; }
    return orig();
  };
  G.debug.freeze = false;
  for (let k = 0; k < 4000 && !done; k++) await sleep(2);
  G.enemies.sweep = orig;
  return { done, zones: G.zones.count, shots: G.pb.count };
}
/** For stage(): true once a zone of this type is part-way through its life. */
export const zoneAt = (type, frac = 0.4) => (g) => {
  for (let i = 0; i < g.zones.count; i++) { const z = g.zones.items[i]; if (!z.dead && z.type === type && z.t > z.life * frac) return true; }
  return false;
};
