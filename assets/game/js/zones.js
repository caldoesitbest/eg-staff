/* Zones: short-lived areas on the battlefield. Weapon evolutions make most of them (Starbreaker's
   burning trail and implosion, Supernova's shockwave, Singularity's pull, Gravity Well, Tempest's
   storm, Cataclysm's timed blasts); elite mutations make the rest (a Shockwave robot's ring, a Volatile
   robot's death blast). Each one belongs to whoever made it (z.by), so kills feed that player's build.
   Pool size is fixed (state.js), so a crowd of effects can never grow without limit. */

import { G, usePlayer } from "./state.js";
import { TAU, easeOutCubic, rand } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { sprites, C, P_WHITE } from "./sprites.js";
import { damageEnemy, queueBlast, fireBeam, hurtPlayer } from "./world.js";
import { playerHurtRadius } from "./player.js";

export const Z = { TRAIL: 1, IMPLODE: 2, WAVE: 3, PULL: 4, WELL: 5, STORM: 6, DELAY: 7, SHOCK: 8 };
// What each type keeps in the generic fields:
//   TRAIL   r reach, dmg per touch, k per-robot cooldown          IMPLODE r pull reach, n force, x2 blast radius, dmg blast
//   WAVE    r max radius, r0 arc, a angle, dmg, y2 knockback        PULL    r reach, x2 length, y2 beam width, n force, dmg beam
//   WELL    r reach, n force, dmg vulnerable time                   STORM   r reach, k strike interval, dmg per strike
//   DELAY   r blast radius, dmg to robots, y2 to players (a robot's blast)   SHOCK  r0 start, r end radius, k damage to players

/** A new zone (or null when the pool is full: the effect just doesn't happen). */
export function addZone(type, x, y, r, life) {
  const z = G.zones.get();
  if (!z) return null;
  z.dead = false; z.type = type; z.x = x; z.y = y; z.x2 = 0; z.y2 = 0; z.a = 0;
  z.r = r; z.r0 = 0; z.t = 0; z.life = life; z.dmg = 0; z.tick = 0; z.n = 0; z.nh = 0; z.big = false; z.k = 0;
  z.by = G.player; z.src = G.curEnemy ? G.curEnemy.type : ""; z.chg = G.curChg || 0;
  z.col = C.cyan; z.pal = 0;
  z.hits[0] = z.hits[1] = z.hits[2] = z.hits[3] = 0;     // SHOCK: who it already hit (by player slot)
  return z;
}

/** How many zones of a type this player has out (wells and storms are capped per player). */
export function zoneCount(type, by) {
  let n = 0;
  const zs = G.zones;
  for (let i = 0; i < zs.count; i++) { const z = zs.items[i]; if (!z.dead && z.type === type && z.by === by) n++; }
  return n;
}
/** The oldest zone of a type this player owns (a new storm replaces it). */
export function oldestZone(type, by) {
  let best = null;
  const zs = G.zones;
  for (let i = 0; i < zs.count; i++) { const z = zs.items[i]; if (!z.dead && z.type === type && z.by === by && (!best || z.t > best.t)) best = z; }
  return best;
}

const hit = (z, id) => { for (let k = 0; k < z.nh; k++) if (z.hits[k] === id) return true; return false; };
const remember = (z, id) => { if (z.nh < z.hits.length) z.hits[z.nh++] = id; };

/** Pulls robots (not bosses) within R of a point toward it; force is roughly the pull speed. */
function pullTo(x, y, R, force, dt) {
  const items = G.enemies.items, res = G.hash.results;
  const n = G.hash.query(x, y, R + G.maxR);
  for (let j = 0; j < n; j++) {
    const e = items[res[j]];
    if (e.dead || e.boss || e.ally > 0 || e.passive || e.type === "gem") continue;
    const dx = x - e.x, dy = y - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > R || d < 14) continue;
    const k = (force * 7 * dt) / Math.sqrt(e.mass || 1);
    e.kx += (dx / d) * k; e.ky += (dy / d) * k;
  }
}

export function updateZones(dt) {
  const zs = G.zones;
  if (!zs.count) return;
  const items = G.enemies.items, res = G.hash.results;
  for (let i = 0; i < zs.count; i++) {
    const z = zs.items[i];
    if (z.dead) continue;
    z.t += dt;
    G.curChg = z.chg || 0;
    if (z.by && z.by !== G.player && z.type !== Z.SHOCK) usePlayer(z.by);
    switch (z.type) {
      case Z.TRAIL: {
        // Starbreaker: a burning wake behind a bolt that pierced something
        const n = G.hash.query(z.x, z.y, z.r + G.maxR);
        for (let j = 0; j < n; j++) {
          const e = items[res[j]];
          if (e.dead || e.ally > 0 || e.spawnT > 0.15 || e.trailCd > 0 || e.phased) continue;
          const rr = z.r + e.r * e.scale;
          if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 > rr * rr) continue;
          e.trailCd = z.k;
          damageEnemy(e, z.dmg, false, 0, 0, 0);
        }
        break;
      }
      case Z.IMPLODE: {
        // Starbreaker: robots get dragged into the orb's last position, then it goes off
        pullTo(z.x, z.y, z.r, z.n, dt);
        if (Math.random() < 0.9) {
          const a = rand(0, TAU), d = z.r * rand(0.5, 1);
          fx.p(0, z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, -Math.cos(a) * d * 3, -Math.sin(a) * d * 3, 0.3, 1.6, z.pal, 0);
        }
        break;
      }
      case Z.WAVE: {
        // Supernova: a cone shockwave rolling out; each robot is hit once, robot shots in it are erased
        const R = z.r * easeOutCubic(Math.min(1, z.t / z.life));
        const R0 = Math.max(0, z.x2);
        z.x2 = R;
        const half = z.r0 / 2;
        const n = G.hash.query(z.x, z.y, R + G.maxR);
        for (let j = 0; j < n; j++) {
          const e = items[res[j]];
          if (e.dead || e.ally > 0 || e.spawnT > 0.15 || hit(z, e.id) || e.phased) continue;
          const dx = e.x - z.x, dy = e.y - z.y, d = Math.sqrt(dx * dx + dy * dy), er = e.r * e.scale;
          if (d > R + er || d < R0 - 40 - er) continue;
          let off = Math.atan2(dy, dx) - z.a;
          while (off > Math.PI) off -= TAU;
          while (off < -Math.PI) off += TAU;
          if (Math.abs(off) > half + Math.atan2(er, Math.max(1, d))) continue;
          remember(z, e.id);
          damageEnemy(e, z.dmg, true, dx / (d || 1), dy / (d || 1), e.boss ? 0 : z.y2);
          fx.sparks(e.x, e.y, Math.atan2(dy, dx), 0.5, 5, z.pal, 380, 0.22);
        }
        const eb = G.eb;
        for (let j = 0; j < eb.count; j++) {
          const b = eb.items[j];
          if (b.dead) continue;
          const dx = b.x - z.x, dy = b.y - z.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > R + 8 || d < R0 - 30) continue;
          let off = Math.atan2(dy, dx) - z.a;
          while (off > Math.PI) off -= TAU;
          while (off < -Math.PI) off += TAU;
          if (Math.abs(off) > half) continue;
          b.dead = true;
          fx.p(0, b.x, b.y, 0, 0, 0.15, 1.4, P_WHITE, 0);
        }
        break;
      }
      case Z.PULL: {
        // Singularity: the beam's path pulls robots in before it fires (x2 = length, r = reach)
        const c = Math.cos(z.a), sn = Math.sin(z.a);
        const n = G.hash.query(z.x + c * z.x2 * 0.5, z.y + sn * z.x2 * 0.5, z.x2 * 0.5 + z.r + G.maxR);
        for (let j = 0; j < n; j++) {
          const e = items[res[j]];
          if (e.dead || e.boss || e.ally > 0 || e.passive || e.type === "gem") continue;
          const dx = e.x - z.x, dy = e.y - z.y;
          const along = dx * c + dy * sn;
          if (along < -20 || along > z.x2) continue;
          const side = -dx * sn + dy * c;
          if (Math.abs(side) > z.r || Math.abs(side) < 6) continue;
          const k = (z.n * 7 * dt) / Math.sqrt(e.mass || 1) * Math.min(1, Math.abs(side) / 40);
          const sg = side > 0 ? -1 : 1;
          e.kx += -sn * sg * k; e.ky += c * sg * k;
        }
        if (Math.random() < 0.8) {
          const along = rand(0, z.x2), sd = rand(-z.r, z.r);
          const px = z.x + c * along - sn * sd, py = z.y + sn * along + c * sd;
          fx.p(0, px, py, sn * sd * 3, -c * sd * 3, 0.25, 1.4, z.pal, 0);
        }
        break;
      }
      case Z.WELL: {
        // Gravity Well: pulls robots in; anything inside takes more damage for a moment
        pullTo(z.x, z.y, z.r, z.n, dt);
        const n = G.hash.query(z.x, z.y, z.r + G.maxR);
        for (let j = 0; j < n; j++) {
          const e = items[res[j]];
          if (e.dead || e.ally > 0) continue;
          if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 > (z.r + e.r * e.scale) ** 2) continue;
          if (e.vuln < z.dmg) e.vuln = z.dmg;
        }
        break;
      }
      case Z.STORM: {
        // Tempest: lightning strikes a robot inside every so often
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = z.k;
          const n = G.hash.query(z.x, z.y, z.r + G.maxR);
          let best = null, bs = -1;
          for (let j = 0; j < n; j++) {
            const e = items[res[j]];
            if (e.dead || e.ally > 0 || e.spawnT > 0.1 || e.passive || e.phased) continue;
            if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 > z.r * z.r) continue;
            const sc = Math.random() + (e.id === z.n ? -1 : 0);      // rarely the same robot twice in a row
            if (sc > bs) { bs = sc; best = e; }
          }
          if (best) {
            z.n = best.id;
            strike(best.x, best.y, C.blue);
            damageEnemy(best, z.dmg, false, 0, 0, 0);
            audio.play("zap", best.x, best.y, 0.45);
          }
        }
        break;
      }
      case Z.SHOCK: {
        // a Shockwave robot's ring: crosses the arena; boost through it (or just be elsewhere)
        const R = z.r0 + (z.r - z.r0) * (z.t / z.life);
        for (let k = 0; k < G.players.length; k++) {
          const P = G.players[k];
          if (P.dead || P.gone || z.hits[k]) continue;
          const d = Math.hypot(P.x - z.x, P.y - z.y);
          if (Math.abs(d - R) > 10 + playerHurtRadius()) continue;
          z.hits[k] = 1;
          usePlayer(P);
          G.hurtSrc = "shockwave";
          hurtPlayer(z.k, z.x, z.y);
          G.hurtSrc = "";
        }
        break;
      }
    }
    if (z.t >= z.life) { finish(z); z.dead = true; }
  }
  G.curChg = 0;
  zs.sweep();
  usePlayer(G.me);
}

/** A bolt of lightning from the sky onto a spot (Tempest, static field). */
export function strike(x, y, col) {
  const top = y - 230;
  fx.bolt(x + rand(-40, 40), top, x, y, col);
  fx.ring(x, y, 4, 34, 0.2, col, 2);
  fx.sparks(x, y, -Math.PI / 2, 1.2, 5, P_WHITE, 260, 0.2);
}

function finish(z) {
  if (z.type === Z.IMPLODE) {
    queueBlast(z.x, z.y, z.x2, z.dmg, true, false, 0, z.col, z.pal);
    fx.ring(z.x, z.y, z.x2 * 1.3, 10, 0.2, C.white, 3);
    fx.screenFlash(z.col, 0.12, 5);
    audio.play("bigExplode", z.x, z.y, 0.5);
  } else if (z.type === Z.PULL) {
    // the beam lands on everything the pull lined up
    fireBeam(z.x, z.y, z.a, z.x2, z.y2, z.dmg, z.col);
    audio.play("beam", z.x, z.y);
    fx.shake(0.3);
  } else if (z.type === Z.DELAY) {
    // a timed blast: Cataclysm's ring and core, a Volatile robot's death
    if (z.big) audio.play("bigExplode", z.x, z.y, 0.6);
    if (z.y2 > 0) {
      // a robot's blast (y2 = damage to players): it hurts you and other robots, not bosses
      const cur = G.curEnemy;
      G.curEnemy = null;
      G.hurtSrc = z.src;
      queueBlast(z.x, z.y, z.r, z.dmg, false, true, z.y2, z.col, z.pal);
      G.hurtSrc = "";
      G.curEnemy = cur;
    } else queueBlast(z.x, z.y, z.r, z.dmg, true, false, 0, z.col, z.pal);
  }
}

// ---------------------------------------------------------------------------
// drawing (render.js calls these in world space)
// ---------------------------------------------------------------------------
/** Under the robots: trails, wells, storms, pull lines, telegraphs. */
export function drawZonesUnder(g) {
  const zs = G.zones;
  for (let i = 0; i < zs.count; i++) {
    const z = zs.items[i];
    if (z.dead) continue;
    const p = Math.min(1, z.t / z.life);
    switch (z.type) {
      case Z.TRAIL: {
        const a = 1 - p;
        if (G.gfx.glow) {
          g.globalCompositeOperation = "lighter";
          g.globalAlpha = 0.55 * a;
          const d = sprites.dots[z.pal];
          g.drawImage(d, z.x - z.r * 1.6, z.y - z.r * 1.6, z.r * 3.2, z.r * 3.2);
          g.globalCompositeOperation = "source-over";
        }
        g.globalAlpha = 0.7 * a;
        g.fillStyle = z.col;
        g.beginPath(); g.arc(z.x, z.y, z.r * 0.35 * (1 - p * 0.5), 0, TAU); g.fill();
        g.globalAlpha = 1;
        break;
      }
      case Z.WELL: {
        const fade = Math.min(1, z.t / 0.15) * Math.min(1, (z.life - z.t) / 0.25);
        g.globalAlpha = 0.16 * fade;
        g.fillStyle = z.col;
        g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.fill();
        g.globalAlpha = 0.65 * fade;
        g.strokeStyle = z.col;
        g.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          // rings spiralling inward
          const f = 1 - ((G.time * 1.4 + k / 3) % 1);
          g.beginPath(); g.arc(z.x, z.y, z.r * f, G.time * 3 + k, G.time * 3 + k + 4.2); g.stroke();
        }
        g.fillStyle = "#05030f";
        g.globalAlpha = 0.85 * fade;
        g.beginPath(); g.arc(z.x, z.y, 7 + (z.big ? 6 : 0), 0, TAU); g.fill();
        g.globalAlpha = 1;
        break;
      }
      case Z.STORM: {
        const fade = Math.min(1, z.t / 0.3) * Math.min(1, (z.life - z.t) / 0.4);
        g.globalAlpha = 0.12 * fade;
        g.fillStyle = z.col;
        g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.fill();
        g.globalAlpha = 0.5 * fade;
        g.strokeStyle = z.col;
        g.lineWidth = 2;
        g.setLineDash([10, 12]);
        g.lineDashOffset = -G.time * 30;
        g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.stroke();
        g.setLineDash([]);
        // clouds: a few soft blobs drifting round the middle
        if (G.gfx.glow) {
          g.globalCompositeOperation = "lighter";
          for (let k = 0; k < 4; k++) {
            const a = G.time * 0.6 + k * 1.57, d = z.r * 0.4;
            g.globalAlpha = 0.25 * fade;
            g.drawImage(sprites.dots[z.pal], z.x + Math.cos(a) * d - 40, z.y + Math.sin(a) * d - 40, 80, 80);
          }
          g.globalCompositeOperation = "source-over";
        }
        g.globalAlpha = 1;
        break;
      }
      case Z.PULL: {
        g.save();
        g.translate(z.x, z.y);
        g.rotate(z.a);
        g.globalAlpha = 0.18 + p * 0.25;
        g.fillStyle = z.col;
        const w = z.r * (1 - p * 0.75);
        g.fillRect(0, -w, z.x2, w * 2);
        g.globalAlpha = 0.9;
        g.strokeStyle = z.col;
        g.lineWidth = 2 + p * 3;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(z.x2, 0); g.stroke();
        g.restore();
        break;
      }
      case Z.DELAY: {
        // a filling ring: when it's full, it goes off
        g.globalAlpha = 0.12 + p * 0.22;
        g.fillStyle = z.col;
        g.beginPath(); g.arc(z.x, z.y, z.r * p, 0, TAU); g.fill();
        g.globalAlpha = 0.85;
        g.strokeStyle = z.col;
        g.lineWidth = z.y2 > 0 ? 3 : 2;
        if (z.y2 > 0) { g.setLineDash([12, 8]); g.lineDashOffset = G.time * 40; }
        g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        break;
      }
    }
  }
}

/** Over the robots: implosions, cone shockwaves, shockwave rings. */
export function drawZonesOver(g) {
  const zs = G.zones;
  for (let i = 0; i < zs.count; i++) {
    const z = zs.items[i];
    if (z.dead) continue;
    const p = Math.min(1, z.t / z.life);
    if (z.type === Z.IMPLODE) {
      // its reach, three rings collapsing inward, and a core that swells until it bursts
      g.globalAlpha = 0.1 + p * 0.08;
      g.fillStyle = z.col;
      g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.fill();
      g.strokeStyle = z.col;
      g.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        const f = ((1 - p) + k / 3) % 1;
        g.globalAlpha = 0.85 * f;
        g.beginPath(); g.arc(z.x, z.y, Math.max(3, z.r * f), 0, TAU); g.stroke();
      }
      if (G.gfx.glow) {
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.6 + p * 0.4;
        const s = 30 + p * 60;
        g.drawImage(sprites.dots[z.pal], z.x - s, z.y - s, s * 2, s * 2);
        g.globalCompositeOperation = "source-over";
      }
      g.fillStyle = "#ffffff";
      g.globalAlpha = 0.7 + p * 0.3;
      g.beginPath(); g.arc(z.x, z.y, 4 + p * 10, 0, TAU); g.fill();
      g.globalAlpha = 1;
    } else if (z.type === Z.WAVE) {
      const R = z.r * easeOutCubic(p);
      g.save();
      g.globalAlpha = 0.85 * (1 - p * 0.7);
      g.strokeStyle = z.col;
      g.lineWidth = 10 * (1 - p) + 3;
      g.beginPath(); g.arc(z.x, z.y, R, z.a - z.r0 / 2, z.a + z.r0 / 2); g.stroke();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.globalAlpha = 0.9 * (1 - p);
      g.beginPath(); g.arc(z.x, z.y, R, z.a - z.r0 / 2, z.a + z.r0 / 2); g.stroke();
      g.restore();
    } else if (z.type === Z.SHOCK) {
      const R = z.r0 + (z.r - z.r0) * p;
      g.globalAlpha = 0.9 * (1 - p * 0.6);
      g.strokeStyle = z.col;
      g.lineWidth = 6;
      g.beginPath(); g.arc(z.x, z.y, R, 0, TAU); g.stroke();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(z.x, z.y, R, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
  }
}

