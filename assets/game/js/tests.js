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
    const keep = JSON.stringify({ sigils: d0.sigils, owned: d0.owned, cos: d0.cos, suit: d0.settings.suit, presets: d0.presets, contracts: d0.contracts, achv: d0.achv, wave: d0.best.wave, claims: d0.claims, sigilDay: d0.sigilDay, life: d0.life.sigils });
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
      // 4.5: the economy (real payouts: debug off for these few lines, everything put back after)
      const SG = BALANCE.sigils;
      G.debug.on = false;
      try {
        d0.claims = {}; d0.sigilDay = { day: "", run: 0, rush: 0 };
        G.difficulty = "normal";
        const s0 = d0.sigils;
        const idle = cat.runPay({ time: 600, kills: 400, wave: 20, active: 0.1 });
        const short = cat.runPay({ time: 40, kills: 3, wave: 2, active: 1 });
        const real = cat.runPay({ time: 900, kills: 600, wave: 22, won: false, active: 0.9 });
        check("Sigils: a real run pays a little (1-3), a short or idle one nothing", idle.n === 0 && idle.why === "idle" && short.n === 0 && real.n === 3 && d0.sigils === s0 + 3, idle.why + "/" + short.why + "/" + real.n);
        let farmed = 0;
        for (let i = 0; i < 20; i++) farmed += cat.runPay({ time: 900, kills: 600, wave: 22, active: 0.9 }).n;
        check("Sigils: run Sigils stop at the daily cap", 3 + farmed === SG.run.dayCap, "total " + (3 + farmed));
        G.difficulty = "nightmare";
        const f1 = cat.firstWin(), f2 = cat.firstWin();
        check("Sigils: a first win pays once (more on Nightmare), never twice", f1 === SG.first.win[2] && f2 === 0);
        const b1 = cat.firstBoss("sloth"), b2 = cat.firstBoss("sloth");
        G.difficulty = "hard";
        const b3 = cat.firstBoss("sloth");
        check("Sigils: each boss's first defeat pays once per difficulty", b1 === Math.round(SG.first.boss * SG.diff.nightmare) && b2 === 0 && b3 === Math.round(SG.first.boss * SG.diff.hard));
        let rush = 0;
        for (let i = 0; i < 5; i++) rush += cat.rushClear("S");
        check("Sigils: Boss Rush clears pay three a day (plus the first-ever bonus)", rush === SG.first.rush[1] + 3 * Math.round((SG.rush.clear + SG.rush.rank.S) * SG.diff.hard), "paid " + rush);
        check("Sigils: challenges pay far more than a run", SG.contracts[0] >= 10 * SG.run.dayCap / 3 && SG.contracts[2] >= 100 && cat.achvSigils("nightmare") >= 200);
      } finally { G.debug.on = true; }
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
      d0.claims = k.claims || {}; d0.sigilDay = k.sigilDay || { day: "", run: 0, rush: 0 }; d0.life.sigils = k.life || 0;
      G.difficulty = keepDiff;
      store.save(true);
    }
    // --- 4.4: buying a gun with both slots full asks which one goes; nothing is spent until you confirm ------
    if (h.shopBuy && h.openArmory) {
      const arm = await import("./armory.js");
      const { ui } = await import("./ui.js");
      fresh([]);
      G.guns[0] = { id: "blaster", tier: 3 }; G.guns[1] = { id: "rail", tier: 2 }; G.gunSlot = 0;
      G.stars = 500; G.wave = 4;
      h.openArmory();
      G.shop.offers[0] = { kind: "gun", id: "nova", locked: false, sold: false };
      check("swap: a new gun with both slots full needs a pick", arm.needsSlotPick(G.shop.offers[0]) && !arm.needsSlotPick({ kind: "gun", id: "rail" }) && !arm.needsSlotPick({ kind: "item", id: "nanoweave" }));
      h.shopBuy(0);
      const asked = ui.swapOpen, starsAsked = G.stars;
      ui.closeSwapPick();
      check("swap: asking (then cancelling) spends nothing and changes nothing", asked && starsAsked === 500 && G.stars === 500 && !G.shop.offers[0].sold && G.guns.map((g) => g.id + g.tier).join() === "blaster3,rail2");
      const price = arm.offerPrice(G.shop.offers[0]);
      h.shopBuy(0, 1);
      check("swap: confirming replaces the slot you picked (not the gun in hand)", G.guns.map((g) => g.id + g.tier).join() === "blaster3,nova1" && G.stars === 500 - price && G.shop.offers[0].sold);
      G.stars = 0;
      G.shop.offers[1] = { kind: "gun", id: "smg", locked: false, sold: false };
      h.shopBuy(1);
      check("swap: can't afford it, no dialog", !ui.swapOpen && !G.shop.offers[1].sold);
      ui.closeSwapPick();
      // the build screen draws all four pages without throwing
      let pages = 0;
      for (const t of ["guns", "sins", "gear", "stats"]) { ui.buildTab = t; ui.renderBuildView(); if (document.getElementById("bv-page").children.length > 0) pages++; }
      check("build screen: every page has something on it", pages === 4, pages + "/4");
      ui.buildTab = "guns";
      ui.show(null);
    }
    // --- 4.4: friend codes ----------------------------------------------------------------------------------
    {
      const so = await import("./social.js");
      const k1 = "a".repeat(64), k2 = "b".repeat(64);
      const c1 = await so.codeOf(k1), c1b = await so.codeOf(k1), c2 = await so.codeOf(k2);
      check("friend codes: 8 characters, the same every time, different per player", c1.length === 8 && c1 === c1b && c1 !== c2 && so.cleanCode(c1) === c1, c1 + " / " + c2);
      check("friend codes: typed with a dash, spaces or lower case still work", so.cleanCode(" " + so.fmtCode(c1).toLowerCase() + " ") === c1 && so.cleanCode("ABCD-EFG0") === "" && so.cleanCode("short") === "");
      check("friend codes: a teammate's look carries their code (and only that)", so.tagOf("void/halo/mirror/stars/gold/~" + c1) === c1 && so.tagOf("void/halo/mirror/stars/gold") === "");
    }
    // --- 4.5: levels -----------------------------------------------------------------------------------------
    {
      const xp = await import("./xp.js");
      const total = (L) => { let t = 0; for (let i = 1; i < L; i++) t += xp.xpNeed(i); return t; };
      check("levels: XP makes the level, with the remainder carried", xp.levelOf(0).level === 1 && xp.levelOf(total(10)).level === 10 && xp.levelOf(total(10) - 1).level === 9 && xp.levelOf(total(25) + 7).into === 7);
      check("levels: level 1000 is the top (and a long way off)", xp.levelOf(1e12).level === 1000 && total(1000) > 5e6 && total(100) > 1e5, "to 1000: " + total(1000));
      const cat2 = await import("./catalog.js");
      const { store: st2 } = await import("./storage.js");
      const keepXp = st2.data.xp;
      st2.data.xp = total(25);
      const ok25 = cat2.owns(cat2.item("hat", "cadet")) && cat2.owns(cat2.item("hat", "comet")) && !cat2.owns(cat2.item("hat", "ringed"));
      st2.data.xp = keepXp;
      check("levels: the level hats unlock at their level, not before", ok25 && cat2.source(cat2.item("hat", "ascended")).level === 1000);
      const rx = xp.runXp({ wave: 20, kills: 300, bosses: 4, active: 1 }), idle = xp.runXp({ wave: 20, kills: 300, bosses: 4, active: 0.05 });
      check("levels: a run's XP adds up, and standing still earns a quarter", rx.total > 0 && Math.abs(idle.total - rx.total * 0.25) <= 1, rx.total + " vs " + idle.total);
    }
    // --- 4.5: cloud saves merge without losing or doubling anything -----------------------------------------
    {
      const cl = await import("./cloud.js");
      const mk = (dev, base, earned, spent, owned) => ({ owned, achv: {}, claims: {}, best: { score: 0, wave: 0 }, totals: {}, rush: { clears: 0, best: {}, splits: {} },
        contracts: { day: "", list: [] }, life: { sigils: 0 }, settings: { suit: "classic" }, cos: {}, presets: [null, null, null], daily: {}, sigils: base + earned - spent, xp: 0,
        ledger: { dev, base: { [dev]: base }, earned: { [dev]: earned }, spent: { [dev]: spent }, xpBase: { [dev]: 0 }, xp: {} } });
      const web = mk("dweb", 300, 50, 100, { "hat:halo": 1 }), exe = mk("dexe", 200, 20, 0, { "hat:tophat": 2 });
      const s1 = JSON.parse(JSON.stringify(web));
      cl.mergeInto(s1, JSON.parse(JSON.stringify(exe)));
      const once = JSON.stringify({ o: s1.owned, s: s1.sigils });
      cl.mergeInto(s1, JSON.parse(JSON.stringify(exe)));
      check("cloud: items are a union, Sigils add up across devices (no doubles)", s1.owned["hat:halo"] && s1.owned["hat:tophat"] && s1.sigils === (300 + 50 - 100) + (200 + 20), "sigils " + s1.sigils);
      check("cloud: merging the same copy twice changes nothing", JSON.stringify({ o: s1.owned, s: s1.sigils }) === once);
    }
    // --- 4.5: endless steepens every wave ------------------------------------------------------------------------
    {
      const stx = await import("./state.js");
      const keepW = G.wave, keepM = G.mode, keepDaily = G.daily;
      G.mode = "ladder"; G.daily = null;
      G.wave = 30; const a = [stx.endless("hp"), stx.endless("dmg")];
      G.wave = 60; const b = [stx.endless("hp"), stx.endless("dmg"), stx.endless("aggro")];
      G.wave = keepW; G.mode = keepM; G.daily = keepDaily;
      check("endless: nothing changes before wave 35, then robots get tougher, hit harder, attack faster", a[0] === 1 && a[1] === 1 && b[0] > 3 && b[1] > 2 && b[2] < 0.8, b.map((x) => x.toFixed(2)).join("/"));
    }
    // --- every Hangar tab and menu screen draws without throwing --------------------------------------------
    {
      const { ui } = await import("./ui.js");
      const bad = [];
      const keepState = G.state;
      G.state = "menu";
      for (const t of ["play", "locker", "shop", "challenges", "friends", "profile"]) { try { ui.show("menu"); ui.hangarTab(t); } catch (err) { bad.push(t + ": " + err.message); } }
      for (const sc of ["how", "news", "download"]) { try { ui.show(sc); } catch (err) { bad.push(sc + ": " + err.message); } }
      try { ui.openRush(); } catch (err) { bad.push("rush: " + err.message); }
      try { ui.openSettings("menu"); ui.closeSettings(); } catch (err) { bad.push("settings: " + err.message); }
      ui.show(null);
      G.state = keepState;
      check("screens: every Hangar tab and menu screen draws", !bad.length, bad.join(" | "));
    }
    // --- 4.7: outfits, bundles, paid Sigils ---------------------------------------------------------------------
    {
      const cat = await import("./catalog.js");
      const { sprites } = await import("./sprites.js");
      const { sigilShop } = await import("./sigilshop.js");
      const { store: S } = await import("./storage.js");
      // every suit, hat and visor draws (patterns, the ruff, the bow tie, the nose, the monocle)
      const drawBad = [];
      for (const k of ["suit", "hat", "visor"]) for (const it of cat.itemsOf(k)) {
        try { const a = sprites.astronaut(2, cat.look({ strict: true, [k]: it.id })); if (!a.player || !a.player.c) drawBad.push(it.key); } catch (err) { drawBad.push(it.key + ": " + err.message); }
      }
      check("outfits: every suit, hat and visor draws", !drawBad.length, drawBad.join(", "));
      check("outfits: the 4.7 collections each give a title", ["bigtop", "blacktie"].every((id) => cat.setItems(id).length >= 4 && cat.ITEMS.some((i) => i.kind === "title" && i.fromSet === id)));
      S.save(true);
      let keep = null;
      try { keep = localStorage.getItem("eg-glider-v1"); } catch (err) { /* no storage */ }
      try {
        // buying the rest of a collection: 15% off two or more, rounded to 5, title and all
        const d = S.data;
        for (const it of cat.setItems("bigtop")) delete d.owned[it.key];
        const o = cat.setOffer("bigtop");
        const full = cat.setItems("bigtop").reduce((n, i) => n + i.price, 0);
        check("bundles: the rest of a collection costs 15% less", o.full === full && o.price === Math.round((full * 0.85) / 5) * 5 && o.price < full, o.price + " of " + full);
        d.sigils = o.price - 1;
        check("bundles: you can't buy it a Sigil short", cat.buySet("bigtop") === false && cat.setItems("bigtop").every((i) => !d.owned[i.key]));
        d.sigils = o.price + 10;
        const got = cat.buySet("bigtop");
        check("bundles: buying it takes the price and gives every item and the title", !!got && d.sigils === 10 && cat.setDone("bigtop") && cat.owns(cat.item("title", "clown")));
        check("bundles: nothing left to buy afterwards", cat.setOffer("bigtop").rest.length === 0 && cat.buySet("bigtop") === false);
        // paid Sigils: the server's total goes on, the same total again changes nothing, a refund comes off
        d.sigils = 100; d.paid = { uid: "", total: 0, at: 0 };
        const a1 = sigilShop.credit("u1", 1300), b1 = d.sigils;
        const a2 = sigilShop.credit("u1", 1300), b2 = d.sigils;
        const a3 = sigilShop.credit("u1", 0), b3 = d.sigils;
        check("paid Sigils: credited once, refunds come back off", a1 === 1300 && b1 === 1400 && a2 === 0 && b2 === 1400 && a3 === -1300 && b3 === 100, [a1, b1, a2, b2, a3, b3].join(","));
        sigilShop.credit("u1", 500);
        const b4 = d.sigils;
        sigilShop.credit("u2", 0);
        check("paid Sigils: another account's purchases don't stay on this device", b4 === 600 && d.sigils === 100 && d.paid.uid === "u2");
      } finally {
        try { if (keep === null) localStorage.removeItem("eg-glider-v1"); else localStorage.setItem("eg-glider-v1", keep); } catch (err) { /* ignore */ }
        S.load();
      }
    }
    // a 4.1 save comes through: bests kept, Boss Rush open, a past win and a wave-50 run counted (and paid in Sigils)
    const KEY = "eg-glider-v1";
    let backup = null;
    try { backup = localStorage.getItem(KEY); } catch (err) { /* storage blocked */ }
    try {
      localStorage.setItem(KEY, JSON.stringify({ best: { score: 4242, wave: 52, wins: 1 }, totals: { runs: 9, kills: 900 }, settings: { suit: "mint", difficulty: "hard" } }));
      store.load();
      const d = store.data;
      check("save migration: 4.1 save upgraded to version 6", d.ver === 6 && d.best.score === 4242 && d.settings.suit === "mint", "ver " + d.ver);
      check("save migration: Boss Rush open, past achievements counted", store.rushUnlocked() && !!d.achv.ladder && !!d.achv.beyond);
      // two achievements (ladder, beyond): 3 each in 4.2, x5 in 4.5, then topped up to their tier's reward
      const SGm = BALANCE.sigils, want41 = 2 * 3 * SGm.rescale + (SGm.achv[SGm.achvTier.ladder] - 15) + (SGm.achv[SGm.achvTier.beyond] - 15);
      check("save migration: past achievements pay Sigils (topped up in 4.5), crown on", d.sigils === want41 && d.cos.hat === "crown" && d.claims["win:normal"] && d.tutorial === 1, "sigils " + d.sigils + " want " + want41);
      // a 4.2 save (version 3) with two hats bought: they're still yours, in the one inventory
      localStorage.setItem(KEY, JSON.stringify({ ver: 3, best: { score: 10, wave: 5 }, sigils: 33, hats: { tophat: 111, halo: 222 }, cos: { hat: "halo" }, settings: { suit: "classic" } }));
      store.load();
      const d2 = store.data;
      check("save migration: 4.2 hats carry over (balance x5 in 4.5)", d2.ver === 6 && d2.owned["hat:tophat"] === 111 && d2.owned["hat:halo"] === 222 && d2.sigils === 33 * BALANCE.sigils.rescale && !d2.hats && cat.equipped("hat").id === "halo");
      // a 4.3 save (version 4): everything kept, and an empty friends section added
      localStorage.setItem(KEY, JSON.stringify({ ver: 4, best: { score: 99, wave: 9 }, sigils: 120, owned: { "hat:halo": 5, "suit:void": 6 }, cos: { hat: "halo" }, presets: [null, { suit: "void" }, null], settings: { suit: "void" } }));
      store.load();
      const d3 = store.data;
      check("save migration: 4.3 save keeps its cosmetics and gets friends", d3.ver === 6 && d3.sigils === 120 * BALANCE.sigils.rescale && d3.owned["suit:void"] === 6 && d3.presets[1] && d3.social && typeof d3.social.acct === "object" && typeof d3.social.prefs === "object");
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
