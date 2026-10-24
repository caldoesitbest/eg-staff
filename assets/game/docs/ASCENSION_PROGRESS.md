# Envious Glider — Project Ascension progress

Update 4.0 "Ascension" (branch `game-v4`). This file tracks the master directive: what was audited,
what shipped, how it was tested, and what is still to do. Statuses are honest: **Done** means built and
tested, **Partial** means some of it shipped, **Next** means not started.

## Audit (before changes)

| Area | Found | Action |
| --- | --- | --- |
| Boss health | `spawnEnemy` raised boss HP to "your build's DPS × fightSecs", so stronger builds never killed bosses faster | Removed. Boss HP = boss × rung × lap × crew, never your build |
| Between waves | Card pick **and** the Armory after every wave (two stops, every wave) | Armory after waves 2 and 4 of each chapter and after every boss (3 of 5 waves) |
| Wave 12 | "Robots evolved" and the elite warning were separate pop-ups that overlapped | One wave intro, lines joined |
| Envy | "IT COPIED YOUR POWER" floating text duplicated the steal telegraph | Line removed |
| Version | Client posted `web-2.0`, the menu said v3.0, the import map used `?v=4` | One source: `js/version.js` (4.0 "Ascension"), modules at `?v=5` |
| Music | One procedural loop for the whole game, created nodes per note | New engine (`js/music.js`), see below |
| Crosshair | Fixed cyan ring, vanished on bright explosions and cyan bullets | Auto (inverting) + colours, size, style, outline, red-on-target |
| Leaderboard keys | Game code uses the site's anon Supabase client only, no privileged keys | No change needed |
| Perf | Per-frame `setLineDash([..])` array allocations (~0.6 MB/s churn), sprites rebuilt at render resolution, Auto quality only dropped effects | Cached dash arrays, sprite "art scale", dynamic resolution, device-based start |

## Milestones

| # | Directive item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Remove the boss DPS health floor | **Done** | Retuned with a convex rung curve (`ladder.rungHp2`), Pride's crown (gems 300 HP, humbled ×1.6), Envy 9000 base |
| 2 | Boss music per Sin | **Done** | 7 boss arrangements + 7 chapter themes + menu, adaptive intensity 0–4 |
| 3 | Crosshair visibility / options | **Done** | Settings → Gameplay → Crosshair, live preview on dark and bright |
| 4 | Between-wave flow, SIN / AUGMENT / EQUIPMENT / WEAPON terms | **Done** | Armory cadence `shop.openAfter: [2, 4, 5]`; boss bounty (one Epic+ offer, a free reroll); card tags "Sin" / "Augment"; offers "<Rarity> equipment" |
| 5 | Wave-12 message overlap | **Done** | |
| 6 | Chapter art direction | **Done** | Per-chapter nebula, grid tint, arena corners, ambient motes (dust, spores, glints, rose petals, embers, crystals, shards) |
| 7 | Damage direction + cause of death | **Done** | Red arc toward the hit; "Got you" on the summary; synced in co-op |
| 8 | End-of-run summary | **Done** | Damage dealt, biggest hit, top gun, stars spent, what got you |
| 9 | Perfect boost polish | **Done** | Music duck, violet ring, radial sparks |
| 10 | Synergy hints | **Done** | `js/synergy.js`: chips on cards and Armory offers when they combo with what you have |
| 11 | Version unification | **Done** | `js/version.js` feeds the menu and the leaderboard `p_client` |
| 12 | Performance | **Done** | See Performance below |
| 13 | Co-op fairness | **Partial** | Boss HP never reads anyone's build; card-only waves wait for everyone; hit arcs sync. No per-player loot split changes |
| 14 | Boss refinement | **Partial** | Health retune, Envy text fix. No new attacks this update |
| 15 | Weapon refinement | **Next** | |
| 16 | Accessibility | **Partial** | Crosshair options. Key remapping and UI scale are next |
| 17 | Boss Practice / Boss Rush | **Next** | |
| 18 | Achievements, cosmetics | **Next** | Suits by best wave already exist |
| 19 | Leaderboard integrity (server side) | **Next** | Client is clean; plausibility checks belong in the Supabase function |
| 20 | Endless: nothing left to pick | **Done** | Every Sin and Augment maxed: the card screen is skipped. Armory sold out (both guns Tier IV, all gear maxed): skipped unless you're hurt (it still opens to patch you up). Empty offer slots fall back to other rarities, then to a gun |

## Music engine (`js/music.js`)

- One fixed graph built once: bass (2 osc → filter → drive → amp, sidechain pump), pad (3 × 2 osc),
  two arps (Envy mirrors), lead (2 osc + vibrato), kick, snare + body, hats, toms, perc, crash and a
  riser, all fed by one looped noise buffer. A note is a few AudioParam changes; no nodes are created
  while music plays. The whole graph is torn down when music is muted or at 0 volume.
- Lookahead sequencer (25 ms timer, 120 ms ahead). Theme changes land on a bar line.
- Intensity: 0 calm (menus, cards, Armory), 1 combat, 2 high threat (crowded arena, low health, boss
  incoming), 3 boss arrangement + lead, 4 boss below half health (drive, double hats, lead up an octave).
  Envy's lead steals every other boss's melody at intensity 4.
- Riser into a boss entrance, impact on the reveal, duck on a perfect boost, muffle while paused.
- It is procedural synthesis, not produced/recorded tracks.

## Performance

- Fixed 60 Hz simulation, pooled objects, spatial hash, pre-rendered sprites (unchanged).
- Sprites, star tiles and the planet render at an "art scale" independent of the render resolution,
  so lowering resolution no longer rebuilds or blurs them.
- Auto quality: the device picks a starting preset (CPU cores, memory, touch screen); then two slow
  windows lower the render resolution first (down to 60%) when the GPU is the bottleneck, and only then
  effects. Eight fast windows step back up. The FPS readout shows `res N%` when it is scaled.
- `setLineDash` uses cached arrays (`util.dash`) instead of a new array per call per frame.

## Tests run

- Headless autopilot (`?debug=1&headless=1&autoplay=1&god=1&speed=8`): full ladder to the win screen,
  boss fight timings logged per boss (see Balance data). No console errors.
- Music: every theme × part × intensity rendered through an analyser in the browser (non-silent
  output, no errors), duck / riser / impact / muffle, stop tears the graph down.
- Crosshair settings: every control present, custom colour row toggles, preview draws.
- Co-op two-tab smoke (`?cohost=2` / `?cojoin=CODE`), desktop exe `--selftest`, `--selftest-join`.

## Balance data (autopilot, random builds, perfect aim)

Fight seconds before the retune (no DPS floor), 4 runs: Sloth 6–12, Gluttony 8–27, Greed 11–38,
Lust 9–16, Wrath 15–25, Pride 4–7, Envy 5–38. Pride and Envy were far too short.

After the retune (steeper rung curve, Pride's crown, Envy 9000 base), 2 runs:

| Boss | HP (solo, lap 1) | Weak build (s) | Strong build (s) |
| --- | --- | --- | --- |
| Sloth | 950 | 12 | 9 |
| Gluttony | 2375 | 24 | 14 |
| Greed | 3625 (was 4060 in this run) | 41 | 22 |
| Lust | 5184 | 10 | 4 |
| Wrath | 8140 (was 9240 in this run) | 25 | 16 |
| Pride | 13438 | 34 | 4 |
| Envy | 29250 | 27 | 7 |

Greed and Wrath base health were trimmed afterwards (2800 → 2500, 4200 → 3700). The strong run's
damage was 49% Heartseeker; a top-tier Heartseeker build still deletes late bosses, which the old
floor would not have stopped either (the game's damage estimate read that build at a ninth of its real
output). Heartseeker is first in line for the weapon pass.

## Known issues / limits

- Frame timing could not be profiled in a visible window during this pass (the test browser was
  hidden); performance work is based on allocation and draw-cost measurements.
- Boss fight length still varies a lot with the build (that is the point of removing the floor);
  a very weak build can take over a minute on Envy.

## Next steps

1. Weapon pass, starting with Heartseeker (top-tier builds delete late bosses).
2. Boss Practice and Boss Rush modes.
3. Key remapping and a UI scale setting.
4. Achievements and cosmetics (trails, crosshair skins, suit colours).
5. Per-gun feel and Tier IV signatures.
6. New boss attacks per Sin; per-boss music stingers on phase changes.
7. Server-side leaderboard plausibility checks (score vs wave vs time).
