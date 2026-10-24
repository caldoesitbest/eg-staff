/* Rung 2 · Gluttony, The Gluttony Engine: eats its own minions to heal and grow. Starve it. */

import { G } from "../state.js";
import { TAU, rand, randRange, dash } from "../util.js";
import { C, SIN, P_GLUT, P_HEART, P_RED, P_AMBER } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, face, angleToPlayer } from "./index.js";
import { leadAngle, leadK } from "./roster.js";
import { killEnemy, hurtPlayer } from "../world.js";
import { playerHurtRadius } from "../player.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, eachPlayer, chargeRing, moves, pace } from "./boss-common.js";

const COL = SIN.glutton;

export const glutton = {
  pal: P_GLUT, accent: COL,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.32);
    e.a = 0.3;     // mouth open amount
    e.meals = 0; e.healed = 0; e.shock = 0;
  },
  update(e, dt, P) {
    const d = BB.glutton;
    if (e.state === -1) return introUpdate(e, dt);
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 90, "IT'S STARVING", COL, 22, 1.4); audio.play("bossIntro"); }
    minionTick(e, dt, d.minionEvery * (enraged ? 0.75 : 1), d.minionMax, ["drone", "drone", "swarm", "splitter"]);
    const pc = pace() * (enraged ? 0.7 : 1);

    if (e.state === 0) {                         // lumber toward you
      seek(e, P.x, P.y, e.speed * (1 + (e.scale - 1) * 0.4), 1.2, dt);
      face(e, angleToPlayer(e), 1.6, dt);
      e.a += (0.3 - e.a) * Math.min(1, 4 * dt);
      e.cd -= dt; e.t2 -= dt; e.t3 -= dt;
      const dist = Math.hypot(P.x - e.x, P.y - e.y);
      if (e.cd <= 0) {
        e.state = 2; e.t = d.inhaleTime;
        fx.text(e.x, e.y - e.r * e.scale - 20, "FEAST!", COL, 24, 1.2);
        audio.play("bossIntro", e.x, e.y, 0.5);
      } else if (e.t2 <= 0 && dist < d.slamRadius * e.scale * 1.4) {
        e.state = 3; e.t = d.slamWindup;
        audio.play("warn", e.x, e.y);
      } else if (e.t3 <= 0) {
        e.t3 = randRange(d.spit.every) * pc;
        // spits where you're heading (the fan still covers where you are)
        const la = leadAngle(e.x, e.y, P, d.spit.speed, leadK("boss"));
        moves.fan(e, { x: e.x + Math.cos(la) * 100, y: e.y + Math.sin(la) * 100 }, d.spit.count + (enraged ? 4 : 0), d.spit.arc, d.spit.speed, "glutton");
        e.a = 1;
        audio.play("enemyShot", e.x, e.y);
        audio.play("chomp", e.x, e.y, 0.5);
      }
    } else if (e.state === 2) {                  // inhale: drags minions (and you, a little) into the maw
      brake(e, 3, dt);
      face(e, angleToPlayer(e), 0.8, dt);
      e.a += (1.1 - e.a) * Math.min(1, 5 * dt);
      e.t -= dt;
      const R = e.r * e.scale;
      const mx = e.x + Math.cos(e.ang) * R * 0.7, my = e.y + Math.sin(e.ang) * R * 0.7;
      const range = d.inhaleRange;
      const items = G.enemies.items;
      for (let i = 0; i < G.enemies.count; i++) {
        const o = items[i];
        if (o.dead || o.boss || o.ally > 0 || o.spawnT > 0) continue;
        const dx = mx - o.x, dy = my - o.y;
        const dd = Math.hypot(dx, dy) || 1;
        if (dd > range) continue;
        o.kx += (dx / dd) * d.pull * dt * 4;
        o.ky += (dy / dd) * d.pull * dt * 4;
        if (dd < R * 0.75 + o.r) {
          // CHOMP
          killEnemy(o, true);
          // every meal heals a little less, and it can only win back so much: starve it and it dies
          const heal = Math.min(e.maxHp * d.mealHeal * Math.max(0.3, 1 - e.meals * d.mealFalloff), Math.max(0, e.maxHp * d.healCap - e.healed));
          e.meals++; e.healed += heal;
          e.hp = Math.min(e.maxHp, e.hp + heal);
          e.scale = Math.min(d.maxGrow, e.scale + d.mealGrow);
          fx.text(e.x, e.y - R - 14, heal > 0 ? "+" + Math.round(heal) : "FULL", COL, 18, 0.9);
          fx.burst(mx, my, 10, P_GLUT, 180, 0.5, 1.6);
          fx.shake(0.12);
          audio.play("chomp", e.x, e.y);
        }
      }
      eachPlayer((Q) => {
        const dx = mx - Q.x, dy = my - Q.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < range) { Q.vx += (dx / dd) * d.playerPull * dt * 3; Q.vy += (dy / dd) * d.playerPull * dt * 3; }
      });
      if (Math.random() < 0.6) {
        const a = rand(0, TAU), rr = rand(range * 0.5, range);
        const px = mx + Math.cos(a) * rr, py = my + Math.sin(a) * rr;
        fx.p(1, px, py, (mx - px) * 2.4, (my - py) * 2.4, 0.4, 1, P_GLUT, 0);
      }
      if (e.t <= 0) { e.state = 0; e.cd = randRange(d.inhaleEvery) * pc; }
    } else if (e.state === 3) {                  // slam windup → shockwave
      brake(e, 6, dt);
      e.t -= dt;
      e.a += (0.1 - e.a) * Math.min(1, 6 * dt);
      if (e.t <= 0) {
        const R = d.slamRadius * Math.min(e.scale, d.slamGrowCap) * (e.shock ? d.aftershock.scale : 1);   // its slam outgrows it only so far: you can always get out of it
        fx.ring(e.x, e.y, e.r * e.scale, R, 0.4, COL, 8);
        fx.ring(e.x, e.y, e.r * e.scale, R * 0.8, 0.35, "#ffffff", 3);
        fx.debris(e.x, e.y, 14, "#7a5c96", 340);
        fx.shake(0.55);
        audio.play("slam", e.x, e.y);
        eachPlayer((Q) => { if (Math.hypot(Q.x - e.x, Q.y - e.y) < R + playerHurtRadius()) hurtPlayer(d.slamDmg, e.x, e.y); });
        if (enraged && !e.shock) { e.shock = 1; e.state = 3; e.t = d.aftershock.windup; audio.play("warn", e.x, e.y, 0.8); }   // starving: it slams again, wider
        else { e.shock = 0; e.state = 0; e.t2 = randRange(d.slamEvery) * pc; }
      }
    }
  },
  onDeath(e) { startBossDeath(e); },
  drawUnder(g, e, x, y) {
    const d = BB.glutton;
    if (e.state === 2) {
      g.save();
      g.globalAlpha = 0.14;
      g.strokeStyle = COL;
      g.lineWidth = 3;
      g.setLineDash(dash(6, 14));
      g.lineDashOffset = G.time * 140;
      g.beginPath(); g.arc(x, y, d.inhaleRange, 0, TAU); g.stroke();
      g.restore();
    }
    if (e.state === 3) chargeRing(g, x, y, d.slamRadius * Math.min(e.scale, d.slamGrowCap) * (e.shock ? d.aftershock.scale : 1), 1 - e.t / (e.shock ? d.aftershock.windup : d.slamWindup), e.shock ? "#ff8fb3" : COL);
  },
  draw(g, e, x, y, ang) {
    const R = e.r * e.scale;
    const flash = e.flash > 0;
    glowBall(g, x, y, R * 2.4, P_GLUT, 0.35 + (e.state === 2 ? 0.25 : 0));
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const grd = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    grd.addColorStop(0, flash ? "#ffffff" : "#4a2048");
    grd.addColorStop(1, flash ? "#ffd6e6" : "#160a20");
    const open = e.a;
    g.beginPath();
    g.moveTo(Math.cos(open * 0.5) * R * 0.15, 0);
    g.arc(0, 0, R, open * 0.5, TAU - open * 0.5);
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,79,139,0.25)";
    g.stroke();
    g.lineWidth = 2.5;
    g.strokeStyle = COL;
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.1)";
    g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const a = open * 0.5 + ((TAU - open) * i) / 6;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, R * 0.55, open * 0.5 + 0.2, TAU - open * 0.5 - 0.2); g.stroke();
    // maw + teeth + the dripping tongue from the Gluttony emoji
    g.fillStyle = "#2a0018";
    g.beginPath(); g.moveTo(R * 0.12, 0); g.arc(0, 0, R * 0.96, -open * 0.5, open * 0.5); g.closePath(); g.fill();
    glowBall(g, R * 0.55, 0, R * 0.5 * (0.6 + open * 0.4), P_HEART, 0.6);
    g.fillStyle = "#ffe9f7";
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 4; i++) {
        const t = 0.3 + i * 0.18;
        const bx = Math.cos(open * 0.5) * R * t, by = s * Math.sin(open * 0.5) * R * t;
        g.beginPath(); g.moveTo(bx - 4, by); g.lineTo(bx + 4, by); g.lineTo(bx, by - s * 9); g.closePath(); g.fill();
      }
    }
    for (let s = -1; s <= 1; s += 2) {
      const ex = Math.cos(s * (open * 0.5 + 0.55)) * R * 0.62, ey = Math.sin(s * (open * 0.5 + 0.55)) * R * 0.62;
      glowBall(g, ex, ey, 14, e.b ? P_RED : P_AMBER, 0.9);
      g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, 3, 0, TAU); g.fill();
    }
    g.restore();
  },
};
