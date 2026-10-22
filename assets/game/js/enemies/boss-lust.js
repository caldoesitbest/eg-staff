/* Rung 4 · Lust, The Heartbreaker. Circles you, blows homing kisses, breaks into heart-shaped
   bursts, blinks around the arena (where it'll land is marked first), and its Allure drags you in
   for a couple of seconds: boost out of it. */

import { G } from "../state.js";
import { TAU, rand, randRange } from "../util.js";
import { C, SIN, P_LUST, P_HEART, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, angleToPlayer } from "./index.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, moves, pace } from "./boss-common.js";

const COL = SIN.lust;
const ROAM = 0, LURE_WIND = 1, LURE = 2, BLINK_OUT = 3, BLINK_IN = 4, HEART_WIND = 5;

export const lust = {
  pal: P_LUST, accent: COL,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.3);
    e.kissCd = 2; e.heartCd = 4; e.lureCd = 6; e.blinkCd = 5; e.orb = rand(0, TAU); e.alpha = 1; e.bx = 0; e.by = 0; e.beat = 0;
  },
  update(e, dt, P) {
    const d = BB.lust;
    if (e.state === -1) return introUpdate(e, dt);
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 70, "HEARTBROKEN", COL, 22, 1.4); audio.play("bossIntro", e.x, e.y, 0.6); }
    const pc = pace() * (enraged ? 0.75 : 1);
    minionTick(e, dt, d.minionEvery, d.minionMax, ["swarm", "splitter", "drone"]);
    e.beat += dt * (enraged ? 9 : 6);

    switch (e.state) {
      case ROAM: {
        // circle you at a flirty distance
        e.orb += dt * 0.55 * (enraged ? 1.3 : 1);
        const R = 340 + Math.sin(G.time * 0.7) * 60;
        let tx = P.x + Math.cos(e.orb) * R, ty = P.y + Math.sin(e.orb) * R;
        tx = Math.max(80, Math.min(A.w - 80, tx)); ty = Math.max(80, Math.min(A.h - 80, ty));
        seek(e, tx, ty, e.speed, 2.2, dt);
        e.ang = angleToPlayer(e);
        e.kissCd -= dt; e.heartCd -= dt; e.lureCd -= dt; e.blinkCd -= dt;
        if (e.lureCd <= 0) {
          e.state = LURE_WIND; e.t = d.allure.windup;
          fx.text(e.x, e.y - 60, "♥ come here ♥", COL, 18, 1);
          audio.play("charm", e.x, e.y);
        } else if (e.blinkCd <= 0) {
          e.state = BLINK_OUT; e.t = d.blink.fade;
          const a = rand(0, TAU), r = rand(300, 440);
          e.bx = Math.max(90, Math.min(A.w - 90, P.x + Math.cos(a) * r));
          e.by = Math.max(90, Math.min(A.h - 90, P.y + Math.sin(a) * r));
          audio.play("steal", e.x, e.y, 0.6);
        } else if (e.heartCd <= 0) {
          e.state = HEART_WIND; e.t = 0.45;
          audio.play("warn", e.x, e.y, 0.6);
        } else if (e.kissCd <= 0) {
          e.kissCd = randRange(d.kiss.every) * pc;
          moves.kiss(e, P, d.kiss.count + (enraged ? 2 : 0), d.kiss.speed, d.kiss.turn, d.kiss.life);
          audio.play("charm", e.x, e.y, 0.6);
        }
        break;
      }
      case HEART_WIND:
        brake(e, 6, dt);
        e.t -= dt;
        if (e.t <= 0) {
          moves.heart(e, d.heart.count + (enraged ? 8 : 0), d.heart.speed, "heart");
          fx.ring(e.x, e.y, 10, 90, 0.3, COL, 3);
          audio.play("enemyShot", e.x, e.y);
          e.state = ROAM; e.heartCd = randRange(d.heart.every) * pc;
        }
        break;
      case LURE_WIND:
        brake(e, 6, dt);
        e.t -= dt;
        if (e.t <= 0) { e.state = LURE; e.t = d.allure.time; }
        break;
      case LURE: {
        brake(e, 6, dt);
        e.t -= dt;
        if (!P.dead && P.boostT <= 0) {
          const dx = e.x - P.x, dy = e.y - P.y, dd = Math.hypot(dx, dy) || 1;
          if (dd < d.allure.range) { P.vx += (dx / dd) * d.allure.pull * dt * 3; P.vy += (dy / dd) * d.allure.pull * dt * 3; }
          if (Math.random() < 0.5) fx.p(1, P.x, P.y, dx * 1.6, dy * 1.6, 0.5, 1, P_HEART, 0);
        }
        if (e.t <= 0) { e.state = ROAM; e.lureCd = randRange(d.allure.every) * pc; }
        break;
      }
      case BLINK_OUT:
        brake(e, 10, dt);
        e.t -= dt;
        e.alpha = Math.max(0.1, e.t / d.blink.fade);
        e.invuln = true;
        if (e.t <= 0) {
          e.x = e.px = e.bx; e.y = e.py = e.by;
          e.state = BLINK_IN; e.t = 0.3;
        }
        break;
      case BLINK_IN:
        e.t -= dt;
        e.alpha = 1 - e.t / 0.3;
        if (e.t <= 0) {
          e.alpha = 1; e.invuln = false;
          moves.ring(e, 10, 180, "heart");
          fx.burst(e.x, e.y, 12, P_LUST, 220, 0.5, 1.6);
          e.state = ROAM; e.blinkCd = randRange(d.blink.every) * pc;
        }
        break;
    }
  },
  onDeath(e) { e.alpha = 1; startBossDeath(e); },
  drawUnder(g, e, x, y) {
    const d = BB.lust;
    if (e.state === BLINK_OUT || e.state === BLINK_IN) {
      // where it's about to appear
      g.save();
      g.globalAlpha = 0.7;
      g.strokeStyle = COL;
      g.lineWidth = 3;
      g.setLineDash([8, 8]);
      g.lineDashOffset = G.time * 40;
      g.beginPath(); g.arc(e.bx, e.by, e.r + 14, 0, TAU); g.stroke();
      g.restore();
    }
    if (e.state === LURE_WIND || e.state === LURE) {
      g.save();
      const p = e.state === LURE ? 1 : 1 - e.t / d.allure.windup;
      for (let k = 0; k < 3; k++) {
        const f = ((G.time * 0.8 + k / 3) % 1);
        g.globalAlpha = (1 - f) * 0.5 * p;
        g.strokeStyle = COL;
        g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, e.r + (1 - f) * 360, 0, TAU); g.stroke();
      }
      g.restore();
    }
  },
  draw(g, e, x, y) {
    const R = e.r;
    const beat = 1 + Math.max(0, Math.sin(e.beat)) * 0.12;
    g.save();
    g.globalAlpha = e.alpha === undefined ? 1 : e.alpha;
    glowBall(g, x, y, R * 2.8, P_LUST, 0.4);
    g.translate(x, y + Math.sin(G.time * 2.4) * 3);
    // legs ending in heels
    g.strokeStyle = "#a64a7b"; g.lineWidth = 6; g.lineCap = "round";
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * R * 0.3, R * 0.6); g.lineTo(s * R * 0.42, R * 1.45); g.stroke();
      g.fillStyle = COL;
      g.beginPath(); g.moveTo(s * R * 0.42, R * 1.45); g.lineTo(s * R * 0.72, R * 1.5); g.lineTo(s * R * 0.42, R * 1.32); g.closePath(); g.fill();
    }
    // hourglass body
    const grd = g.createLinearGradient(0, -R, 0, R);
    grd.addColorStop(0, e.flash > 0 ? "#ffffff" : "#f3c6de");
    grd.addColorStop(0.5, e.flash > 0 ? "#ffffff" : COL);
    grd.addColorStop(1, "#4a1636");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-R * 0.75, -R * 0.75); g.quadraticCurveTo(0, -R * 1.05, R * 0.75, -R * 0.75);
    g.quadraticCurveTo(R * 0.25, 0, R * 0.75, R * 0.7); g.quadraticCurveTo(0, R * 0.95, -R * 0.75, R * 0.7);
    g.quadraticCurveTo(-R * 0.25, 0, -R * 0.75, -R * 0.75);
    g.closePath(); g.fill();
    g.lineWidth = 2; g.strokeStyle = "#ffe3f1"; g.stroke();
    // visor
    g.fillStyle = "#2a0a1e";
    g.beginPath(); g.ellipse(0, -R * 0.58, R * 0.42, R * 0.13, 0, 0, TAU); g.fill();
    g.fillStyle = e.b ? C.red : "#ffd1ea";
    g.fillRect(-R * 0.3, -R * 0.6, R * 0.6, R * 0.05);
    // the beating heart core
    g.scale(beat, beat);
    g.fillStyle = e.b ? C.red : C.magenta;
    g.beginPath();
    const h = R * 0.32;
    g.moveTo(0, h * 0.9);
    g.bezierCurveTo(-h * 1.3, 0, -h * 0.6, -h * 1.0, 0, -h * 0.4);
    g.bezierCurveTo(h * 0.6, -h * 1.0, h * 1.3, 0, 0, h * 0.9);
    g.closePath(); g.fill();
    g.restore();
    glowBall(g, x, y, R * 0.6 * beat, P_HEART, 0.6 * (e.alpha === undefined ? 1 : e.alpha));
  },
  stolen(e, P) { moves.heart(e, 24, 165, "heart"); moves.kiss(e, P, 2, 200, 1.5, 4); },
};
