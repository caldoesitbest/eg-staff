/* Envious Glider: every tuning number lives here.
   Units: distances are world units (about 1 CSS px at desktop zoom), times are seconds,
   speeds are units per second. Health and damage are in half-hearts (2 = one 💜). */

export const BALANCE = {
  arena: {
    w: 2000,
    h: 1300,
    asteroids: 7,            // drifting rocks kept in the arena (cover; they block shots both ways)
  },

  // How much of the world every screen shows (at least this much on the short and long side).
  // Same numbers on phone and desktop, so nobody sees more of the arena than anyone else.
  view: { short: 640, long: 1100 },

  player: {
    radius: 15,
    hp: 6,                   // 3 hearts
    maxHpCap: 16,
    speed: 285,
    accel: 11,               // how quickly you reach top speed while steering
    glide: 2.3,              // how quickly you drift to a stop with no input (lower = floatier)
    iframes: 1.1,            // invulnerable after a hit
    hurtKnock: 430,
    gun: {
      rate: 6.2,             // shots per second
      damage: 10,
      speed: 950,
      radius: 5,
      life: 0.72,
      spread: 0.035,         // random inaccuracy (radians)
      fan: 0.16,             // angle between extra projectiles
      knock: 70,
    },
    boost: {
      speed: 1000,
      time: 0.17,
      cooldown: 1.1,
      grace: 0.12,           // still invulnerable this long after the boost ends
      perfectRefund: 0.7,    // a perfect boost (dodging a hit mid-boost) refunds this much cooldown
      perfectSlowmo: 0.3,    // seconds of slow motion on a perfect boost
    },
  },

  combo: {
    window: 2.5,             // seconds to land the next kill before the combo drops
    perKill: 0.04,           // multiplier gained per kill
    cap: 6,
    perfectBonus: 3,         // kills added to the combo by a perfect boost
  },

  score: {
    star: 2,
    waveClear: 60,           // × wave number
    flawless: 120,           // × wave number, for a wave with no hits taken
  },

  drops: {
    heartChance: 0.025,
    heartChanceLow: 0.06,    // when you're at 1 heart or less
    heartHeal: 2,
    heartLife: 10,
    starLife: 14,
    magnet: 70,              // pickup radius
    magnetPull: 900,
  },

  economy: {                 // stars (scrap) spent on the upgrade screen
    reroll: 8, rerollStep: 8,
    patch: 18, patchStep: 14, patchHeal: 2,
  },

  enemies: {
    drone:    { hp: 22, r: 13, speed: 120, contact: 1, score: 10, stars: 1.4, mass: 1, threat: 1 },
    swarm:    { hp: 7, r: 7.5, speed: 215, contact: 1, score: 4, stars: 0.35, mass: 0.4, threat: 0.35, pack: [6, 10] },
    ripper:   { hp: 34, r: 15, speed: 105, contact: 1, score: 25, stars: 2, mass: 1.4, threat: 2.5,
                range: 400, windup: 0.62, chargeSpeed: 760, chargeTime: 0.5, chargeDmg: 2, rest: [1.2, 2.0] },
    gunner:   { hp: 38, r: 15, speed: 100, contact: 1, score: 25, stars: 2, mass: 1.3, threat: 3,
                keep: [270, 420], reload: [1.7, 2.5], windup: 0.45, shotSpeed: 240, shotDmg: 1 },
    splitter: { hp: 56, r: 18, speed: 88, contact: 1, score: 20, stars: 1.5, mass: 1.8, threat: 3, splits: 3 },
    mini:     { hp: 10, r: 9, speed: 155, contact: 1, score: 5, stars: 0.4, mass: 0.6, threat: 0 },
    bulwark:  { hp: 115, r: 22, speed: 64, contact: 1, score: 45, stars: 4, mass: 4, threat: 5,
                turn: 1.3, shieldArc: 1.95, vent: { every: [5, 7], time: 1.4 } },   // shield vents (goes dark) every 5-7s
    boomer:   { hp: 26, r: 15, speed: 170, contact: 0, score: 20, stars: 1.5, mass: 1, threat: 2.5,
                trigger: 100, fuse: 0.75, blast: 118, blastDmg: 2, blastEnemyDmg: 60 },
    sniper:   { hp: 30, r: 14, speed: 85, contact: 1, score: 35, stars: 3, mass: 1, threat: 4,
                keep: [480, 680], aim: 1.0, reload: [2.4, 3.2], shotSpeed: 1450, shotDmg: 2 },
    gem:      { hp: 170, r: 15, speed: 0, contact: 0, score: 30, stars: 1, mass: 99, threat: 0 },   // Pride's crown gems
    patch:    { hp: 50, r: 15, speed: 92, contact: 1, score: 40, stars: 3, mass: 1.2, threat: 4,
                healRadius: 160, healEvery: 1.4, healPct: 0.12, keep: 300 },
    decoy:    { hp: 1, r: 40, speed: 125, contact: 0, score: 15, stars: 0.5, mass: 3, threat: 0 },   // Lust's fakes: one hit pops them
  },

  elite: {                   // "overcharged" robots from this wave on, each with a trait you can see
    from: 12, chance: 0.03, chanceMax: 0.3, hp: 1.6, speed: 1.1, score: 2.5, stars: 2,
    twoTraitsFrom: 30,       // from this wave, elites roll two traits
    traits: {
      shielded: { label: "Shielded", share: 0.4 },        // a shield worth 40% of its health takes hits first
      hasted:   { label: "Hasted", speed: 1.35, attack: 1.35 },
      volatile: { label: "Volatile", count: 10, speed: 190 },   // bursts into a ring of shots when it dies
      regen:    { label: "Regenerating", perSec: 0.05 },
    },
  },

  // Robots evolve as you climb: Mk I → Mk II → Mk III, then another Mark every 12 waves in endless.
  // Each robot type reads its Mark (0, 1, 2, ...) to unlock nastier behaviour (see enemies/roster.js).
  marks: { at: [12, 24, 36], every: 12 },

  waves: {
    breather: 1.4,           // pause after the last robot dies before the upgrade pick
    bossEvery: 5,
    // Hand-made opening waves (they teach). After these, waves are built from the numbers below.
    intro: [
      { budget: 9,  mix: { drone: 1 }, maxAlive: 7, gap: [1.1, 1.7], group: [1, 2] },
      { budget: 15, mix: { drone: 0.7, ripper: 0.3 }, maxAlive: 9, gap: [1.0, 1.6], group: [1, 2] },
      { budget: 21, mix: { drone: 0.55, ripper: 0.2, gunner: 0.25 }, maxAlive: 11, gap: [0.9, 1.5], group: [1, 3] },
      { budget: 28, mix: { drone: 0.45, ripper: 0.2, gunner: 0.15, splitter: 0.2 }, maxAlive: 14, gap: [0.85, 1.4], group: [1, 3] },
    ],
    unlock: { drone: 1, ripper: 2, gunner: 3, splitter: 4, bulwark: 6, boomer: 7, swarm: 8, sniper: 9, patch: 11 },
    weight: { drone: 10, swarm: 4.5, ripper: 5, gunner: 4.5, splitter: 3.5, bulwark: 2.4, boomer: 3.6, sniper: 2.3, patch: 1.6 },
    budget: { base: 8, perWave: 4.2, curve: 1.42, cap: 330 },  // threat points: base + wave×perWave + wave^curve
    maxAlive: { base: 9, perWave: 2.6, cap: 75 },       // never more than this many robots at once (keeps it readable + smooth)
    gap: { min: 1.5, max: 2.2, perWave: 0.06, floorMin: 0.4, floorMax: 0.75 },
    lanes: { two: 9, three: 20 },                       // from these waves, 2 / 3 groups land at once (from different edges)
    group: { max: 2, perWaves: 4, cap: 5 },             // biggest spawn group grows by 1 every N waves
    hpPerWave: 0.06, hpCurve: 0.0012,                   // robot health: 1 + 6%·(wave-1) + 0.12%·(wave-1)²  (≈1.6× at 10, 2.6× at 20, 3.8× at 30)
    shotSpeedPerWave: 0.01, shotSpeedCap: 0.3,          // robot shots get a little faster (not the sniper's)
    speedPerWave: 0.01, speedCap: 0.25,
    spawnWarn: 0.8,                                     // seconds a spawn marker shows before the robot lands
    minSpawnDist: 420,
  },

  // Charged shot (right-click / LT / E: hold, then release). Damage is a multiple of your bullet damage.
  charge: {
    time: 1.0,               // seconds to full charge
    min: 0.15,               // below this a release does nothing
    cooldown: 0.3,
    dmg: [1.5, 9],           // x bullet damage, no charge -> full charge
    radius: [7, 19],
    speed: 820,
    blast: 95, blastDmg: 0.5,          // full charges burst at the end (x the shot's damage)
    moveMul: 0.9,            // you move a little slower while charging
    pierceLoss: 0.12,        // a charged shot loses this much damage per robot it passes through
  },

  // Guns: two slots (Q / mouse wheel / Y swaps). Multipliers are on the player gun above.
  // Buying a gun you already hold raises its tier (I to IV).
  guns: {
    blaster: { name: "Blaster", price: 0, rate: 1, dmg: 1, speed: 1, life: 1, pellets: 1, spread: 0.035, fan: 0.16, knock: 1, look: 0,
               blurb: "Reliable all-rounder. Charged: a piercing plasma orb.", charge: "orb" },
    scatter: { name: "Scattergun", price: 42, rate: 0.42, dmg: 0.64, speed: 0.85, life: 0.62, pellets: 5, spread: 0.06, fan: 0.12, knock: 2.4, look: 4,
               blurb: "Five pellets, short range, big knockback. Charged: a wall of 14.", charge: "cone" },
    smg:     { name: "Pulse SMG", price: 42, rate: 2.1, dmg: 0.48, speed: 1.05, life: 0.65, pellets: 1, spread: 0.11, fan: 0.12, knock: 0.45, look: 3,
               blurb: "Sprays light bolts. More hits, more sin procs. Charged: a 14-bolt burst.", charge: "burst" },
    rail:    { name: "Rail Lance", price: 58, rate: 0.55, dmg: 2.3, speed: 2.3, life: 0.6, pellets: 1, spread: 0, fan: 0.1, knock: 2, pierce: 3, look: 1,
               blurb: "Slow, heavy bolts that pierce 3. Charged: a beam across the screen.", charge: "beam" },
    nova:    { name: "Nova Launcher", price: 58, rate: 0.6, dmg: 1.5, speed: 0.62, life: 0.9, pellets: 1, spread: 0.04, fan: 0.22, knock: 1, explode: 70, splash: 0.6, look: 7,
               blurb: "Grenades that burst on impact. Charged: a cluster bomb.", charge: "cluster" },
    arc:     { name: "Arc Caster", price: 62, rate: 0.95, dmg: 0.85, speed: 1.1, life: 0.62, pellets: 1, spread: 0.03, fan: 0.16, knock: 0.6, chain: 2, chainRange: 170, chainDmg: 0.6, look: 12,
               blurb: "Bolts arc to 2 nearby robots. Charged: a storm orb that zaps as it flies.", charge: "storm" },
    heart:   { name: "Heartseeker", price: 62, rate: 1.1, dmg: 0.8, speed: 0.75, life: 1.15, pellets: 1, spread: 0.08, fan: 0.2, knock: 0.6, homing: 3.2, look: 16,
               blurb: "Homing heart darts. Charged: a swarm of 8 hearts.", charge: "swarm" },
  },
  gunTiers: { dmg: [1, 1.25, 1.55, 1.9], rate: [1, 1.05, 1.1, 1.18], upgradeCost: [0, 0.8, 1.1, 1.5] },   // upgrade price = gun price x this

  // The shop between waves. Rarity: 0 common, 1 rare, 2 epic, 3 legendary.
  shop: {
    slots: 4,
    priceGrowth: 0.09,       // prices x (1 + this x (wave - 1))
    reroll: { base: 4, perWave: 0.8, step: 3 },
    gunChance: 0.3,          // chance each slot is a gun (from wave 2)
    rarity: { rare: [2, 0.04, 0.35], epic: [5, 0.016, 0.2], legendary: [10, 0.006, 0.08] },   // [from wave, + per wave, max]
    patch: 18, patchStep: 14, patchHeal: 2,
  },
  items: {
    battery:   { name: "Spare Battery", r: 0, price: 22, max: 5, rate: 0.08, text: "+8% fire rate" },
    hollow:    { name: "Hollow Points", r: 0, price: 22, max: 5, dmg: 0.08, text: "+8% damage" },
    fuel:      { name: "Jet Fuel", r: 0, price: 18, max: 3, boostCd: 0.1, text: "Boost recharges 10% faster" },
    coolant:   { name: "Coolant", r: 0, price: 18, max: 3, chargeTime: 0.15, text: "Charged shots charge 15% faster" },
    magnet:    { name: "Star Magnet", r: 0, price: 16, max: 3, magnet: 0.35, text: "+35% pickup range" },
    nanoweave: { name: "Nanoweave", r: 1, price: 40, max: 3, hp: 2, text: "+1 💜 max (and fills it)" },
    capbank:   { name: "Capacitor Bank", r: 1, price: 38, max: 3, chargeDmg: 0.25, text: "+25% charged-shot damage" },
    scope:     { name: "Long Scope", r: 1, price: 34, max: 2, range: 0.25, crit: 0.05, text: "+25% range, +5% crit chance" },
    fang:      { name: "Vampire Fang", r: 1, price: 45, max: 2, every: [35, 25], text: "Every 35 kills heals ½💜 (2nd: every 25)" },
    thorns:    { name: "Thorn Plating", r: 1, price: 40, max: 2, count: [12, 20], dmg: 1.5, text: "When you're hit, fire a ring of 12 shots (2nd: 20)" },
    coupon:    { name: "Loyalty Card", r: 1, price: 30, max: 2, discount: 0.08, text: "Shop prices −8%" },
    piggy:     { name: "Piggy Bank", r: 1, price: 35, max: 1, interest: 0.12, cap: 30, text: "Banked stars earn 12% each wave (up to 30)" },
    bubble:    { name: "Bubble Shield", r: 2, price: 70, max: 1, text: "Blocks the first hit of every wave" },
    mines:     { name: "Mine Layer", r: 2, price: 60, max: 2, radius: 80, dmg: 3, text: "Boosting drops a mine that blasts robots (2nd: two mines)" },
    turret:    { name: "Buddy Drone", r: 2, price: 80, max: 2, rate: 2.2, dmg: 0.45, text: "A drone flies with you and shoots robots (2nd: two drones)" },
    glass:     { name: "Glass Cannon", r: 2, price: 55, max: 1, dmg: 0.35, hp: -2, text: "+35% damage, −1 💜 max" },
    crown:     { name: "Crown of Sins", r: 3, price: 150, max: 1, text: "Your strongest unfinished sin gains a level" },
    clover:    { name: "Four-Leaf Chip", r: 3, price: 120, max: 1, text: "Pick from 4 cards instead of 3. Shops lean rarer" },
    overdrive: { name: "Overdrive Core", r: 3, price: 140, max: 1, text: "Full charges fire twice" },
  },

  // The Sin Ladder: the same seven rungs, colours and order as the Ladder on the homepage.
  // One sin boss every 5 waves. Beating Envy (wave 35) wins the run; "Keep climbing" laps the
  // ladder again with every boss tougher and faster.
  ladder: { rungs: 7, lapHp: 0.6, lapPace: 0.85, rungHp: 0.03 },   // per extra lap: boss health +60%, cooldowns ×0.85; per wave up the ladder: +4.5%

  // fightSecs: a boss always has at least this many seconds of your build's firepower in health
  // (so a snowballed build still gets a real fight; weak builds just use the normal hp).
  bosses: {
    order: ["sloth", "glutton", "greed", "lust", "wrath", "pride", "envy"],
    sloth: {
      name: "Sloth", title: "The Idle King", tagline: "It isn't lazy. It's waiting.", emoji: "sloth", c1: "#b8bfe0", c2: "#8e97c7",
      hp: 950, fightSecs: 16, r: 56, speed: 34, contact: 2, score: 1200,
      drowse: { radius: 250, slow: 0.62 },                                  // you move slower inside its aura
      yawn: { every: [3.8, 4.8], windup: 0.9, count: 18, speed: 150, rings: 2 },
      nap: { every: [11, 13], time: 4, takes: 2, wakeWindup: 0.9, wakeRadius: 200, wakeDmg: 1 },
      swipe: { range: 160, windup: 0.6, arc: 2.0, reach: 175, dmg: 2, cooldown: 2.4 },
      minionEvery: 3.0, minionMax: 8,
    },
    glutton: {
      name: "Gluttony", title: "The Gluttony Engine", tagline: "It eats its own. Starve it.", emoji: "gluttony", c1: "#ff4f8b", c2: "#c2307a",
      hp: 2000, fightSecs: 20, r: 58, speed: 52, contact: 2, score: 1800,
      mealHeal: 0.035, mealGrow: 0.05, maxGrow: 1.6,
      inhaleEvery: [6, 8], inhaleTime: 2.4, inhaleRange: 540, pull: 300, playerPull: 85,
      slamEvery: [3.4, 4.4], slamWindup: 0.95, slamRadius: 215, slamDmg: 2,
      spit: { count: 9, speed: 250, arc: 1.1, every: [2.6, 3.6] },
      minionEvery: 1.9, minionMax: 12,
    },
    greed: {
      name: "Greed", title: "The Golden Vault", tagline: "Every star you leave, it keeps.", emoji: "greed", c1: "#ffd45c", c2: "#e8a820",
      hp: 2800, fightSecs: 22, r: 50, speed: 70, contact: 2, score: 2400,
      hoard: { range: 380, pull: 380, heal: 0.003, shieldMax: 5, perPip: 0.08, knockEvery: 0.02, decay: 5 },  // each coin: -8% damage taken; one falls off per 2% of its health you deal, or every 5s
      coins: { every: [2.2, 3.0], count: 7, arc: 1.0, speed: 320, back: 1.1 },   // boomerang coins come back to it
      spin: { every: [7, 9], windup: 0.8, speed: 820, bounces: 3, trailEvery: 0.07 },
      minionEvery: 2.4, minionMax: 10,
    },
    lust: {
      name: "Lust", title: "The Heartbreaker", tagline: "Don't fall for it.", emoji: "lust", c1: "#d77fb0", c2: "#a64a7b",
      hp: 2900, fightSecs: 19, r: 40, speed: 125, contact: 2, score: 2800,
      orbit: { radius: 360, speed: 0.5 },
      kiss: { every: [2.8, 3.6], count: 2, enraged: 3, speed: 185, turn: 1.15, home: 2.2, life: 4.2 },   // kisses can be shot down
      heart: { every: [5, 6.2], windup: 0.75, count: 22, enraged: 26, speed: 150 },
      allure: { every: [8, 10], windup: 1.1, time: 1.8, pull: 170, range: 620, exposed: 1.6, stun: 1.4 },   // while it lures you its heart is exposed; boost out to stun it
      dance: { every: [6.5, 8], fade: 0.55, mark: 0.9, decoys: 2, decoyLife: 6 },                          // blinks; heartbroken, it brings two fakes
      minionEvery: 3.2, minionMax: 6,
    },
    wrath: {
      name: "Wrath", title: "The Overclock", tagline: "Three phases. Zero chill.", emoji: "wrath", c1: "#ff9448", c2: "#e05ad6",
      hp: 4200, fightSecs: 26, r: 46, speed: 90, contact: 2, score: 3200,
      phases: [0.66, 0.33], shieldedTakes: 0.25,
      spiral: { rate: 9, speed: 210, arms: 2, turn: 1.6 },
      burst: { count: 22, speed: 230, every: [2.4, 3.2] },
      aimed: { count: 3, speed: 330, every: [1.4, 2.0] },
      summon: { waves: 3, every: 3.5 },
      enraged: { speed: 1.5, dashWindup: 0.7, dashSpeed: 900, dashEvery: [3, 4] },
    },
    pride: {
      name: "Pride", title: "The Throne", tagline: "Break its crown before you break it.", emoji: "pride", c1: "#a98bff", c2: "#8a6cf0",
      hp: 5000, fightSecs: 30, r: 48, speed: 60, contact: 2, score: 3800,
      gems: { count: 5, radius: 118, spin: 0.9, hp: 170, guarded: 0.2, humbled: 2, humbleTime: 7, regrow: 1.4 },
      decree: { every: [6, 7.5], warn: 1.0, sweep: 1.8, arc: 1.8, length: 950, width: 20, dmg: 2 },
      kneel: { every: [3.4, 4.2], count: 30, speed: 210, gap: 3 },
      minionEvery: 2.6, minionMax: 9,
    },
    envy: {
      name: "Envy", title: "The Mirror", tagline: "It can't be earned. Only taken.", emoji: "envy", c1: "#6d7bff", c2: "#4a2ff0",
      hp: 7000, fightSecs: 45, r: 32, speed: 150, contact: 2, score: 6000, maxRange: 460,
      fireMul: 0.34, shotSpeed: 330, shotDmg: 1, boostSpeed: 900, boostTime: 0.22, orbitMax: 3,
      steal: { at: 0.66, every: [3.0, 3.8] },          // below 66%: it uses the moves of every sin you beat
      frenzy: { at: 0.3, rate: 1.4 },
      minionEvery: 2.6, minionMax: 8,
    },
  },

  // Upgrade cards. Sin paths stack up to 4 levels each; "max" is the level-4 bonus.
  upgrades: {
    gluttony: { feast: [14, 10, 7, 5], shield: [0, 0, 2, 4] },           // kills per heal; shield pips from overheal
    greed:    { drops: [0.4, 0.8, 1.1, 1.4], magnet: [0.6, 1.2, 1.6, 2.2], interest: [0, 0.1, 0.2, 0.25], interestCap: 40, value: [1, 1, 2, 2], jackpot: 0.05 },
    wrath:    { damage: [0.15, 0.3, 0.45, 0.6], rate: [0.12, 0.24, 0.36, 0.48], boomRadius: 72, boomDmg: 2.2 },  // boomDmg × bullet damage
    pride:    { crit: [0.1, 0.15, 0.2, 0.25], critMul: [2, 2, 2.5, 3], streak: [0, 0.01, 0.012, 0.015], streakCap: [0, 0.25, 0.4, 0.5] },
    sloth:    { radius: [110, 140, 165, 190], slow: [0.75, 0.65, 0.58, 0.5], trail: [false, false, true, true], trailSlow: 0.45, bulletTime: 1.2 },
    envy:     { chance: [0.1, 0.16, 0.22, 0.3], time: [6, 8, 10, 12], slots: [1, 1, 2, 3] },
    lust:     { chance: [0.05, 0.08, 0.11, 0.15], time: [4, 5, 6, 7], burst: [40, 55, 70, 90] },
    multishot:{ max: 4 },
    pierce:   { max: 3 },
    boost:    { max: 3, distance: 0.25, cooldown: 0.15, ramDmg: 40 },
    suit:     { max: 4, hp: 2 },
    orbit:    { max: 3, radius: 62, speed: 3.2, dmg: 14 },
    velocity: { max: 3, speed: 0.25, range: 0.2 },
    ricochet: { max: 2 },
    thrusters:{ max: 3, speed: 0.12 },
    homing:   { max: 2, turn: [2.2, 4.2] },
    rear:     { max: 1 },
    overcharge: { max: 3, dmg: [0.5, 1, 1.5], speed: [0.2, 0.35, 0.5] },   // charged-shot damage, charge speed
    capacitor:  { max: 2 },
  },

  // What Envy steals from each robot (lasts upgrades.envy.time seconds).
  envyPowers: {
    drone:    { name: "Overdrive", text: "+25% move speed", speed: 0.25 },
    swarm:    { name: "Frenzy", text: "+40% fire rate", rate: 0.4 },
    ripper:   { name: "Charge", text: "Boost recharges 2× faster", boostCd: 0.5 },
    gunner:   { name: "Side cannons", text: "+2 angled shots", extra: 2, angle: 0.42 },
    splitter: { name: "Split shot", text: "Shots split on hit" },
    mini:     { name: "Split shot", text: "Shots split on hit" },
    bulwark:  { name: "Bulwark", text: "Front shield blocks shots", arc: 1.0, dist: 30 },
    boomer:   { name: "Payload", text: "Shots explode", radius: 46, dmg: 0.6 },
    sniper:   { name: "Railgun", text: "+2 pierce, faster shots", pierce: 2, speed: 0.6 },
    patch:    { name: "Repair", text: "Heal ½💜 every 3s", every: 3 },
  },

  fx: {
    particles: { high: 900, low: 350 },     // hard caps; new bursts thin out as the screen fills
    shake: { hit: 0.18, hurt: 0.5, explode: 0.28, boss: 0.9, max: 22 },
    hitstop: { kill: 0.018, bigKill: 0.05, hurt: 0.09, boss: 0.16 },
  },
};
