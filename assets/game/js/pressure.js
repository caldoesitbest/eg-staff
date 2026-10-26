/* Pressure (4.5): what makes standing still a mistake, and what makes Hard and Nightmare robots work together.
   - Standing still: stay inside a small circle for a couple of seconds and the robots notice. Chasers swing round
     to come at you from behind and gunners take bearings behind your aim; a little longer and orbital strikes start
     landing where you stand: a red ring fills first (about a second), so a step or a boost always gets you out,
     and boosting through one is a perfect boost. Stay put even longer and a second strike lands beside the first.
     Moving bleeds it all off. It runs on every difficulty (sooner and faster on harder ones), never between waves.
   - Volleys (Hard, Nightmare): every few seconds up to three ranged robots that can see you line their shots up,
     so the crossfire arrives together. Each still winds up with its usual telegraph.
   The host (or a solo game) runs this; co-op guests see the strikes as ordinary zones. */

import { G, diff, endless } from "./state.js";
import { BALANCE } from "./balance.js";
import { rand, TAU } from "./util.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { addZone, Z } from "./zones.js";
import { hostileCount, visible } from "./enemies/index.js";
import { waves } from "./waves.js";
import { PAL, P_RED } from "./sprites.js";

const PR = BALANCE.pressure;
const DI = { normal: 0, hard: 1, nightmare: 2 };
const at = (arr) => arr[DI[G.difficulty] || 0];
const tAt = (arr) => at(arr) * endless("pressure");       // endless: robots notice sooner
let syncT = 4, warned = false;

G.on("runStart", () => {
  syncT = 4; warned = false;
  for (const P of G.players || []) { P.campT = 0; P.campX = P.x; P.campY = P.y; P.campHot = false; P.strikeCd = 0; }
});

/** True while this player has been standing still long enough for robots to come round behind. */
export const camping = (P) => !!(P && P.campHot);

export function pressureTick(dt) {
  if (G.state !== "playing" || G.tutorial || G.net.role === "client") return;
  // the whole wave counts (not just while robots are on screen): an empty moment mid-wave doesn't let you off
  const fight = (waves.active && !waves.done) || hostileCount() > 0 || (G.boss && !G.boss.dead && G.boss.state !== -1);
  for (let i = 0; i < G.players.length; i++) {
    const P = G.players[i];
    if (P.dead || P.gone) { P.campT = 0; P.campHot = false; continue; }
    if (P.campX === undefined) { P.campX = P.x; P.campY = P.y; P.campT = 0; P.strikeCd = 0; }
    const dx = P.x - P.campX, dy = P.y - P.campY;
    if (P.boostT > 0) { P.campT = 0; P.campX = P.x; P.campY = P.y; }
    else if (dx * dx + dy * dy > PR.radius * PR.radius) { P.campT *= PR.keep; P.campX = P.x; P.campY = P.y; }
    else if (fight) P.campT += dt;
    else P.campT = Math.max(0, P.campT - dt * 2);
    P.campHot = fight && P.campT > tAt(PR.settle);
    if (!fight || P.campT < tAt(PR.strike.after)) { P.strikeCd = Math.min(P.strikeCd, 0.6); continue; }
    P.strikeCd -= dt;
    if (P.strikeCd > 0) continue;
    // the longer you stay, the harder and faster they come; past `lethal` each one takes a third of your health
    const S = PR.strike, over = P.campT - tAt(S.after);
    P.strikeCd = Math.max(S.minEvery, at(S.every) * (1 - over * S.faster));
    let dmg = S.dmg * (1 + Math.floor(over / S.rampEvery));
    if (P.campT > tAt(S.lethal)) dmg = Math.max(dmg, Math.ceil((P.maxHp + (P.maxShield || 0)) * S.lethalPct));
    strikeAt(P, P.x + rand(-16, 16), P.y + rand(-16, 16), dmg);
    if (P.campT > tAt(S.pair)) {
      // stayed put through the first ones: the next lands beside you too, so drifting a step isn't enough
      const a = rand(0, TAU);
      strikeAt(P, P.x + Math.cos(a) * S.r * 1.5, P.y + Math.sin(a) * S.r * 1.5, dmg);
    }
    if (!warned && P === G.me) { warned = true; G.emit("campWarn"); }
  }
  if (fight) volleys(dt);
}

function strikeAt(P, x, y, dmg) {
  const S = PR.strike;
  const z = addZone(Z.DELAY, x, y, S.r, at(S.fuse));
  if (!z) return;
  z.dmg = 0; z.y2 = dmg || S.dmg; z.col = S.col; z.pal = PAL.indexOf(S.col) >= 0 ? PAL.indexOf(S.col) : P_RED; z.src = "orbital strike"; z.by = null; z.big = true;
  audio.play("warn", x, y, 0.7);
  fx.ring(x, y, S.r * 1.4, S.r, 0.35, S.col, 2);
}

/** Hard and Nightmare: a few ranged robots that can see you fire together. */
function volleys(dt) {
  const every = diff().sync || 0;
  if (!every) return;
  syncT -= dt;
  if (syncT > 0) return;
  syncT = every * rand(0.85, 1.15);
  const items = G.enemies.items;
  let n = 0;
  for (let i = 0; i < G.enemies.count && n < 3; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.boss || e.spawnT > 0 || e.state !== 0 || !PR.volley[e.type] || !visible(e, 30)) continue;
    e.cd = Math.min(e.cd, PR.volleyLead + n * 0.08);
    n++;
  }
}

/** A pulsing reticle on a camper (world space, under the robots), so the reason for the strikes is plain. */
export function drawPressure(g) {
  for (let i = 0; i < G.players.length; i++) {
    const P = G.players[i];
    if (!P.campHot || P.dead || P.gone) continue;
    const k = Math.min(1, (P.campT - tAt(PR.settle)) / Math.max(0.1, tAt(PR.strike.after) - tAt(PR.settle)));
    const r = 46 - k * 10 + Math.sin(G.time * 10) * 2;
    g.save();
    g.globalAlpha = 0.35 + k * 0.4;
    g.strokeStyle = PR.strike.col;
    g.lineWidth = 2;
    g.setLineDash([6, 6]);
    g.lineDashOffset = -G.time * 30;
    g.beginPath(); g.arc(P.x, P.y, r, 0, TAU); g.stroke();
    g.setLineDash([]);
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2 + G.time * 0.8;
      g.beginPath(); g.moveTo(P.x + Math.cos(a) * (r + 4), P.y + Math.sin(a) * (r + 4)); g.lineTo(P.x + Math.cos(a) * (r + 13), P.y + Math.sin(a) * (r + 13)); g.stroke();
    }
    g.restore();
  }
}
