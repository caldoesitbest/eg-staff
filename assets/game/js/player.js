/* The crowned astronaut: glide movement (from the original Envious Glider), aiming (manual,
   aim assist or full auto on every control), your gun, the charged shot and the BOOST dash.
   Co-op: every player runs through updatePlayer. On the host, a teammate's astronaut ("remote")
   takes aim, buttons and position from the network and the host fires its shots; on a client, your
   own astronaut moves here (so it feels instant) but its shots come back from the host. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { input } from "./input.js";
import { fx } from "./fx.js";
import { audio } from "./audio.js";
import { TAU, rand, smooth, angDiff } from "./util.js";
import { P_CYAN, P_WHITE, P_DVIOLET, P_VIOLET, P_AMBER, P_ORANGE, P_BLUE, P_HEART, P_MINT, C } from "./sprites.js";
import { firePlayerBullet, fireBeam, addPuddle, newBoostSerial, haptic, hitStop } from "./world.js";
import { hasEnvy, ENVY_POWERS } from "./upgrades.js";
import { swapGun, GUN_COL } from "./armory.js";
import { evoRate, evoSpread, evoFired, evoShot, evoCharged, evoOrb, evoPal, evoCol, newVolley } from "./evolve.js";
import { fusionReset, fusionRate, fusionBeforeFire, fusionAfterFire } from "./fusion.js";

const A = BALANCE.arena;
const B = BALANCE.player;
const TRAIL = 6;

export function createPlayer(slot = 0) {
  const s = G.stats || { maxHp: B.hp, shieldCap: 0 };
  const P = {
    slot, name: "", suit: "classic", ctx: null, input: null,
    orbPos: new Float32Array(8), drones: [], slowMul: 1, orbN: 0, slowR: 0, turrets: 0,
    reviveT: 0, impX: 0, impY: 0, hurtSeq: 0, v0x: 0, v0y: 0,
    x: A.w / 2, y: A.h / 2, px: A.w / 2, py: A.h / 2, vx: 0, vy: 0,
    r: B.radius, hp: s.maxHp, maxHp: s.maxHp, shield: 0, maxShield: s.shieldCap,
    iframes: 1.2, hurtT: 0, grace: 0,
    boostT: 0, boostCdT: 0, boostDX: 1, boostDY: 0, perfectUsed: false, boostSerial: 0, boostBuffer: 0, boostWasReady: true,
    aimAng: 0, paim: 0, facing: 1, fireCd: 0, recoil: 0, muzzle: 0,
    tilt: 0, thrustT: 0, puddleT: 0,
    trailX: new Float32Array(TRAIL), trailY: new Float32Array(TRAIL), trailN: 0, trailT: 0, ghostT: 0,
    dead: false, deathT: 0,
    streak: 0, feast: 0, envy: [],
    charge: 0, charging: false, chargeCd: 0, chargeFull: false, chargeBank: false, echoT: 0, echoAng: 0, echoAmt: 0,
    bubble: false, fangN: 0,
    // weapon evolutions (evolve.js): Phantom streak, Soulbound streak, Overdrive meter / heat, Tempest, Blood Moon darts
    rep: 0, repIdle: 0, repN: 0, soul: 0, soulIdle: 0, od: 0, odT: 0, heat: 0, odIdle: 0, staticT: 0, bloodN: 0,
  };
  fusionReset(P);          // Sin Fusion state (fusion.js)
  return P;
}

const CH = BALANCE.charge;
const PAL_OF = { blaster: P_CYAN, scatter: P_AMBER, smg: P_MINT, rail: P_VIOLET, nova: P_ORANGE, arc: P_BLUE, heart: P_HEART };
export const gunPal = (id) => PAL_OF[id] === undefined ? P_CYAN : PAL_OF[id];

/** Drops a charge without firing (menus, death). */
export function cancelCharge(P = G.me) {
  if (P) { P.charging = false; P.charge = 0; P.chargeFull = false; P.echoT = 0; }
  audio.chargeStop();
}

/** Hurtbox is smaller than the sprite: grazes don't count. */
export function playerHurtRadius() { return 9; }

function pickAutoTarget(P) {
  const items = G.enemies.items;
  const range = 600;
  let best = null, bd = range * range;
  const cur = G.autoTarget;
  for (let i = 0; i < G.enemies.count; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (Math.abs(dx) > G.cam.viewW / 2 + 40 || Math.abs(dy) > G.cam.viewH / 2 + 40) continue;
    let d2 = dx * dx + dy * dy;
    if (e === cur) d2 *= 0.65;             // sticky: don't flicker between two targets
    if (e.kind.priority) d2 *= e.kind.priority;
    if (d2 < bd) { bd = d2; best = e; }
  }
  G.autoTarget = best;
  return best;
}

/** Aim assist: the robot closest to a point (the crosshair), within a radius. */
function nearPoint(x, y, R) {
  const items = G.enemies.items;
  let best = null, bd = R * R;
  for (let i = 0; i < G.enemies.count; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    const rr = R + e.r * e.scale;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 < rr * rr && d2 < bd + e.r * e.r) { bd = d2; best = e; }
  }
  return best;
}
/** Aim assist on a stick: the nearest robot within a narrow cone of where you're pointing. */
function nearCone(P, ang, cone, range) {
  const items = G.enemies.items;
  let best = null, bs = 1e9;
  for (let i = 0; i < G.enemies.count; i++) {
    const e = items[i];
    if (e.dead || e.ally > 0 || e.spawnT > 0.1) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
    if (d > range) continue;
    const off = Math.abs(angDiff(ang, Math.atan2(dy, dx)));
    if (off > cone + Math.atan2(e.r * e.scale, d)) continue;
    const score = off * 400 + d;
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}
/** Angle to a robot, leading it so the shot lands. */
function leadAngle(P, t, speed) {
  const dx = t.x - P.x, dy = t.y - P.y;
  const k = Math.sqrt(dx * dx + dy * dy) / speed;
  return Math.atan2(dy + t.vy * k * t.slowMul, dx + t.vx * k * t.slowMul);
}

function startBoost(P, s, inp) {
  let dx = inp.move.x, dy = inp.move.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.1) {
    const sp = Math.hypot(P.vx, P.vy);
    if (sp > 50) { dx = P.vx / sp; dy = P.vy / sp; }
    else { dx = Math.cos(P.aimAng); dy = Math.sin(P.aimAng); }
  }
  const l = Math.hypot(dx, dy) || 1;
  P.boostDX = dx / l; P.boostDY = dy / l;
  P.boostT = B.boost.time;
  P.bn = (P.bn || 0) + 1;            // co-op: the host counts your boosts
  P.boostCdT = s.boostCd * (hasEnvy("ripper") ? ENVY_POWERS.ripper.boostCd : 1);
  P.perfectUsed = false;
  P.boostSerial = newBoostSerial();
  P.boostBuffer = 0;
  P.boostWasReady = false;
  P.trailN = 0;
  const back = Math.atan2(-P.boostDY, -P.boostDX);
  fx.ring(P.x, P.y, 8, 46, 0.25, C.cyan, 2.5);
  fx.sparks(P.x, P.y, back, 0.5, 10, P_CYAN, 420, 0.3);
  fx.burst(P.x, P.y, 6, P_WHITE, 120, 0.3, 1.2);
  fx.shake(0.06);
  audio.play("boost", P.x, P.y);
  haptic(10);
  G.emit("boost");
}

const shotBuf = [];
function fire(P, s) {
  const base = P.aimAng;
  const c = Math.cos(base), sn = Math.sin(base);
  const mx = P.x + c * 20, my = P.y + 3 + sn * 20;
  const n = s.projectiles;
  const spread = s.spread * (s.ev ? evoSpread(P, s) : 1);
  const pellets = s.gun.pellets > 1;
  fusionBeforeFire(P);
  if (G.net.role !== "client") {
    const made = shotBuf;
    made.length = 0;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * s.fan;
      const b = firePlayerBullet(mx, my, base + off + rand(-spread, spread), undefined, s.multiDmg);
      if (b && pellets) { const k = rand(0.85, 1.12); b.vx *= k; b.vy *= k; }   // a shotgun's pellets don't fly in a perfect line
      if (b) made.push(b);
    }
    if (s.rear) { const b = firePlayerBullet(P.x - c * 12, P.y + 3 - sn * 12, base + Math.PI + rand(-spread, spread)); if (b) made.push(b); }
    if (hasEnvy("gunner")) {
      const a = ENVY_POWERS.gunner.angle;
      const l = firePlayerBullet(mx, my, base + a, 3), r = firePlayerBullet(mx, my, base - a, 3);
      if (l) made.push(l);
      if (r) made.push(r);
    }
    // one pull of the trigger: it misses only if none of these hit (evolve.js accuracy streaks)
    if (made.length) {
      const v = newVolley(P, made.length);
      for (let i = 0; i < made.length; i++) { made[i].vol = v; if (s.ev) evoShot(P, s, made[i]); }
    }
  }
  if (s.ev) evoFired(P, s);
  fusionAfterFire(P);
  const kick = s.gunId === "scatter" ? 34 : s.gunId === "rail" ? 26 : s.gunId === "nova" ? 18 : 10;
  P.recoil = 1;
  P.muzzle = 0.05;
  if (!P.input) { P.vx -= c * kick; P.vy -= sn * kick; }
  fx.p(0, mx, my, c * 40, sn * 40, 0.07, 2.6, P_WHITE, 0);
  fx.sparks(mx, my, base, 0.35, pellets ? 4 : 2, gunPal(s.gunId), 300, 0.1);
  audio.play(SHOOT_SFX[s.gunId] || "shoot", P.x, P.y, 0.45);
  if (s.gunId === "rail" || s.gunId === "scatter") fx.shake(0.05);
}
const SHOOT_SFX = { scatter: "shotgun", smg: "smg", rail: "rail", nova: "launch", arc: "zap", heart: "kissShot" };

/** Lets go of a charged shot. amt is 0..1. What it does depends on the gun. */
function fireCharged(P, s, amt, ang, mul = 1) {
  const full = amt >= 0.999;
  const k = Math.pow(amt, 1.3);
  // based on your core damage (sins, gear, the gun's tier), not the gun's per-bullet damage,
  // so a light SMG bolt and a heavy rail slug charge into shots of similar weight
  const dmg = s.baseDamage * BALANCE.gunTiers.dmg[s.gunTier - 1] * (CH.dmg[0] + (CH.dmg[1] - CH.dmg[0]) * k) * s.chargeMul * mul;
  const c = Math.cos(ang), sn = Math.sin(ang);
  const mx = P.x + c * 22, my = P.y + 3 + sn * 22;
  const id = s.gunId;
  const pal = s.ev ? evoPal(s.ev) : gunPal(id), col = s.ev ? evoCol(s.ev) : GUN_COL[id] || C.cyan;
  let knock = 60 + 160 * k;
  const evolved = s.ev ? evoCharged(P, s, amt, ang, dmg, mx, my, k) : false;     // some evolutions fire their own version
  if (G.net.role === "client") {
    // co-op client: the host fires the real shot; this is just the feel of it
    audio.play(id === "rail" ? "beam" : "chargeShot", P.x, P.y);
  } else if (evolved) {
    if (id === "rail" || id === "scatter") knock += 120;
  } else if (id === "rail") {
    fireBeam(mx, my, ang, 1500, 14 + 16 * k + (s.chargeWide ? 10 : 0), dmg * 1.15, s.ev ? col : undefined);
    knock += 120;
    audio.play("beam", P.x, P.y);
  } else if (id === "scatter" || id === "smg" || id === "heart") {
    // a wall of pellets / a burst of bolts / a swarm of hearts
    const n = id === "scatter" ? 14 : id === "smg" ? 14 : 8;
    const arc = id === "scatter" ? 0.9 : id === "smg" ? 0.25 : 1.4;
    const per = (dmg * (id === "heart" ? 1.5 : id === "smg" ? 1.7 : 2)) / n;
    for (let i = 0; i < n; i++) {
      const a = ang + (n === 1 ? 0 : -arc / 2 + (arc * i) / (n - 1)) + rand(-0.04, 0.04);
      const b = firePlayerBullet(mx, my, a, undefined, 1);
      if (!b) break;
      b.dmg = per * (b.crit ? s.critMul : 1);
      b.pierce += 1;
      const sp = id === "smg" ? rand(0.75, 1.3) : rand(0.9, 1.1);
      b.vx *= sp; b.vy *= sp;
      if (id === "heart") { b.homing = Math.max(b.homing, 5.5); b.life *= 1.4; }
      b.r *= 1.3;
    }
    audio.play(id === "scatter" ? "shotgun" : id === "smg" ? "smg" : "kissShot", P.x, P.y);
    audio.play("chargeShot", P.x, P.y, 0.6);
  } else {
    // blaster: a big piercing orb; nova: a cluster bomb; arc: a storm orb
    const b = firePlayerBullet(mx, my, ang, 2, 1);
    if (b) {
      b.dmg = dmg * (id === "nova" ? 0.9 : id === "arc" ? 0.8 : 1) * (b.crit ? s.critMul : 1);
      b.r = CH.radius[0] + (CH.radius[1] - CH.radius[0]) * k;
      const sp = id === "nova" ? 560 : id === "arc" ? 420 : CH.speed;
      b.vx = c * sp; b.vy = sn * sp;
      b.life = id === "arc" ? 1.5 : id === "nova" ? 0.8 : 1.1;
      b.pierce = 99;
      b.homing = 0;
      b.explode = 0;
      b.chain = 0;
      b.special = id === "nova" ? 3 : id === "arc" ? 2 : 1;
      b.full = full;
      b.amt = amt; b.dmg0 = b.dmg;
      if (s.ev) evoOrb(s, b);
      b.kind = id === "nova" ? 7 : id === "arc" ? 8 : 2;
      if (id === "nova") b.r *= 0.8;
    }
    audio.play("chargeShot", P.x, P.y);
  }
  if (!P.input) { P.vx -= c * knock; P.vy -= sn * knock; }
  P.recoil = 1;
  P.muzzle = 0.08;
  fx.ring(mx, my, 6, 30 + 50 * k, 0.25, col, 3);
  fx.sparks(mx, my, ang, 0.5, 6 + Math.round(10 * k), pal, 420, 0.2);
  fx.shake(0.08 + 0.25 * k);
  if (full) { hitStop(0.03, false); haptic(20); }
  G.emit("chargeShot", amt);
}

export function updatePlayer(dt, P = G.player) {
  if (!P) return;
  const inp = P.input || input;     // a teammate's astronaut on the host reads the network instead
  const remote = !!P.input;
  const me = P === G.me;
  P.px = P.x; P.py = P.y; P.paim = P.aimAng;
  if (P.dead) {
    P.deathT += dt;
    P.vx *= 0.96; P.vy *= 0.96;
    P.x += P.vx * dt * 0.4; P.y += P.vy * dt * 0.4;
    return;
  }
  const s = G.stats;
  const playing = G.state === "playing" || G.state === "clear";

  if (P.iframes > 0) P.iframes -= dt;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (P.grace > 0) P.grace -= dt;
  if (P.muzzle > 0) P.muzzle -= dt;
  if (P.recoil > 0) P.recoil = Math.max(0, P.recoil - dt * 12);
  if (P.boostCdT > 0) P.boostCdT -= dt;
  if (P.boostBuffer > 0) P.boostBuffer -= dt;
  if (P.chargeCd > 0) P.chargeCd -= dt;
  if (playing && inp.consumeSwap()) swapGun(inp.swapTo);

  // ----- boost (a remote astronaut's boost comes over the network) -----
  if (!remote && playing && inp.consumeBoost()) P.boostBuffer = 0.16;        // buffered: a slightly early press still counts
  if (!remote && P.boostBuffer > 0 && P.boostCdT <= 0 && P.boostT <= 0) startBoost(P, s, inp);
  if (!remote && !P.boostWasReady && P.boostCdT <= 0 && P.boostT <= 0) {
    P.boostWasReady = true;
    audio.play("boostReady", P.x, P.y, 0.5);
    fx.ring(P.x, P.y, 20, 30, 0.2, C.cyan, 1.5);
  }

  // ----- movement -----
  const envySpeed = hasEnvy("drone") ? 1 + ENVY_POWERS.drone.speed : 1;
  const speed = s.moveSpeed * envySpeed * (P.slowMul || 1) * (P.charging ? CH.moveMul : 1);
  const mx = inp.move.x, my = inp.move.y;
  P.mvx = mx; P.mvy = my;
  if (remote) {
    // its own game moves it; here it just puffs
    if ((mx || my) && G.gfx.trails && P.boostT <= 0) {
      P.thrustT -= dt;
      if (P.thrustT <= 0) { P.thrustT = 0.05; fx.p(0, P.x - P.facing * 10, P.y + 4, -mx * 120, -my * 120, 0.35, 1.5, P_DVIOLET, 3); }
    }
  } else if (P.boostT > 0) {
    P.boostT -= dt;
    P.vx = P.boostDX * s.boostSpeed;
    P.vy = P.boostDY * s.boostSpeed;
    if (s.slothTrail) {
      P.puddleT -= dt;
      if (P.puddleT <= 0) { P.puddleT = 0.035; addPuddle(P.x, P.y); }
    }
    if (Math.random() < 0.8) fx.p(0, P.x + rand(-6, 6), P.y + rand(-6, 6), -P.vx * 0.1, -P.vy * 0.1, 0.3, 1.8, P_CYAN, 4);
    if (P.boostT <= 0) {
      P.grace = B.boost.grace;
      P.vx *= 0.4; P.vy *= 0.4;
    }
  } else {
    const k = (mx || my) ? smooth(B.accel, dt) : smooth(B.glide, dt);
    P.vx += (mx * speed - P.vx) * k;
    P.vy += (my * speed - P.vy) * k;
    // jetpack puffs while steering (the original's trail)
    if ((mx || my) && G.gfx.trails) {
      P.thrustT -= dt;
      if (P.thrustT <= 0) {
        P.thrustT = 0.03;
        const bx = P.x - P.facing * 10, by = P.y + 4;
        fx.p(0, bx, by, -mx * 120 + rand(-20, 20), -my * 120 + rand(-20, 20), 0.35, 1.5, Math.random() < 0.5 ? P_VIOLET : P_DVIOLET, 3);
      }
    }
  }

  // afterimage trail while boosting
  if (P.boostT > 0 || P.grace > 0) {
    P.trailT -= dt;
    if (P.trailT <= 0) {
      P.trailT = 0.022;
      for (let i = TRAIL - 1; i > 0; i--) { P.trailX[i] = P.trailX[i - 1]; P.trailY[i] = P.trailY[i - 1]; }
      P.trailX[0] = P.x; P.trailY[0] = P.y;
      P.trailN = Math.min(TRAIL, P.trailN + 1);
    }
    P.ghostT = 0.18;
  } else if (P.ghostT > 0) {
    P.ghostT -= dt;
    if (P.ghostT <= 0) P.trailN = 0;
  }

  if (!remote) {
    P.x += P.vx * dt;
    P.y += P.vy * dt;
    const r = P.r;
    if (P.x < r) { P.x = r; P.vx = Math.abs(P.vx) * 0.4; }
    if (P.x > A.w - r) { P.x = A.w - r; P.vx = -Math.abs(P.vx) * 0.4; }
    if (P.y < r) { P.y = r; P.vy = Math.abs(P.vy) * 0.4; }
    if (P.y > A.h - r) { P.y = A.h - r; P.vy = -Math.abs(P.vy) * 0.4; }
  }

  // tilt into the glide, like the original
  const targetTilt = Math.max(-0.4, Math.min(0.4, P.vx / 700));
  P.tilt += (targetTilt - P.tilt) * smooth(10, dt);

  // ----- aim -----
  // autoAim: "off" | "assist" (nudges your aim onto the robot you're pointing at) | "auto" (aims and
  // fires at the nearest robot by itself; on mouse, holding left-click takes over again).
  let target = null;
  const mode = G.settings.autoAim;
  const full = mode === "auto" && !remote;
  let used = false;            // did auto-aim pick this tick's target (for the reticle)
  if (me) G.assistTarget = null;
  if (inp.aimMode === "remote") {
    P.aimAng = inp.aimAng;       // a teammate aims on their own screen (auto-aim included)
  } else if (inp.aimMode === "mouse") {
    if (full && !inp.mouse.down) { target = pickAutoTarget(P); used = !!target; }
    if (target) P.aimAng = leadAngle(P, target, s.bulletSpeed);
    else {
      const t = mode !== "off" ? nearPoint(G.aimWorld.x, G.aimWorld.y, 70) : null;
      if (t) { G.assistTarget = t; P.aimAng = leadAngle(P, t, s.bulletSpeed); }
      else P.aimAng = Math.atan2(G.aimWorld.y - P.y, G.aimWorld.x - P.x);
    }
  } else if (inp.aimMode === "stick") {
    P.aimAng = Math.atan2(inp.aimY, inp.aimX);
    if (mode !== "off") {
      const t = nearCone(P, P.aimAng, 0.2, 700);
      if (t) { G.assistTarget = t; P.aimAng = leadAngle(P, t, s.bulletSpeed); }
    }
  } else {
    if (full || inp.aimMode === "hold") { target = pickAutoTarget(P); used = !!target; }
    if (target) P.aimAng = leadAngle(P, target, s.bulletSpeed);   // lead it a little so auto-aim actually lands
    else if (mx || my) P.aimAng = Math.atan2(my, mx);
  }
  if (!used && me) G.autoTarget = null;
  P.facing = Math.cos(P.aimAng) >= 0 ? 1 : -1;

  // ----- charged shot: hold, then let go -----
  const holding = playing && inp.charge && !P.dead;
  if (holding && (P.charging || P.chargeCd <= 0)) {
    if (!P.charging) {
      P.charging = true;
      P.charge = P.chargeBank ? 1 : 0;
      P.chargeFull = false;
      P.chargeBank = false;
      if (me) audio.chargeStart();
    }
    P.charge = Math.min(1, P.charge + dt / s.chargeTime);
    if (me) audio.chargeLevel(P.charge);
    if (P.charge >= 1 && !P.chargeFull) {
      P.chargeFull = true;
      fx.ring(P.x, P.y, 30, 10, 0.25, GUN_COL[s.gunId] || C.cyan, 3);
      audio.play("chargeFull", P.x, P.y);
      haptic(8);
    }
    // sparks pulled into the muzzle
    if (Math.random() < 0.5 + P.charge * 0.5) {
      const a = rand(0, TAU), r = rand(26, 44);
      const gx = P.x + Math.cos(P.aimAng) * 24, gy = P.y + 3 + Math.sin(P.aimAng) * 24;
      fx.p(0, gx + Math.cos(a) * r, gy + Math.sin(a) * r, -Math.cos(a) * r * 4, -Math.sin(a) * r * 4, 0.22, 1.2, gunPal(s.gunId), 0);
    }
  } else if (P.charging) {
    const amt = P.charge;
    P.charging = false;
    P.charge = 0;
    if (me) audio.chargeStop();
    if (amt >= CH.min && playing) {
      fireCharged(P, s, amt, P.aimAng);
      P.chargeCd = CH.cooldown;
      P.fireCd = Math.max(P.fireCd, 0.12);
      if (amt >= 0.999 && s.chargeTwice) { P.echoT = 0.14; P.echoAmt = amt; }
    } else audio.play("fizzle", P.x, P.y, 0.6);
  }
  if (P.echoT > 0) {
    // Overdrive Core: a full charge goes off twice
    P.echoT -= dt;
    if (P.echoT <= 0 && playing) fireCharged(P, s, P.echoAmt, P.aimAng, BALANCE.items.overdrive.echo);
  }

  // ----- fire -----
  const autoFire = full && target !== null && (inp.aimMode === "none" || inp.aimMode === "mouse");
  const wantFire = G.state === "playing" && (inp.fire || autoFire) && (!P.charging || s.chargeFire);
  P.wantFire = wantFire;
  if (P.fireCd > 0) P.fireCd -= dt;
  if (wantFire && P.fireCd <= 0) {
    const rate = s.rate * (hasEnvy("swarm") ? 1 + ENVY_POWERS.swarm.rate : 1) * (P.charging ? 0.6 : 1) * (s.ev ? evoRate(P, s) : 1) * fusionRate(P);
    fire(P, s);
    P.fireCd += 1 / rate;
    if (P.fireCd < 0) P.fireCd = 0;
  }

  // ----- moons -----
  const n = s.orbitals;
  if (n) {
    const O = BALANCE.upgrades.orbit;
    for (let i = 0; i < n; i++) {
      const a = G.time * O.speed + (i / n) * TAU;
      P.orbPos[i * 2] = P.x + Math.cos(a) * O.radius;
      P.orbPos[i * 2 + 1] = P.y + Math.sin(a) * O.radius;
    }
  }
  // what teammates' screens need to draw this astronaut
  P.orbN = s.orbitals; P.slowR = s.slowRadius; P.turrets = s.turrets; P.gunId = s.gunId;
}
