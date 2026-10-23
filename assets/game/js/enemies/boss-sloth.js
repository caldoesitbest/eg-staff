/* Rung 1 · Sloth, The Idle King. The first boss, so it teaches:
   a drowsy aura slows you, yawns send out slow rings, and every so often it naps (takes double
   damage: be greedy) before waking with a telegraphed shockwave. Hug it and it swipes. */

import { G } from "../state.js";
import { TAU, rand, randRange, angDiff } from "../util.js";
import { C, SIN, P_SLOTH, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, angleToPlayer } from "./index.js";
import { hurtPlayer } from "../world.js";
import { playerHurtRadius } from "../player.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, eachPlayer, chargeRing, moves, pace } from "./boss-common.js";

const COL = SIN.sloth;
const IDLE = 0, YAWN = 1, NAP = 2, WAKE = 3, SWIPE = 4;

export const sloth = {
  pal: P_SLOTH, accent: COL,
  init(e) {
    const d = BB.sloth;
    bossInit(e, A.w / 2, A.h * 0.35);
    e.cd = 2.5;                         // yawn
    e.t2 = randRange(d.nap.every);      // nap
    e.t3 = 1;                           // swipe
    e.ringsLeft = 0; e.ringT = 0; e.zz = 0; e.mouth = 0;
  },
  update(e, dt, P) {
    const d = BB.sloth;
    if (e.state === -1) return introUpdate(e, dt);
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 90, "IT'S WIDE AWAKE", COL, 22, 1.4); audio.play("bossIntro", e.x, e.y, 0.6); }
    const pc = pace() * (enraged ? 0.75 : 1);
    if (e.state !== NAP) minionTick(e, dt, d.minionEvery, d.minionMax, ["drone", "drone", "splitter"]);

    // the drowse aura (off while it naps)
    const dist = Math.hypot(P.x - e.x, P.y - e.y);
    if (e.state !== NAP) {
      // everyone inside the drowse aura moves slower
      for (let i = 0; i < G.players.length; i++) {
        const Q = G.players[i];
        if (!Q.dead && Math.hypot(Q.x - e.x, Q.y - e.y) < d.drowse.radius) Q.slowMul = Math.min(Q.slowMul, d.drowse.slow);
      }
    }

    // second (and third) yawn ring, a beat after the first
    if (e.ringsLeft > 0) {
      e.ringT -= dt;
      if (e.ringT <= 0) { e.ringsLeft--; e.ringT = 0.45; moves.ring(e, d.yawn.count + (enraged ? 6 : 0), d.yawn.speed, "sloth"); }
    }
    e.mouth += ((e.state === YAWN ? 1 : 0) - e.mouth) * Math.min(1, 8 * dt);

    switch (e.state) {
      case IDLE:
        seek(e, P.x, P.y, e.speed, 0.8, dt);
        e.ang = angleToPlayer(e);
        e.cd -= dt; e.t2 -= dt; e.t3 -= dt;
        if (e.t2 <= 0) {
          e.state = NAP; e.t = d.nap.time; e.dmgMul = d.nap.takes;
          fx.text(e.x, e.y - e.r - 26, "Zzz… (hit it!)", COL, 18, 1.4);
          audio.play("heal", e.x, e.y, 0.5);
        } else if (e.t3 <= 0 && dist < d.swipe.range) {
          e.state = SWIPE; e.t = d.swipe.windup; e.a = angleToPlayer(e);
          audio.play("warn", e.x, e.y);
        } else if (e.cd <= 0) {
          e.state = YAWN; e.t = d.yawn.windup;
          fx.text(e.x, e.y - e.r - 20, "*yawn*", COL, 16, 0.9);
        }
        break;
      case YAWN:
        brake(e, 6, dt);
        e.t -= dt;
        if (e.t <= 0) {
          moves.ring(e, d.yawn.count + (enraged ? 6 : 0), d.yawn.speed, "sloth");
          e.ringsLeft = d.yawn.rings - 1 + (enraged ? 1 : 0); e.ringT = 0.45;
          audio.play("enemyShot", e.x, e.y);
          e.state = IDLE; e.cd = randRange(d.yawn.every) * pc;
        }
        break;
      case NAP:
        brake(e, 4, dt);
        e.t -= dt;
        e.zz -= dt;
        if (e.zz <= 0) { e.zz = 0.55; fx.text(e.x + rand(-10, 30), e.y - e.r - 6, "z", COL, 16 + rand(0, 8), 1.2); }
        if (e.t <= 0) {
          e.state = WAKE; e.t = d.nap.wakeWindup; e.dmgMul = 1;
          audio.play("warn", e.x, e.y);
        }
        break;
      case WAKE:
        e.t -= dt;
        if (e.t <= 0) {
          fx.ring(e.x, e.y, e.r, d.nap.wakeRadius, 0.4, COL, 8);
          fx.shake(0.4);
          audio.play("slam", e.x, e.y);
          eachPlayer((Q) => { if (Math.hypot(Q.x - e.x, Q.y - e.y) < d.nap.wakeRadius + playerHurtRadius()) hurtPlayer(d.nap.wakeDmg, e.x, e.y); });
          moves.ring(e, 12, 190, "sloth");
          e.state = IDLE; e.t2 = randRange(d.nap.every) * pc;
        }
        break;
      case SWIPE:
        brake(e, 8, dt);
        e.t -= dt;
        if (e.t <= 0) {
          eachPlayer((Q) => {
            const a = Math.atan2(Q.y - e.y, Q.x - e.x);
            if (Math.hypot(Q.x - e.x, Q.y - e.y) < d.swipe.reach + playerHurtRadius() && Math.abs(angDiff(e.a, a)) < d.swipe.arc / 2) hurtPlayer(d.swipe.dmg, e.x, e.y);
          });
          fx.sparks(e.x + Math.cos(e.a) * e.r, e.y + Math.sin(e.a) * e.r, e.a, d.swipe.arc / 2, 12, P_SLOTH, 420, 0.25);
          audio.play("charge", e.x, e.y, 0.7);
          e.state = IDLE; e.t3 = d.swipe.cooldown * pc;
        }
        break;
    }
  },
  onDeath(e) { startBossDeath(e); },
  drawUnder(g, e, x, y) {
    const d = BB.sloth;
    if (e.state !== NAP && e.state !== -1) {
      g.save();
      g.globalAlpha = 0.07;
      g.fillStyle = COL;
      g.beginPath(); g.arc(x, y, d.drowse.radius, 0, TAU); g.fill();
      g.globalAlpha = 0.35;
      g.strokeStyle = COL;
      g.lineWidth = 2;
      g.setLineDash([3, 12]);
      g.lineDashOffset = G.time * 6;
      g.stroke();
      g.restore();
    }
    if (e.state === WAKE) chargeRing(g, x, y, d.nap.wakeRadius, 1 - e.t / d.nap.wakeWindup, COL);
    if (e.state === SWIPE) {
      const p = 1 - e.t / d.swipe.windup;
      g.save();
      g.globalAlpha = 0.15 + p * 0.3;
      g.fillStyle = COL;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, d.swipe.reach, e.a - d.swipe.arc / 2, e.a + d.swipe.arc / 2); g.closePath(); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    }
  },
  draw(g, e, x, y) {
    const R = e.r;
    const napping = e.state === NAP;
    const flash = e.flash > 0;
    const face = G.player && G.player.x < x ? -1 : 1;
    glowBall(g, x, y, R * 2.3, P_SLOTH, napping ? 0.2 : 0.32);
    g.save();
    g.translate(x, y + Math.sin(G.time * (napping ? 1.2 : 2)) * 3);
    g.scale(face, 1);
    // long hanging arms with claws
    g.strokeStyle = "#8e97c7"; g.lineWidth = 9; g.lineCap = "round";
    for (const s of [-1, 1]) {
      const sw = e.state === SWIPE && s === 1 ? (1 - e.t / BB.sloth.swipe.windup) * -0.8 : 0;
      g.beginPath();
      g.moveTo(s * R * 0.62, R * 0.1);
      g.quadraticCurveTo(s * R * 1.2, R * (0.55 + sw), s * R * 1.05, R * (1.05 + sw));
      g.stroke();
      g.strokeStyle = "#e9ecff"; g.lineWidth = 2.5;
      for (let k = -1; k <= 1; k++) {
        g.beginPath(); g.moveTo(s * R * 1.05, R * (1.05 + sw)); g.lineTo(s * R * (1.05 + k * 0.08), R * (1.25 + sw)); g.stroke();
      }
      g.strokeStyle = "#8e97c7"; g.lineWidth = 9;
    }
    // body
    const grd = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    grd.addColorStop(0, flash ? "#ffffff" : "#d9dcf2");
    grd.addColorStop(0.6, flash ? "#ffffff" : "#8e97c7");
    grd.addColorStop(1, "#3a3f66");
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, 0, R * 0.95, R, 0, 0, TAU); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = COL; g.stroke();
    // face mask (the sloth's dark eye band)
    g.fillStyle = "#2a2d4a";
    g.beginPath(); g.ellipse(0, -R * 0.22, R * 0.62, R * 0.3, 0, 0, TAU); g.fill();
    g.fillStyle = "#e9ecff";
    g.beginPath(); g.ellipse(0, -R * 0.02, R * 0.3, R * 0.22, 0, 0, TAU); g.fill();
    // eyes: half-shut lids, fully shut when napping
    for (const s of [-1, 1]) {
      const ex = s * R * 0.3, ey = -R * 0.24;
      if (napping) {
        g.strokeStyle = "#e9ecff"; g.lineWidth = 2.5;
        g.beginPath(); g.arc(ex, ey - 2, 6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else {
        glowBall(g, ex, ey, 11, e.b ? 8 : P_SLOTH, 0.9);
        g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, 3.2, 0, TAU); g.fill();
        g.fillStyle = "#2a2d4a"; g.fillRect(ex - 8, ey - 8, 16, 6);   // heavy lid
      }
    }
    // mouth: a tiny smile, a big yawn
    g.fillStyle = "#1a1830";
    g.beginPath(); g.ellipse(0, R * 0.12, R * (0.08 + e.mouth * 0.16), R * (0.04 + e.mouth * 0.2), 0, 0, TAU); g.fill();
    g.restore();
    if (e.mouth > 0.2) glowBall(g, x, y + R * 0.12, R * 0.4 * e.mouth, P_WHITE, 0.4);
  },
  // Envy borrows the yawn
  stolen(e) { moves.ring(e, 22, 160, "sloth"); },
};
