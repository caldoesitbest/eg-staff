/* Debug only (?debug=1&autoplay=1): a simple autopilot for soak and balance testing.
   It sees every robot and shot (so it's better at dodging than a person, worse at planning).
   Runs before every simulation step, so ?speed=N fast-forward doesn't dull its reactions. */

import { G } from "./state.js";
import { input } from "./input.js";
import { BALANCE } from "./balance.js";

export const bot = {
  runs: [],
  autoRetry: true,
  onRetry: null,
  onPick: null,

  tick() {
    if (G.state === "upgrade") {
      const cards = document.querySelectorAll("#cards .card");
      if (cards.length && this.onPick) this.onPick(cards[Math.floor(Math.random() * cards.length)].dataset.id);
      return;
    }
    if (G.state === "over") {
      if (this.autoRetry && this.onRetry) {
        this.runs.push({ wave: G.wave, time: Math.round(G.time), hits: G.hitsTaken, score: Math.round(G.score), build: JSON.stringify(G.up) });
        this.onRetry();
      }
      return;
    }
    if (G.state !== "playing" && G.state !== "clear") { input.mouse.down = false; return; }
    const P = G.player;
    if (!P || P.dead) return;
    let best = null, bd = 1e12, ax = 0, ay = 0;
    for (let i = 0; i < G.enemies.count; i++) {
      const e = G.enemies.items[i];
      if (e.dead || e.ally > 0) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d2 = dx * dx + dy * dy;
      const w = e.kind.priority ? d2 * 0.5 : e.boss ? d2 * 0.35 : d2;
      if (w < bd) { bd = w; best = e; }
      const R = 230 + e.r * e.scale;
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1; ax -= (dx / d) * (R - d); ay -= (dy / d) * (R - d); }
    }
    // read telegraphs like a person would: leave rings, step off charge and laser lines
    let near = false;
    for (let i = 0; i < G.enemies.count; i++) {
      const e = G.enemies.items[i];
      if (e.dead || e.ally > 0) continue;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      let ring = 0;
      if (e.type === "glutton" && e.state === 3) ring = BALANCE.bosses.glutton.slamRadius * e.scale + 40;
      if (e.type === "boomer" && e.state === 1) ring = BALANCE.enemies.boomer.blast + 30;
      if (ring && d < ring) { ax += (dx / d) * (ring - d) * 6; ay += (dy / d) * (ring - d) * 6; if (d < ring * 0.8) near = true; }
      const lane = (e.type === "ripper" && e.state === 1) || (e.type === "sniper" && e.state === 1) || (e.type === "overclock" && e.windT > 0);
      if (lane) {
        const a = e.type === "overclock" ? e.dashA : e.a;
        const c = Math.cos(a), s = Math.sin(a);
        const along = dx * c + dy * s, side = -dx * s + dy * c;
        if (along > 0 && Math.abs(side) < 60) { const k = side >= 0 ? 1 : -1; ax += -s * k * 400; ay += c * k * 400; if (Math.abs(side) < 25) near = true; }
      }
    }
    for (let i = 0; i < G.eb.count; i++) {
      const b = G.eb.items[i];
      const d2 = (b.x - P.x) ** 2 + (b.y - P.y) ** 2;
      if (d2 < 55 * 55) near = true;
      const d = Math.sqrt(d2) || 1;
      if (d < 140) { ax -= ((b.x - P.x) / d) * (140 - d) * 1.6; ay -= ((b.y - P.y) / d) * (140 - d) * 1.6; }
    }
    ax += (1000 - P.x) * 0.25;
    ay += (650 - P.y) * 0.25;
    input.mode = "kbm";
    input.mouse.seen = true;
    input.mouse.inside = true;
    if (best) {
      const c = G.cam;
      input.mouse.x = (best.x - c.x) * c.z + c.cssW / 2;
      input.mouse.y = (best.y - c.y) * c.z + c.cssH / 2;
      G.aimWorld.x = best.x; G.aimWorld.y = best.y;
      input.mouse.down = true;
      input.fire = true;
    } else { input.mouse.down = false; input.fire = false; }
    input.aimMode = "mouse";
    const l = Math.hypot(ax, ay);
    if (l > 20) { input.move.x = ax / l; input.move.y = ay / l; } else { input.move.x = 0; input.move.y = 0; }
    if (near && P.boostCdT <= 0) input.queued.boost = true;
  },
};
