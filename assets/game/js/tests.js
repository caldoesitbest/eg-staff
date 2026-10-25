/* Debug only (?debug=1&tests=1): deterministic checks that the 4.2 systems stay bounded. Each test sets up
   a small situation, drives the real code, and checks a limit. Results go to the console (and the Windows
   app's status log); window.__tests holds them. Nothing here runs in normal play. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";
import { seedRng } from "./util.js";

export async function runTests(h) {
  const out = [];
  const say = (msg) => { try { window.chrome.webview.postMessage({ type: "status", msg }); } catch (e) { console.log("[tests] " + msg); } };
  const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); say((ok ? "PASS " : "FAIL ") + name + (detail !== undefined ? " (" + detail + ")" : "")); };
  const up = await import("./upgrades.js");
  const fu = await import("./fusion.js");
  const ev = await import("./evolve.js");
  const mu = await import("./mutations.js");
  const world = await import("./world.js");
  const zones = await import("./zones.js");
  const st = await import("./state.js");
  seedRng(7);
  const fresh = (cards) => {
    h.startRun();
    G.debug.god = true;
    h.waves.queue.length = 0; h.waves.active = false;
    G.enemies.clear(); G.zones.clear(); G.pb.clear(); G.eb.clear(); G.warnings.clear();
    for (const c of cards || []) up.applyCard(c);
    return G.player;
  };
  const spawn = (type, dx, dy, opts) => h.spawnEnemy(type, G.player.x + dx, G.player.y + dy, { spawnT: 0, ...(opts || {}) });
  try {
    const F = BALANCE.fusions;
    // --- Sin Fusions ---------------------------------------------------------------------------------
    let P = fresh(["greed", "greed", "envy", "envy"]);
    check("fusion: not offered below level 3", up.fusionsOpen().length === 0);
    up.applyCard("greed"); up.applyCard("envy");
    check("fusion: offered at level 3", up.fusionsOpen().some((c) => c.id === "covetous"));
    up.applyCard("covetous");
    for (let i = 0; i < 3; i++) up.applyCard("wrath");          // Golden Frenzy (greed + wrath) now qualifies too
    check("fusion: one per run on the Ladder", up.fusionsOpen().length === 0);
    G.won = true;
    check("fusion: a second one in endless", up.fusionsOpen().some((c) => c.id === "frenzy"));
    G.won = false;
    P.envy.push({ type: "drone", t: 1, max: 12, tick: 0 });
    for (let i = 0; i < 200; i++) fu.fusionStar(P, 3);
    check("Covetous King: extension capped at 100% of the power's time", P.envy[0].ext <= P.envy[0].max * F.covetous.extendCap + 1e-6 && P.envy[0].t <= P.envy[0].max, P.envy[0].ext);
    P = fresh(["greed", "greed", "greed", "wrath", "wrath", "wrath", "frenzy"]);
    for (let i = 0; i < 500; i++) fu.fusionStar(P, 0);
    check("Golden Frenzy: damage bonus capped", fu.fusionDmg(P) <= (1 + F.frenzy.cap * F.frenzy.per) * (1 + F.frenzy.burst.dmg) + 1e-6, fu.fusionDmg(P).toFixed(2));
    const gold = P.goldT;
    for (let i = 0; i < 500; i++) fu.fusionStar(P, 0);
    check("Golden Frenzy: no retrigger during a burst", P.goldT <= gold);
    P = fresh(["gluttony", "gluttony", "gluttony", "pride", "pride", "pride", "feast"]);
    P.hp = P.maxHp; P.shield = P.maxShield;
    for (let i = 0; i < 30; i++) world.healPlayer(1, true);
    check("Immortal Feast: gorge stores at most 3", P.gorge === F.feast.gorgeMax, P.gorge);
    P = fresh(["lust", "lust", "lust", "gluttony", "gluttony", "gluttony", "parasite"]);
    P.hp = 1; let e = spawn("drone", 80, 0); e.ally = 3; e.allyMax = 7; e.allyBy = P;
    for (let i = 0; i < 1000; i++) fu.allyHit(e);
    check("Parasitic Heart: 2 heals a wave", P.leechN === F.parasite.heals, P.leechN);
    P.shield = 0;
    for (let i = 0; i < 20; i++) fu.allyPop(e);
    check("Parasitic Heart: shields capped", P.shield <= P.maxShield && P.leechS <= F.parasite.shields, P.leechS);
    P = fresh(["wrath", "wrath", "wrath", "lust", "lust", "lust", "bloodlust"]);
    e = spawn("drone", 80, 0); e.ally = 0.01; e.allyMax = 100; e.allyBy = P;
    check("Bloodlust: viciousness capped", fu.bloodRamp(e) <= F.bloodlust.rampCap, fu.bloodRamp(e));
    P = fresh(["envy", "envy", "envy", "sloth", "sloth", "sloth", "stolen"]);
    P.envy.push({ type: "gunner", t: 1, max: 12, tick: 0 });
    for (let i = 0; i < 20; i++) { P.perfectUsed = false; world.perfectBoost(); }
    check("Stolen Time: 3 extensions per power", P.envy[0].pext === F.stolen.extends, P.envy[0].pext);
    // --- weapon evolutions -----------------------------------------------------------------------------
    P = fresh();
    G.guns = [{ id: "smg", tier: 4, evo: "b" }, null]; G.gunSlot = 0; up.computeStats();
    e = spawn("bulwark", 200, 0); e.hp = e.maxHp = 1e9;
    for (let i = 0; i < 100; i++) ev.evoHit({ ev: ev.E.TOXIN, special: 0, kin: 0 }, e, false);
    check("Neurotoxin: stacks capped at " + BALANCE.evolution.smg.b.max, e.tox === BALANCE.evolution.smg.b.max, e.tox);
    G.guns = [{ id: "blaster", tier: 4, evo: "b" }, null]; up.computeStats();
    for (let i = 0; i < 100; i++) ev.evoHit({ ev: ev.E.PHANTOM, special: 0, kin: 0 }, e, false);
    check("Phantom Repeater: streak capped", P.rep === BALANCE.evolution.blaster.b.cap && ev.evoRate(P, G.stats) <= 1 + BALANCE.evolution.blaster.b.cap * BALANCE.evolution.blaster.b.perHit + 1e-9, P.rep);
    G.guns = [{ id: "heart", tier: 4, evo: "b" }, null]; up.computeStats();
    for (let i = 0; i < 100; i++) ev.evoHit({ ev: ev.E.SOUL, special: 0, kin: 0 }, e, false);
    check("Soulbound: streak capped", P.soul === BALANCE.evolution.heart.b.cap, P.soul);
    G.guns = [{ id: "heart", tier: 4, evo: "a" }, null]; up.computeStats();
    G.pb.clear(); P.bloodN = 0;
    for (let i = 0; i < 40; i++) { const r = spawn("drone", 120 + i, 40); r.moon = 4; r.moonBy = P; world.killEnemy(r); }
    check("Blood Moon: darts capped at " + BALANCE.evolution.heart.a.maxDarts, P.bloodN <= BALANCE.evolution.heart.a.maxDarts, P.bloodN);
    G.guns = [{ id: "arc", tier: 4, evo: "b" }, null]; up.computeStats(); G.zones.clear();
    for (let i = 0; i < 6; i++) ev.evoEnd({ ev: ev.E.TEMPEST, special: 2, kin: 0, x: P.x + 100, y: P.y, dmg0: 100, by: P });
    check("Tempest: at most 2 storms each", zones.zoneCount(zones.Z.STORM, P) <= BALANCE.evolution.arc.b.storm.max, zones.zoneCount(zones.Z.STORM, P));
    G.guns = [{ id: "nova", tier: 4, evo: "b" }, null]; up.computeStats(); G.zones.clear();
    for (let i = 0; i < 40; i++) ev.evoEnd({ ev: ev.E.WELL, special: 0, kin: 0, explode: 70, x: P.x + i, y: P.y, dmg: 10, by: P });
    check("Gravity Well: at most 10 wells each", zones.zoneCount(zones.Z.WELL, P) <= BALANCE.evolution.nova.b.well.max, zones.zoneCount(zones.Z.WELL, P));
    const kinEnd = ev.evoEnd({ ev: ev.E.CATACLYSM, special: 0, kin: 1, explode: 42, x: P.x, y: P.y, dmg: 10, by: P });
    check("evolution shots never retrigger evolutions (kin)", kinEnd === false);
    check("Annihilator: ramp capped", ev.beamRamp(50) <= BALANCE.evolution.rail.a.rampCap, ev.beamRamp(50));
    // --- mutations -------------------------------------------------------------------------------------
    fresh();
    e = spawn("gunner", 300, 0, { mut: mu.M.REPLICATOR });
    const n0 = G.enemies.count;
    for (let i = 0; i < 10; i++) world.damageEnemy(e, e.maxHp * 0.09, false, 1, 0, 0);
    check("Replicator: two copies at most", G.enemies.count - n0 <= 2 && e.mutN <= 2, G.enemies.count - n0);
    e = spawn("drone", 300, 100, { mut: mu.M.VAMPIRIC }); e.hp = 1;
    for (let i = 0; i < 50; i++) { mu.vampHeal(e, G.player); e.hp = Math.max(1, e.hp - e.maxHp * 0.2); }
    check("Vampiric: heals no more than its cap", e.mutHeal <= e.maxHp * BALANCE.mutations.types.vampiric.healCap + 1e-6, (e.mutHeal / e.maxHp).toFixed(2));
    e = spawn("drone", 300, -100, { mut: mu.M.ARMORED }); e.ang = 0;
    check("Armored: front/back multipliers", mu.armorMul(e, -1, 0) === BALANCE.mutations.types.armored.front && mu.armorMul(e, 1, 0) === BALANCE.mutations.types.armored.back);
    G.enemies.clear(); G.wave = 30;
    let rolled = 0;
    for (let i = 0; i < 400; i++) { const m = mu.rollMutation("drone", 30); if (m) { spawn("drone", 200 + (i % 10) * 20, 200, { mut: m }); rolled++; } }
    let alive = 0; for (let i = 0; i < G.enemies.count; i++) if (!G.enemies.items[i].dead && G.enemies.items[i].mut) alive++;
    check("mutations: at most " + BALANCE.mutations.maxAlive + " out at once", alive <= BALANCE.mutations.maxAlive, alive);
    check("mutations: never before wave " + BALANCE.mutations.minFrom, (() => { for (let i = 0; i < 200; i++) if (mu.rollMutation("drone", BALANCE.mutations.minFrom - 1)) return false; return true; })());
    // --- boss resolve ----------------------------------------------------------------------------------
    fresh(); G.wave = 35;
    const b = h.spawnEnemy("envy", 1000, 400, { spawnT: 0 }); b.state = 0; b.invuln = false;
    const hp0 = b.hp, cap = b.maxHp * st.resolveRate();
    world.damageEnemy(b, cap * 10, false, 0, 0, 0);
    const took = hp0 - b.hp;
    check("resolve: a huge hit lands at cap + 35% of the rest", Math.abs(took - (cap + cap * 9 * BALANCE.resolve.over)) < 1, Math.round(took) + " of " + Math.round(cap * 10));
    b.res = 0;
    const hp1 = b.hp; world.damageEnemy(b, cap * 0.5, false, 0, 0, 0);
    check("resolve: damage under the cap is untouched", Math.abs((hp1 - b.hp) - cap * 0.5) < 1e-6);
    G.boss = null; b.dead = true;
    // --- the rest ------------------------------------------------------------------------------------
    check("Boss Rush rank: fast and clean is S", h.rushRank && h.rushRank(200, 2) === "S");
    check("Boss Rush rank: hits cost grades", h.rushRank && h.rushRank(200, 17) === "B");
    // hats and Sigils: prices hold, nothing free, nothing earned in a debug run
    const { store } = await import("./storage.js");
    const pr = await import("./progress.js");
    const keep = { sigils: store.data.sigils, hats: { ...store.data.hats }, hat: store.data.cos.hat, diff: G.difficulty };
    try {
      store.data.hats = {}; store.data.cos.hat = "crown"; store.data.sigils = 10;
      check("hats: the crown is yours from the start", pr.hatOwned("crown") && pr.hatOf() === "crown");
      check("hats: can't buy what you can't afford", !pr.buyHat("halo") && store.data.sigils === 10 && !pr.hatOwned("halo"));
      check("hats: can't wear a hat you don't own", !pr.wearHat("halo") && pr.hatOf() === "crown");
      store.data.sigils = 250;
      check("hats: buying spends Sigils and puts it on", pr.buyHat("halo") && store.data.sigils === 250 - BALANCE.sigils.hats.halo && pr.hatOf() === "halo");
      check("hats: no buying the same hat twice", !pr.buyHat("halo") && store.data.sigils === 250 - BALANCE.sigils.hats.halo);
      check("hats: swap back to the crown", pr.wearHat("crown") && pr.hatOf() === "crown");
      const before = store.data.sigils;
      check("Sigils: none in a debug run", pr.earnSigils(5, "test") === 0 && store.data.sigils === before);
      G.difficulty = "nightmare";
      check("Sigils: x3 on Nightmare", pr.sigilAmount("win") === BALANCE.sigils.win * 3 && pr.sigilAmount("rush", "S") === (BALANCE.sigils.rush + BALANCE.sigils.rank.S) * 3);
    } finally {
      store.data.sigils = keep.sigils; store.data.hats = keep.hats; store.data.cos.hat = keep.hat; G.difficulty = keep.diff;
      store.save(true);
    }
    // a 4.1 save comes through: bests kept, Boss Rush open, a past win and a wave-50 run counted (and paid in Sigils)
    const KEY = "eg-glider-v1";
    let backup = null;
    try { backup = localStorage.getItem(KEY); } catch (err) { /* storage blocked */ }
    try {
      localStorage.setItem(KEY, JSON.stringify({ best: { score: 4242, wave: 52, wins: 1 }, totals: { runs: 9, kills: 900 }, settings: { suit: "mint", difficulty: "hard" } }));
      store.load();
      const d = store.data;
      check("save migration: 4.1 save upgraded to version 3", d.ver === 3 && d.best.score === 4242 && d.settings.suit === "mint", "ver " + d.ver);
      check("save migration: Boss Rush open, past achievements counted", store.rushUnlocked() && !!d.achv.ladder && !!d.achv.beyond);
      check("save migration: past achievements pay Sigils, crown on", d.sigils === 2 * BALANCE.sigils.achievement && d.cos.hat === "crown", "sigils " + d.sigils);
    } finally {
      try { if (backup === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, backup); } catch (err) { /* ignore */ }
      store.load();
    }
  } catch (err) {
    check("tests ran without throwing", false, err && err.message);
  }
  const failed = out.filter((t) => !t.ok).length;
  say(out.length - failed + "/" + out.length + " passed");
  say("smoke done");
  window.__tests = out;
  return out;
}
