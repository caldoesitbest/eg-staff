/* Co-op (2-4 players), the game side. The host runs the real simulation for everyone; 15 times a
   second it sends a snapshot (players, robots, shots, pickups, rocks, plus the effects and sounds that
   happened) and each client draws it, smoothed. Each client moves its own astronaut itself (so it
   feels instant) and sends position, aim and buttons 30 times a second; the host fires that player's
   guns and decides who gets hit. Between waves everyone picks cards and shops on their own screen,
   then readies up. The transport (lobby + WebRTC) is net.js. */

import { G, usePlayer, makeCtx, syncCtx } from "./state.js";
import { BALANCE } from "./balance.js";
import { net } from "./net.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { sprites, PAL } from "./sprites.js";
import { updatePlayer } from "./player.js";
import { computeStats } from "./upgrades.js";
import { ROSTER } from "./enemies/roster.js";
import { BOSSES, BOSS_MINIONS } from "./enemies/bosses.js";
import { collideRocks, newBoostSerial, haptic } from "./world.js";
import { updateDrones } from "./armory.js";
import { waves } from "./waves.js";
import { TAU } from "./util.js";
import { evoCode, evoTick } from "./evolve.js";
import { mutVis, M as MUT } from "./mutations.js";

const TYPES = [...Object.keys(ROSTER), ...Object.keys(BOSS_MINIONS)];
const TYPE_IX = Object.fromEntries(TYPES.map((t, i) => [t, i]));
const GUNS = Object.keys(BALANCE.guns);
const LOOKS = ["pink", "amber", "violet", "mint", "red", "magenta", "green", "sloth", "glutton", "wrath", "pride", "envy", "coin", "heart"];
const LOOK_IX = Object.fromEntries(LOOKS.map((t, i) => [t, i]));
const ENVY = Object.keys(BALANCE.envyPowers);
export const SLOT_COL = ["#63f4ff", "#ff42d0", "#73ffce", "#ffc861"];

const SNAP_EVERY = 4;       // ticks between snapshots (15 a second)
const INPUT_EVERY = 2;      // ticks between a client's control packets (30 a second)

export const coop = {
  hooks: null,              // main.js: { startRun, toMenu, openUpgrade, closeBetween, startWave, gameOver, showWin, waveBanner, clearBanner, toast }
  ready: new Set(),         // host: slots that are ready for the next wave
  waiting: false,           // you pressed Ready and are waiting on the others
  lastSnap: 0,
  snapGap: 1 / 15,
  sinceSnap: 0,
  tick: 0,
};

// ---------------------------------------------------------------------------
// recording what happened on the host (effects + sounds), replayed on every client
// ---------------------------------------------------------------------------
const FX_REC = ["burst", "sparks", "debris", "smoke", "ring", "number", "text", "explode", "beam", "bolt", "screenFlash", "shake"];
let recFx = [], recAu = [], depth = 0;
const r1 = (v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v);
let hooked = false;
function hookRecording() {
  if (hooked) return;
  hooked = true;
  for (const name of FX_REC) {
    const orig = fx[name];
    fx[name] = function (...args) {
      if (G.net.role === "host" && depth === 0 && !G.personal && recFx.length < 180) recFx.push([G.fxOwner, name, ...args.map(r1)]);
      depth++;
      try { return orig.apply(fx, args); } finally { depth--; }
    };
  }
  const play = audio.play;
  audio.play = function (name, x, y, gain, opts) {
    if (G.net.role === "host" && !G.personal && recAu.length < 32) recAu.push([G.fxOwner, name, x === undefined ? null : Math.round(x), y === undefined ? null : Math.round(y), gain === undefined ? 1 : Math.round(gain * 100) / 100, (opts && opts.pitch) || 0]);
    return play.call(audio, name, x, y, gain, opts);
  };
}

function replay(evs, aus) {
  const mine = G.net.slot;
  const nums = G.settings.dmgNumbers;
  for (const ev of evs) {
    if (ev[0] === mine) continue;          // you already saw your own (your game made them)
    const name = ev[1];
    if (name === "number" && (nums === "off" || (nums === "crits" && !ev[5]))) continue;
    if (name === "shake" && ev[2] < 0.3) continue;   // only big shakes travel
    const f = fx[name];
    if (f) { try { f.apply(fx, ev.slice(2)); } catch (e) { /* skip */ } }
  }
  for (const a of aus) {
    if (a[0] === mine) continue;
    audio.play(a[1], a[2] === null ? undefined : a[2], a[3] === null ? undefined : a[3], a[4], a[5] ? { pitch: a[5] } : undefined);
  }
}

// ---------------------------------------------------------------------------
// binary snapshot bits
// ---------------------------------------------------------------------------
const buf = new ArrayBuffer(96 * 1024);
const dv = new DataView(buf);
let o = 0;
const qp = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 4)));       // position: quarter units
const qv = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
const qa = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535);
const ua = (v) => (v / 65535) * TAU;
const q100 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
const u8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const w8 = (v) => { dv.setUint8(o, v); o += 1; };
const w16 = (v) => { dv.setInt16(o, v); o += 2; };
const wu16 = (v) => { dv.setUint16(o, v); o += 2; };
const w32 = (v) => { dv.setUint32(o, v >>> 0); o += 4; };

function bossJSON(e) {
  const out = {};
  for (const k in e) {
    const v = e[k];
    if (typeof v === "number") out[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === "boolean" || typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v.length && v.length < 12 && v[0] && typeof v[0] === "object" && !v[0].kind && !v[0].pc) out[k] = v;
  }
  return out;
}

function playerRow(P) {
  const ctx = P.ctx;
  const g = ctx && ctx.guns ? ctx.guns[ctx.gunSlot] || ctx.guns[0] : null;
  let envy = "";
  for (const p of P.envy) envy += ENVY.indexOf(p.type) + ":" + Math.round(p.t * 10) / 10 + ":" + p.max + ",";
  return [P.slot, r1(P.x), r1(P.y), Math.round(P.vx), Math.round(P.vy), Math.round(P.aimAng * 1000) / 1000, P.facing, P.hp, P.maxHp, P.shield, P.maxShield,
    P.dead ? 1 : 0, r1(P.boostT * 10) / 10, Math.round(P.iframes * 100) / 100, P.charging ? 1 : 0, Math.round(P.charge * 100) / 100,
    g ? GUNS.indexOf(g.id) : 0, g ? g.tier : 1, ctx ? ctx.stars : 0, Math.round(P.reviveT * 100) / 100, r1(P.impX), r1(P.impY), Math.round(P.slowMul * 100) / 100,
    P.hurtSeq, P.orbN, P.slowR, P.turrets, Math.round(P.recoil * 10) / 10, P.perfSeq || 0, P.bubble ? 1 : 0, envy, P.gone ? 1 : 0, Math.round(P.grace * 100) / 100,
    Math.round((P.hurtAng || 0) * 100) / 100, P.killedBy || "", g ? evoCode(g.id, g.evo) : 0, Math.round((P.rep || 0) * 10) / 10, Math.round((P.soul || 0) * 10) / 10,
    P.gorge || 0, Math.round((P.frenzy || 0) * 10) / 10, Math.round((P.goldT || 0) * 10) / 10, Math.round((P.judgeT || 0) * 10) / 10];
}

/** Host: everything a client needs to draw this moment. */
function encodeSnapshot() {
  const boss = G.boss && !G.boss.dead ? G.boss : null;
  const meta = {
    k: "s", t: Math.round(G.time * 1000) / 1000, w: G.wave, lap: G.lap, mk: G.mark, sc: Math.floor(G.score), cb: G.combo, ct: Math.round(G.comboTimer * 100) / 100,
    left: waves.remaining(), bo: waves.boss ? waves.bossType : "", fz: G.freezeT > 0 ? 1 : 0,
    ts: G.hitstop > 0 ? 0 : G.slowmo > 0 ? G.slowScale : 1,       // how fast the world is running (slow-mo, hit-stop)
    p: G.players.map(playerRow), B: boss ? bossJSON(boss) : null, fx: recFx, au: recAu,
  };
  recFx = []; recAu = [];
  const json = new TextEncoder().encode(JSON.stringify(meta));
  o = 0;
  w32(json.length);
  new Uint8Array(buf, o, json.length).set(json);
  o += json.length;
  // robots (bosses go in the JSON)
  const en = G.enemies;
  let n = 0;
  const nAt = o; wu16(0);
  for (let i = 0; i < en.count && n < 220; i++) {
    const e = en.items[i];
    if (e.dead || e.boss) continue;
    n++;
    w32(e.id); w8(TYPE_IX[e.type] || 0); w16(qp(e.x)); w16(qp(e.y)); wu16(qa(e.ang));
    w8(u8(e.scale * 50)); w8(u8((e.hp / e.maxHp) * 255));
    w8((e.flash > 0 ? 1 : 0) | (e.elite ? 2 : 0) | (e.ally > 0 ? 4 : 0) | (e.warnPlayed ? 8 : 0) | (e.invuln ? 16 : 0));
    w8(e.traits); w8(u8(e.mark)); w8(u8(e.state + 1));
    w16(q100(e.t)); w16(q100(e.t2)); w16(q100(e.t3)); w16(Math.max(-32768, Math.min(32767, Math.round(e.a * 1000))));
    w16(q100(e.b)); w16(q100(e.c));
    w8(u8((e.spawnT / 0.35) * 255)); w8(u8(e.allyMax > 0 ? (e.ally / e.allyMax) * 255 : 0)); w8(u8(e.shieldMax > 0 ? (e.shield / e.shieldMax) * 255 : 0));
    w8(Math.min(15, e.tox) | (e.vuln > 0 ? 16 : 0) | (e.moon > 0 ? 32 : 0) | (e.phased ? 64 : 0) | (e.chill > 0 ? 128 : 0));
    w8((e.mut || 0) | (e.berserk ? 128 : 0) | (e.mutN === 1 && e.mut === MUT.PHANTOM ? 64 : 0)); w8(u8(mutVis(e) * 255));
  }
  dv.setUint16(nAt, n);
  // robot shots
  const eb = G.eb;
  n = 0;
  const ebAt = o; wu16(0);
  for (let i = 0; i < eb.count && n < 420; i++) {
    const b = eb.items[i];
    if (b.dead) continue;
    n++;
    w16(qp(b.x)); w16(qp(b.y)); w16(qv(b.vx)); w16(qv(b.vy)); w8(LOOK_IX[b.look] || 0); w8(u8(b.r * 10)); w8((b.bolt ? 1 : 0) | (b.hp > 0 ? 2 : 0));
  }
  dv.setUint16(ebAt, n);
  // player shots
  const pb = G.pb;
  n = 0;
  const pbAt = o; wu16(0);
  for (let i = 0; i < pb.count && n < 320; i++) {
    const b = pb.items[i];
    if (b.dead) continue;
    n++;
    w16(qp(b.x)); w16(qp(b.y)); w16(qv(b.vx)); w16(qv(b.vy)); w8(b.kind); w8(u8(b.r * 8)); w8(b.special | (b.full ? 4 : 0) | (b.crit ? 8 : 0)); w8(b.by ? b.by.slot : 0);
  }
  dv.setUint16(pbAt, n);
  // pickups
  const pk = G.pickups;
  n = 0;
  const pkAt = o; wu16(0);
  for (let i = 0; i < pk.count && n < 240; i++) {
    const q = pk.items[i];
    if (q.dead) continue;
    n++;
    w16(qp(q.x)); w16(qp(q.y)); w16(qv(q.vx)); w16(qv(q.vy)); w8(q.kind); w8(u8(q.life * 10)); w8(u8(q.t * 100));
  }
  dv.setUint16(pkAt, n);
  // rocks
  const as = G.asteroids;
  w8(as.count);
  for (let i = 0; i < as.count; i++) {
    const a = as.items[i];
    w16(qp(a.x)); w16(qp(a.y)); w16(qv(a.vx)); w16(qv(a.vy)); w8(u8(a.r)); wu16(qa(a.rot)); w32(a.seed); w8(a.flash > 0 ? 1 : 0);
  }
  // spawn warnings
  const ws = G.warnings;
  w8(Math.min(255, ws.count));
  for (let i = 0; i < ws.count && i < 255; i++) {
    const q = ws.items[i];
    w16(qp(q.x)); w16(qp(q.y)); w8(u8(q.t * 100)); w8(u8(q.max * 100)); w8(TYPE_IX[q.type] === undefined ? 255 : TYPE_IX[q.type]); w8(u8(q.count)); w8(u8(q.spread));
  }
  // sloth puddles + mines
  const pd = G.puddles;
  w8(Math.min(255, pd.count));
  for (let i = 0; i < pd.count && i < 255; i++) { const q = pd.items[i]; w16(qp(q.x)); w16(qp(q.y)); w8(u8(q.r)); w8(u8((q.life / q.max) * 255)); }
  const mn = G.mines;
  w8(Math.min(255, mn.count));
  for (let i = 0; i < mn.count && i < 255; i++) { const q = mn.items[i]; w16(qp(q.x)); w16(qp(q.y)); w8(u8(q.t * 10)); w8(u8(q.life * 10)); }
  // zones (evolution effects, mutation blasts): enough to draw them
  const zs = G.zones;
  let zn = 0;
  const znAt = o; w8(0);
  for (let i = 0; i < zs.count && zn < 120; i++) {
    const z = zs.items[i];
    if (z.dead) continue;
    zn++;
    w8(z.type); w16(qp(z.x)); w16(qp(z.y)); wu16(Math.round(z.r)); w16(qv(z.r0 * 100)); w16(qv(z.x2)); w16(qv(z.y2)); wu16(qa(z.a));
    wu16(Math.round(z.t * 1000)); wu16(Math.round(z.life * 1000)); w8(z.pal); w8(z.big ? 1 : 0);
  }
  dv.setUint8(znAt, zn);
  return buf.slice(0, o);
}

// ---------------------------------------------------------------------------
// client: applying a snapshot
// ---------------------------------------------------------------------------
const prevEnemy = new Map();     // id -> { x, y, ang } as last drawn
const prevRock = new Map();      // seed -> { x, y, rot }
const rockSprites = new Map();   // seed -> sprite
let rd = null, ro = 0;
const r8 = () => rd.getUint8(ro++);
const r16 = () => { const v = rd.getInt16(ro); ro += 2; return v; };
const ru16 = () => { const v = rd.getUint16(ro); ro += 2; return v; };
const r32 = () => { const v = rd.getUint32(ro); ro += 4; return v; };

function applySnapshot(data) {
  rd = new DataView(data);
  ro = 0;
  const jl = r32();
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(data, ro, jl)));
  ro += jl;
  const now = performance.now() / 1000;
  if (coop.lastSnap) coop.snapGap = Math.max(0.04, Math.min(0.2, coop.snapGap * 0.8 + (now - coop.lastSnap) * 0.2));
  coop.lastSnap = now;
  coop.sinceSnap = 0;

  // world clock, score, wave
  if (Math.abs(G.time - meta.t) > 0.25) G.time = meta.t; else G.time += (meta.t - G.time) * 0.2;
  G.wave = meta.w; G.lap = meta.lap; G.mark = meta.mk;
  G.score = meta.sc; G.combo = meta.cb; G.comboTimer = meta.ct;
  if (G.combo > G.bestCombo) G.bestCombo = G.combo;
  G.netLeft = meta.left;
  waves.boss = !!meta.bo; waves.bossType = meta.bo;
  G.freezeT = meta.fz ? 0.1 : 0;
  coop.ts = meta.ts === undefined ? 1 : meta.ts;

  // players
  for (const row of meta.p) applyPlayer(row);

  // robots
  const en = G.enemies;
  en.clear();
  let n = ru16();
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const id = r32(), type = TYPES[r8()];
    const x = r16() / 4, y = r16() / 4, ang = ua(ru16());
    const scale = r8() / 50, hpF = r8() / 255, flags = r8(), traits = r8(), mark = r8(), state = r8() - 1;
    const t = r16() / 100, t2 = r16() / 100, t3 = r16() / 100, a = r16() / 1000, b = r16() / 100, c = r16() / 100;
    const spawnT = (r8() / 255) * 0.35, allyF = r8() / 255, shF = r8() / 255;
    const st = r8(), mut = r8(), mv = r8();
    const e = en.get();
    if (!e) continue;
    const kind = ROSTER[type] || BOSS_MINIONS[type];
    const def = BALANCE.enemies[type];
    const prev = prevEnemy.get(id);
    e.dead = false; e.id = id; e.type = type; e.kind = kind; e.def = def; e.boss = false;
    e.art = sprites.robots[type] || null;
    e.r = def ? def.r : 14; e.scale = scale;
    e.ox = prev ? prev.x : x; e.oy = prev ? prev.y : y; e.oang = prev ? prev.ang : ang;
    e.sx = x; e.sy = y; e.sang = ang;
    e.x = e.px = e.ox; e.y = e.py = e.oy; e.ang = e.pang = e.oang;
    // the host's numbers, near enough (health bars only show on big robots and elites)
    const nW = Math.max(0, G.wave - 1), W = BALANCE.waves;
    e.maxHp = (def ? def.hp : 20) * (1 + nW * W.hpPerWave + nW * nW * W.hpCurve) * ((flags & 2) ? BALANCE.elite.hp : 1);
    e.hp = hpF * e.maxHp;
    e.flash = flags & 1 ? 0.05 : 0; e.elite = !!(flags & 2); e.ally = flags & 4 ? allyF * 5 : 0; e.allyMax = 5;
    e.warnPlayed = !!(flags & 8); e.invuln = !!(flags & 16);
    e.traits = traits; e.mark = mark; e.state = state; e.t = t; e.t2 = t2; e.t3 = t3; e.a = a; e.b = b; e.c = c;
    e.spawnT = spawnT; e.shieldMax = shF > 0 ? 1 : 0; e.shield = shF;
    e.vx = e.vy = 0; e.slowMul = 1; e.alpha = 1; e.beat = G.time * 8;
    e.tox = st & 15; e.vuln = st & 16 ? 1 : 0; e.moon = st & 32 ? 1 : 0; e.phased = !!(st & 64); e.chill = st & 128 ? 1 : 0;
    e.mut = mut & 31; e.berserk = !!(mut & 128); e.mutN = mut & 64 ? 1 : 0; e.mutVisNet = mv / 255;
    seen.add(id);
  }
  for (const id of prevEnemy.keys()) if (!seen.has(id)) prevEnemy.delete(id);
  // the boss
  G.boss = null;
  if (meta.B) {
    const e = en.get();
    if (e) {
      const prev = prevEnemy.get(meta.B.id);
      for (const k in meta.B) e[k] = meta.B[k];
      e.dead = false; e.boss = true; e.kind = BOSSES[meta.B.type]; e.def = BALANCE.bosses[meta.B.type]; e.art = null;
      e.ox = prev ? prev.x : e.x; e.oy = prev ? prev.y : e.y; e.oang = prev ? prev.ang : e.ang;
      e.sx = e.x; e.sy = e.y; e.sang = e.ang;
      e.x = e.px = e.ox; e.y = e.py = e.oy;
      G.boss = e;
    }
  }
  // robot shots
  const eb = G.eb;
  eb.clear();
  n = ru16();
  for (let i = 0; i < n; i++) {
    const q = eb.get();
    const x = r16() / 4, y = r16() / 4, vx = r16(), vy = r16(), look = LOOKS[r8()], r = r8() / 10, fl = r8();
    if (!q) continue;
    q.dead = false; q.sx = x; q.sy = y; q.x = q.px = x; q.y = q.py = y; q.vx = vx; q.vy = vy; q.look = look; q.r = r; q.bolt = !!(fl & 1); q.hp = fl & 2 ? 1 : 0;
  }
  // player shots
  const pb = G.pb;
  pb.clear();
  n = ru16();
  for (let i = 0; i < n; i++) {
    const q = pb.get();
    const x = r16() / 4, y = r16() / 4, vx = r16(), vy = r16(), kind = r8(), r = r8() / 8, fl = r8();
    r8();
    if (!q) continue;
    q.dead = false; q.sx = x; q.sy = y; q.x = q.px = x; q.y = q.py = y; q.vx = vx; q.vy = vy; q.kind = kind; q.r = r;
    q.special = fl & 3; q.full = !!(fl & 4); q.crit = !!(fl & 8);
  }
  // pickups
  const pk = G.pickups;
  pk.clear();
  n = ru16();
  for (let i = 0; i < n; i++) {
    const q = pk.get();
    const x = r16() / 4, y = r16() / 4, vx = r16(), vy = r16(), kind = r8(), life = r8() / 10, t = r8() / 100;
    if (!q) continue;
    q.dead = false; q.sx = x; q.sy = y; q.x = q.px = x; q.y = q.py = y; q.vx = vx; q.vy = vy; q.kind = kind; q.life = life; q.t = t;
  }
  // rocks
  const as = G.asteroids;
  as.clear();
  n = r8();
  for (let i = 0; i < n; i++) {
    const a = as.get();
    const x = r16() / 4, y = r16() / 4, vx = r16(), vy = r16(), r = r8(), rot = ua(ru16()), seed = r32(), flash = r8();
    if (!a) continue;
    const prev = prevRock.get(seed);
    a.dead = false; a.seed = seed; a.r = r; a.vx = vx; a.vy = vy;
    a.ox = prev ? prev.x : x; a.oy = prev ? prev.y : y; a.sx = x; a.sy = y; a.orot = prev ? prev.rot : rot; a.srot = rot;
    a.x = a.px = a.ox; a.y = a.py = a.oy; a.rot = a.prot = a.orot;
    a.flash = flash ? 0.05 : 0;
    let spr = rockSprites.get(seed);
    if (!spr || spr.P !== sprites.P) { spr = sprites.rock(r, seed); spr.P = sprites.P; rockSprites.set(seed, spr); }
    a.spr = spr;
  }
  if (rockSprites.size > 64) rockSprites.clear();
  // warnings
  const ws = G.warnings;
  ws.clear();
  n = r8();
  for (let i = 0; i < n; i++) {
    const w = ws.get();
    const x = r16() / 4, y = r16() / 4, t = r8() / 100, max = r8() / 100, ti = r8(), count = r8(), spread = r8();
    if (!w) continue;
    w.dead = false; w.x = x; w.y = y; w.t = t; w.max = max || 0.8; w.type = TYPES[ti] || ""; w.count = count; w.spread = spread;
  }
  const pd = G.puddles;
  pd.clear();
  n = r8();
  for (let i = 0; i < n; i++) {
    const q = pd.get();
    const x = r16() / 4, y = r16() / 4, r = r8(), lf = r8() / 255;
    if (!q) continue;
    q.dead = false; q.x = x; q.y = y; q.r = r; q.max = 2.6; q.life = lf * 2.6;
  }
  const mn = G.mines;
  mn.clear();
  n = r8();
  for (let i = 0; i < n; i++) {
    const q = mn.get();
    const x = r16() / 4, y = r16() / 4, t = r8() / 10, life = r8() / 10;
    if (!q) continue;
    q.dead = false; q.x = x; q.y = y; q.t = t; q.life = life;
  }
  const zs = G.zones;
  zs.clear();
  n = r8();
  for (let i = 0; i < n; i++) {
    const z = zs.get();
    const type = r8(), x = r16() / 4, y = r16() / 4, r = ru16(), r0 = r16() / 100, x2 = r16(), y2 = r16(), a = ua(ru16());
    const t = ru16() / 1000, life = ru16() / 1000, pal = r8(), big = r8();
    if (!z) continue;
    z.dead = false; z.type = type; z.x = x; z.y = y; z.r = r; z.r0 = r0; z.x2 = x2; z.y2 = y2; z.a = a;
    z.t = t; z.life = life || 1; z.pal = pal; z.col = PAL[pal] || "#ffffff"; z.big = !!big;
  }

  replay(meta.fx || [], meta.au || []);
}

function applyPlayer(row) {
  const slot = row[0];
  const P = G.players[slot];
  if (!P) return;
  const me = P === G.me;
  const wasDead = P.dead;
  P.hp = row[7]; P.maxHp = row[8]; P.shield = row[9]; P.maxShield = row[10];
  P.dead = !!row[11];
  P.reviveT = row[19];
  P.gone = !!row[31];
  if (me) {
    // the host decides health, hits and revives; you decide where you are
    if (P.dead && !wasDead) { P.deathT = 0; }
    if (!P.dead && wasDead) { P.x = row[1]; P.y = row[2]; P.vx = P.vy = 0; P.iframes = 2; }
    P.iframes = Math.max(P.iframes, row[13]);
    if (G.state === "playing" || G.state === "clear" || G.state === "dying") G.stars = row[18];
    // pushes from the host (knockback, Lust's lure, Gluttony's inhale)
    const ix = row[20] - (P.impAX || 0), iy = row[21] - (P.impAY || 0);
    P.impAX = row[20]; P.impAY = row[21];
    if (Math.abs(ix) + Math.abs(iy) < 3000) { P.vx += ix; P.vy += iy; }
    P.slowMul = row[22];
    if (row[23] > (P.hurtSeqSeen || 0)) {
      if (P.hurtSeqSeen !== undefined) { P.hurtAng = row[33]; P.hurtShow = 0.7; hurtFeedback(P); }
      P.hurtSeqSeen = row[23];
    }
    P.killedBy = row[34] || "";
    P.rep = row[36] || 0; P.soul = row[37] || 0;
    P.gorge = row[38] || 0; P.frenzy = row[39] || 0; P.goldT = row[40] || 0; P.judgeT = row[41] || 0;
    if (row[28] > (P.perfSeen || 0)) {
      if (P.perfSeen !== undefined) P.boostCdT *= 1 - BALANCE.player.boost.perfectRefund;
      P.perfSeen = row[28];
    }
    P.bubble = !!row[29];
    // stolen powers (drawn as chips; Overdrive changes how fast you move)
    const list = [];
    if (row[30]) for (const part of row[30].split(",")) { if (!part) continue; const [ti, t, max] = part.split(":"); list.push({ type: ENVY[+ti], t: +t, max: +max, tick: 0 }); }
    P.envy = list;
    return;
  }
  // a teammate: smoothed toward where the host says they are
  P.ox = P.x; P.oy = P.y; P.sx = row[1]; P.sy = row[2];
  if (P.first === undefined) { P.ox = P.sx; P.oy = P.sy; P.first = false; }
  P.vx = row[3]; P.vy = row[4]; P.aimAng = row[5]; P.facing = row[6];
  P.boostT = row[12]; P.iframes = row[13]; P.charging = !!row[14]; P.charge = row[15];
  P.gunId = GUNS[row[16]] || "blaster"; P.gunTier = row[17];
  P.orbN = row[24]; P.slowR = row[25]; P.turrets = row[26]; P.recoil = row[27]; P.bubble = !!row[29]; P.grace = row[32];
  P.gunEv = row[35] || 0;
  P.gorge = row[38] || 0; P.frenzy = row[39] || 0; P.goldT = row[40] || 0; P.judgeT = row[41] || 0;
}

function hurtFeedback(P) {
  fx.screenFlash("#ff2a55", 0.32, 2.6);
  fx.shake(BALANCE.fx.shake.hurt);
  audio.play("hurt");
  haptic(60);
  if (G.combo >= 5) fx.text(P.x, P.y - 40, "COMBO LOST", "#ff7d95", 14, 1);
  P.hurtT = 0.45;
  P.streak = 0;
}

// ---------------------------------------------------------------------------
// the per-tick hooks main.js calls
// ---------------------------------------------------------------------------
/** Host, before the world step: teammates' latest controls and positions. */
export function hostBefore(dt) {
  for (const P of G.players) {
    if (!P.input || P.gone) continue;
    const pk = P.pk;
    if (pk && pk.fresh) {
      pk.fresh = false;
      if (!P.dead) { P.x = pk.x; P.y = pk.y; P.vx = pk.vx; P.vy = pk.vy; }
      P.facing = pk.fc;
      const inp = P.input;
      inp.aimAng = pk.a; inp.fire = !!pk.f; inp.charge = !!pk.c; inp.move.x = pk.mx; inp.move.y = pk.my;
      P.boostT = pk.bt; P.grace = pk.gr; P.boostDX = pk.bdx; P.boostDY = pk.bdy;
      if (pk.bn > (P.bn || 0)) {
        // they boosted: mines, Envy copying it, a fresh perfect-dodge window
        P.bn = pk.bn;
        P.perfectUsed = false;
        P.boostSerial = newBoostSerial();
        usePlayer(P);
        G.emit("boost");
      }
      const ctx = P.ctx;
      if (pk.g !== ctx.gunSlot && ctx.guns[pk.g]) { usePlayer(P); G.gunSlot = pk.g; computeStats(); }
    } else if (!P.dead) {
      P.x += P.vx * dt; P.y += P.vy * dt;           // between packets: keep them gliding
      if (P.boostT > 0) P.boostT -= dt;
      if (P.grace > 0) P.grace -= dt;
    }
    P.v0x = P.vx; P.v0y = P.vy;
  }
  usePlayer(G.me);
}

/** Host, after the world step: collect the pushes teammates got, send a snapshot now and then. */
export function hostAfter() {
  for (const P of G.players) {
    if (!P.input) continue;
    P.impX += P.vx - P.v0x; P.impY += P.vy - P.v0y;
  }
  coop.tick++;
  if (coop.tick % SNAP_EVERY === 0 && net.connected) net.broadcast(encodeSnapshot(), false);
}

/** Client: your own astronaut (moved here), everyone else smoothed from snapshots. */
export function clientStep(dt) {
  G.time += dt;
  coop.sinceSnap += dt;
  const P = G.me;
  const live = G.state === "playing" || G.state === "clear" || G.state === "dying";
  if (live) {
    updatePlayer(dt, P);
    collideRocks(P, false);
    evoTick(P, G.stats, dt);
  }
  for (let i = 0; i < G.zones.count; i++) G.zones.items[i].t += dt;
  for (const Q of G.players) updateDrones(Q, Q === G.me ? G.stats : { turrets: Q.turrets }, dt);
  smooth();
  fx.update(dt);
  coop.tick++;
  if (live && coop.tick % INPUT_EVERY === 0) sendInput(P);
}

function smooth() {
  const k = Math.min(1, coop.sinceSnap / coop.snapGap);
  const t = coop.sinceSnap * (coop.ts === undefined ? 1 : coop.ts);
  const en = G.enemies;
  for (let i = 0; i < en.count; i++) {
    const e = en.items[i];
    e.x = e.px = e.ox + (e.sx - e.ox) * k;
    e.y = e.py = e.oy + (e.sy - e.oy) * k;
    let d = e.sang - e.oang;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    e.ang = e.pang = e.oang + d * k;
    prevEnemy.set(e.id, { x: e.x, y: e.y, ang: e.ang });
  }
  for (const pool of [G.eb, G.pb, G.pickups]) {
    for (let i = 0; i < pool.count; i++) { const q = pool.items[i]; q.x = q.px = q.sx + q.vx * t; q.y = q.py = q.sy + q.vy * t; }
  }
  const as = G.asteroids;
  for (let i = 0; i < as.count; i++) {
    const a = as.items[i];
    a.x = a.px = a.ox + (a.sx - a.ox) * k;
    a.y = a.py = a.oy + (a.sy - a.oy) * k;
    a.rot = a.prot = a.orot + (a.srot - a.orot) * k;
    prevRock.set(a.seed, { x: a.x, y: a.y, rot: a.rot });
  }
  for (const Q of G.players) {
    if (Q === G.me || Q.sx === undefined) continue;
    Q.px = Q.x = Q.ox + (Q.sx - Q.ox) * k;
    Q.py = Q.y = Q.oy + (Q.sy - Q.oy) * k;
    Q.paim = Q.aimAng;
    Q.tilt = Math.max(-0.4, Math.min(0.4, Q.vx / 700));
    const O = BALANCE.upgrades.orbit;
    for (let j = 0; j < Q.orbN; j++) {
      const a = G.time * O.speed + (j / Q.orbN) * TAU;
      Q.orbPos[j * 2] = Q.x + Math.cos(a) * O.radius; Q.orbPos[j * 2 + 1] = Q.y + Math.sin(a) * O.radius;
    }
  }
}

function sendInput(P) {
  net.toHost({
    k: "i", x: Math.round(P.x * 10) / 10, y: Math.round(P.y * 10) / 10, vx: Math.round(P.vx), vy: Math.round(P.vy),
    a: Math.round(P.aimAng * 1000) / 1000, f: P.wantFire ? 1 : 0, c: P.charging ? 1 : 0, mx: Math.round((P.mvx || 0) * 100) / 100, my: Math.round((P.mvy || 0) * 100) / 100,
    bt: Math.round(P.boostT * 1000) / 1000, gr: Math.round(P.grace * 1000) / 1000, bdx: Math.round(P.boostDX * 100) / 100, bdy: Math.round(P.boostDY * 100) / 100,
    bn: P.bn || 0, g: G.gunSlot, fc: P.facing,
  }, false);
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------
function onMessage(from, msg) {
  if (msg instanceof ArrayBuffer) {
    if (G.net.role === "client" && G.state !== "menu") applySnapshot(msg);
    return;
  }
  const H = coop.hooks;
  if (G.net.role === "host") {
    const m = net.members.find((x) => x.id === from);
    const P = m ? G.players[m.slot] : null;
    if (msg.k === "i" && P) { P.pk = msg; msg.fresh = true; }
    else if (msg.k === "ready" && P) { applyBuild(P, msg.build); coop.ready.add(P.slot); readyChanged(); }
    else if (msg.k === "bye") net.lost(from);
    return;
  }
  // client
  switch (msg.k) {
    case "lobby": net.members = msg.members; if (net.on.lobby) net.on.lobby(msg.members); break;
    case "start": startClient(msg); break;
    case "go": coop.waiting = false; H.closeBetween(msg.n); break;
    case "clear": H.waveBanner(msg); break;
    case "between": coop.waiting = false; H.openUpgrade(msg); break;
    case "ready": coop.readySlots = msg.slots; if (H.readyChanged) H.readyChanged(); break;
    case "over": H.gameOver(msg.sum); break;
    case "win": H.showWin(msg.sum); break;
    case "rushdone": H.rushDone(msg.sum); break;
    case "bye": net.lost(from); break;
  }
}

/** What a client sends when it's ready: its whole build (it shopped on its own screen). */
export function buildPayload() {
  const P = G.me;
  return { up: G.up, guns: G.guns, slot: G.gunSlot, items: G.items, stars: G.stars, starsTotal: G.starsTotal, patches: G.patches, rerolls: G.rerolls, hp: P.hp, shield: P.shield };
}
function applyBuild(P, b) {
  if (!b) return;
  const ctx = P.ctx;
  ctx.up = b.up || {}; ctx.guns = b.guns || ctx.guns; ctx.gunSlot = b.slot || 0; ctx.items = b.items || {};
  ctx.stars = b.stars || 0; ctx.starsTotal = b.starsTotal || 0; ctx.patches = b.patches || 0; ctx.rerolls = b.rerolls || 0;
  const cur = G.player;
  syncCtx();
  G.player = null;            // force a fresh load of this player's build
  usePlayer(P);
  computeStats();
  P.maxHp = G.stats.maxHp;
  P.maxShield = G.stats.shieldCap;
  P.hp = Math.max(1, Math.min(P.maxHp, b.hp || P.hp));
  P.shield = Math.min(P.maxShield, b.shield || 0);
  usePlayer(cur || G.me);
}

function readyChanged() {
  const slots = [...coop.ready];
  net.broadcast({ k: "ready", slots }, true);
  coop.readySlots = slots;
  if (coop.hooks.readyChanged) coop.hooks.readyChanged();
  // everyone ready (host included): next wave
  const need = G.players.filter((p) => !p.gone).map((p) => p.slot);
  if (need.every((s) => coop.ready.has(s))) coop.hooks.nextWave();
}

/** Who you're waiting on (names), for the Ready button. */
export function waitingOn() {
  const ready = new Set(coop.readySlots || []);
  return G.players.filter((p) => !p.gone && !ready.has(p.slot)).map((p) => p.name);
}

// ---------------------------------------------------------------------------
// starting, the flow between waves, leaving
// ---------------------------------------------------------------------------
export function initCoop(hooks) {
  coop.hooks = hooks;
  hookRecording();
  net.on.message = onMessage;
  net.on.closed = (why) => { if (G.net.role !== "off") { endCoop(); hooks.toMenu(); hooks.toast(why, 3500); } };
  net.on.left = (m) => {
    const P = G.players[m.slot];
    if (!P || G.net.role !== "host") return;
    P.gone = true; P.dead = true;
    G.net.n = Math.max(1, G.players.filter((p) => !p.gone).length);
    hooks.toast((m.name || "A player") + " left the game", 2500);
    coop.ready.delete(m.slot);
    if (G.state === "upgrade" || G.state === "shop") readyChanged();
    if (!G.players.some((p) => !p.dead && !p.gone)) G.emit("playerDown");
  };
}

/** The players for a co-op run, from the lobby (call before resetting builds). */
export function coopRoster() {
  return net.members.map((m) => ({ slot: m.slot, name: m.name, suit: m.suit }));
}

export function startHost() {
  G.net.role = "host";
  G.net.slot = 0;
  G.net.n = net.members.length;
  coop.ready.clear();
  coop.readySlots = [];
  net.closeChannel();
  // the host's pick of mode (Boss Rush needs the host to have unlocked it) and difficulty goes to everyone
  const rush = coop.mode === "rush";
  const mods = rush ? coop.mods || [] : [];
  net.broadcast({ k: "start", members: net.members, diff: G.settings.difficulty, rush, mods }, true);
  coop.hooks.startRun({ coop: true, difficulty: G.settings.difficulty, rush, mods });
}

function startClient(msg) {
  net.members = msg.members;
  const me = msg.members.find((m) => m.id === net.id);
  if (!me) return;
  G.net.role = "client";
  G.net.slot = me.slot;
  G.net.n = msg.members.length;
  coop.readySlots = [];
  coop.waiting = false;
  prevEnemy.clear(); prevRock.clear();
  net.closeChannel();
  coop.hooks.startRun({ coop: true, difficulty: msg.diff, rush: !!msg.rush, mods: msg.mods || [] });     // everyone plays the host's mode and difficulty
}

/** Players for a run: [{slot, name, suit}] → G.players with a build each; G.me is yours. */
export function setupPlayers(list, makePlayer) {
  G.players = [];
  for (const m of list) {
    const P = makePlayer(m.slot);
    P.name = m.name; P.suit = m.suit;
    P.ctx = makeCtx();
    if (G.net.role === "host" && m.slot !== 0) P.input = { move: { x: 0, y: 0 }, fire: false, charge: false, aimMode: "remote", aimAng: 0, mouse: { down: false }, swapTo: undefined, consumeBoost: () => false, consumeSwap: () => false };
    G.players[m.slot] = P;
  }
  G.players = G.players.filter(Boolean);
  G.me = G.players.find((p) => p.slot === G.net.slot) || G.players[0];
}

export function endCoop() {
  net.leave();
  G.net.role = "off";
  G.net.slot = 0;
  G.net.n = 1;
  coop.ready.clear();
  coop.waiting = false;
}

/** Host: tells everyone. */
export function hostSend(msg) { if (G.net.role === "host") net.broadcast(msg, true); }
export function hostReady() { coop.ready.add(0); readyChanged(); }
export function clientReady() {
  coop.waiting = true;
  net.toHost({ k: "ready", build: buildPayload() }, true);
}
export function resetReady() { coop.ready.clear(); coop.readySlots = []; coop.waiting = false; }
