/* Rung 7 · Envy, The Mirror. The final rung ("cannot be earned"). It copies your gun, your moons
   and your boosts; below two-thirds health it starts using the signature move of every sin you beat
   (each one is called out by name in that sin's colour), and below 30% it goes into a frenzy. */

import { G } from "../state.js";
import { TAU, rand, randRange } from "../util.js";
import { sprites, C, SIN, PAL, P_ENVY, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, angleToPlayer } from "./index.js";
import { fireEnemyBullet, hurtPlayer } from "../world.js";
import { playerHurtRadius } from "../player.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, eachPlayer, moves, pace } from "./boss-common.js";
import { sloth } from "./boss-sloth.js";
import { greed } from "./boss-greed.js";
import { lust } from "./boss-lust.js";
import { kneelRing } from "./boss-pride.js";

const COL = SIN.envy;
let hooked = false;

// The moves it steals, in ladder order.
const STEALS = [
  { sin: "sloth", label: "SLOTH'S YAWN", run: (e) => sloth.stolen(e) },
  { sin: "glutton", label: "GLUTTONY'S HUNGER", run: (e, P) => { moves.fan(e, P, 11, 1.25, 250, "glutton"); e.pullT = 1.4; } },
  { sin: "greed", label: "GREED'S COINS", run: (e, P) => greed.stolen(e, P) },
  { sin: "lust", label: "LUST'S HEARTBREAK", run: (e, P) => lust.stolen(e, P) },
  { sin: "wrath", label: "WRATH'S FURY", run: (e) => { e.spiralT = 1.6; } },
  { sin: "pride", label: "PRIDE'S DECREE", run: (e) => kneelRing(e, 32, 220, 3) },
];

export const envy = {
  pal: P_ENVY, accent: COL,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.3);
    if (e.scaledToYou) fx.text(A.w / 2, A.h * 0.3 - 80, "IT COPIED YOUR POWER", SIN.envy, 22, 2);
    e.boostT = 0; e.boostDX = 0; e.boostDY = 0; e.pendingBoost = -1; e.fireCd = 1.2;
    e.stealCd = 2; e.stealI = 0; e.flashCol = COL; e.flashT = 0; e.pullT = 0; e.spiralT = 0; e.spin = 0; e.c2 = 0;
    if (!hooked) {
      hooked = true;
      G.on("boost", () => {
        const b = G.boss;
        if (b && !b.dead && b.type === "envy" && b.state === 0 && b.pendingBoost < 0) b.pendingBoost = 0.18;
      });
    }
  },
  update(e, dt, P) {
    const d = BB.envy;
    if (e.state === -1) return introUpdate(e, dt);
    const s = G.stats;
    const frac = e.hp / e.maxHp;
    const stealing = frac < d.steal.at;
    const frenzy = frac < d.frenzy.at;
    if (stealing && !e.b) { e.b = 1; fx.text(e.x, e.y - 70, "EVERYTHING YOU BEAT IS MINE", COL, 20, 1.6); audio.play("steal", e.x, e.y); }
    if (frenzy && e.b === 1) { e.b = 2; fx.text(e.x, e.y - 70, "FRENZY", "#ffffff", 26, 1.4); fx.shake(0.5); audio.play("bossIntro", e.x, e.y, 0.7); }
    const rate = (frenzy ? d.frenzy.rate : 1) / pace();
    minionTick(e, dt, d.minionEvery, d.minionMax, ["drone", "gunner", "ripper", "sniper"]);
    if (e.flashT > 0) e.flashT -= dt;

    // copy your boost (mirrored), a beat later
    if (e.pendingBoost >= 0) {
      e.pendingBoost -= dt;
      if (e.pendingBoost < 0) {
        e.pendingBoost = -1;
        e.boostT = d.boostTime;
        e.boostDX = -P.boostDX; e.boostDY = -P.boostDY;
        fx.ring(e.x, e.y, 8, 50, 0.25, COL, 2.5);
        audio.play("boost", e.x, e.y);
      }
    }
    if (e.boostT > 0) {
      e.boostT -= dt;
      e.vx = e.boostDX * d.boostSpeed; e.vy = e.boostDY * d.boostSpeed;
      if (Math.random() < 0.8) fx.p(0, e.x, e.y, -e.vx * 0.1, -e.vy * 0.1, 0.35, 2, P_ENVY, 3);
    } else {
      // stand where you'd see yourself in a mirror, pulled close enough that your shots reach it
      let tx = A.w - P.x, ty = A.h - P.y;
      const dx = tx - P.x, dy = ty - P.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < 280) { tx = P.x + (dx / dd) * 280; ty = P.y + (dy / dd) * 280; }
      else if (dd > d.maxRange) { tx = P.x + (dx / dd) * d.maxRange; ty = P.y + (dy / dd) * d.maxRange; }
      tx = Math.max(80, Math.min(A.w - 80, tx)); ty = Math.max(80, Math.min(A.h - 80, ty));
      seek(e, tx, ty, e.speed * (frenzy ? 1.3 : 1), 2.5, dt);
    }
    e.ang = angleToPlayer(e);

    // your gun, against you
    e.fireCd -= dt;
    if (e.fireCd <= 0) {
      const r = Math.max(1.2, s.rate * d.fireMul * rate);
      e.fireCd = 1 / r;
      const n = Math.min(5, s.projectiles);
      for (let i = 0; i < n; i++) {
        const a = e.ang + (i - (n - 1) / 2) * Math.max(0.14, s.fan);
        fireEnemyBullet(e.x + Math.cos(e.ang) * 26, e.y + Math.sin(e.ang) * 26, Math.cos(a) * d.shotSpeed, Math.sin(a) * d.shotSpeed, d.shotDmg, "envy", 6);
      }
      if (s.rear) fireEnemyBullet(e.x, e.y, -Math.cos(e.ang) * d.shotSpeed, -Math.sin(e.ang) * d.shotSpeed, d.shotDmg, "envy", 6);
      audio.play("enemyShot", e.x, e.y, 0.6);
    }

    // stolen sins, in ladder order
    if (stealing) {
      e.stealCd -= dt;
      if (e.stealCd <= 0) {
        e.stealCd = randRange(d.steal.every) * pace() * (frenzy ? 0.7 : 1);
        const m = STEALS[e.stealI % STEALS.length];
        e.stealI++;
        e.flashCol = SIN[m.sin]; e.flashT = 1;
        fx.text(e.x, e.y - 64, m.label, SIN[m.sin], 18, 1.2);
        fx.ring(e.x, e.y, 10, 110, 0.35, SIN[m.sin], 4);
        m.run(e, P);
        audio.play("steal", e.x, e.y, 0.8);
      }
    }
    if (e.pullT > 0 && !P.dead) {          // stolen Gluttony: a short pull
      e.pullT -= dt;
      if (P.boostT <= 0) {
        const dx = e.x - P.x, dy = e.y - P.y, dd = Math.hypot(dx, dy) || 1;
        P.vx += (dx / dd) * 80 * dt * 3; P.vy += (dy / dd) * 80 * dt * 3;
      }
    }
    if (e.spiralT > 0) {                    // stolen Wrath: a short spiral
      e.spiralT -= dt;
      e.spin += dt * 6;
      if (Math.floor(e.spiralT * 12) !== Math.floor((e.spiralT + dt) * 12)) moves.spiral(e, e.spin, 3, 220, "wrath");
    }

    // your moons too: they eat your shots and sting on touch
    const nm = Math.min(d.orbitMax, s.orbitals + (frenzy ? 1 : 0));
    e.c2 = nm;
    if (nm) {
      const pb = G.pb;
      for (let k = 0; k < nm; k++) {
        const a = -G.time * 3.2 + (k / nm) * TAU;
        const ox = e.x + Math.cos(a) * 62, oy = e.y + Math.sin(a) * 62;
        for (let i = 0; i < pb.count; i++) {
          const b = pb.items[i];
          if (b.dead) continue;
          if ((b.x - ox) ** 2 + (b.y - oy) ** 2 < 14 * 14) { b.dead = true; fx.sparks(b.x, b.y, a, 0.8, 3, P_ENVY, 200, 0.15); }
        }
        eachPlayer((Q) => { if ((Q.x - ox) ** 2 + (Q.y - oy) ** 2 < (10 + playerHurtRadius()) ** 2) hurtPlayer(1, ox, oy); });
      }
    }
  },
  onDeath(e) { startBossDeath(e); },
  draw(g, e, x, y) {
    const R = e.r;
    const col = e.flashT > 0 ? e.flashCol : COL;
    const pal = e.flashT > 0 ? Math.max(0, PAL.indexOf(e.flashCol)) : P_ENVY;
    glowBall(g, x, y, R * 3.4, pal, 0.4);
    g.save();
    g.translate(x, y);
    const spin = G.time * 0.8;
    g.rotate(spin);
    g.lineWidth = 3;
    g.strokeStyle = "rgba(109,123,255,0.3)";
    g.beginPath(); g.moveTo(0, -R * 1.8); g.lineTo(R * 1.5, 0); g.lineTo(0, R * 1.8); g.lineTo(-R * 1.5, 0); g.closePath(); g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = col;
    g.stroke();
    // orbiting shards, one for each sin on the ladder
    const sins = ["sloth", "glutton", "greed", "lust", "wrath", "pride", "envy"];
    for (let i = 0; i < 7; i++) {
      const a = -spin * 2 + (i / 7) * TAU;
      const sx = Math.cos(a) * R * 2.1, sy = Math.sin(a) * R * 2.1;
      g.fillStyle = SIN[sins[i]];
      g.beginPath(); g.moveTo(sx, sy - 6); g.lineTo(sx + 3, sy); g.lineTo(sx, sy + 6); g.lineTo(sx - 3, sy); g.closePath(); g.fill();
    }
    g.restore();
    // your reflection
    const spr = e.flash > 0 ? sprites.playerFlash : sprites.envy;
    const P = G.player;
    const face = P && P.x > x ? 1 : -1;
    g.save();
    g.translate(x, y);
    g.scale(face * 1.5, 1.5);
    g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    g.restore();
    const nm = e.c2 || 0;
    for (let k = 0; k < nm; k++) {
      const a = -G.time * 3.2 + (k / nm) * TAU;
      const ox = x + Math.cos(a) * 62, oy = y + Math.sin(a) * 62;
      glowBall(g, ox, oy, 18, P_ENVY, 0.8);
      g.fillStyle = "#e6e9ff"; g.beginPath(); g.arc(ox, oy, 4, 0, TAU); g.fill();
    }
    if (e.boostT > 0) { g.globalAlpha = 0.4; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, R * 1.6, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  },
};
