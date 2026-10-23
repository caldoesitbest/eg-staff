/* Rung 4 · Lust, The Heartbreaker. A winged siren that circles you blowing kisses (shoot them down),
   breaks into heart-shaped bursts and lures you in with ribbons. While it lures, its heart is
   exposed (it takes extra damage); boost out of the lure and it's left stunned. It blinks around the
   arena (the landing spot is marked first). Heartbroken (below half health) it brings two fakes when
   it blinks: the real one is the one whose heart is beating. */

import { G } from "../state.js";
import { TAU, rand, randRange } from "../util.js";
import { C, SIN, P_LUST, P_HEART, P_WHITE } from "../sprites.js";
import { fx } from "../fx.js";
import { audio } from "../audio.js";
import { killEnemy } from "../world.js";
import { seek, brake, angleToPlayer, spawnEnemy } from "./index.js";
import { A, BB, bossInit, introUpdate, minionTick, startBossDeath, glowBall, moves, pace } from "./boss-common.js";

const COL = SIN.lust;
const ROAM = 0, LURE_WIND = 1, LURE = 2, BLINK_OUT = 3, BLINK_IN = 4, HEART_WIND = 5, STUNNED = 6;

function kiss(e, P, n) {
  const k = BB.lust.kiss;
  moves.kiss(e, P, n, k.speed, k.turn, k.life, k.home);
  audio.play("charm", e.x, e.y, 0.6);
}

/** Circles you at a flirty distance (the real one and its fakes). */
function orbit(e, P, dt, speedMul) {
  const d = BB.lust;
  e.orb += dt * d.orbit.speed * speedMul;
  const R = d.orbit.radius + Math.sin(G.time * 0.7 + e.id) * 60;
  let tx = P.x + Math.cos(e.orb) * R, ty = P.y + Math.sin(e.orb) * R;
  tx = Math.max(80, Math.min(A.w - 80, tx)); ty = Math.max(80, Math.min(A.h - 80, ty));
  seek(e, tx, ty, e.speed, 2.2, dt);
  e.ang = angleToPlayer(e);
}

export const lust = {
  pal: P_LUST, accent: COL,
  init(e) {
    bossInit(e, A.w / 2, A.h * 0.3);
    e.kissCd = 2.2; e.heartCd = 4.5; e.lureCd = 7; e.blinkCd = 5.5;
    e.orb = rand(0, TAU); e.alpha = 1; e.beat = 0; e.ribbon = 0; e.real = 0;
    e.marks = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]; e.nMarks = 0; e.lureSlot = 0;
  },
  update(e, dt, P) {
    const d = BB.lust;
    if (e.state === -1) return introUpdate(e, dt);
    const broken = e.hp < e.maxHp * 0.5;
    if (broken && !e.b) {
      e.b = 1;
      fx.text(e.x, e.y - 70, "HEARTBROKEN", COL, 22, 1.4);
      fx.burst(e.x, e.y, 18, P_HEART, 260, 0.7, 1.8);
      audio.play("bossIntro", e.x, e.y, 0.6);
    }
    const pc = pace() * (broken ? 0.85 : 1);
    minionTick(e, dt, d.minionEvery * (broken ? 1.2 : 1), d.minionMax, ["swarm", "drone"]);
    e.beat += dt * (broken ? 8 : 5.5);
    // its heart is exposed while it lures you (and while it's stunned)
    e.dmgMul = e.state === LURE || e.state === STUNNED ? d.allure.exposed : 1;
    if (e.state !== LURE_WIND && e.state !== LURE) e.ribbon = Math.max(0, e.ribbon - dt * 3);

    switch (e.state) {
      case ROAM: {
        orbit(e, P, dt, broken ? 1.3 : 1);
        e.kissCd -= dt; e.heartCd -= dt; e.lureCd -= dt; e.blinkCd -= dt;
        const dist = Math.hypot(P.x - e.x, P.y - e.y);
        if (e.lureCd <= 0 && dist < d.allure.range && !P.dead) {
          e.state = LURE_WIND; e.t = d.allure.windup;
          e.lureSlot = P.slot || 0;          // co-op: it lures one of you
          fx.text(e.x, e.y - 64, "♥ come here ♥", COL, 18, 1);
          audio.play("charm", e.x, e.y);
        } else if (e.blinkCd <= 0) {
          e.state = BLINK_OUT; e.t = d.dance.fade + d.dance.mark;
          // where it'll land (and, heartbroken, where the fakes will)
          e.nMarks = broken ? 1 + d.dance.decoys : 1;
          const a0 = rand(0, TAU);
          for (let i = 0; i < e.nMarks; i++) {
            const a = a0 + (i / e.nMarks) * TAU + rand(-0.3, 0.3), r = rand(300, 420);
            e.marks[i].x = Math.max(90, Math.min(A.w - 90, P.x + Math.cos(a) * r));
            e.marks[i].y = Math.max(90, Math.min(A.h - 90, P.y + Math.sin(a) * r));
          }
          e.real = Math.floor(Math.random() * e.nMarks);
          audio.play("steal", e.x, e.y, 0.6);
        } else if (e.heartCd <= 0) {
          e.state = HEART_WIND; e.t = d.heart.windup;
          audio.play("warn", e.x, e.y, 0.6);
        } else if (e.kissCd <= 0) {
          e.kissCd = randRange(d.kiss.every) * pc;
          kiss(e, P, broken ? d.kiss.enraged : d.kiss.count);
        }
        break;
      }
      case HEART_WIND:
        brake(e, 6, dt);
        e.t -= dt;
        if (e.t <= 0) {
          moves.heart(e, broken ? d.heart.enraged : d.heart.count, d.heart.speed, "heart");
          fx.ring(e.x, e.y, 10, 90, 0.3, COL, 3);
          audio.play("enemyShot", e.x, e.y);
          e.state = ROAM; e.heartCd = randRange(d.heart.every) * pc;
        }
        break;
      case LURE_WIND:
        brake(e, 6, dt);
        e.t -= dt;
        e.ribbon = 1 - Math.max(0, e.t) / d.allure.windup;
        if (e.t <= 0) { e.state = LURE; e.t = d.allure.time; e.ribbon = 1; }
        break;
      case LURE: {
        brake(e, 6, dt);
        e.t -= dt;
        P = G.players[e.lureSlot] || P;
        const dx = e.x - P.x, dy = e.y - P.y, dd = Math.hypot(dx, dy) || 1;
        if (!P.dead && dd < d.allure.range) {
          if (P.boostT > 0) {
            // boosted out: the charm breaks and Lust is left reeling
            e.state = STUNNED; e.t = d.allure.stun;
            fx.text(P.x, P.y - 40, "RESISTED!", C.cyan, 18, 1);
            fx.text(e.x, e.y - 64, "STUNNED", "#ffffff", 18, 1);
            fx.ring(e.x, e.y, 10, 120, 0.4, COL, 4);
            fx.burst(e.x, e.y, 14, P_HEART, 220, 0.6, 1.6);
            audio.play("perfect", e.x, e.y, 0.8);
            fx.shake(0.25);
            break;
          }
          P.vx += (dx / dd) * d.allure.pull * dt * 3; P.vy += (dy / dd) * d.allure.pull * dt * 3;
          if (Math.random() < 0.4) fx.p(1, P.x, P.y, dx * 1.6, dy * 1.6, 0.5, 1, P_HEART, 0);
        }
        if (e.t <= 0) { e.state = ROAM; e.lureCd = randRange(d.allure.every) * pc; }
        break;
      }
      case STUNNED:
        brake(e, 10, dt);
        e.t -= dt;
        if (Math.random() < dt * 8) fx.p(0, e.x + rand(-20, 20), e.y - e.r - 10, rand(-20, 20), -40, 0.6, 1.4, P_HEART, 1);
        if (e.t <= 0) { e.state = ROAM; e.lureCd = randRange(d.allure.every) * pc; e.kissCd = 1.2; }
        break;
      case BLINK_OUT:
        brake(e, 10, dt);
        e.t -= dt;
        e.alpha = Math.max(0.08, Math.min(1, (e.t - d.dance.mark) / d.dance.fade));
        e.invuln = true;
        if (e.t <= 0) {
          const m = e.marks[e.real];
          e.x = e.px = m.x; e.y = e.py = m.y;
          for (let i = 0; i < e.nMarks; i++) {
            if (i === e.real) continue;
            const f = spawnEnemy("decoy", e.marks[i].x, e.marks[i].y, { spawnT: 0 });
            if (f) { f.orb = Math.atan2(f.y - P.y, f.x - P.x); f.alpha = 0; }
          }
          e.orb = Math.atan2(e.y - P.y, e.x - P.x);
          e.state = BLINK_IN; e.t = 0.3;
        }
        break;
      case BLINK_IN:
        e.t -= dt;
        e.alpha = 1 - e.t / 0.3;
        if (e.t <= 0) {
          e.alpha = 1; e.invuln = false;
          moves.ring(e, 8, 170, "heart");
          fx.burst(e.x, e.y, 12, P_LUST, 220, 0.5, 1.6);
          e.state = ROAM; e.blinkCd = randRange(d.dance.every) * pc;
        }
        break;
    }
  },
  onDeath(e) {
    e.alpha = 1;
    // the fakes go with it
    const items = G.enemies.items;
    for (let i = 0; i < G.enemies.count; i++) { const o = items[i]; if (!o.dead && o.type === "decoy") killEnemy(o, true); }
    startBossDeath(e);
  },
  drawUnder(g, e, x, y) {
    const d = BB.lust;
    if (e.state === BLINK_OUT || e.state === BLINK_IN) {
      // where it's about to appear
      g.save();
      g.globalAlpha = 0.75;
      g.strokeStyle = COL;
      g.lineWidth = 3;
      g.setLineDash([8, 8]);
      g.lineDashOffset = G.time * 40;
      for (let i = 0; i < e.nMarks; i++) { g.beginPath(); g.arc(e.marks[i].x, e.marks[i].y, e.r + 14, 0, TAU); g.stroke(); }
      g.restore();
    }
    if (e.ribbon > 0) {
      // the lure: rings rolling in, and two ribbons reaching for whoever it chose
      const P = G.players[e.lureSlot] || G.player;
      g.save();
      for (let k = 0; k < 3; k++) {
        const f = (G.time * 0.8 + k / 3) % 1;
        g.globalAlpha = (1 - f) * 0.45 * e.ribbon;
        g.strokeStyle = COL;
        g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, e.r + f * d.allure.range * 0.6, 0, TAU); g.stroke();
      }
      if (P && !P.dead) {
        const px = x + (P.x - x) * e.ribbon, py = y + (P.y - y) * e.ribbon;
        const dx = px - x, dy = py - y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        g.lineCap = "round";
        for (const s of [-1, 1]) {
          const w = Math.sin(G.time * 9 + s) * 26 * s;
          g.globalAlpha = 0.75;
          g.strokeStyle = s < 0 ? COL : "#ffc2e2";
          g.lineWidth = e.state === LURE ? 4 : 2;
          g.beginPath();
          g.moveTo(x + nx * s * 10, y + ny * s * 10);
          g.bezierCurveTo(x + dx * 0.33 + nx * w, y + dy * 0.33 + ny * w, x + dx * 0.66 - nx * w, y + dy * 0.66 - ny * w, px, py);
          g.stroke();
        }
      }
      g.restore();
    }
  },
  draw(g, e, x, y) { drawLust(g, e, x, y, false); },
  stolen(e, P) { moves.heart(e, 22, 160, "heart"); moves.kiss(e, P, 2, 190, 1.15, 4, 2.2); },
};

/** Lust's fakes: same dance, a hollow heart, one hit pops them. */
export const decoy = {
  pal: P_LUST, accent: COL,
  init(e) {
    e.maxHp = e.hp = 1;
    e.t = BB.lust.dance.decoyLife;
    e.cd = rand(1.2, 2.2);
    e.orb = 0; e.alpha = 0; e.beat = rand(0, TAU); e.b = 1;
  },
  update(e, dt, P) {
    e.t -= dt;
    e.alpha = Math.min(1, e.alpha + dt * 3.5) * (e.t < 0.6 ? e.t / 0.6 : 1);
    if (e.t <= 0 || !G.boss || G.boss.dead) { fx.burst(e.x, e.y, 10, P_HEART, 160, 0.5, 1.4); killEnemy(e, true); return; }
    orbit(e, P, dt, 1.2);
    e.beat += dt * 8;
    e.cd -= dt;
    if (e.cd <= 0) { e.cd = 99; kiss(e, P, 1); }
  },
  onDeath(e, silent) {
    if (!silent) fx.text(e.x, e.y - 50, "FAKE!", "#ffc2e2", 16, 0.8);
    fx.burst(e.x, e.y, 14, P_HEART, 200, 0.6, 1.6);
  },
  draw(g, e, x, y) { drawLust(g, e, x, y, true); },
};

function heart(g, h) {
  g.beginPath();
  g.moveTo(0, h * 0.9);
  g.bezierCurveTo(-h * 1.3, 0, -h * 0.6, -h * 1.0, 0, -h * 0.4);
  g.bezierCurveTo(h * 0.6, -h * 1.0, h * 1.3, 0, 0, h * 0.9);
  g.closePath();
}

/** Lust: a winged siren. Cracked porcelain mask, glowing eye slits and a stitched grin, horns,
    clawed arms, a tattered wraith skirt, and its heart beating inside a ribcage. When the heart
    is exposed the ribs swing open; a fake's cage is empty. */
function drawLust(g, e, x, y, fake) {
  const R = e.r;
  const alpha = (e.alpha === undefined ? 1 : e.alpha) * (fake ? 0.82 + Math.sin(G.time * 13 + e.id) * 0.1 : 1);
  const exposed = !fake && (e.state === LURE || e.state === STUNNED);
  const beat = fake ? 1 : 1 + Math.max(0, Math.sin(e.beat)) * (exposed ? 0.3 : 0.14);
  const flash = e.flash > 0;
  const t = G.time + e.id * 0.37;
  const bob = Math.sin(t * 2.2) * 4;
  const flap = Math.sin(t * 3.1);
  const dark = flash ? "#ffffff" : "#1b0713";
  const bone = flash ? "#ffffff" : "#f2d4e2";
  const eyeCol = fake ? "#8a5a74" : e.b ? "#ff2a55" : "#ff4fb0";
  const stunned = !fake && e.state === STUNNED;
  g.save();
  g.globalAlpha = alpha;
  if (G.gfx.glow) glowBall(g, x, y, R * 3.3, P_LUST, 0.3 * alpha);
  g.translate(x, y + bob);
  g.lineCap = "round";
  g.lineJoin = "round";

  // wings: torn membranes on long finger bones, flapping slowly
  for (const s of [-1, 1]) {
    const sx = s * R * 0.32, sy = -R * 0.55;
    const tipX = s * R * (1.7 + flap * 0.1), tipY = -R * (1.25 + flap * 0.26);
    const midX = s * R * 1.8, midY = -R * (0.35 + flap * 0.12);
    const lowX = s * R * 1.35, lowY = R * (0.5 - flap * 0.06);
    g.fillStyle = flash ? "rgba(255,255,255,0.8)" : "rgba(52,8,36,0.9)";
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(tipX, tipY);
    g.quadraticCurveTo(s * R * 1.42, -R * 0.75, midX, midY);
    g.quadraticCurveTo(s * R * 1.28, -R * 0.05, lowX, lowY);
    g.quadraticCurveTo(s * R * 0.95, R * 0.12, s * R * 0.3, R * 0.15);
    g.closePath();
    g.fill();
    g.strokeStyle = COL; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = bone; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx, sy); g.lineTo(tipX, tipY);
    g.moveTo(sx, sy); g.lineTo(midX, midY);
    g.moveTo(sx, sy); g.lineTo(lowX, lowY);
    g.stroke();
    // a claw at the top joint
    g.fillStyle = bone;
    g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(tipX + s * 7, tipY - 9); g.lineTo(tipX + s * 1, tipY - 2); g.closePath(); g.fill();
  }

  // tattered wraith skirt
  const sk = g.createLinearGradient(0, 0, 0, R * 1.75);
  sk.addColorStop(0, flash ? "#ffffff" : "#5a1238");
  sk.addColorStop(1, "rgba(60,8,36,0)");
  g.fillStyle = sk;
  g.beginPath();
  g.moveTo(-R * 0.3, R * 0.12);
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const px = -R * 0.72 + (i / n) * R * 1.44;
    const len = R * (1.2 + (i % 2 ? 0.4 : 0)) + Math.sin(t * 4 + i * 1.7) * R * 0.14;
    g.lineTo(px + Math.sin(t * 3 + i) * 4, len);
    if (i < n) g.lineTo(px + R * 0.12, R * 0.78);
  }
  g.lineTo(R * 0.3, R * 0.12);
  g.closePath();
  g.fill();

  // long clawed arms, swaying
  for (const s of [-1, 1]) {
    const sw = Math.sin(t * 2 + s);
    const ex = s * R * 0.78, ey = -R * 0.08;
    const hx = s * R * (0.98 + sw * 0.08), hy = R * (0.58 + sw * 0.06);
    g.strokeStyle = dark; g.lineWidth = 5;
    g.beginPath(); g.moveTo(s * R * 0.36, -R * 0.52); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = COL; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = bone; g.lineWidth = 1.8;
    g.beginPath();
    for (let k = -1; k <= 1; k++) { g.moveTo(hx, hy); g.quadraticCurveTo(hx + s * 3 + k * 4, hy + 9, hx + s * 1 + k * 8, hy + 17); }
    g.stroke();
  }

  // torso (the cage)
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(-R * 0.44, -R * 0.62);
  g.quadraticCurveTo(0, -R * 0.74, R * 0.44, -R * 0.62);
  g.quadraticCurveTo(R * 0.36, -R * 0.12, R * 0.2, R * 0.18);
  g.lineTo(-R * 0.2, R * 0.18);
  g.quadraticCurveTo(-R * 0.36, -R * 0.12, -R * 0.44, -R * 0.62);
  g.closePath();
  g.fill();
  g.strokeStyle = COL; g.lineWidth = 1.5; g.stroke();

  // the heart, behind the ribs (a fake's cage is empty)
  g.save();
  g.translate(0, -R * 0.24);
  g.scale(beat, beat);
  heart(g, R * 0.25);
  if (fake) { g.fillStyle = "#07020a"; g.fill(); g.strokeStyle = "#4a1a36"; g.lineWidth = 1.5; g.stroke(); }
  else {
    const hg = g.createRadialGradient(-R * 0.06, -R * 0.08, 1, 0, 0, R * 0.3);
    hg.addColorStop(0, flash ? "#ffffff" : "#ff8fb8");
    hg.addColorStop(0.5, flash ? "#ffffff" : e.b ? "#e0103c" : "#ff2a6d");
    hg.addColorStop(1, "#5a0018");
    g.fillStyle = hg;
    g.fill();
    // veins
    g.strokeStyle = "rgba(90,0,24,0.8)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-R * 0.06, -R * 0.06); g.lineTo(R * 0.02, R * 0.06); g.lineTo(R * 0.09, R * 0.02); g.stroke();
  }
  g.restore();

  // ribs: they swing open when the heart is exposed
  const open = exposed ? 0.6 + Math.sin(G.time * 10) * 0.05 : 0;
  g.strokeStyle = bone; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(0, -R * 0.64); g.lineTo(0, -R * 0.06); g.stroke();
  for (let k = 0; k < 3; k++) {
    const yy = -R * (0.5 - k * 0.15);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, yy);
      g.quadraticCurveTo(s * R * (0.3 + open * 0.35), yy - R * (0.1 + open * 0.16), s * R * (0.33 + open * 0.28), yy + R * (0.1 - open * 0.12));
      g.stroke();
    }
  }

  // head: horns and long tendrils of hair
  const hy = -R * 0.98 + (stunned ? Math.sin(G.time * 6) * 2 : 0);
  const tilt = stunned ? Math.sin(G.time * 4) * 0.25 : Math.sin(t * 1.3) * 0.06;
  g.save();
  g.translate(0, hy);
  g.rotate(tilt);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const w = Math.sin(t * 2.6 + k + s) * 8;
      g.strokeStyle = k === 1 ? "#3a0b28" : dark;
      g.lineWidth = 3.5 - k * 0.6;
      g.beginPath();
      g.moveTo(s * R * 0.12, -R * 0.1);
      g.bezierCurveTo(s * R * (0.45 + k * 0.1), R * 0.05 + w, s * R * (0.3 + k * 0.14), R * 0.5 - w, s * R * (0.5 + k * 0.12), R * (0.85 + k * 0.1) + w);
      g.stroke();
    }
    // horn
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(s * R * 0.14, -R * 0.2);
    g.quadraticCurveTo(s * R * 0.42, -R * 0.38, s * R * 0.5, -R * 0.72);
    g.quadraticCurveTo(s * R * 0.3, -R * 0.42, s * R * 0.04, -R * 0.26);
    g.closePath();
    g.fill();
    g.strokeStyle = COL; g.lineWidth = 1.2; g.stroke();
  }
  // the mask
  g.fillStyle = flash ? "#ffffff" : "#f4e6ee";
  g.beginPath(); g.ellipse(0, 0, R * 0.24, R * 0.32, 0, 0, TAU); g.fill();
  g.strokeStyle = "#a64a7b"; g.lineWidth = 1.5; g.stroke();
  // glowing eye slits
  g.fillStyle = eyeCol;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * R * 0.04, -R * 0.05);
    g.lineTo(s * R * 0.2, -R * 0.15);
    g.lineTo(s * R * 0.17, -R * 0.02);
    g.closePath();
    g.fill();
  }
  // a stitched grin
  g.strokeStyle = "#2a0a1e"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-R * 0.16, R * 0.1); g.quadraticCurveTo(0, R * 0.2, R * 0.16, R * 0.1); g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  for (let k = -3; k <= 3; k++) { const gx = k * R * 0.04; const gy = R * 0.15 - Math.abs(k) * R * 0.012; g.moveTo(gx, gy - 3); g.lineTo(gx, gy + 3); }
  g.stroke();
  // heartbroken: the mask cracks
  if (e.b) {
    g.strokeStyle = "#2a0a1e"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(R * 0.04, -R * 0.31); g.lineTo(-R * 0.02, -R * 0.18); g.lineTo(R * 0.06, -R * 0.1); g.lineTo(R * 0.01, R * 0.02); g.stroke();
  }
  g.restore();

  if (stunned) {
    // dizzy hearts
    for (let i = 0; i < 3; i++) {
      const a = G.time * 5 + (i / 3) * TAU;
      g.save();
      g.translate(Math.cos(a) * R * 0.6, -R * 1.62 + Math.sin(a) * 6);
      g.fillStyle = "#ffffff";
      heart(g, 4);
      g.fill();
      g.restore();
    }
  }
  g.restore();

  // eye glow + the heart's glow (and its weak-point ring when exposed)
  if (!fake && G.gfx.glow) {
    const ey = y + bob - R * 1.05;
    glowBall(g, x - R * 0.12, ey, 5.5, P_HEART, 0.55 * alpha);
    glowBall(g, x + R * 0.12, ey, 5.5, P_HEART, 0.55 * alpha);
  }
  if (!fake) {
    glowBall(g, x, y + bob - R * 0.24, R * (exposed ? 1.0 : 0.5) * beat, P_HEART, (exposed ? 0.85 : 0.5) * alpha);
    if (exposed) {
      // weak point: a ring that says "hit me now"
      g.save();
      g.globalAlpha = 0.6 + Math.sin(G.time * 12) * 0.3;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.setLineDash([4, 6]);
      g.lineDashOffset = -G.time * 30;
      g.beginPath(); g.arc(x, y + bob - R * 0.24, R * 0.4 * beat + 8, 0, TAU); g.stroke();
      g.restore();
    }
  }
}
