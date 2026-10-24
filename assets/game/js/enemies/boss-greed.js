/* Rung 3 · Greed, The Golden Vault. It hoards the stars you leave on the floor: each one becomes a
   gold coin of armour orbiting it (less damage taken) until you knock the coins off by hurting it.
   Throws fans of boomerang coins, and spins across the arena like a flipped coin (path shown first). */

import { G } from "../state.js";
import { TAU, rand, randRange, dash } from "../util.js";
import { C, SIN, P_GREED, P_AMBER, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, angleToPlayer } from "./index.js";
import { fireEnemyBullet, dropPickup, hurtPlayer } from "../world.js";
import { playerHurtRadius } from "../player.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, moves, pace, eachPlayer } from "./boss-common.js";
import { lineToWall, leadAngle, leadK } from "./roster.js";

const COL = SIN.greed;
const IDLE = 0, WIND = 1, SPIN = 2;

function coinToss(e, P, count, arc, speed) {
  // thrown where you're heading
  const la = leadAngle(e.x, e.y, P, speed, leadK("boss"));
  const shots = moves.fan(e, { x: e.x + Math.cos(la) * 100, y: e.y + Math.sin(la) * 100 }, count, arc, speed, "coin", 8);
  for (const b of shots) { b.back = BB.greed.coins.back; b.owner = e; b.homeX = e.x; b.homeY = e.y; }
  audio.play("star", e.x, e.y, 0.7, { pitch: -5 });
}

export const greed = {
  pal: P_GREED, accent: COL,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.32);
    e.pips = 0; e.knock = 0; e.lastHp = e.hp; e.spinCd = 6; e.bounces = 0; e.trailT = 0; e.strafe = 1;
    e.rainCd = 2; e.rainT = 0; e.rain = Array.from({ length: 8 }, () => ({ x: 0, y: 0 })); e.nRain = 0;
  },
  update(e, dt, P) {
    const d = BB.greed;
    if (e.state === -1) { e.lastHp = e.hp; return introUpdate(e, dt); }
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 80, "MINE! ALL MINE!", COL, 22, 1.4); audio.play("bossIntro", e.x, e.y, 0.6); }
    const pc = pace() * (enraged ? 0.75 : 1);
    minionTick(e, dt, d.minionEvery, d.minionMax, ["gunner", "drone", "drone"]);

    // damage knocks coins off its armour (one per 3% of its health)
    const took = e.lastHp - e.hp;
    e.lastHp = e.hp;
    // coins also slip off on their own
    if (e.pips > 0) {
      e.decayT = (e.decayT || 0) + dt;
      if (e.decayT >= d.hoard.decay) { e.decayT = 0; e.pips--; fx.burst(e.x, e.y - e.r, 4, P_GREED, 120, 0.4, 1.2); }
    } else e.decayT = 0;
    if (took > 0 && e.pips > 0) {
      e.knock += took;
      const per = e.maxHp * d.hoard.knockEvery;
      while (e.knock >= per && e.pips > 0) {
        e.knock -= per; e.pips--;
        const a = rand(0, TAU);
        fx.burst(e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 6, P_GREED, 160, 0.4, 1.4);
        dropPickup(1, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 3);      // a gold star back for you
        audio.play("clank", e.x, e.y, 0.6);
      }
    }
    if (e.pips === 0) e.knock = 0;
    e.dmgMul = Math.max(0.45, 1 - e.pips * d.hoard.perPip);

    // hoard: drag loose stars in and turn them into armour
    const ps = G.pickups, R = e.r;
    for (let i = 0; i < ps.count; i++) {
      const q = ps.items[i];
      if (q.dead || q.kind === 2 || q.pulled) continue;
      const dx = e.x - q.x, dy = e.y - q.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > d.hoard.range) continue;
      q.vx += (dx / dd) * d.hoard.pull * dt; q.vy += (dy / dd) * d.hoard.pull * dt;
      if (dd < R + 8) {
        q.dead = true;
        if (e.pips < d.hoard.shieldMax) e.pips++;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * d.hoard.heal);
        e.lastHp = e.hp;
        fx.burst(q.x, q.y, 3, P_GREED, 80, 0.3, 1);
        audio.play("star", e.x, e.y, 0.35, { pitch: -3 });
      }
    }

    // golden rain: marked spots around you (one where you're heading), then the coins land
    if (e.rainT > 0) {
      e.rainT -= dt;
      if (e.rainT <= 0) {
        const r = d.rain.radius;
        for (let i = 0; i < e.nRain; i++) {
          const m = e.rain[i];
          eachPlayer((Q) => { if (Math.hypot(Q.x - m.x, Q.y - m.y) < r + playerHurtRadius()) hurtPlayer(d.rain.dmg, m.x, m.y); });
          fx.ring(m.x, m.y, 6, r, 0.3, COL, 4);
          fx.burst(m.x, m.y, 8, P_GREED, 220, 0.45, 1.5);
        }
        fx.shake(0.2);
        audio.play("clank", P.x, P.y, 0.8);
      }
    } else if (enraged) {
      e.rainCd -= dt;
      if (e.rainCd <= 0 && e.state === IDLE) {
        e.rainCd = randRange(d.rain.every) * pc;
        e.rainT = d.rain.warn;
        e.nRain = Math.min(e.rain.length, d.rain.count + (G.lap ? 2 : 0));
        const la = leadAngle(P.x, P.y, P, 1, 0);
        for (let i = 0; i < e.nRain; i++) {
          const m = e.rain[i];
          if (i === 0) { m.x = P.x + P.vx * 0.6; m.y = P.y + P.vy * 0.6; }
          else { const a = la + (i / e.nRain) * TAU + rand(-0.3, 0.3), rr = rand(70, d.rain.spread); m.x = P.x + Math.cos(a) * rr; m.y = P.y + Math.sin(a) * rr; }
          m.x = Math.max(40, Math.min(A.w - 40, m.x)); m.y = Math.max(40, Math.min(A.h - 40, m.y));
        }
        fx.text(e.x, e.y - 80, "MAKE IT RAIN", COL, 18, 1);
        audio.play("warn", e.x, e.y, 0.8);
      }
    }

    switch (e.state) {
      case IDLE: {
        const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
        let tx = P.x - (dx / dist) * 340 - (dy / dist) * 140 * e.strafe, ty = P.y - (dy / dist) * 340 + (dx / dist) * 140 * e.strafe;
        tx = Math.max(90, Math.min(A.w - 90, tx)); ty = Math.max(90, Math.min(A.h - 90, ty));
        seek(e, tx, ty, e.speed, 1.5, dt);
        e.ang = angleToPlayer(e);
        if (Math.random() < dt * 0.25) e.strafe = -e.strafe;
        e.cd -= dt; e.spinCd -= dt;
        if (e.spinCd <= 0) {
          e.state = WIND; e.t = d.spin.windup; e.a = angleToPlayer(e);
          fx.text(e.x, e.y - 76, "JACKPOT!", COL, 20, 1);
          audio.play("warn", e.x, e.y);
        } else if (e.cd <= 0) {
          e.cd = randRange(d.coins.every) * pc;
          coinToss(e, P, d.coins.count + (enraged ? 4 : 0), d.coins.arc + (enraged ? 0.4 : 0), d.coins.speed);
        }
        break;
      }
      case WIND:
        brake(e, 8, dt);
        e.t -= dt;
        if (e.t > d.spin.windup * 0.35) e.a = angleToPlayer(e);
        if (e.t <= 0) { e.state = SPIN; e.t = 2.6; e.bounces = d.spin.bounces + (enraged ? 1 : 0); e.contact = 2; audio.play("charge", e.x, e.y); }
        break;
      case SPIN: {
        e.t -= dt;
        e.vx = Math.cos(e.a) * d.spin.speed; e.vy = Math.sin(e.a) * d.spin.speed;
        let bounced = false;
        if (e.x <= e.r + 4 && e.vx < 0) { e.a = Math.PI - e.a; bounced = true; }
        else if (e.x >= A.w - e.r - 4 && e.vx > 0) { e.a = Math.PI - e.a; bounced = true; }
        if (e.y <= e.r + 4 && e.vy < 0) { e.a = -e.a; bounced = true; }
        else if (e.y >= A.h - e.r - 4 && e.vy > 0) { e.a = -e.a; bounced = true; }
        if (bounced) { e.bounces--; fx.shake(0.15); audio.play("clank", e.x, e.y); fx.sparks(e.x, e.y, e.a, 0.8, 8, P_GREED, 320, 0.25); }
        e.trailT -= dt;
        if (e.trailT <= 0) {
          e.trailT = d.spin.trailEvery;
          const pa = e.a + Math.PI / 2;
          fireEnemyBullet(e.x, e.y, Math.cos(pa) * 55, Math.sin(pa) * 55, 1, "coin", 8);
        }
        if (e.bounces < 0 || e.t <= 0) {
          e.state = IDLE; e.contact = d.contact; e.spinCd = randRange(d.spin.every) * pc; e.vx *= 0.2; e.vy *= 0.2;
          if (enraged) { moves.ring(e, d.spin.cashOut, 230, "coin"); audio.play("star", e.x, e.y, 0.8, { pitch: -8 }); }   // cashes out
        }
        break;
      }
    }
  },
  onDeath(e) {
    startBossDeath(e);
    // Payday: everything it hoarded spills out
    for (let i = 0; i < 12 + e.pips * 3; i++) dropPickup(1, e.x, e.y, 5);
  },
  drawUnder(g, e, x, y) {
    const d = BB.greed;
    if (e.rainT > 0) {
      // where the gold will land: rings that fill as it falls
      const p = 1 - e.rainT / d.rain.warn;
      g.save();
      for (let i = 0; i < e.nRain; i++) {
        const m = e.rain[i];
        g.globalAlpha = 0.12 + p * 0.25;
        g.fillStyle = COL;
        g.beginPath(); g.arc(m.x, m.y, d.rain.radius * p, 0, TAU); g.fill();
        g.globalAlpha = 0.85;
        g.strokeStyle = p > 0.7 ? "#ffffff" : COL;
        g.lineWidth = 2.5;
        g.setLineDash(dash(10, 7));
        g.beginPath(); g.arc(m.x, m.y, d.rain.radius, 0, TAU); g.stroke();
      }
      g.restore();
    }
    if (e.state !== WIND) return;
    const p = 1 - e.t / d.spin.windup;
    const locked = e.t <= d.spin.windup * 0.35;
    const len = Math.min(900, lineToWall(x, y, e.a));
    g.save();
    g.globalAlpha = 0.4 + p * 0.5;
    g.strokeStyle = locked ? "#ffffff" : COL;
    g.lineWidth = locked ? 4 : 2.5;
    g.setLineDash(dash(14, 10));
    g.lineDashOffset = -G.time * 160;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(e.a) * len, y + Math.sin(e.a) * len); g.stroke();
    g.restore();
  },
  draw(g, e, x, y) {
    const R = e.r;
    const spinning = e.state === SPIN;
    glowBall(g, x, y, R * 2.4, P_GREED, 0.35 + e.pips * 0.04);
    // armour coins
    for (let i = 0; i < e.pips; i++) {
      const a = G.time * 1.6 + (i / Math.max(1, e.pips)) * TAU;
      const cx = x + Math.cos(a) * (R + 26), cy = y + Math.sin(a) * (R + 26);
      g.fillStyle = "#e8a820"; g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.fill();
      g.fillStyle = COL; g.beginPath(); g.arc(cx, cy, 7, 0, TAU); g.fill();
    }
    g.save();
    g.translate(x, y);
    // a spinning coin squashes edge-on
    const sx = spinning ? Math.max(0.15, Math.abs(Math.cos(G.time * 18))) : 1;
    g.scale(sx, 1);
    const grd = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    grd.addColorStop(0, e.flash > 0 ? "#ffffff" : "#fff1b8");
    grd.addColorStop(0.5, e.flash > 0 ? "#ffffff" : COL);
    grd.addColorStop(1, "#8a5a00");
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.lineWidth = 4; g.strokeStyle = "#e8a820"; g.stroke();
    // milled rim
    g.save();
    g.rotate(G.time * 0.8);
    g.strokeStyle = "rgba(90,56,0,0.6)"; g.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); g.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98); g.stroke();
    }
    g.restore();
    // vault door + the $ eye
    g.fillStyle = "#3b2600";
    g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.fill();
    g.strokeStyle = "#e8a820"; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + G.time * (spinning ? 6 : 0.6);
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); g.lineTo(Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58); g.stroke();
    }
    g.restore();
    glowBall(g, x, y, 20, e.b ? 8 : P_AMBER, 0.95);
    g.fillStyle = "#fff6d6";
    g.font = "700 26px Rajdhani, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("$", x, y + 1);
  },
  stolen(e, P) { coinToss(e, P, 9, 1.2, 320); },
};
