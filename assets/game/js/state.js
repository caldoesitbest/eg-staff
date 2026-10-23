/* The one shared game-state object, its pools and a tiny event bus for the UI. */

import { Pool, SpatialHash } from "./util.js";
import { BALANCE } from "./balance.js";

const MAX_ENEMIES = 420;

function makeEnemy() {
  return {
    dead: true, id: 0, type: "", def: null, kind: null, art: null, boss: false, elite: false, ramStamp: 0, target: null, targetId: 0,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, kx: 0, ky: 0, r: 10, scale: 1,
    ang: 0, pang: 0, hp: 1, maxHp: 1, speed: 0, mass: 1, contact: 1, score: 0, stars: 0,
    state: 0, t: 0, t2: 0, t3: 0, cd: 0, a: 0, b: 0, c: 0, tx: 0, ty: 0,
    flash: 0, spawnT: 0, ally: 0, allyMax: 1, slowMul: 1, dmgMul: 1, orbCd: 0, invuln: false, warnPlayed: false,
    mark: 0, traits: 0, shield: 0, shieldMax: 0, haste: 1, numAcc: 0, numCd: 0, parent: null, parentId: 0, slot: 0,
  };
}
function makePBullet() {
  return {
    dead: true, id: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 5, dmg: 10, life: 1,
    pierce: 0, hits: new Int32Array(8), nh: 0, bounces: 0, crit: false, homing: 0, kind: 0, explode: 0, split: false, knock: 0,
    tgt: null, tgtId: 0, tgtT: 0,
    explodeDmg: 0, chain: 0, special: 0, full: false, zapT: 0, plain: false,   // gun effects + charged shots
  };
}
function makeEBullet() {
  return { dead: true, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 6, dmg: 1, life: 1, look: "pink", bolt: false, grazed: false,
    age: 0, turn: 0, back: 0, homeX: 0, homeY: 0, owner: null, hp: 0, home: 0 };
}
function makePickup() {
  return { dead: true, kind: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 1, value: 1, t: 0, etype: "", pulled: false };
}
function makeWarning() {
  return { dead: true, x: 0, y: 0, t: 0, max: 1, type: "", count: 1, elite: false, spread: 0 };
}
function makeAsteroid() {
  return { dead: true, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 30, hp: 1, maxHp: 1, rot: 0, prot: 0, vr: 0, spr: null, flash: 0, seed: 1 };
}
function makePuddle() { return { dead: true, x: 0, y: 0, r: 30, life: 0, max: 1 }; }
function makeMine() { return { dead: true, x: 0, y: 0, t: 0, life: 1 }; }
function makeBlast() { return { dead: true, x: 0, y: 0, r: 0, dmg: 0, friendly: true, hurtsPlayer: false, enemyDmg: 0, col: "#fff", pal: 0 }; }

export const G = {
  state: "boot",             // boot | menu | playing | paused | clear | upgrade | shop | dying | over | win
  debug: { on: false, god: false, startWave: 1 },
  time: 0,                   // simulation seconds this run
  nextId: 1,

  // run stats
  wave: 0, score: 0, kills: 0, combo: 0, comboTimer: 0, bestCombo: 0,
  mark: 0, lap: 0, won: false, daily: null, desktop: false,
  stars: 0, starsTotal: 0, waveHits: 0, hitsTaken: 0, flawlessWaves: 0, bossesKilled: 0, starChain: 0, starChainT: 0,
  rerolls: 0, patches: 0,
  hitstop: 0,
  slowmo: 0, slowScale: 1,
  freezeT: 0,                // Sloth bullet-time after a perfect boost
  playerSlow: 1,             // Sloth (the boss) drowse aura: your move speed multiplier this tick
  vacuum: false,             // pull every pickup to the player (wave clear)
  perfects: 0,
  orbPos: new Float32Array(8),

  player: null,
  stats: null,               // computed from upgrades (upgrades.js)
  up: {},                    // upgrade levels by id
  guns: [{ id: "blaster", tier: 1 }, null], gunSlot: 0,   // two gun slots (armory.js)
  items: {},                 // shop gear by id → stacks
  shop: { offers: [], rerolls: 0 },
  gfx: { resScale: 1, particles: "high", glow: true, background: "full", grid: true, trails: true },   // effective graphics (main.js)
  hitMark: 0, killMark: 0,   // crosshair hit markers
  boss: null,
  bossFx: null,              // boss death sequence in progress
  maxR: 30,                  // biggest enemy radius this tick (for collision queries)

  enemies: new Pool(makeEnemy, MAX_ENEMIES),
  pb: new Pool(makePBullet, 700),
  eb: new Pool(makeEBullet, 600),
  pickups: new Pool(makePickup, 400),
  warnings: new Pool(makeWarning, 60),
  asteroids: new Pool(makeAsteroid, 32),
  puddles: new Pool(makePuddle, 60),
  blasts: new Pool(makeBlast, 80),
  mines: new Pool(makeMine, 24),
  hash: new SpatialHash(BALANCE.arena.w, BALANCE.arena.h, 64, MAX_ENEMIES),

  cam: { x: 1000, y: 650, px: 1000, py: 650, z: 1, P: 1, dpr: 1, cssW: 1, cssH: 1, viewW: 1, viewH: 1, leadX: 0, leadY: 0 },
  aimWorld: { x: 0, y: 0 },
  autoTarget: null,

  settings: null,            // storage settings object
  touchActive: false,        // the player is using touch (enables vibration)
  quality: 2,                // 2 high, 1 medium, 0 low (auto adjusts)

  // ---------- event bus ----------
  _ev: Object.create(null),
  on(name, fn) { (this._ev[name] || (this._ev[name] = [])).push(fn); },
  emit(name, a, b, c) {
    const list = this._ev[name];
    if (list) for (let i = 0; i < list.length; i++) list[i](a, b, c);
  },
};
