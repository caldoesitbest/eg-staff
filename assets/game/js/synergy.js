/* Synergy hints: a short label on a card or a shop offer when it works especially well with what you
   already have. Every rule here is a real interaction in the game's code (named next to it), so the
   hints never promise something that doesn't happen. */

import { G } from "./state.js";
import { BALANCE } from "./balance.js";

const lvl = (id) => (G.up && G.up[id]) || 0;
const item = (id) => (G.items && G.items[id]) || 0;
const gun = () => (G.stats && G.stats.gunId) || "blaster";
const gunName = (id) => (BALANCE.guns[id] ? BALANCE.guns[id].name : id).toUpperCase();
const CHARGED = ["coolant", "capbank", "overdrive"];

/** kind: "card" | "item" | "gun". Returns a short label or "". */
export function synergyFor(kind, id) {
  const g = gun();
  if (kind === "card") {
    // Lust rolls a charm on every hit (upgrades.onHit): more hits a second, more charms
    if (id === "lust" && (g === "smg" || g === "scatter")) return "Strong with " + gunName(g);
    // Pride rolls a crit per projectile (world.firePlayerBullet)
    if (id === "pride" && (g === "smg" || g === "scatter" || lvl("multishot") >= 2)) return "More shots, more crits";
    // Seeker homing adds to the Heartseeker's own (upgrades.computeStats: homing = card + gun)
    if (id === "homing" && g === "heart") return "Stacks with Heartseeker";
    if (id === "homing" && item("turret")) return "Your drones home too";
    // Piercing adds to the Rail Lance's 3 (computeStats: pierce = card + gun)
    if (id === "pierce" && g === "rail") return "Stacks with Rail Lance pierce";
    // Wrath's level-4 kill blasts chain off Nova splash kills
    if (id === "wrath" && g === "nova") return "Explosions on explosions";
    if ((id === "overcharge" || id === "capacitor") && CHARGED.some(item)) return "Enhances charged shots";
    if (id === "overcharge" && (g === "rail" || g === "nova")) return "Huge on " + gunName(g) + " charges";
    // Greed interest and the Piggy Bank both pay on banked stars (upgrades.onWaveEnd)
    if (id === "greed" && item("piggy")) return "Stacks with Piggy Bank";
    // Big Boost's shorter cooldown means more boosts: more mines
    if (id === "boost" && item("mines")) return "More boosts, more mines";
    // Gluttony overheal turns into shield pips (world.healPlayer)
    if (id === "gluttony" && item("fang")) return "Fang heals feed the shield";
    return "";
  }
  if (kind === "item") {
    if (CHARGED.indexOf(id) !== -1 && (lvl("overcharge") || lvl("capacitor"))) return "Stacks with Overcharge";
    if (CHARGED.indexOf(id) !== -1 && (g === "rail" || g === "nova")) return "Enhances charged shots";
    if (id === "battery" && lvl("lust")) return "More shots, more charms";
    if (id === "piggy" && lvl("greed") >= 2) return "Stacks with Greed interest";
    if (id === "mines" && (lvl("boost") || item("fuel"))) return "More boosts, more mines";
    if (id === "fuel" && item("mines")) return "More mines";
    if (id === "turret" && lvl("homing")) return "Drones get Seeker homing";
    if (id === "scope" && lvl("pride")) return "More crits";
    return "";
  }
  if (kind === "gun") {
    if ((id === "smg" || id === "scatter") && lvl("lust")) return "More hits, more charms";
    if ((id === "smg" || id === "scatter") && lvl("pride")) return "More shots, more crits";
    if (id === "heart" && lvl("homing")) return "Stacks with Seeker homing";
    if (id === "rail" && lvl("pierce")) return "Stacks with Piercing";
    if (id === "nova" && lvl("wrath") >= 4) return "Explosions on explosions";
    if ((id === "rail" || id === "nova") && (lvl("overcharge") || CHARGED.some(item))) return "Huge charged shots";
    return "";
  }
  return "";
}
