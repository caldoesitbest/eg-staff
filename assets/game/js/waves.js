/* The wave director. Difficulty ramps by WHAT shows up (new robots, nastier mixes, more
   at once) far more than by health. Spawns come from the arena edges with a warning marker. */

import { MINIBOSSES, rollMiniboss } from "./enemies/minibosses.js";
import { G, diff, endless } from "./state.js";
import { BALANCE } from "./balance.js";
import { rand, randInt, randRange, chance, TAU, rng } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { onScreen } from "./world.js";
import { spawnEnemy, hostileCount } from "./enemies/index.js";
import { rollMutation } from "./mutations.js";

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

// Co-op: more players, more robots (not much tougher ones).
const crewBudget = () => 1 + 0.6 * (Math.max(1, G.net.n || 1) - 1);
const crewAlive = () => 1 + 0.35 * (Math.max(1, G.net.n || 1) - 1);

function nearestPlayerD2(x, y) {
  let bd = 1e9;
  for (let i = 0; i < G.players.length; i++) { const P = G.players[i]; if (P.gone) continue; bd = Math.min(bd, (x - P.x) ** 2 + (y - P.y) ** 2); }
  return bd;
}

function edgePoint() {
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
    const d2 = nearestPlayerD2(x, y);
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

  /** Which rung (0..6) a wave belongs to, and how many full laps of the ladder came before it. */
  rungOf(n) { return Math.floor(((n - 1) % 35) / W.bossEvery); },
  lapOf(n) { return Math.floor((n - 1) / 35); },
  markOf(n) {
    const M = BALANCE.marks;
    n += diff().mark;                 // harder modes: robots evolve earlier
    let m = 0;
    for (const at of M.at) if (n >= at) m++;
    const last = M.at[M.at.length - 1];
    if (n >= last) m += Math.floor((n - last) / M.every);
    return m;
  },

  start(n) {
    G.wave = n;
    G.waveHits = 0;
    G.lap = this.lapOf(n);
    const mark = this.markOf(n);
    this.newMark = mark > G.mark && n > 1;
    G.mark = mark;
    this.queue.length = 0;
    this.active = true;
    this.done = false;
    this.boss = this.isBossWave(n);
    this.gapT = 1.0;
    if (this.boss) {
      this.bossType = BALANCE.bosses.order[this.rungOf(n)];
      this.bossT = 1.6;
      this.maxAlive = 40;
      return;
    }
    let mix, budget, maxGroup;
    if (n <= W.intro.length) {
      const cfg = W.intro[n - 1];
      mix = cfg.mix;
      budget = cfg.budget * crewBudget() * diff().budget;
      maxGroup = cfg.group[1];
      this.maxAlive = Math.round(cfg.maxAlive * crewAlive() * diff().alive);
      this.gap = cfg.gap;
    } else {
      mix = {};
      for (const t in W.unlock) if (W.unlock[t] <= n) mix[t] = W.weight[t];
      budget = Math.min(W.budget.cap, W.budget.base + n * W.budget.perWave + Math.pow(n, W.budget.curve)) * crewBudget() * diff().budget * endless("budget");
      maxGroup = Math.min(W.group.cap, W.group.max + Math.floor(n / W.group.perWaves));
      this.maxAlive = Math.round(Math.min(Math.round(W.maxAlive.cap * crewAlive() * diff().alive), Math.round((W.maxAlive.base + n * W.maxAlive.perWave) * crewAlive() * diff().alive)) * endless("alive"));
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
    // some groups are squads that work together (more often later, and on harder difficulties)
    const squads = W.squads.filter((q) => q.from <= n + diff().mark);
    const squadChance = n >= W.squadFrom ? Math.min(W.squadMax, (n - W.squadFrom + 1) * W.squadPerWave) * diff().squads : 0;
    // 4.5: now and then a mini-boss joins the wave, partway through (it takes the place of some robots)
    const minis = rollMiniboss(n);
    if (minis) for (const t of minis) budget -= BALANCE.enemies[t].threat * 0.6;
    while (budget > 0.3) {
      if (squads.length && chance(squadChance)) {
        const q = squads[randInt(0, squads.length - 1)];
        const members = q.members.map(([t, c]) => ({ type: t, count: c }));
        this.queue.push({ squad: q.id, members, split: !!q.split });
        for (const m of members) budget -= BALANCE.enemies[m.type].threat * m.count;
        continue;
      }
      const type = weightedType(mix);
      const count = groupSize(type, maxGroup);
      this.queue.push({ type, count });
      budget -= BALANCE.enemies[type].threat * count;
    }
    if (minis) minis.forEach((t, i) => this.queue.splice(Math.min(this.queue.length, Math.floor(this.queue.length * (0.3 + 0.25 * i)) + 1), 0, { type: t, count: 1, mini: true }));
  },

  /** A squad lands together from one edge (a split squad: its halves from opposite edges). */
  spawnSquad(g) {
    const p = edgePoint();
    g.members.forEach((m, i) => {
      let x = p[0], y = p[1];
      if (g.split && i % 2) { x = A.w - x; y = A.h - y; }        // the other side of the arena
      else if (i) { x += rand(-60, 60); y += rand(-60, 60); }
      this.spawnGroup(m.type, m.count, [Math.max(46, Math.min(A.w - 46, x)), Math.max(46, Math.min(A.h - 46, y))]);
    });
  },

  /** Puts a warning marker on the edge; the group lands when it runs out. Also used by bosses. */
  spawnGroup(type, count, at) {
    const p = at || edgePoint();
    const w = G.warnings.get();
    if (!w) return;
    w.dead = false;
    w.x = p[0]; w.y = p[1];
    w.t = w.max = W.spawnWarn;
    w.type = type; w.count = count;
    const el = BALANCE.elite;
    const from = Math.max(el.minFrom, el.from - diff().mark);        // harder modes bring them sooner, never in the first waves
    w.elite = G.wave >= from ? Math.min(el.chanceMax * Math.min(1.6, diff().elite), (G.wave - from + 1) * el.chance * diff().elite) + endless("elite") : 0;
    if (G.mode === "rush" && !G.rush.mods.includes("entourage")) w.elite = 0;      // Boss Rush: plain minions unless you asked for more
    w.spread = 14 + count * 5;
    if (MINIBOSSES[type]) { w.elite = 0; w.t = w.max = W.spawnWarn * 1.8; w.mini = true; G.emit("minibossWarn", type); }
  },

  pending() {
    let n = 0;
    for (let i = 0; i < this.queue.length; i++) { const q = this.queue[i]; if (q.squad) for (const m of q.members) n += m.count; else n += q.count; }
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
        const mut = rollMutation(w.type, G.wave);          // mutations and elite traits never share a robot
        spawnEnemy(w.type, w.x + Math.cos(a) * d, w.y + Math.sin(a) * d, { elite: !mut && w.elite > 0 && chance(w.elite), mut });
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
          if (g.squad) this.spawnSquad(g); else this.spawnGroup(g.type, g.count);
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
