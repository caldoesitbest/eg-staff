/* Rung 5 · Wrath, The Overclock: bullet patterns → summons behind a shield → enraged dashes. */

import { G } from "../state.js";
import { TAU, rand, randInt, randRange, dash } from "../util.js";
import { C, SIN, P_WRATH, P_MAGENTA, P_RED, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, angleToPlayer } from "./index.js";
import { fireEnemyBullet } from "../world.js";
import { waves } from "../waves.js";
import { A, BB, bossInit, introUpdate, startBossDeath, glowBall, moves, pace } from "./boss-common.js";
import { leadAngle, leadK } from "./roster.js";

const PHASE_COL = [SIN.wrath, "#e05ad6", C.red];
const PHASE_PAL = [P_WRATH, P_MAGENTA, P_RED];

export const wrath = {
  pal: P_WRATH, accent: SIN.wrath,
  init(e) {
    bossInit(e, A.w / 2, A.h / 2);
    e.phase = 0; e.spin = 0; e.spiralT = 0; e.burstCd = 2.5; e.aimCd = 1.5; e.summoned = 0; e.summonCd = 1; e.shieldT = 0;
    e.dashCd = 3; e.dashT = 0; e.windT = 0; e.dashA = 0; e.orbitA = 0; e.burstWarned = false;
  },
  update(e, dt, P) {
    const d = BB.wrath;
    if (e.state === -1) return introUpdate(e, dt);
    const frac = e.hp / e.maxHp;
    const want = frac > d.phases[0] ? 0 : frac > d.phases[1] ? 1 : 2;
    if (want > e.phase) {
      e.phase = want;
      if (want === 2) G.emit("wrathEnraged", e);
      if (want === 1) {
        e.summoned = 0; e.summonCd = 0.8; e.shieldT = 14; e.dmgMul = d.shieldedTakes;
        fx.text(e.x, e.y - 80, "SUMMONING", PHASE_COL[1], 24, 1.4);
      } else {
        e.dmgMul = 1; e.shieldT = 0;
        fx.text(e.x, e.y - 80, "ENRAGED", C.red, 26, 1.4);
        fx.ring(e.x, e.y, 30, 260, 0.5, C.red, 5);
        fx.shake(0.5);
      }
      audio.play("bossIntro", e.x, e.y, 0.7);
    }
    const rage = (e.phase === 2 ? d.enraged.speed : 1) / pace();
    e.spin += dt * (1.2 + e.phase * 1.4);

    if (e.dashT > 0) {
      e.dashT -= dt;
      e.vx = Math.cos(e.dashA) * d.enraged.dashSpeed; e.vy = Math.sin(e.dashA) * d.enraged.dashSpeed;
      e.t3 -= dt;
      if (e.t3 <= 0) {
        e.t3 = 0.06;
        const pa = e.dashA + Math.PI / 2;
        fireEnemyBullet(e.x, e.y, Math.cos(pa) * 60, Math.sin(pa) * 60, 1, "red", 6);
        fireEnemyBullet(e.x, e.y, -Math.cos(pa) * 60, -Math.sin(pa) * 60, 1, "red", 6);
      }
      if (e.dashT <= 0 || e.x < 90 || e.x > A.w - 90 || e.y < 90 || e.y > A.h - 90) {
        e.dashT = 0; e.dashCd = randRange(d.enraged.dashEvery) * pace();
        moves.ring(e, d.enraged.dashRing, 210, "red");          // it lands in a burst
        fx.ring(e.x, e.y, 20, 130, 0.3, C.red, 4);
        fx.shake(0.25);
      }
      return;
    }
    if (e.windT > 0) {
      brake(e, 6, dt);
      e.windT -= dt;
      if (e.windT > 0.25) e.dashA = leadAngle(e.x, e.y, P, d.enraged.dashSpeed, leadK("boss"));
      if (e.windT <= 0) { e.dashT = 1.1; e.t3 = 0; audio.play("charge", e.x, e.y); fx.shake(0.2); }
      return;
    }
    e.orbitA += dt * 0.35 * rage;
    seek(e, A.w / 2 + Math.cos(e.orbitA) * 260, A.h / 2 + Math.sin(e.orbitA * 1.3) * 170, e.speed * rage, 1.5, dt);
    e.ang = angleToPlayer(e);

    const sp = d.spiral;
    e.spiralT -= dt;
    if (e.spiralT <= 0) {
      e.spiralT = 1 / (sp.rate * (e.phase === 1 ? 0.5 : rage));
      moves.spiral(e, e.spin * sp.turn, sp.arms, sp.speed * Math.min(1.5, rage), "wrath");
    }
    e.burstCd -= dt;
    if (e.burstCd <= 0.5 && !e.burstWarned) { e.burstWarned = true; audio.play("warn", e.x, e.y); }
    if (e.burstCd <= 0) {
      e.burstWarned = false;
      e.burstCd = randRange(d.burst.every) / rage;
      moves.ring(e, d.burst.count, d.burst.speed * Math.min(1.4, rage), e.phase === 2 ? "red" : "pink");
      fx.ring(e.x, e.y, 20, 120, 0.3, PHASE_COL[e.phase], 4);
      audio.play("enemyShot", e.x, e.y);
    }
    e.aimCd -= dt;
    if (e.aimCd <= 0 && e.phase !== 1) {
      e.aimCd = randRange(d.aimed.every) / rage;
      const la = leadAngle(e.x, e.y, P, d.aimed.speed, leadK("boss"));
      for (let i = 0; i < d.aimed.count; i++) {
        const a = la + (i - 1) * 0.18;
        fireEnemyBullet(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, Math.cos(a) * d.aimed.speed, Math.sin(a) * d.aimed.speed, 1, "magenta", 6);
      }
    }
    if (e.phase === 1 && e.shieldT > 0) {
      e.shieldT -= dt;
      e.summonCd -= dt;
      // the shield pulses: a ring every few seconds while it hides behind the summons
      e.pulseT = (e.pulseT === undefined ? 1.5 : e.pulseT) - dt;
      if (e.pulseT <= 0) { e.pulseT = d.summon.pulseEvery * pace(); moves.ring(e, d.summon.pulse, 190, "pink"); fx.ring(e.x, e.y, 30, 150, 0.3, PHASE_COL[1], 3); }
      if (e.summonCd <= 0 && e.summoned < d.summon.waves) {
        e.summonCd = d.summon.every;
        e.summoned++;
        waves.spawnGroup("drone", randInt(3, 4));
        waves.spawnGroup(e.summoned === 2 ? "swarm" : "ripper", e.summoned === 2 ? randInt(6, 7) : 2);
        fx.ring(e.x, e.y, 30, 200, 0.4, PHASE_COL[1], 3);
      }
      let minions = 0;
      const items = G.enemies.items;
      for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss && o.ally <= 0) minions++; }
      if (e.shieldT <= 0 || (e.summoned >= d.summon.waves && minions === 0 && G.warnings.count === 0)) {
        e.shieldT = 0; e.dmgMul = 1;
        fx.text(e.x, e.y - 70, "SHIELD DOWN", C.cyan, 20, 1.2);
        fx.ring(e.x, e.y, 30, 160, 0.4, C.cyan, 4);
        audio.play("clank", e.x, e.y);
      }
    }
    if (e.phase === 2) {
      e.dashCd -= dt;
      if (e.dashCd <= 0) { e.windT = d.enraged.dashWindup; e.dashA = angleToPlayer(e); audio.play("warn", e.x, e.y); }
    }
  },
  onDeath(e) { startBossDeath(e); },
  drawUnder(g, e, x, y) {
    if (e.windT > 0) {
      g.save();
      g.globalAlpha = 0.6;
      g.strokeStyle = e.windT <= 0.25 ? "#ffffff" : C.red;
      g.lineWidth = e.windT <= 0.25 ? 4 : 2;
      g.setLineDash(dash(16, 10));
      g.lineDashOffset = -G.time * 200;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(e.dashA) * 1100, y + Math.sin(e.dashA) * 1100); g.stroke();
      g.restore();
    }
  },
  draw(g, e, x, y) {
    const R = e.r;
    const col = PHASE_COL[e.phase], pal = PHASE_PAL[e.phase];
    glowBall(g, x, y, R * 3, pal, 0.42);
    // flickering flame tongues (the Wrath bolt, set on fire)
    g.save();
    g.translate(x, y);
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + e.spin * 0.6;
      const len = R * (1.9 + Math.sin(G.time * 9 + i * 1.7) * 0.25 + e.phase * 0.2);
      g.globalAlpha = 0.35;
      g.fillStyle = i % 2 ? col : "#ffd45c";
      g.beginPath();
      g.moveTo(Math.cos(a - 0.18) * R * 1.2, Math.sin(a - 0.18) * R * 1.2);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a + 0.18) * R * 1.2, Math.sin(a + 0.18) * R * 1.2);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    for (let k = 0; k < 3; k++) {
      const rr = R * (1.55 - k * 0.32);
      g.save();
      g.rotate(e.spin * (k % 2 ? -1.3 : 1) * (1 + k * 0.4));
      g.strokeStyle = k === 0 ? col : "rgba(255,255,255,0.35)";
      g.lineWidth = k === 0 ? 6 : 3;
      g.setLineDash(k === 0 ? dash(10, 7) : dash(4, 6));
      g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke();
      g.restore();
    }
    const grd = g.createRadialGradient(0, 0, 2, 0, 0, R);
    grd.addColorStop(0, e.flash > 0 ? "#ffffff" : "#3a1426");
    grd.addColorStop(1, "#12060e");
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, R * 0.9, 0, TAU); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = col; g.stroke();
    // the lightning bolt
    g.fillStyle = "#ffd45c";
    g.beginPath();
    g.moveTo(R * 0.1, -R * 0.62); g.lineTo(-R * 0.3, R * 0.06); g.lineTo(-R * 0.02, R * 0.06);
    g.lineTo(-R * 0.14, R * 0.62); g.lineTo(R * 0.32, -R * 0.08); g.lineTo(R * 0.04, -R * 0.08);
    g.closePath(); g.fill();
    g.restore();
    glowBall(g, x, y, 16, P_WHITE, 0.7);
    if (e.shieldT > 0) {
      g.save();
      g.globalAlpha = 0.25 + Math.sin(G.time * 6) * 0.08;
      g.fillStyle = PHASE_COL[1];
      g.beginPath(); g.arc(x, y, R * 1.9, 0, TAU); g.fill();
      g.globalAlpha = 0.8;
      g.strokeStyle = PHASE_COL[1];
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, R * 1.9, 0, TAU); g.stroke();
      g.restore();
    }
    if (e.burstCd < 0.5 && e.burstCd > 0) {
      g.save();
      g.globalAlpha = 1 - e.burstCd * 2;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, R * (2.6 - (0.5 - e.burstCd) * 2), 0, TAU); g.stroke();
      g.restore();
    }
  },
};
