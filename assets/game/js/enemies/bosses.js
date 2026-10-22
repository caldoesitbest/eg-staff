/* Bosses, every 5 waves, in rotation:
   The Gluttony Engine (eats its own minions to heal and grow),
   The Envy Mirror (copies your gun, moons and boosts),
   The Overclock (bullet patterns → summons → enraged dashes). */

import { G } from "../state.js";
import { BALANCE } from "../balance.js";
import { TAU, rand, randInt, randRange, angDiff } from "../util.js";
import { sprites, C, P_MAGENTA, P_MINT, P_CYAN, P_AMBER, P_RED, P_WHITE, P_HEART, P_GREEN } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { seek, brake, face, angleToPlayer } from "./index.js";
import { fireEnemyBullet, killEnemy, hurtPlayer, dropPickup, addScore, haptic } from "../world.js";
import { playerHurtRadius } from "../player.js";
import { waves } from "../waves.js";

const BB = BALANCE.bosses;
const A = BALANCE.arena;
const INTRO = 2.0;

// ---------------------------------------------------------------------------
// Shared: entrance, minions, death payoff
// ---------------------------------------------------------------------------
function introUpdate(e, dt) {
  // Glides in from outside the arena edge to its start point; invulnerable meanwhile.
  e.t -= dt;
  const k = Math.min(1, 2.2 * dt);
  e.x += (e.tx - e.x) * k;
  e.y += (e.ty - e.y) * k;
  e.vx = e.vy = 0;
  if (e.t <= 0) { e.state = 0; e.invuln = false; G.emit("bossFight", e); }
  return true;
}

function bossInit(e, cx, cy) {
  e.state = -1; e.t = INTRO; e.invuln = true;
  e.tx = cx; e.ty = cy;
  e.spawnT = 0;
  e.cd = 2; e.t2 = 3; e.t3 = 1.5; e.c = 1; e.a = 0; e.b = 0;
  G.boss = e;
  audio.play("bossIntro");
  fx.shake(0.5);
}

function minionTick(e, dt, every, max, pool) {
  e.c -= dt;
  if (e.c > 0) return;
  e.c = every;
  let alive = 0;
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss && o.ally <= 0) alive++; }
  if (alive + G.warnings.count * 2 >= max) return;
  const type = pool[randInt(0, pool.length - 1)];
  const count = type === "swarm" ? randInt(5, 8) : randInt(1, type === "drone" ? 3 : 2);
  waves.spawnGroup(type, count);
}

export function startBossDeath(e) {
  G.bossFx = { x: e.x, y: e.y, r: e.r * e.scale, t: 0, next: 0, def: e.def, type: e.type };
  G.slowmo = 1.3; G.slowScale = 0.4;
  e.invuln = true;
  audio.play("bigExplode", e.x, e.y);
  haptic([40, 40, 40, 40, 120]);
  // the minions go down with it
  const items = G.enemies.items;
  for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && !o.boss) killEnemy(o); }
  G.eb.clear();
  G.warnings.clear();
}

export function updateBossFx(dt) {
  const f = G.bossFx;
  if (!f) return;
  f.t += dt;
  f.next -= dt;
  if (f.t < 1.25) {
    if (f.next <= 0) {
      f.next = 0.1;
      const a = rand(0, TAU), d = rand(0, f.r);
      const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
      const pal = [P_MAGENTA, P_CYAN, P_AMBER, P_WHITE][randInt(0, 3)];
      fx.explode(x, y, rand(18, 32), pal, C.cyan);
      fx.shake(0.25);
      audio.play("explode", x, y);
    }
    return;
  }
  // final blast
  fx.explode(f.x, f.y, 70, P_WHITE, C.white);
  fx.ring(f.x, f.y, 20, 520, 0.9, C.cyan, 6);
  fx.ring(f.x, f.y, 10, 340, 0.7, C.magenta, 5);
  fx.burst(f.x, f.y, 60, P_CYAN, 520, 1.2, 2.4);
  fx.burst(f.x, f.y, 40, P_MAGENTA, 420, 1.0, 2.2);
  fx.screenFlash("#ffffff", 0.75, 1.4);
  fx.shake(BALANCE.fx.shake.boss);
  G.hitstop = Math.max(G.hitstop, BALANCE.fx.hitstop.boss);
  audio.play("bossDown");
  for (let i = 0; i < 40; i++) dropPickup(0, f.x, f.y, G.stats.starValue);
  for (let i = 0; i < 6; i++) dropPickup(1, f.x, f.y, 5);
  dropPickup(2, f.x, f.y, 2);
  dropPickup(2, f.x, f.y, 2);
  addScore(f.def.score);
  G.bossesKilled++;
  G.bossFx = null;
  G.boss = null;
  G.emit("bossDown", f);
}

function glowBall(g, x, y, r, pal, a) {
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = a;
  g.drawImage(sprites.dots[pal], x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

// ---------------------------------------------------------------------------
// The Gluttony Engine
// ---------------------------------------------------------------------------
const glutton = {
  pal: P_MAGENTA, accent: C.magenta,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.32);
    e.x = e.px = A.w / 2; e.y = e.py = -120;
    e.a = 0.3;     // mouth open amount
  },
  update(e, dt, P) {
    const d = BB.glutton;
    if (e.state === -1) return introUpdate(e, dt);
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 90, "IT'S STARVING", C.magenta, 22, 1.4); audio.play("bossIntro"); }
    minionTick(e, dt, d.minionEvery * (enraged ? 0.75 : 1), d.minionMax, ["drone", "drone", "swarm", "splitter"]);

    if (e.state === 0) {                         // lumber toward you
      seek(e, P.x, P.y, e.speed * (1 + (e.scale - 1) * 0.4), 1.2, dt);
      face(e, angleToPlayer(e), 1.6, dt);
      e.a += (0.3 - e.a) * Math.min(1, 4 * dt);
      e.cd -= dt; e.t2 -= dt; e.t3 -= dt;
      const dist = Math.hypot(P.x - e.x, P.y - e.y);
      if (e.cd <= 0) {
        e.state = 2; e.t = d.inhaleTime;
        fx.text(e.x, e.y - e.r * e.scale - 20, "FEAST!", C.magenta, 24, 1.2);
        audio.play("bossIntro", e.x, e.y, 0.5);
      } else if (e.t2 <= 0 && dist < d.slamRadius * e.scale * 1.4) {
        e.state = 3; e.t = d.slamWindup;
        audio.play("warn", e.x, e.y);
      } else if (e.t3 <= 0) {
        e.t3 = randRange(d.spit.every) * (enraged ? 0.7 : 1);
        const n = d.spit.count + (enraged ? 4 : 0);
        const base = angleToPlayer(e);
        for (let i = 0; i < n; i++) {
          const a = base - d.spit.arc / 2 + (d.spit.arc * i) / (n - 1);
          const sp = d.spit.speed * rand(0.9, 1.1);
          const mx = e.x + Math.cos(base) * e.r * e.scale * 0.8, my = e.y + Math.sin(base) * e.r * e.scale * 0.8;
          fireEnemyBullet(mx, my, Math.cos(a) * sp, Math.sin(a) * sp, 1, "pink", 7);
        }
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
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * d.mealHeal);
          e.scale = Math.min(d.maxGrow, e.scale + d.mealGrow);
          fx.text(e.x, e.y - R - 14, "+" + Math.round(e.maxHp * d.mealHeal), C.magenta, 18, 0.9);
          fx.burst(mx, my, 10, P_MAGENTA, 180, 0.5, 1.6);
          fx.shake(0.12);
          audio.play("chomp", e.x, e.y);
        }
      }
      if (!P.dead) {
        const dx = mx - P.x, dy = my - P.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < range) { P.vx += (dx / dd) * d.playerPull * dt * 3; P.vy += (dy / dd) * d.playerPull * dt * 3; }
      }
      if (Math.random() < 0.9) {
        const a = rand(0, TAU), rr = rand(range * 0.5, range);
        const px = mx + Math.cos(a) * rr, py = my + Math.sin(a) * rr;
        fx.p(1, px, py, (mx - px) * 2.4, (my - py) * 2.4, 0.4, 1, P_MAGENTA, 0);
      }
      if (e.t <= 0) { e.state = 0; e.cd = randRange(d.inhaleEvery) * (enraged ? 0.7 : 1); }
    } else if (e.state === 3) {                  // slam windup → shockwave
      brake(e, 6, dt);
      e.t -= dt;
      e.a += (0.1 - e.a) * Math.min(1, 6 * dt);
      if (e.t <= 0) {
        const R = d.slamRadius * e.scale;
        fx.ring(e.x, e.y, e.r * e.scale, R, 0.4, C.magenta, 8);
        fx.ring(e.x, e.y, e.r * e.scale, R * 0.8, 0.35, "#ffffff", 3);
        fx.debris(e.x, e.y, 16, "#7a5c96", 340);
        fx.shake(0.55);
        audio.play("slam", e.x, e.y);
        if (!P.dead && Math.hypot(P.x - e.x, P.y - e.y) < R + playerHurtRadius()) hurtPlayer(d.slamDmg, e.x, e.y);
        e.state = 0; e.t2 = randRange(d.slamEvery);
      }
    }
  },
  onDeath(e) { startBossDeath(e); },
  drawUnder(g, e, x, y) {
    const d = BB.glutton;
    if (e.state === 2) {
      g.save();
      g.globalAlpha = 0.12;
      g.strokeStyle = C.magenta;
      g.lineWidth = 3;
      g.setLineDash([6, 14]);
      g.lineDashOffset = G.time * 140;
      g.beginPath(); g.arc(x, y, d.inhaleRange, 0, TAU); g.stroke();
      g.restore();
    }
    if (e.state === 3) {
      const p = 1 - e.t / d.slamWindup;
      const R = d.slamRadius * e.scale;
      g.save();
      g.globalAlpha = 0.1 + p * 0.25;
      g.fillStyle = C.magenta;
      g.beginPath(); g.arc(x, y, R * p, 0, TAU); g.fill();
      g.globalAlpha = 0.85;
      g.strokeStyle = C.magenta;
      g.lineWidth = 3;
      g.setLineDash([14, 10]);
      g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
      g.restore();
    }
  },
  draw(g, e, x, y, ang) {
    const R = e.r * e.scale;
    const flash = e.flash > 0;
    glowBall(g, x, y, R * 2.4, P_MAGENTA, 0.35 + (e.state === 2 ? 0.25 : 0));
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    // body
    const grd = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    grd.addColorStop(0, flash ? "#ffffff" : "#3a2c66");
    grd.addColorStop(1, flash ? "#ffd6f4" : "#120d2a");
    const open = e.a;
    g.beginPath();
    g.moveTo(Math.cos(open * 0.5) * R * 0.15, 0);
    g.arc(0, 0, R, open * 0.5, TAU - open * 0.5);
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,66,208,0.25)";
    g.stroke();
    g.lineWidth = 2.5;
    g.strokeStyle = C.magenta;
    g.stroke();
    // plating
    g.strokeStyle = "rgba(255,255,255,0.1)";
    g.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const a = open * 0.5 + ((TAU - open) * i) / 6;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, R * 0.55, open * 0.5 + 0.2, TAU - open * 0.5 - 0.2); g.stroke();
    // maw + teeth
    g.fillStyle = "#2a0018";
    g.beginPath(); g.moveTo(R * 0.12, 0); g.arc(0, 0, R * 0.96, -open * 0.5, open * 0.5); g.closePath(); g.fill();
    glowBall(g, R * 0.55, 0, R * 0.5 * (0.6 + open * 0.4), P_HEART, 0.6);
    g.fillStyle = "#ffe9f7";
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 4; i++) {
        const t = 0.3 + i * 0.18;
        const bx = Math.cos(open * 0.5) * R * t, by = s * Math.sin(open * 0.5) * R * t;
        g.beginPath();
        g.moveTo(bx - 4, by);
        g.lineTo(bx + 4, by);
        g.lineTo(bx, by - s * 9);
        g.closePath();
        g.fill();
      }
    }
    // eyes
    for (let s = -1; s <= 1; s += 2) {
      const ex = Math.cos(s * (open * 0.5 + 0.55)) * R * 0.62, ey = Math.sin(s * (open * 0.5 + 0.55)) * R * 0.62;
      glowBall(g, ex, ey, 14, e.b ? P_RED : P_AMBER, 0.9);
      g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, 3, 0, TAU); g.fill();
    }
    g.restore();
  },
};

// ---------------------------------------------------------------------------
// The Envy Mirror
// ---------------------------------------------------------------------------
const mirror = {
  pal: P_MINT, accent: C.mint,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.3);
    e.x = e.px = A.w / 2; e.y = e.py = -100;
    e.boostT = 0; e.boostDX = 0; e.boostDY = 0; e.pendingBoost = -1; e.fireCd = 1.2; e.ringCd = 4;
    if (!mirror.hooked) {
      mirror.hooked = true;
      G.on("boost", () => {
        const b = G.boss;
        if (b && !b.dead && b.type === "mirror" && b.state === 0 && b.pendingBoost < 0) b.pendingBoost = 0.18;
      });
    }
  },
  update(e, dt, P) {
    const d = BB.mirror;
    if (e.state === -1) return introUpdate(e, dt);
    const s = G.stats;
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && !e.b) { e.b = 1; fx.text(e.x, e.y - 60, "IT WANTS MORE", C.mint, 22, 1.4); audio.play("steal", e.x, e.y); }
    minionTick(e, dt, d.minionEvery, d.minionMax, ["drone", "gunner", "ripper"]);

    // copy your boost (mirrored), a beat later
    if (e.pendingBoost >= 0) {
      e.pendingBoost -= dt;
      if (e.pendingBoost < 0) {
        e.pendingBoost = -1;
        e.boostT = d.boostTime;
        e.boostDX = -P.boostDX; e.boostDY = -P.boostDY;
        fx.ring(e.x, e.y, 8, 50, 0.25, C.mint, 2.5);
        audio.play("boost", e.x, e.y);
      }
    }
    if (e.boostT > 0) {
      e.boostT -= dt;
      e.vx = e.boostDX * d.boostSpeed; e.vy = e.boostDY * d.boostSpeed;
      if (Math.random() < 0.8) fx.p(0, e.x, e.y, -e.vx * 0.1, -e.vy * 0.1, 0.35, 2, P_MINT, 3);
    } else {
      // stand where you'd see yourself in a mirror across the arena centre, but never too close
      // ...pulled in close enough that your shots always reach it
      let tx = A.w - P.x, ty = A.h - P.y;
      const dx = tx - P.x, dy = ty - P.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < 280) { tx = P.x + (dx / dd) * 280; ty = P.y + (dy / dd) * 280; }
      else if (dd > d.maxRange) { tx = P.x + (dx / dd) * d.maxRange; ty = P.y + (dy / dd) * d.maxRange; }
      tx = Math.max(80, Math.min(A.w - 80, tx)); ty = Math.max(80, Math.min(A.h - 80, ty));
      seek(e, tx, ty, e.speed * (enraged ? 1.25 : 1), 2.5, dt);
    }
    e.ang = angleToPlayer(e);

    // your gun, against you
    e.fireCd -= dt;
    if (e.fireCd <= 0) {
      const rate = Math.max(1.2, s.rate * d.fireMul * (enraged ? 1.4 : 1));
      e.fireCd = 1 / rate;
      const n = Math.min(5, s.projectiles);
      for (let i = 0; i < n; i++) {
        const a = e.ang + (i - (n - 1) / 2) * Math.max(0.14, s.fan);
        fireEnemyBullet(e.x + Math.cos(e.ang) * 26, e.y + Math.sin(e.ang) * 26, Math.cos(a) * d.shotSpeed, Math.sin(a) * d.shotSpeed, d.shotDmg, "mint", 6);
      }
      if (s.rear) fireEnemyBullet(e.x, e.y, -Math.cos(e.ang) * d.shotSpeed, -Math.sin(e.ang) * d.shotSpeed, d.shotDmg, "mint", 6);
      audio.play("enemyShot", e.x, e.y, 0.6);
    }
    if (enraged) {
      e.ringCd -= dt;
      if (e.ringCd <= 0) {
        e.ringCd = 4;
        const n = 14, off = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          fireEnemyBullet(e.x, e.y, Math.cos(a) * 200, Math.sin(a) * 200, 1, "green", 7);
        }
        fx.ring(e.x, e.y, 10, 80, 0.3, C.mint, 3);
        audio.play("enemyShot", e.x, e.y);
      }
    }

    // your moons too: they eat your shots and sting on touch
    const nm = Math.min(d.orbitMax, s.orbitals + (enraged ? 1 : 0));
    e.c2 = nm;
    if (nm) {
      const pb = G.pb;
      for (let k = 0; k < nm; k++) {
        const a = -G.time * 3.2 + (k / nm) * TAU;
        const ox = e.x + Math.cos(a) * 62, oy = e.y + Math.sin(a) * 62;
        for (let i = 0; i < pb.count; i++) {
          const b = pb.items[i];
          if (b.dead) continue;
          if ((b.x - ox) ** 2 + (b.y - oy) ** 2 < 14 * 14) { b.dead = true; fx.sparks(b.x, b.y, a, 0.8, 3, P_MINT, 200, 0.15); }
        }
        if (!P.dead && (P.x - ox) ** 2 + (P.y - oy) ** 2 < (10 + playerHurtRadius()) ** 2) hurtPlayer(1, ox, oy);
      }
    }
  },
  onDeath(e) { startBossDeath(e); },
  draw(g, e, x, y) {
    const R = e.r;
    glowBall(g, x, y, R * 3.2, P_MINT, 0.35);
    // diamond mirror frame
    g.save();
    g.translate(x, y);
    const spin = G.time * 0.8;
    g.rotate(spin);
    g.lineWidth = 3;
    g.strokeStyle = "rgba(115,255,206,0.25)";
    g.beginPath(); g.moveTo(0, -R * 1.8); g.lineTo(R * 1.5, 0); g.lineTo(0, R * 1.8); g.lineTo(-R * 1.5, 0); g.closePath(); g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = C.mint;
    g.stroke();
    // orbiting shards
    for (let i = 0; i < 6; i++) {
      const a = -spin * 2 + (i / 6) * TAU;
      const sx = Math.cos(a) * R * 2.1, sy = Math.sin(a) * R * 2.1;
      g.fillStyle = i % 2 ? "rgba(115,255,206,0.7)" : "rgba(99,244,255,0.5)";
      g.beginPath(); g.moveTo(sx, sy - 6); g.lineTo(sx + 3, sy); g.lineTo(sx, sy + 6); g.lineTo(sx - 3, sy); g.closePath(); g.fill();
    }
    g.restore();
    // your reflection
    const spr = e.flash > 0 ? sprites.playerFlash : sprites.mirror;
    const P = G.player;
    const face = P && P.x > x ? 1 : -1;
    g.save();
    g.translate(x, y);
    g.scale(face * 1.5, 1.5);
    g.globalAlpha = 0.95;
    g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    g.restore();
    // its moons
    const nm = e.c2 || 0;
    for (let k = 0; k < nm; k++) {
      const a = -G.time * 3.2 + (k / nm) * TAU;
      const ox = x + Math.cos(a) * 62, oy = y + Math.sin(a) * 62;
      glowBall(g, ox, oy, 18, P_MINT, 0.8);
      g.fillStyle = "#e9fff7"; g.beginPath(); g.arc(ox, oy, 4, 0, TAU); g.fill();
    }
    if (e.boostT > 0) { g.globalAlpha = 0.4; g.strokeStyle = C.mint; g.lineWidth = 2; g.beginPath(); g.arc(x, y, R * 1.6, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  },
};

// ---------------------------------------------------------------------------
// The Overclock
// ---------------------------------------------------------------------------
const overclock = {
  pal: P_AMBER, accent: C.amber,
  init(e) {
    bossInit(e, A.w / 2, A.h / 2);
    e.x = e.px = A.w / 2; e.y = e.py = -120;
    e.phase = 0; e.spin = 0; e.spiralT = 0; e.burstCd = 2.5; e.aimCd = 1.5; e.summoned = 0; e.summonCd = 1; e.shieldT = 0;
    e.dashCd = 3; e.dashT = 0; e.windT = 0; e.dashA = 0; e.orbitA = 0;
  },
  update(e, dt, P) {
    const d = BB.overclock;
    if (e.state === -1) return introUpdate(e, dt);
    const frac = e.hp / e.maxHp;
    const want = frac > d.phases[0] ? 0 : frac > d.phases[1] ? 1 : 2;
    if (want > e.phase) {
      e.phase = want;
      if (want === 1) {
        e.summoned = 0; e.summonCd = 0.8; e.shieldT = 14; e.dmgMul = d.shieldedTakes;
        fx.text(e.x, e.y - 80, "SUMMONING", C.amber, 24, 1.4);
      } else {
        e.dmgMul = 1; e.shieldT = 0;
        fx.text(e.x, e.y - 80, "ENRAGED", C.red, 26, 1.4);
        fx.ring(e.x, e.y, 30, 260, 0.5, C.red, 5);
        fx.shake(0.5);
      }
      audio.play("bossIntro", e.x, e.y, 0.7);
    }
    const rage = e.phase === 2 ? d.enraged.speed : 1;
    e.spin += dt * (1.2 + e.phase * 1.4);

    // movement: slow orbit around the middle, dashes when enraged
    if (e.dashT > 0) {
      e.dashT -= dt;
      e.vx = Math.cos(e.dashA) * d.enraged.dashSpeed; e.vy = Math.sin(e.dashA) * d.enraged.dashSpeed;
      e.t3 -= dt;
      if (e.t3 <= 0) {
        e.t3 = 0.05;
        const pa = e.dashA + Math.PI / 2;
        fireEnemyBullet(e.x, e.y, Math.cos(pa) * 60, Math.sin(pa) * 60, 1, "red", 6);
        fireEnemyBullet(e.x, e.y, -Math.cos(pa) * 60, -Math.sin(pa) * 60, 1, "red", 6);
      }
      if (e.dashT <= 0 || e.x < 90 || e.x > A.w - 90 || e.y < 90 || e.y > A.h - 90) { e.dashT = 0; e.dashCd = randRange(d.enraged.dashEvery); }
      return;
    }
    if (e.windT > 0) {
      brake(e, 6, dt);
      e.windT -= dt;
      if (e.windT > 0.25) e.dashA = angleToPlayer(e);
      if (e.windT <= 0) { e.dashT = 1.1; e.t3 = 0; audio.play("charge", e.x, e.y); fx.shake(0.2); }
      return;
    }
    e.orbitA += dt * 0.35 * rage;
    seek(e, A.w / 2 + Math.cos(e.orbitA) * 260, A.h / 2 + Math.sin(e.orbitA * 1.3) * 170, e.speed * rage, 1.5, dt);
    e.ang = angleToPlayer(e);

    // spiral (always on; half rate while summoning)
    const sp = d.spiral;
    e.spiralT -= dt;
    if (e.spiralT <= 0) {
      e.spiralT = 1 / (sp.rate * (e.phase === 1 ? 0.5 : rage));
      for (let k = 0; k < sp.arms; k++) {
        const a = e.spin * sp.turn + (k / sp.arms) * TAU;
        fireEnemyBullet(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, Math.cos(a) * sp.speed * rage, Math.sin(a) * sp.speed * rage, 1, "amber", 6);
      }
    }
    // radial burst with a windup flash
    e.burstCd -= dt;
    if (e.burstCd <= 0.5 && !e.burstWarned) { e.burstWarned = true; audio.play("warn", e.x, e.y); }
    if (e.burstCd <= 0) {
      e.burstWarned = false;
      e.burstCd = randRange(d.burst.every) / rage;
      const n = d.burst.count, off = rand(0, TAU);
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        fireEnemyBullet(e.x, e.y, Math.cos(a) * d.burst.speed * rage, Math.sin(a) * d.burst.speed * rage, 1, e.phase === 2 ? "red" : "pink", 7);
      }
      fx.ring(e.x, e.y, 20, 120, 0.3, e.phase === 2 ? C.red : C.amber, 4);
      audio.play("enemyShot", e.x, e.y);
    }
    // aimed triple
    e.aimCd -= dt;
    if (e.aimCd <= 0 && e.phase !== 1) {
      e.aimCd = randRange(d.aimed.every) / rage;
      for (let i = 0; i < d.aimed.count; i++) {
        const a = e.ang + (i - 1) * 0.18;
        fireEnemyBullet(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, Math.cos(a) * d.aimed.speed, Math.sin(a) * d.aimed.speed, 1, "magenta", 6);
      }
    }
    // phase 2: summon waves behind a shield
    if (e.phase === 1 && e.shieldT > 0) {
      e.shieldT -= dt;
      e.summonCd -= dt;
      if (e.summonCd <= 0 && e.summoned < d.summon.waves) {
        e.summonCd = d.summon.every;
        e.summoned++;
        waves.spawnGroup("drone", randInt(3, 4));
        waves.spawnGroup(e.summoned === 2 ? "swarm" : "ripper", e.summoned === 2 ? randInt(6, 8) : 2);
        fx.ring(e.x, e.y, 30, 200, 0.4, C.amber, 3);
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
    // phase 3: telegraphed dashes
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
      g.setLineDash([16, 10]);
      g.lineDashOffset = -G.time * 200;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(e.dashA) * 1100, y + Math.sin(e.dashA) * 1100); g.stroke();
      g.restore();
    }
  },
  draw(g, e, x, y) {
    const R = e.r;
    const col = e.phase === 0 ? C.cyan : e.phase === 1 ? C.amber : C.red;
    const pal = e.phase === 0 ? P_CYAN : e.phase === 1 ? P_AMBER : P_RED;
    glowBall(g, x, y, R * 3, pal, 0.4);
    g.save();
    g.translate(x, y);
    // three counter-rotating gear rings
    for (let k = 0; k < 3; k++) {
      const rr = R * (1.55 - k * 0.32);
      g.save();
      g.rotate(e.spin * (k % 2 ? -1.3 : 1) * (1 + k * 0.4));
      g.strokeStyle = k === 0 ? col : "rgba(255,255,255,0.35)";
      g.lineWidth = k === 0 ? 6 : 3;
      g.setLineDash(k === 0 ? [10, 7] : [4, 6]);
      g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke();
      g.restore();
    }
    // core
    const grd = g.createRadialGradient(0, 0, 2, 0, 0, R);
    grd.addColorStop(0, e.flash > 0 ? "#ffffff" : "#1d2550");
    grd.addColorStop(1, "#0a0e26");
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, R * 0.9, 0, TAU); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = col; g.stroke();
    // clock hands
    g.strokeStyle = "#ffffff";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(e.spin * 2) * R * 0.6, Math.sin(e.spin * 2) * R * 0.6); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(e.spin * 0.3) * R * 0.4, Math.sin(e.spin * 0.3) * R * 0.4); g.stroke();
    g.restore();
    glowBall(g, x, y, 16, P_WHITE, 0.9);
    if (e.shieldT > 0) {
      g.save();
      g.globalAlpha = 0.25 + Math.sin(G.time * 6) * 0.08;
      g.fillStyle = C.amber;
      g.beginPath(); g.arc(x, y, R * 1.9, 0, TAU); g.fill();
      g.globalAlpha = 0.8;
      g.strokeStyle = C.amber;
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

export const BOSSES = { glutton, mirror, overclock };
