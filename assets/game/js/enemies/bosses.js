/* The Sin Ladder's bosses, one per rung, in the homepage Ladder's order:
   Sloth → Gluttony → Greed → Lust → Wrath → Pride → Envy. */

import { sloth } from "./boss-sloth.js";
import { glutton } from "./boss-gluttony.js";
import { greed } from "./boss-greed.js";
import { lust, decoy } from "./boss-lust.js";
import { wrath } from "./boss-wrath.js";
import { pride } from "./boss-pride.js";
import { envy } from "./boss-envy.js";

export const BOSSES = { sloth, glutton, greed, lust, wrath, pride, envy };
export { updateBossFx, startBossDeath } from "./boss-common.js";
// Boss helpers that are spawned like robots but drawn by their boss's code.
export const BOSS_MINIONS = { decoy };
