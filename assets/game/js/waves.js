/* The wave director. Difficulty ramps by WHAT shows up (new robots, nastier mixes, more
   at once) far more than by health. Spawns come from the arena edges with a warning marker. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { rand, randInt, randRange, chance, TAU, rng } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { onScreen } from "./world.js";
import { spawnEnemy, hostileCount } from "./enemies/index.js";

const W = BALANCE.waves;
const A = BALANCE.arena;
const HEAVY = { bulwark: 2, sniper: 2, patch: 2 };

function weightedType(mix) {
  let total = 0;
  for (const k in mix) total += mix[k];
  let r = rng() * total;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return Object.keys(mix)[0];
}

function groupSize(type, maxGroup) {
  if (type === "swarm") return randInt(BALANCE.enemies.swarm.pack[0], BALANCE.enemies.swarm.pack[1]);
  return randInt(1, Math.min(maxGroup, HEAVY[type] || maxGroup));
}

function edgePoint() {
  const P = G.player;
  const min2 = W.minSpawnDist * W.minSpawnDist;
  let best = null, bestD = -1;
  for (let tries = 0; tries < 18; tries++) {
    const side = randInt(0, 3);
    const inset = 46;
    let x, y;
    if (side === 0) { x = rand(inset, A.w - inset); y = inset; }
    else if (side === 1) { x = A.w - inset; y = rand(inset, A.h - inset); }
    else if (side === 2) { x = rand(inset, A.w - inset); y = A.h - inset; }
    else { x = inset; y = rand(inset, A.h - inset); }
    const d2 = P ? (x - P.x) ** 2 + (y - P.y) ** 2 : 1e9;
    if (d2 > bestD) { bestD = d2; best = [x, y]; }
    if (d2 < min2) continue;
    // prefer spawning just off-screen (the arrow + marker still warn you)
    if (tries < 12 && onScreen(x, y, -30)) continue;
    return [x, y];
  }
  return best;
}

export const waves = {
  active: false,
  boss: false,
  bossType: "",
  bossT: 0,
  queue: [],
  gapT: 0,
  gap: [1, 2],
  maxAlive: 10,
  done: false,

  isBossWave(n) { return n % W.bossEvery === 0; },

  start(n) {
    G.wave = n;
    G.waveHits = 0;
    this.queue.length = 0;
    this.active = true;
    this.done = false;
    this.boss = this.isBossWave(n);
    this.gapT = 1.0;
    if (this.boss) {
      const order = BALANCE.bosses.order;
      this.bossType = order[(n / W.bossEvery - 1) % order.length];
      this.bossT = 1.6;
      this.maxAlive = 40;
      return;
    }
    let mix, budget, maxGroup;
    if (n <= W.intro.length) {
      const cfg = W.intro[n - 1];
      mix = cfg.mix;
      budget = cfg.budget;
      maxGroup = cfg.group[1];
      this.maxAlive = cfg.maxAlive;
      this.gap = cfg.gap;
    } else {
      mix = {};
      for (const t in W.unlock) if (W.unlock[t] <= n) mix[t] = W.weight[t];
      budget = W.budget.base + n * W.budget.perWave + Math.pow(n, W.budget.curve);
      maxGroup = Math.min(W.group.cap, W.group.max + Math.floor(n / W.group.perWaves));
      this.maxAlive = Math.min(W.maxAlive.cap, Math.round(W.maxAlive.base + n * W.maxAlive.perWave));
      const g = W.gap;
      this.gap = [Math.max(g.floorMin, g.min - n * g.perWave), Math.max(g.floorMax, g.max - n * g.perWave)];
    }
    // A robot's debut wave opens with a group of it, so you meet it on its own terms.
    for (const t in W.unlock) {
      if (W.unlock[t] === n && n > 1) {
        const count = t === "swarm" ? 6 : HEAVY[t] ? 1 : 2;
        this.queue.push({ type: t, count });
        budget -= BALANCE.enemies[t].threat * count;
      }
    }
    while (budget > 0.3) {
      const type = weightedType(mix);
      const count = groupSize(type, maxGroup);
      this.queue.push({ type, count });
      budget -= BALANCE.enemies[type].threat * count;
    }
  },

  /** Puts a warning marker on the edge; the group lands when it runs out. Also used by bosses. */
  spawnGroup(type, count) {
    const p = edgePoint();
    const w = G.warnings.get();
    if (!w) return;
    w.dead = false;
    w.x = p[0]; w.y = p[1];
    w.t = w.max = W.spawnWarn;
    w.type = type; w.count = count;
    const el = BALANCE.elite;
    w.elite = G.wave >= el.from ? Math.min(el.chanceMax, (G.wave - el.from + 1) * el.chance) : 0;
    w.spread = 14 + count * 5;
  },

  pending() {
    let n = 0;
    for (let i = 0; i < this.queue.length; i++) n += this.queue[i].count;
    for (let i = 0; i < G.warnings.count; i++) n += G.warnings.items[i].count;
    return n;
  },

  update(dt) {
    // warnings → robots
    const ws = G.warnings;
    for (let i = 0; i < ws.count; i++) {
      const w = ws.items[i];
      w.t -= dt;
      if (w.t > 0) continue;
      w.dead = true;
      for (let k = 0; k < w.count; k++) {
        const a = rand(0, TAU), d = k === 0 ? 0 : rand(8, w.spread);
        spawnEnemy(w.type, w.x + Math.cos(a) * d, w.y + Math.sin(a) * d, { elite: w.elite > 0 && chance(w.elite) });
      }
      fx.ring(w.x, w.y, 6, 40 + w.count * 3, 0.3, "#ffffff", 2);
      audio.play("spawn", w.x, w.y, 0.6);
    }
    ws.sweep();

    if (!this.active || G.state !== "playing") return;

    if (this.boss) {
      if (this.bossT > 0) {
        this.bossT -= dt;
        if (this.bossT <= 0) {
          const b = spawnEnemy(this.bossType, A.w / 2, -100, { spawnT: 0 });
          if (b) G.emit("bossSpawn", b);
        }
        return;
      }
      if (!G.boss && !G.bossFx && ws.count === 0 && hostileCount() === 0) this.complete();
      return;
    }

    this.gapT -= dt;
    if (this.gapT <= 0 && this.queue.length) {
      const alive = hostileCount();
      let incoming = 0;
      for (let i = 0; i < ws.count; i++) incoming += ws.items[i].count;
      if (alive + incoming < this.maxAlive) {
        // Later waves come from several edges at once.
        const lanes = G.wave >= W.lanes.three ? 3 : G.wave >= W.lanes.two ? 2 : 1;
        for (let l = 0; l < lanes && this.queue.length; l++) {
          const g = this.queue.shift();
          this.spawnGroup(g.type, g.count);
        }
        this.gapT = randRange(this.gap);
        // If the arena is nearly empty, hurry the next group along.
        if (alive < 3) this.gapT *= 0.5;
      }
    }
    if (!this.queue.length && ws.count === 0 && hostileCount() === 0) this.complete();
  },

  complete() {
    if (this.done) return;
    this.done = true;
    this.active = false;
    G.emit("waveClear", G.wave);
  },

  remaining() { return this.pending() + hostileCount(); },
};
