/* Flight school (4.5): a short, hands-on tutorial before a new player's first run. It's a quiet run of its own:
   no waves, nothing can hurt you, nothing is saved but "done". Ten steps, each one waiting for you to actually do
   the thing (with the right buttons for keyboard and mouse, a controller or touch), and a Skip button the whole
   way. It can be replayed from How to play. */

import { G } from "./state.js";
import { store } from "./storage.js";
import { input } from "./input.js";
import { ui } from "./ui.js";
import { BALANCE } from "./balance.js";
import { kbd } from "./keys.js";

let H = null;          // main.js: { spawnEnemy, startRun, toMenu, openCards, audio }
let step = -1, prog = 0, t = 0, lastX = 0, lastY = 0, slot = 0, sawBuild = false, targets = [], gunner = null;
const box = () => document.getElementById("tut");
const mode = () => (input.mode === "touch" ? "touch" : input.mode === "gamepad" ? "gamepad" : "kbm");

const STEPS = [
  { id: "move", title: "Fly", need: 900,
    text: { kbm: () => "Move with " + ["up", "left", "down", "right"].map(kbd).join(" ") + ".", gamepad: "Move with the <b>left stick</b>.", touch: "Drag on the <b>left half</b> of the screen to fly." } },
  { id: "shoot", title: "Shoot", need: 3,
    text: { kbm: "Aim with the mouse and hold <b>left-click</b> to fire. Destroy the three drones.", gamepad: "Aim with the <b>right stick</b>: you fire as you aim (or hold <b>RT</b>). Destroy the three drones.", touch: "Drag on the <b>right half</b> to aim and fire. Destroy the three drones." } },
  { id: "charge", title: "Charged shot", need: 1,
    text: { kbm: "Hold <b>right-click</b> until it's full, then let go.", gamepad: "Hold <b>LT</b> until it's full, then let go.", touch: "Hold the <b>Charge</b> button until it's full, then let go." } },
  { id: "boost", title: "Boost", need: 2,
    text: { kbm: () => "Press " + kbd("boost") + " to boost. Nothing can hit you mid-boost. Boost twice.", gamepad: "Press <b>A</b> (or <b>LB</b> / <b>RB</b>) to boost. Nothing can hit you mid-boost. Boost twice.", touch: "Tap <b>Boost</b>. Nothing can hit you mid-boost. Boost twice." } },
  { id: "perfect", title: "Perfect Boost", need: 1, skipAfter: 35,
    text: { all: "That gunner is shooting at you. Boost <b>through</b> a shot just before it hits: a <b>Perfect Boost</b> gives slow-mo, combo and a faster recharge." } },
  { id: "swap", title: "Two guns", need: 1,
    text: { kbm: () => "You've got a Scattergun now. Press " + kbd("swap") + " (or roll the mouse wheel) to swap guns.", gamepad: "You've got a Scattergun now. Press <b>Y</b> to swap guns.", touch: "You've got a Scattergun now. Tap your gun (top left) to swap." } },
  { id: "build", title: "Your build", need: 1,
    text: { kbm: () => "Press " + kbd("build") + " to see your guns, upgrades and stats, then close it.", gamepad: "Press <b>View</b> (the small left button) to see your build, then <b>B</b> to close it.", touch: "Tap the <b>layers</b> button under pause to see your build, then close it." } },
  { id: "card", title: "Upgrades", need: 1,
    text: { all: "After every wave you pick a <b>Sin</b> or an <b>Augment</b>. Pick one now. The Armory opens between some waves too: guns, gear and patch-ups for stars." } },
  { id: "still", title: "Keep moving", need: 4,
    text: { all: "One rule: <b>don't stand still</b>. Stay put and robots come round behind you, then strikes land where you stand (a red ring fills first). Keep flying for a few seconds." } },
  { id: "done", title: "You're ready", need: 1,
    text: { kbm: () => "Climb the Sin Ladder: a sin boss every 5 waves. Press " + kbd("boost") + " to start your first run.", gamepad: "Climb the Sin Ladder: a sin boss every 5 waves. Press <b>A</b> to start your first run.", touch: "Climb the Sin Ladder: a sin boss every 5 waves. Tap <b>Boost</b> to start your first run." } },
];

function render() {
  const n = box();
  if (!n || step < 0) return;
  const s = STEPS[step];
  n.querySelector(".tut-step").textContent = "Flight school · " + (step + 1) + " of " + STEPS.length;
  n.querySelector(".tut-title").textContent = s.title;
  const tx = s.text.all || s.text[mode()];
  n.querySelector(".tut-text").innerHTML = typeof tx === "function" ? tx() : tx;
  n.querySelector(".tut-fill").style.transform = "scaleX(" + Math.min(1, prog / s.need).toFixed(3) + ")";
  const go = n.querySelector(".tut-go");
  go.hidden = !(s.id === "done" || (s.skipAfter && t > s.skipAfter));
  go.lastChild.textContent = s.id === "done" ? "Start my first run" : "Carry on";
}

function spawnAt(type, dx, dy) {
  const P = G.player;
  const A = BALANCE.arena;
  const e = H.spawnEnemy(type, Math.max(80, Math.min(A.w - 80, P.x + dx)), Math.max(80, Math.min(A.h - 80, P.y + dy)), { spawnT: 0.4 });
  return e;
}
function enter(i) {
  step = i; prog = 0; t = 0;
  const s = STEPS[i];
  if (!s) return finish(true);
  const P = G.player;
  if (s.id === "shoot") {
    targets = [spawnAt("drone", 300, -120), spawnAt("drone", 340, 40), spawnAt("drone", 260, 170)];
    for (const e of targets) if (e) { e.speed = 0; e.contact = 0; e.tut = true; }
  } else if (s.id === "perfect") {
    gunner = spawnAt("gunner", -360, -60);
    if (gunner) { gunner.invuln = true; gunner.tut = true; }
  } else if (s.id === "swap") {
    if (gunner && !gunner.dead) { gunner.invuln = false; gunner.hp = 0; gunner.dead = true; }
    G.guns[1] = { id: "scatter", tier: 1 };
    slot = G.gunSlot;
  } else if (s.id === "card") {
    H.openCards();
  }
  lastX = P.x; lastY = P.y;
  H.audio.play("pick");
  render();
}
function advance() { H.audio.play("achv"); enter(step + 1); }

function finish(start) {
  step = -1;
  G.tutorial = false;
  store.data.tutorial = 1;
  store.save(true);
  const n = box();
  if (n) n.hidden = true;
  if (start) H.startRun();
  else H.toMenu();
}

export const tutorial = {
  get on() { return step >= 0; },
  get dbg() { return { step, prog, t, need: step >= 0 ? STEPS[step].need : 0 }; },
  init(hooks) {
    H = hooks;
    const n = box();
    if (!n) return;
    n.querySelector(".tut-skip").addEventListener("click", () => { H.audio.play("click"); this.skip(); });
    n.querySelector(".tut-go").addEventListener("click", () => { H.audio.play("click"); if (STEPS[step].id === "done") finish(true); else advance(); });
    G.on("kill", (e) => { if (step >= 0 && STEPS[step].id === "shoot" && e.tut) { prog++; render(); } });
    G.on("chargeShot", (amt) => { if (step >= 0 && STEPS[step].id === "charge" && amt >= 0.95) { prog = 1; render(); } });
    G.on("boost", () => {
      if (step < 0) return;
      const id = STEPS[step].id;
      if (id === "boost") { prog++; render(); }
      else if (id === "done") finish(true);
    });
    G.on("perfect", () => { if (step >= 0 && STEPS[step].id === "perfect") { prog = 1; render(); } });
    G.on("card", () => { if (step >= 0 && STEPS[step].id === "card") { prog = 1; render(); } });
    G.on("buildView", () => { if (step >= 0 && STEPS[step].id === "build") sawBuild = true; });
  },
  /** First run for a new player (main.js startRun calls back into begin once the quiet run is set up). */
  start() { G.tutorial = true; H.startRun({ tutorial: true }); },
  begin() {
    const n = box();
    if (n) n.hidden = false;
    enter(0);
  },
  skip() { if (step >= 0) finish(false); },
  /** Left by quitting to the menu: counts as skipped (it's in How to play if they want it). */
  abandon() {
    if (step < 0) return;
    step = -1; G.tutorial = false; store.data.tutorial = 1; store.save(true);
    const n = box(); if (n) n.hidden = true;
  },
  /** A card was picked in the tutorial: back to flying (instead of the Armory or the next wave). */
  cardPicked() { H.resumePlay(); },
  /** Every frame of the tutorial run (main.js). */
  tick(dt) {
    if (step < 0 || G.state === "paused") return;
    const P = G.player, s = STEPS[step];
    if (!P) return;
    t += dt;
    const moved = Math.hypot(P.x - lastX, P.y - lastY);
    lastX = P.x; lastY = P.y;
    const steering = Math.abs(input.move.x) + Math.abs(input.move.y) > 0.2;
    if (s.id === "move" || s.id === "still") prog += s.id === "move" ? moved : moved > 1.5 || steering ? dt : 0;
    if (s.id === "swap" && G.gunSlot !== slot) prog = 1;
    if (s.id === "build" && sawBuild && ui.screen !== "build") { prog = 1; sawBuild = false; }
    if (s.id === "perfect" && (!gunner || gunner.dead)) { gunner = spawnAt("gunner", -360, -60); if (gunner) { gunner.invuln = true; gunner.tut = true; } }
    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) render();
    if (prog >= s.need && s.id !== "done") advance();
  },
};
