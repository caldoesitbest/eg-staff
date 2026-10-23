/* Rung 6 · Pride, The Throne. Five crown gems orbit it and soak most of the damage while any are
   left: shatter them all and it's HUMBLED (double damage) until the crown regrows. Its Royal Decree
   is a sweeping laser (the sweep is drawn a full second before it fires); Kneel is a ring of shots
   with a gap to slip through. Too proud to chase you. */

import { G } from "../state.js";
import { TAU, rand, randRange, angDiff } from "../util.js";
import { C, SIN, P_PRIDE, P_AMBER, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, angleToPlayer, spawnEnemy } from "./index.js";
import { fireEnemyBullet, hurtPlayer, killEnemy } from "../world.js";
import { playerHurtRadius } from "../player.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, eachPlayer, pace } from "./boss-common.js";

const COL = SIN.pride;
const HOLD = 0, DECREE_WARN = 1, DECREE = 2;

function growGems(e) {
  const g = BB.pride.gems;
  for (let i = 0; i < g.count; i++) {
    const gem = spawnEnemy("gem", e.x, e.y, { spawnT: 0.25 });
    if (gem) { gem.parent = e; gem.parentId = e.id; gem.slot = i; }
  }
}
function gemsLeft(e) {
  let n = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && o.type === "gem" && o.parentId === e.id) n++; }
  return n;
}

/** Kneel: a ring with a gap you can slip through (also used by Envy). */
export function kneelRing(e, count, speed, gapSize) {
  const gapAt = Math.floor(rand(0, count));
  const off = rand(0, TAU);
  for (let i = 0; i < count; i++) {
    const d = (i - gapAt + count) % count;
    if (d < gapSize) continue;
    const a = off + (i / count) * TAU;
    fireEnemyBullet(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, 1, "pride", 7);
  }
}

export const pride = {
  pal: P_PRIDE, accent: COL,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.42);
    e.gemsGrown = false; e.humbleT = 0; e.regrowT = 0; e.kneelCd = 3; e.decreeCd = 5; e.beamA = 0; e.beamDir = 1; e.beamHit = 0;
  },
  update(e, dt, P) {
    const d = BB.pride;
    if (e.state === -1) {
      introUpdate(e, dt);
      if (e.state !== -1 && !e.gemsGrown) { e.gemsGrown = true; growGems(e); }
      return;
    }
    const enraged = e.hp < e.maxHp * 0.4;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 90, "HOW DARE YOU", COL, 22, 1.4); audio.play("bossIntro", e.x, e.y, 0.6); }
    const pc = pace() * (enraged ? 0.75 : 1);
    minionTick(e, dt, d.minionEvery, d.minionMax, ["bulwark", "gunner", "drone"]);

    // the crown: guarded → humbled → regrow
    const left = gemsLeft(e);
    if (e.humbleT > 0) {
      e.humbleT -= dt;
      e.dmgMul = d.gems.humbled;
      if (e.humbleT <= 0) { e.regrowT = d.gems.regrow; fx.text(e.x, e.y - 90, "The crown returns…", COL, 16, 1); }
    } else if (e.regrowT > 0) {
      e.regrowT -= dt;
      e.dmgMul = 1;
      if (e.regrowT <= 0) { growGems(e); audio.play("heal", e.x, e.y); }
    } else if (left === 0 && e.gemsGrown) {
      e.humbleT = d.gems.humbleTime;
      fx.text(e.x, e.y - 90, "HUMBLED", "#ffffff", 28, 1.5);
      fx.ring(e.x, e.y, 20, 240, 0.5, COL, 5);
      fx.shake(0.4);
      audio.play("bossDown", e.x, e.y, 0.5);
    } else e.dmgMul = d.gems.guarded;

    switch (e.state) {
      case HOLD: {
        // keep its distance and drift toward the middle, nose in the air
        const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
        let tx = A.w / 2 + Math.cos(G.time * 0.25) * 220, ty = A.h / 2 + Math.sin(G.time * 0.31) * 140;
        if (dist < 300) { tx = e.x - (dx / dist) * 200; ty = e.y - (dy / dist) * 200; }
        seek(e, Math.max(100, Math.min(A.w - 100, tx)), Math.max(100, Math.min(A.h - 100, ty)), e.speed, 1.2, dt);
        e.ang = angleToPlayer(e);
        e.kneelCd -= dt; e.decreeCd -= dt;
        if (e.decreeCd <= 0) {
          e.state = DECREE_WARN; e.t = d.decree.warn;
          e.beamDir = Math.random() < 0.5 ? -1 : 1;
          e.beamA = angleToPlayer(e) - e.beamDir * d.decree.arc / 2;
          fx.text(e.x, e.y - 90, "ROYAL DECREE", COL, 20, 1.1);
          audio.play("laser", e.x, e.y);
        } else if (e.kneelCd <= 0) {
          e.kneelCd = randRange(d.kneel.every) * pc;
          kneelRing(e, d.kneel.count + (enraged ? 8 : 0), d.kneel.speed, d.kneel.gap);
          fx.ring(e.x, e.y, 20, 110, 0.3, COL, 3);
          audio.play("enemyShot", e.x, e.y);
        }
        break;
      }
      case DECREE_WARN:
        brake(e, 8, dt);
        e.t -= dt;
        if (e.t <= 0) { e.state = DECREE; e.t = d.decree.sweep; e.beamHit = 0; audio.play("snipe", e.x, e.y); fx.shake(0.2); }
        break;
      case DECREE: {
        brake(e, 8, dt);
        e.t -= dt;
        e.beamA += e.beamDir * (d.decree.arc / d.decree.sweep) * dt;
        // beam vs. you: distance from your centre to the beam segment
        eachPlayer((Q) => {
          const bit = 1 << Q.slot;
          if (e.beamHit & bit) return;           // one hit per player per sweep
          const c = Math.cos(e.beamA), s = Math.sin(e.beamA);
          const px = Q.x - e.x, py = Q.y - e.y;
          const along = px * c + py * s;
          if (along > 0 && along < d.decree.length) {
            const side = Math.abs(-px * s + py * c);
            if (side < d.decree.width / 2 + playerHurtRadius()) { if (hurtPlayer(d.decree.dmg, e.x, e.y)) e.beamHit |= bit; }
          }
        });
        if (Math.random() < 0.7) {
          const r = rand(60, d.decree.length);
          fx.p(1, e.x + Math.cos(e.beamA) * r, e.y + Math.sin(e.beamA) * r, rand(-60, 60), rand(-60, 60), 0.3, 1, P_PRIDE, 4);
        }
        if (e.t <= 0) { e.state = HOLD; e.decreeCd = randRange(d.decree.every) * pc; }
        break;
      }
    }
  },
  onDeath(e) {
    const items = G.enemies.items;
    for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && o.type === "gem" && o.parentId === e.id) killEnemy(o, true); }
    startBossDeath(e);
  },
  drawUnder(g, e, x, y) {
    const d = BB.pride;
    if (e.state === DECREE_WARN) {
      // the whole sweep, shown before it fires
      const p = 1 - e.t / d.decree.warn;
      const a0 = e.beamA, a1 = e.beamA + e.beamDir * d.decree.arc;
      g.save();
      g.globalAlpha = 0.08 + p * 0.14;
      g.fillStyle = COL;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, d.decree.length, Math.min(a0, a1), Math.max(a0, a1)); g.closePath(); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.setLineDash([12, 10]);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a0) * d.decree.length, y + Math.sin(a0) * d.decree.length); g.stroke();
      g.restore();
    }
    if (e.state === DECREE) {
      const c = Math.cos(e.beamA), s = Math.sin(e.beamA), L = d.decree.length;
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = COL; g.globalAlpha = 0.45; g.lineWidth = d.decree.width * 1.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + c * L, y + s * L); g.stroke();
      g.strokeStyle = "#ffffff"; g.globalAlpha = 0.95; g.lineWidth = d.decree.width * 0.45;
      g.stroke();
      g.restore();
    }
    if (e.regrowT > 0) {
      const gd = d.gems;
      g.save();
      g.globalAlpha = 0.5 * (1 - e.regrowT / gd.regrow);
      g.strokeStyle = COL; g.lineWidth = 2;
      for (let i = 0; i < gd.count; i++) {
        const a = G.time * gd.spin + (i / gd.count) * TAU;
        g.beginPath(); g.arc(x + Math.cos(a) * gd.radius, y + Math.sin(a) * gd.radius, 14, 0, TAU); g.stroke();
      }
      g.restore();
    }
  },
  draw(g, e, x, y) {
    const R = e.r;
    const humbled = e.humbleT > 0;
    glowBall(g, x, y, R * 2.6, P_PRIDE, humbled ? 0.2 : 0.4);
    g.save();
    g.translate(x, y + Math.sin(G.time * 1.6) * 2);
    // cape
    g.fillStyle = "#3a1f8a";
    g.beginPath(); g.moveTo(-R * 0.9, -R * 0.2); g.lineTo(R * 0.9, -R * 0.2); g.lineTo(R * 1.15, R * 1.1); g.lineTo(-R * 1.15, R * 1.1); g.closePath(); g.fill();
    g.strokeStyle = "#ffc861"; g.lineWidth = 2; g.stroke();
    // body + head
    const grd = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    grd.addColorStop(0, e.flash > 0 ? "#ffffff" : "#e8deff");
    grd.addColorStop(0.55, e.flash > 0 ? "#ffffff" : COL);
    grd.addColorStop(1, "#2a1460");
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, R * 0.85, 0, TAU); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = "#ffffff"; g.stroke();
    // eyes, looking down on you
    g.fillStyle = humbled ? "#ffffff" : "#ffc861";
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * R * 0.3, -R * 0.12, R * 0.14, R * 0.06, 0, 0, TAU); g.fill(); }
    // the crown (tilted and dim when humbled)
    g.save();
    g.translate(0, -R * 0.82);
    if (humbled) { g.rotate(0.5); g.translate(R * 0.3, R * 0.2); g.globalAlpha = 0.55; }
    g.fillStyle = "#ffc861";
    g.beginPath();
    g.moveTo(-R * 0.62, R * 0.12); g.lineTo(-R * 0.62, -R * 0.42); g.lineTo(-R * 0.3, -R * 0.12); g.lineTo(0, -R * 0.55);
    g.lineTo(R * 0.3, -R * 0.12); g.lineTo(R * 0.62, -R * 0.42); g.lineTo(R * 0.62, R * 0.12);
    g.closePath(); g.fill();
    g.fillStyle = COL;
    for (const cx of [-R * 0.38, 0, R * 0.38]) { g.beginPath(); g.arc(cx, -R * 0.02, R * 0.07, 0, TAU); g.fill(); }
    g.restore();
    g.restore();
    if (!humbled && e.dmgMul < 1) {
      g.save();
      g.globalAlpha = 0.18 + Math.sin(G.time * 4) * 0.05;
      g.strokeStyle = COL; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, R * 1.25, 0, TAU); g.stroke();
      g.restore();
    }
  },
  stolen(e) { kneelRing(e, 30, 210, 3); },
};
