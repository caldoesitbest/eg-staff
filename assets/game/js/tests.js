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
    // the cosmetics catalog (4.3): ownership, buying, wearing, loadouts, the featured row, look codes
    const { store } = await import("./storage.js");
    const cat = await import("./catalog.js");
    const ct = await import("./contracts.js");
    const { sprites } = await import("./sprites.js");
    const d0 = store.data;
    const keep = JSON.stringify({ sigils: d0.sigils, owned: d0.owned, cos: d0.cos, suit: d0.settings.suit, presets: d0.presets, contracts: d0.contracts, achv: d0.achv, wave: d0.best.wave });
    const keepDiff = G.difficulty;
    try {
      const keys = new Set(cat.ITEMS.map((i) => i.key));
      check("catalog: every item has a unique id per kind", keys.size === cat.ITEMS.length, cat.ITEMS.length + " items");
      check("catalog: every shop item has a rarity and a price", cat.ITEMS.every((i) => cat.RARITY[i.rarity] && (!i.shop || i.price > 0)));
      check("catalog: every collection has items and a title", cat.SETS.every((st) => cat.setItems(st.id).length >= 3 && cat.ITEMS.some((i) => i.kind === "title" && i.fromSet === st.id)));
      let drawn = 0;
      for (const it of cat.ITEMS) if (["hat", "suit", "visor"].includes(it.kind)) { sprites.astronaut(1, cat.look({ strict: true, [it.kind]: it.id })); drawn++; }
      check("catalog: every hat, suit and visor draws", drawn > 40, drawn + " drawn");
      d0.owned = {}; d0.cos.hat = "crown"; d0.settings.suit = "classic"; d0.sigils = 10; d0.achv = {}; d0.best.wave = 0;
      const halo = cat.item("hat", "halo");
      check("Locker: the crown is yours and on from the start", cat.owns(cat.item("hat", "crown")) && cat.equipped("hat").id === "crown");
      check("shop: can't buy what you can't afford", !cat.buy(halo) && d0.sigils === 10 && !cat.owns(halo));
      check("Locker: can't wear what you don't own", !cat.equip("hat", "halo") && cat.equipped("hat").id === "crown");
      check("shop: achievement items aren't for sale", !cat.buy(cat.item("visor", "mirror")) && d0.sigils === 10);
      d0.sigils = 1000;
      check("shop: buying spends exactly its price", cat.buy(halo) && d0.sigils === 1000 - halo.price && cat.owns(halo));
      check("shop: no buying the same thing twice", !cat.buy(halo) && d0.sigils === 1000 - halo.price);
      check("Locker: wear it, then swap back", cat.equip("hat", "halo") && cat.equipped("hat").id === "halo" && cat.equip("hat", "crown") && cat.equipped("hat").id === "crown");
      check("Locker: wave suits open with your best wave", !cat.owns(cat.item("suit", "gold")) && ((d0.best.wave = 20), cat.owns(cat.item("suit", "gold"))));
      d0.sigils = 100000;
      for (const it of cat.setItems("sloth")) cat.buy(it);
      check("collections: owning a whole one gives its title", cat.owns(cat.item("title", "rested")) && !cat.owns(cat.item("title", "bottomless")));
      cat.equip("hat", "nightcap"); cat.equip("suit", "slumber");
      cat.savePreset(0);
      cat.equip("hat", "crown"); cat.equip("suit", "classic");
      delete d0.owned["hat:nightcap"];
      const missing = cat.applyPreset(0);
      check("loadouts: a preset puts back what you still own", missing === 1 && cat.equipped("suit").id === "slumber" && cat.equipped("hat").id === "crown");
      check("loadouts: an empty slot does nothing", cat.applyPreset(2) === -1 || d0.presets[2] !== null);
      const f1 = cat.featured("2026-10-25"), f2 = cat.featured("2026-10-25"), f3 = cat.featured("2026-10-26");
      check("shop: the featured row is the same all day and changes daily", f1.map((i) => i.key).join() === f2.map((i) => i.key).join() && f1.map((i) => i.key).join() !== f3.map((i) => i.key).join());
      check("shop: four featured, all for sale, the first Epic or better", f1.length === 4 && f1.every((i) => i.shop) && f1[0].rarity >= 3);
      cat.equip("visor", "galaxy");
      const code = cat.lookCode();
      const back = cat.parseLook(code);
      check("co-op: your look code round-trips", back.suit === "slumber" && back.visor === "" && back.hat === "crown", code);
      const bad = cat.parseLook("nope/blackhole/<b>/zzz");
      check("co-op: unknown ids in a teammate's look become defaults", bad.suit === "classic" && bad.hat === "blackhole" && bad.visor === "" && bad.trail === "" && bad.finish === "");
      const before = d0.sigils;
      check("Sigils: none in a debug run", cat.earnSigils(5, "test") === 0 && d0.sigils === before);
      G.difficulty = "nightmare";
      check("Sigils: x3 on Nightmare", cat.sigilAmount("win") === BALANCE.sigils.win * 3 && cat.sigilAmount("rush", "S") === (BALANCE.sigils.rush + BALANCE.sigils.rank.S) * 3);
      // daily contracts
      const c1 = ct.pickContracts("2026-10-25", true), c2 = ct.pickContracts("2026-10-25", true);
      check("contracts: three a day, one of each tier, the same all day", c1.length === 3 && c1.map((c) => c.tier).join() === "0,1,2" && JSON.stringify(c1) === JSON.stringify(c2) && new Set(c1.map((c) => c.id)).size === 3);
      check("contracts: no Boss Rush ones before Boss Rush opens", [...Array(40)].every((_, i) => ct.pickContracts("2026-01-" + (i + 1), false).every((c) => c.id !== "rush")));
      d0.contracts = { day: cat.dayKey(), list: [{ id: "kills", tier: 0, need: 100, have: 0, done: false }, { id: "wave", tier: 1, need: 10, have: 0, done: false }, { id: "hard", tier: 2, need: 6, have: 0, done: false }] };
      const r1 = ct.reportRun({ kills: 60, wave: 12, difficulty: "normal" }, true);
      const r2 = ct.reportRun({ kills: 60, wave: 4, difficulty: "hard" }, true);
      const r3 = ct.reportRun({ kills: 500, wave: 30, difficulty: "nightmare" }, true);
      const L = d0.contracts.list;
      check("contracts: sums add up, maxes keep the best, each pays once", r1.length === 1 && r2.length === 1 && r3.length === 1 && L.every((c) => c.done), r1.length + "/" + r2.length + "/" + r3.length);
    } finally {
      const k = JSON.parse(keep);
      d0.sigils = k.sigils; d0.owned = k.owned; d0.cos = k.cos; d0.settings.suit = k.suit; d0.presets = k.presets; d0.contracts = k.contracts; d0.achv = k.achv; d0.best.wave = k.wave;
      G.difficulty = keepDiff;
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
      check("save migration: 4.1 save upgraded to version 4", d.ver === 4 && d.best.score === 4242 && d.settings.suit === "mint", "ver " + d.ver);
      check("save migration: Boss Rush open, past achievements counted", store.rushUnlocked() && !!d.achv.ladder && !!d.achv.beyond);
      check("save migration: past achievements pay Sigils, crown on", d.sigils === 2 * BALANCE.sigils.achievement && d.cos.hat === "crown", "sigils " + d.sigils);
      // a 4.2 save (version 3) with two hats bought: they're still yours, in the one inventory
      localStorage.setItem(KEY, JSON.stringify({ ver: 3, best: { score: 10, wave: 5 }, sigils: 33, hats: { tophat: 111, halo: 222 }, cos: { hat: "halo" }, settings: { suit: "classic" } }));
      store.load();
      const d2 = store.data;
      check("save migration: 4.2 hats carry over", d2.ver === 4 && d2.owned["hat:tophat"] === 111 && d2.owned["hat:halo"] === 222 && d2.sigils === 33 && !d2.hats && cat.equipped("hat").id === "halo");
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
