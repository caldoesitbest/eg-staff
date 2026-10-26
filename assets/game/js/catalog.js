/* The cosmetics catalog (4.3, the Cosmic Hangar). Every hat, suit, visor, jetpack trail, weapon finish,
   victory effect and title in one list: a stable id per kind, a rarity, a collection, and how you get it:
   free, an achievement, a best wave, a finished collection, or Sigils in the Item Shop. Ownership,
   equipping, loadout presets, the shop's daily featured row and the Sigil economy live here too.
   Everything here is cosmetic: none of it touches combat. Saves are local to the device (see storage.js),
   so none of this is tamper-proof; it isn't trying to be. */

import { G } from "./state.js";
import { level } from "./xp.js";
import { ledgerAdd } from "./cloud.js";
import { BALANCE } from "./balance.js";
import { store } from "./storage.js";
import {
  C, SIN, PAL, P_CYAN, P_VIOLET, P_MAGENTA, P_MINT, P_AMBER, P_WHITE, P_ORANGE, P_RED, P_DVIOLET, P_HEART, P_BLUE,
  P_SLOTH, P_GLUT, P_GREED, P_LUST, P_WRATH, P_PRIDE, P_ENVY,
} from "./sprites.js";

const SG = BALANCE.sigils;
const data = () => store.data;

export const RARITY = [
  { id: "common", name: "Common", col: "#c9d2f0" },
  { id: "uncommon", name: "Uncommon", col: "#73ffce" },
  { id: "rare", name: "Rare", col: "#63f4ff" },
  { id: "epic", name: "Epic", col: "#c86bff" },
  { id: "legendary", name: "Legendary", col: "#ffc861" },
  { id: "mythic", name: "Mythic", col: "#ff4f8b" },
];
const COM = 0, UNC = 1, RARE = 2, EPIC = 3, LEG = 4, MYTH = 5;

export const KINDS = [
  { id: "hat", name: "Hat", plural: "Hats" },
  { id: "suit", name: "Suit", plural: "Suits" },
  { id: "visor", name: "Visor", plural: "Visors" },
  { id: "trail", name: "Jetpack trail", plural: "Trails" },
  { id: "finish", name: "Weapon finish", plural: "Finishes" },
  { id: "victory", name: "Victory effect", plural: "Victory effects" },
  { id: "title", name: "Title", plural: "Titles" },
];
export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));
/** What you wear with nothing picked (these are always yours). */
export const DEFAULTS = { suit: "classic", hat: "crown", visor: "", trail: "", finish: "", victory: "", title: "" };
// what a co-op teammate's client is told about you, in this order ("suit/hat/visor/trail/finish")
const LOOK_KINDS = ["suit", "hat", "visor", "trail", "finish"];

/** Themed collections. Owning every shop item in one also gives you its title. */
export const SETS = [
  { id: "sloth", name: "The Sloth Collection", col: SIN.sloth, desc: "Soft indigo and lavender, for robots who can wait." },
  { id: "gluttony", name: "The Gluttony Collection", col: SIN.glutton, desc: "Magenta reactors, running hot and hungry." },
  { id: "greed", name: "The Greed Collection", col: SIN.greed, desc: "Black and gold: dress like you own the arena." },
  { id: "lust", name: "The Lust Collection", col: SIN.lust, desc: "Pink holographics and a heart on your sleeve." },
  { id: "wrath", name: "The Wrath Collection", col: SIN.wrath, desc: "Crimson plating, reactor heat, horns." },
  { id: "pride", name: "The Pride Collection", col: SIN.pride, desc: "Royal violet and laurels for the deserving." },
  { id: "envy", name: "The Envy Collection", col: SIN.envy, desc: "Cracked mirrors and green-eyed light." },
  { id: "void", name: "The Void Collection", col: C.violet2, desc: "Black glass, dark halos, nebula smoke." },
  { id: "astral", name: "The Astral Collection", col: "#ffe08a", desc: "Starlight, cream and gold: the Hangar's finest." },
];
export const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]));

// How you get each item: shop (Sigils, priced by rarity unless it says), achv (an achievement), wave
// (your best wave), fromSet (a finished collection). None of those: it's free.
const RAW = {
  hat: [
    { id: "crown", name: "Crown", rarity: COM, col: C.amber, desc: "The original. Always yours." },
    { id: "none", name: "No hat", rarity: COM, col: "#7f8bb0", desc: "Just the helmet." },
    { id: "nightcap", name: "Sloth's Nightcap", rarity: UNC, shop: 1, set: "sloth", col: SIN.sloth, desc: "Five more minutes. Then the robots." },
    { id: "toque", name: "Gluttony's Toque", rarity: UNC, shop: 1, set: "gluttony", col: "#f4f6ff", desc: "The chef's hat, in Gluttony's pink." },
    { id: "starcap", name: "Starforged Cap", rarity: UNC, shop: 1, col: C.magenta, desc: "Worn backwards, star to the front." },
    { id: "antenna", name: "Machine Antenna", rarity: UNC, shop: 1, col: C.cyan, desc: "Taken off a robot. It still blinks." },
    { id: "tophat", name: "Greed's Top Hat", rarity: RARE, shop: 1, set: "greed", col: SIN.greed, desc: "Black silk, gold band, no refunds." },
    { id: "boppers", name: "Lust's Heart Boppers", rarity: RARE, shop: 1, set: "lust", col: SIN.lust, desc: "Two hearts on springs." },
    { id: "horns", name: "Wrath's Horns", rarity: RARE, shop: 1, set: "wrath", col: "#ff4a3d", desc: "Curling up off the helmet, glowing hot." },
    { id: "bandit", name: "Cosmic Bandit", rarity: RARE, shop: 1, col: "#63f4ff", desc: "A wide-brimmed outlaw's hat with a star buckle." },
    { id: "laurels", name: "Pride's Laurels", rarity: EPIC, shop: 1, set: "pride", col: "#ffd45c", desc: "A victor's wreath, a Pride gem at the front." },
    { id: "serpent", name: "Envy's Serpent", rarity: EPIC, shop: 1, set: "envy", col: SIN.envy, desc: "Coiled over the helmet, watching everyone else's stuff." },
    { id: "voidhalo", name: "Void Halo", rarity: EPIC, shop: 1, set: "void", col: C.violet2, desc: "A dark halo with a violet edge." },
    { id: "brokenhalo", name: "Broken Halo", rarity: EPIC, shop: 1, col: "#fff3c4", desc: "It was a halo once. Pieces of it still float." },
    { id: "halo", name: "Halo", rarity: LEG, shop: 1, col: "#ffe9a8", desc: "For a reformed sinner." },
    { id: "overlord", name: "Overlord", rarity: LEG, shop: 1, col: "#ff3b3b", desc: "A machine crown with a red eye in the band." },
    { id: "astral", name: "Astral Crown", rarity: LEG, shop: 1, set: "astral", col: "#9fe8ff", desc: "A cyan-violet crown floating over the helmet, a star at its heart." },
    { id: "blackhole", name: "Black Hole", rarity: MYTH, shop: 1, col: "#ff8a3d", desc: "A tiny singularity, spinning just above your head." },
    // 4.5: earned by level only (xp.js)
    { id: "cadet", name: "Cadet Wings", rarity: RARE, level: 10, col: "#63f4ff", desc: "A flight cadet's cap with swept wings. Level 10." },
    { id: "comet", name: "Comet Antenna", rarity: EPIC, level: 25, col: "#bff7ff", desc: "Two stalks and a comet that won't stop orbiting them. Level 25." },
    { id: "ringed", name: "Saturn Ring", rarity: EPIC, level: 50, col: "#a57bff", desc: "A whole little planet, ring and moon included. Level 50." },
    { id: "nebula", name: "Nebula Crown", rarity: LEG, level: 100, col: "#ff42d0", desc: "Five spires of living nebula. Level 100." },
    { id: "pulsar", name: "Pulsar Helm", rarity: LEG, level: 250, col: "#9fe8ff", desc: "A neutron star spinning on your head, beams and all. Level 250." },
    { id: "corona", name: "Supernova Corona", rarity: MYTH, level: 500, col: "#ffb347", desc: "The moment a star goes out, worn as a crown. Level 500." },
    { id: "ascended", name: "The Thousandfold", rarity: MYTH, level: 1000, col: "#ffffff", desc: "A crown of gold around a black hole, under a prismatic halo. Level 1000. Very few will ever wear it." },
  ],
  suit: [
    { id: "classic", name: "Classic", rarity: COM, suit: "#eef2ff", trim: "#38e8ff", visor: "#8e44ff", desc: "Standard issue." },
    { id: "violet", name: "Violet", rarity: COM, wave: 5, suit: "#d9c8ff", trim: "#a57bff", visor: "#ff42d0" },
    { id: "mint", name: "Mint", rarity: UNC, wave: 10, suit: "#d6fff1", trim: "#73ffce", visor: "#38e8ff" },
    { id: "magenta", name: "Magenta", rarity: UNC, wave: 15, suit: "#ffd6f4", trim: "#ff42d0", visor: "#8e44ff" },
    { id: "gold", name: "Gold", rarity: RARE, wave: 20, suit: "#fff1cc", trim: "#ffc861", visor: "#ff42d0" },
    { id: "void", name: "Void", rarity: RARE, wave: 25, suit: "#2a2f55", trim: "#63f4ff", visor: "#63f4ff", dark: 1 },
    { id: "laureate", name: "Laureate", rarity: EPIC, achv: "ladder", suit: "#fffaf0", trim: "#ffc861", visor: "#63f4ff" },
    { id: "obsidian", name: "Obsidian", rarity: EPIC, achv: "hard", suit: "#1d1a2e", trim: "#a57bff", visor: "#ff42d0", dark: 1 },
    { id: "seven", name: "Seven Sins", rarity: EPIC, achv: "seven", suit: "#f4f6ff", trim: "#ff9448", visor: "#6d7bff" },
    { id: "nightmare", name: "Nightmare", rarity: LEG, achv: "nightmare", suit: "#2a0d14", trim: "#ff3b5c", visor: "#ffc861", dark: 1 },
    { id: "unholy", name: "Unholy", rarity: LEG, achv: "unholy", suit: "#14081f", trim: "#73ffce", visor: "#ff4f8b", dark: 1 },
    { id: "slumber", name: "Sloth's Slumber", rarity: UNC, shop: 1, set: "sloth", suit: "#c9cff0", trim: "#8f97c9", visor: "#6d7bff", mark: "moon", desc: "Lavender quilting and a crescent moon." },
    { id: "reactor", name: "Gluttony Reactor", rarity: RARE, shop: 1, set: "gluttony", suit: "#2a0f1f", trim: "#ff4f8b", visor: "#ff4f8b", mark: "core", dark: 1, desc: "A magenta core that never stops pulsing." },
    { id: "tycoon", name: "Golden Greed", rarity: RARE, shop: 1, set: "greed", suit: "#17140b", trim: "#ffd45c", visor: "#ffd45c", mark: "coin", dark: 1, desc: "Black and gold, a coin over the heart." },
    { id: "holo", name: "Lust Holo", rarity: RARE, shop: 1, set: "lust", suit: "#ffe3f2", trim: "#d77fb0", visor: "#ff6fb5", mark: "heart", desc: "Pearl pink with a holographic heart." },
    { id: "crimson", name: "Crimson Wrath", rarity: RARE, shop: 1, set: "wrath", suit: "#3a0f14", trim: "#ff4a3d", visor: "#ffb35c", mark: "flame", dark: 1, desc: "Reactor-red plating and a flame on the chest." },
    { id: "royal", name: "Royal Pride", rarity: EPIC, shop: 1, set: "pride", suit: "#1e1240", trim: "#a98bff", visor: "#ffd45c", mark: "crown", dark: 1, desc: "Royal violet with a gold-visored stare." },
    { id: "mirror", name: "Broken Mirror", rarity: EPIC, shop: 1, set: "envy", suit: "#e8ecff", trim: "#6d7bff", visor: "#73ffce", mark: "eye", desc: "Mirror-white, an eye on the chest, always looking at yours." },
    { id: "voidwalker", name: "Voidwalker", rarity: EPIC, shop: 1, set: "void", suit: "#0d0f24", trim: "#8e44ff", visor: "#63f4ff", mark: "star", dark: 1, desc: "Black as the space between stars." },
    { id: "phantom", name: "Nebula Phantom", rarity: LEG, shop: 1, suit: "#2b1b4f", trim: "#ff42d0", visor: "#63f4ff", mark: "swirl", dark: 1, desc: "Deep purple with a nebula swirling on the chest." },
    { id: "guardian", name: "Astral Guardian", rarity: LEG, shop: 1, set: "astral", suit: "#f5f0e6", trim: "#63f4ff", visor: "#ffc861", mark: "spark", desc: "Cream and starlight, gold visor, cyan trim." },
  ],
  visor: [
    { id: "", name: "Suit colour", rarity: COM, desc: "Matches your suit." },
    { id: "mirror", name: "Mirror", rarity: RARE, achv: "untouchable", col: "#e9f1ff" },
    { id: "fused", name: "Fused", rarity: RARE, achv: "fused", col: "#ff7ad9" },
    { id: "toxic", name: "Toxic", rarity: RARE, achv: "diet", col: "#9dff5c" },
    { id: "gold", name: "Gold", rarity: EPIC, achv: "mirror", col: "#ffc861" },
    { id: "sunset", name: "Sunset", rarity: UNC, shop: 1, col: "#ff8a3d", desc: "Warm orange glass." },
    { id: "seafoam", name: "Seafoam", rarity: UNC, shop: 1, col: "#73ffce", desc: "Cool green glass." },
    { id: "bloodmoon", name: "Blood Moon", rarity: RARE, shop: 1, set: "wrath", col: "#ff3b5c", desc: "Red glass. Everything looks angry." },
    { id: "cracked", name: "Cracked Glass", rarity: RARE, shop: 1, set: "envy", col: "#e9f1ff", fx: "crack", desc: "A mirror visor that took a hit and kept going." },
    { id: "galaxy", name: "Galaxy", rarity: EPIC, shop: 1, set: "void", col: "#6d7bff", fx: "stars", desc: "A starfield in the glass." },
    { id: "blackmirror", name: "Black Mirror", rarity: LEG, shop: 1, col: "#0d0d18", fx: "rim", desc: "Pitch-black glass with a cyan rim." },
  ],
  trail: [
    { id: "", name: "Violet", rarity: COM, pals: [P_VIOLET, P_DVIOLET], desc: "The classic jetpack puff." },
    { id: "afterimage", name: "Afterimage", rarity: RARE, achv: "matador", pals: [P_CYAN, P_WHITE] },
    { id: "supernova", name: "Supernova", rarity: EPIC, achv: "overkill", pals: [P_WHITE, P_AMBER] },
    { id: "toxic", name: "Toxic", rarity: RARE, achv: "mutants", col: "#9dff5c" },
    { id: "ember", name: "Ember", rarity: RARE, achv: "calm", pals: [P_ORANGE, P_RED], style: "ember" },
    { id: "gauntlet", name: "Gauntlet", rarity: EPIC, achv: "gauntlet", pals: [P_ORANGE, P_CYAN] },
    { id: "sinful", name: "Seven Sins", rarity: LEG, achv: "seven", sins: true },
    { id: "ion", name: "Cyan Ion", rarity: COM, shop: 1, pals: [P_CYAN, P_BLUE], style: "zap", desc: "Clean, quick ion exhaust." },
    { id: "dreamhaze", name: "Dream Haze", rarity: UNC, shop: 1, set: "sloth", pals: [P_SLOTH, P_BLUE], style: "smoke", desc: "Slow lavender smoke." },
    { id: "exhaust", name: "Reactor Exhaust", rarity: UNC, shop: 1, set: "gluttony", pals: [P_GLUT, P_MAGENTA], style: "ember", desc: "Hot magenta sparks." },
    { id: "golddust", name: "Gold Dust", rarity: RARE, shop: 1, set: "greed", pals: [P_GREED, P_AMBER], style: "dust", desc: "Leaves a little money behind." },
    { id: "heartbeat", name: "Heartbeat", rarity: UNC, shop: 1, set: "lust", pals: [P_LUST, P_HEART], desc: "Pink and violet puffs." },
    { id: "wildfire", name: "Wildfire", rarity: RARE, shop: 1, set: "wrath", pals: [P_WRATH, P_RED], style: "ember", desc: "Embers that rise." },
    { id: "regalia", name: "Regalia", rarity: RARE, shop: 1, set: "pride", pals: [P_PRIDE, P_WHITE], style: "dust", desc: "Violet and white sparkle." },
    { id: "greeneyed", name: "Green-Eyed", rarity: RARE, shop: 1, set: "envy", pals: [P_ENVY, P_MINT], style: "smoke", desc: "Blue-green smoke that lingers." },
    { id: "nebula", name: "Nebula Smoke", rarity: EPIC, shop: 1, set: "void", pals: [P_DVIOLET, P_MAGENTA], style: "smoke", desc: "Purple and magenta clouds." },
    { id: "static", name: "Static", rarity: EPIC, shop: 1, pals: [P_BLUE, P_WHITE], style: "zap", desc: "Crackling blue-white discharge." },
    { id: "astralwake", name: "Astral Wake", rarity: LEG, shop: 1, set: "astral", pals: [P_AMBER, P_CYAN], style: "dust", desc: "Gold and cyan stardust." },
  ],
  finish: [
    { id: "", name: "Steel", rarity: COM, col: "#c9d0f2", desc: "Factory finish." },
    { id: "chrome", name: "Chrome", rarity: RARE, achv: "deadeye", col: "#f4f8ff" },
    { id: "gilded", name: "Gilded", rarity: RARE, achv: "daily", col: "#ffd45c" },
    { id: "obsidian", name: "Obsidian", rarity: EPIC, achv: "hard", col: "#3a3360" },
    { id: "evolved", name: "Prismatic", rarity: LEG, achv: "evolved", prism: true },
    { id: "ascendant", name: "Ascendant", rarity: LEG, achv: "arsenal", col: "#fff4d6" },
    { id: "lavender", name: "Lavender Haze", rarity: UNC, shop: 1, set: "sloth", col: "#c9cff0", desc: "Soft lavender." },
    { id: "glutpink", name: "Glutton Pink", rarity: UNC, shop: 1, set: "gluttony", col: "#ff4f8b", desc: "Hot pink." },
    { id: "bullion", name: "Bullion", rarity: RARE, shop: 1, set: "greed", col: "#e6b422", desc: "Deep, heavy gold." },
    { id: "rose", name: "Rose Quartz", rarity: UNC, shop: 1, set: "lust", col: "#ffb3d9", desc: "Pale pink stone." },
    { id: "crimson", name: "Crimson Reactor", rarity: RARE, shop: 1, set: "wrath", col: "#ff4a3d", desc: "Red-hot." },
    { id: "royalviolet", name: "Royal Violet", rarity: UNC, shop: 1, set: "pride", col: "#a98bff", desc: "Pride's own purple." },
    { id: "seafoam", name: "Seafoam Plasma", rarity: RARE, shop: 1, set: "envy", col: "#73ffce", desc: "Green plasma glow." },
    { id: "voidblack", name: "Void Black", rarity: UNC, shop: 1, set: "void", col: "#1b1830", desc: "Swallows the light." },
    { id: "astralgold", name: "Astral Gold", rarity: EPIC, shop: 1, set: "astral", col: "#ffe08a", desc: "Bright starlit gold." },
  ],
  victory: [
    { id: "", name: "Classic", rarity: COM, desc: "The boss's own explosion." },
    { id: "fireworks", name: "Sin Fireworks", rarity: EPIC, achv: "gauntlet" },
    { id: "eclipse", name: "Eclipse", rarity: LEG, achv: "nightmare" },
    { id: "supernova", name: "Supernova", rarity: LEG, achv: "beyond" },
    { id: "starburst", name: "Starburst", rarity: RARE, shop: 1, desc: "Rings of gold stars over the last sin." },
    { id: "singularity", name: "Singularity", rarity: LEG, shop: 1, desc: "The last sin collapses into a black hole, then bursts." },
  ],
  title: [
    { id: "", name: "No title", rarity: COM },
    { id: "cadet", name: "Space Cadet", rarity: COM, shop: 1, desc: "Everyone starts somewhere." },
    { id: "drifter", name: "Cosmic Drifter", rarity: UNC, shop: 1 },
    { id: "supreme", name: "Sinner Supreme", rarity: EPIC, shop: 1 },
    { id: "ghost", name: "Ghost in the Machine", rarity: EPIC, achv: "ghost" },
    { id: "fiend", name: "Combo Fiend", rarity: RARE, achv: "fiend" },
    { id: "sinner", name: "Sin Incarnate", rarity: RARE, achv: "sinmax" },
    { id: "ascended", name: "The Ascended", rarity: LEG, achv: "allpaths" },
    { id: "kingslayer", name: "Kingslayer", rarity: RARE, achv: "crown" },
    { id: "walker", name: "Nightmare Walker", rarity: LEG, achv: "nightmare" },
    { id: "speed", name: "Speed Demon", rarity: EPIC, achv: "speed" },
    { id: "m_blaster", name: "Blaster Master", rarity: RARE, achv: "m_blaster" },
    { id: "m_scatter", name: "Shotgun Saint", rarity: RARE, achv: "m_scatter" },
    { id: "m_smg", name: "Bullet Hose", rarity: RARE, achv: "m_smg" },
    { id: "m_rail", name: "Railgun Royalty", rarity: RARE, achv: "m_rail" },
    { id: "m_nova", name: "Grenadier", rarity: RARE, achv: "m_nova" },
    { id: "m_arc", name: "Storm Caller", rarity: RARE, achv: "m_arc" },
    { id: "m_heart", name: "Heartbreaker", rarity: RARE, achv: "m_heart" },
    { id: "rested", name: "The Well-Rested", rarity: EPIC, fromSet: "sloth" },
    { id: "bottomless", name: "Bottomless", rarity: EPIC, fromSet: "gluttony" },
    { id: "highroller", name: "High Roller", rarity: EPIC, fromSet: "greed" },
    { id: "heartthrob", name: "Heartthrob", rarity: EPIC, fromSet: "lust" },
    { id: "unchained", name: "Unchained", rarity: EPIC, fromSet: "wrath" },
    { id: "crowned", name: "The Crowned", rarity: EPIC, fromSet: "pride" },
    { id: "greeneyed", name: "Green-Eyed", rarity: EPIC, fromSet: "envy" },
    { id: "voidborn", name: "Voidborn", rarity: LEG, fromSet: "void" },
    { id: "astral", name: "Astral", rarity: LEG, fromSet: "astral" },
  ],
};

export const ITEMS = [];
for (const kind of Object.keys(RAW)) {
  for (const x of RAW[kind]) {
    ITEMS.push({ ...x, kind, key: kind + ":" + x.id, shop: !!x.shop, price: x.shop ? x.price || SG.price[x.rarity] : 0 });
  }
}
const BY_KEY = Object.fromEntries(ITEMS.map((i) => [i.key, i]));
export const item = (kind, id) => BY_KEY[kind + ":" + (id == null ? "" : id)] || null;
export const itemsOf = (kind) => ITEMS.filter((i) => i.kind === kind);
export const shopItems = () => ITEMS.filter((i) => i.shop);
export const SUITS = itemsOf("suit");

// ---------------------------------------------------------------------------
// owning and wearing
// ---------------------------------------------------------------------------
export const setItems = (id) => ITEMS.filter((i) => i.set === id && i.shop);
export const setDone = (id) => setItems(id).every((i) => !!data().owned[i.key]);

/** Is it yours? */
export function owns(it) {
  if (!it) return false;
  if (it.level) return level() >= it.level;
  if (it.shop) return !!data().owned[it.key];
  if (it.achv) return !!data().achv[it.achv];
  if (it.wave) return (data().best.wave || 0) >= it.wave;
  if (it.fromSet) return setDone(it.fromSet);
  return true;
}
/** How you get it, for the cards: { type: "free" | "owned" | "shop" | "achv" | "wave" | "set", ... }. */
export function source(it) {
  if (it.level) return { type: "level", level: it.level };
  if (it.shop) return { type: "shop", price: it.price };
  if (it.achv) return { type: "achv", achv: it.achv };
  if (it.wave) return { type: "wave", wave: it.wave };
  if (it.fromSet) return { type: "set", set: it.fromSet };
  return { type: "free" };
}

export const equippedId = (kind) => {
  const v = kind === "suit" ? data().settings.suit : data().cos[kind];
  return v == null ? DEFAULTS[kind] : v;
};
/** What you're wearing in that slot (the default if the save names something you don't own). */
export function equipped(kind) {
  const it = item(kind, equippedId(kind));
  return it && owns(it) ? it : item(kind, DEFAULTS[kind]);
}
export function equip(kind, id) {
  const it = item(kind, id);
  if (!it || !owns(it)) return false;
  if (kind === "suit") data().settings.suit = it.id; else data().cos[kind] = it.id;
  store.save();
  G.emit("look");
  return true;
}

/** Spends Sigils on a shop item. False if it isn't for sale, is already yours, or you can't afford it. */
export function buy(it) {
  if (!it || !it.shop || owns(it) || (data().sigils || 0) < it.price) return false;
  ledgerAdd("spent", it.price);
  data().sigils -= it.price;
  data().owned[it.key] = Date.now();
  store.save(true);
  G.emit("bought", it);
  if (it.set && setDone(it.set)) G.emit("setDone", SET_BY_ID[it.set]);
  return true;
}

/** Everything you own, newest first (shop items by when you bought them). */
export function ownedCount() {
  let n = 0;
  for (const it of ITEMS) if (owns(it)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// how you look: the astronaut sprites.js draws, the trail and the gun finish
// ---------------------------------------------------------------------------
/** The look to draw, from what you're wearing, with any slots overridden (a try-on, or a teammate's look). */
export function look(over) {
  const o = over || {};
  const pick = (k) => (o[k] !== undefined && item(k, o[k])) || (over && over.strict ? item(k, DEFAULTS[k]) : equipped(k));
  const s = pick("suit"), h = pick("hat"), v = pick("visor");
  return {
    id: s.id, suit: s.suit, trim: s.trim, visor: v.col || s.visor, visorFx: v.fx || "", dark: !!s.dark, mark: s.mark || "",
    hat: h.id, key: s.id + "/" + h.id + "/" + v.id,
  };
}
/** What co-op teammates are told you're wearing: "suit/hat/visor/trail/finish" (older clients read the suit and stop). */
export const lookCode = () => LOOK_KINDS.map((k) => equipped(k).id).join("/");
/** A teammate's look code back to item ids; anything unknown (or from an older client) becomes the default. */
export function parseLook(code) {
  const parts = String(code || "").split("/");
  const out = { strict: true };
  LOOK_KINDS.forEach((k, i) => { const id = parts[i]; out[k] = id !== undefined && item(k, id) ? id : DEFAULTS[k]; });
  return out;
}

// teammates' looks, parsed once per look code
const teamLooks = new Map();
/** One slot of a teammate's look code, as a catalog item. */
export function lookItem(code, kind) {
  let p = teamLooks.get(code);
  if (!p) { p = parseLook(code); if (teamLooks.size > 64) teamLooks.clear(); teamLooks.set(code, p); }
  return item(kind, p[kind]);
}

const SIN_PALS = [P_SLOTH, P_GLUT, P_GREED, P_LUST, P_WRATH, P_PRIDE, P_ENVY];
/** A trail's jetpack puff colour (palette index) at time t. */
export function trailPalOf(it, t) {
  if (!it) return P_VIOLET;
  if (it.sins) return SIN_PALS[Math.floor(t * 6) % SIN_PALS.length];
  if (it.col) { const i = PAL.indexOf(it.col); return i >= 0 ? i : P_VIOLET; }
  const p = it.pals || [P_VIOLET, P_DVIOLET];
  return p[Math.random() < 0.5 ? 0 : 1];
}
// How a trail's puffs move: size, life, spread, and drift (negative rises).
const STYLES = {
  puff: { size: 1.5, life: 0.35, spread: 20, push: 120, rise: 0, n: 1 },
  smoke: { size: 2.4, life: 0.6, spread: 14, push: 70, rise: -20, n: 1 },
  ember: { size: 1.2, life: 0.5, spread: 34, push: 110, rise: -90, n: 1 },
  dust: { size: 0.9, life: 0.55, spread: 40, push: 90, rise: 0, n: 2 },
  zap: { size: 1.1, life: 0.18, spread: 60, push: 200, rise: 0, n: 2 },
};
export const trailStyleOf = (it) => STYLES[(it && it.style) || "puff"];
/** A finish's gun colour at time t. */
export function finishColOf(it, t) {
  if (it && it.prism) return "hsl(" + Math.round((t * 90) % 360) + ", 85%, 78%)";
  return (it && it.col) || "#c9d0f2";
}
export const trailPal = () => trailPalOf(equipped("trail"), G.time);
export const trailStyle = () => trailStyleOf(equipped("trail"));
export const finishCol = () => finishColOf(equipped("finish"), G.time);

// ---------------------------------------------------------------------------
// loadout presets: three saved outfits (cosmetic only; never your guns or build)
// ---------------------------------------------------------------------------
const PRESET_KINDS = ["suit", "hat", "visor", "trail", "finish", "victory", "title"];
export function savePreset(i) {
  const p = {};
  for (const k of PRESET_KINDS) p[k] = equipped(k).id;
  data().presets[i] = p;
  store.save();
  return p;
}
/** Puts a preset on. Returns how many of its items you no longer own (those slots are left alone). */
export function applyPreset(i) {
  const p = data().presets[i];
  if (!p) return -1;
  let missing = 0;
  for (const k of PRESET_KINDS) {
    if (p[k] === undefined) continue;
    const it = item(k, p[k]);
    if (it && owns(it)) { if (k === "suit") data().settings.suit = it.id; else data().cos[k] = it.id; } else missing++;
  }
  store.save();
  G.emit("look");
  return missing;
}

// ---------------------------------------------------------------------------
// the Item Shop's featured row: four picks a day (UTC), the same for everyone, never limited:
// everything in it is in the full catalog every day too
// ---------------------------------------------------------------------------
export const dayKey = (d) => (d || new Date()).toISOString().slice(0, 10);
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function featured(day) {
  const key = day || dayKey();
  let seed = hash("featured:" + key);
  const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  const pool = shopItems().slice().sort((a, b) => (a.key < b.key ? -1 : 1));
  const big = pool.filter((i) => i.rarity >= EPIC && i.kind !== "title");
  const hero = big[Math.floor(rnd() * big.length)];
  const rest = pool.filter((i) => i !== hero && i.kind !== "title");
  const out = [hero];
  const kinds = new Set([hero.kind]);
  for (let tries = 0; out.length < 4 && tries < 200; tries++) {
    const it = rest[Math.floor(rnd() * rest.length)];
    if (out.indexOf(it) >= 0) continue;
    if (kinds.has(it.kind) && tries < 120) continue;         // a mix of kinds when it can
    out.push(it); kinds.add(it.kind);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sigils: the Hangar's currency. Earned in play only (balance.sigils); never in debug runs.
// ---------------------------------------------------------------------------
/** Sigils for one of the payouts (before checking whether this run can earn any). */
const DIFF_I = { normal: 0, hard: 1, nightmare: 2 };
export const diffMul = () => SG.diff[G.difficulty] || 1;
/** What an achievement pays (once), by its tier. */
export const achvSigils = (id) => SG.achv[SG.achvTier[id] || 0];
/** Today's capped payouts: run Sigils so far, Boss Rush clears paid. */
export function sigilDay() {
  const d = data();
  const day = dayKey();
  if (!d.sigilDay || d.sigilDay.day !== day) d.sigilDay = { day, run: 0, rush: 0 };
  return d.sigilDay;
}
/** A reward that pays once, ever (its key is kept in the save). */
export function claimOnce(key, n, why) {
  if (G.debug.on || !(n > 0)) return 0;
  const c = data().claims || (data().claims = {});
  if (c[key]) return 0;
  c[key] = Date.now();
  return earnSigils(n, why);
}
/** The first time you beat each sin boss on a difficulty. */
export const firstBoss = (type) => claimOnce("boss:" + type + ":" + G.difficulty, Math.round(SG.first.boss * diffMul()), "first-boss");
/** The first time you climb the whole Ladder on a difficulty. */
export const firstWin = () => claimOnce("win:" + G.difficulty, SG.first.win[DIFF_I[G.difficulty] || 0], "first-win");
/** A Boss Rush clear: once-ever bonus for the difficulty, then the clear itself (three a day). */
export function rushClear(rank) {
  if (G.debug.on) return 0;
  let n = claimOnce("rush:" + G.difficulty, SG.first.rush[DIFF_I[G.difficulty] || 0], "first-rush");
  const t = sigilDay();
  if (t.rush < SG.rush.dayClears) { t.rush++; n += earnSigils(Math.round((SG.rush.clear + (SG.rush.rank[rank] || 0)) * diffMul()), "rush"); }
  return n;
}
/** What playing a run pays: a little, for a real run, up to a daily cap. r: { time, kills, wave, won, rush, bosses, active }.
    Returns { n, why } (why: "" paid, "short" not a real run, "idle" mostly standing still, "cap" today's run Sigils are in). */
export function runPay(r) {
  const R = SG.run;
  if (G.debug.on) return { n: 0, why: "debug" };
  if ((r.time || 0) < R.minTime || (r.kills || 0) < R.minKills || (r.rush ? (r.bosses || 0) < 1 : (r.wave || 0) < R.minWave)) return { n: 0, why: "short" };
  if ((r.active || 0) < R.minActive) return { n: 0, why: "idle" };
  let n = R.base;
  if (r.rush) n += ((r.bosses || 0) >= 4 ? 1 : 0) + ((r.bosses || 0) >= 7 ? 1 : 0);
  else n += ((r.wave || 0) >= R.waves[0] ? 1 : 0) + ((r.wave || 0) >= R.waves[1] ? 1 : 0) + (r.won ? R.win : 0);
  n = Math.max(1, Math.round(n * diffMul()));
  const t = sigilDay();
  n = Math.min(n, Math.max(0, R.dayCap - t.run));
  if (!n) return { n: 0, why: "cap" };
  t.run += n;
  earnSigils(n, "run", true);
  return { n, why: "" };
}
/** Adds Sigils to your save. quiet: no toast (the achievement card or contract line says it). */
export function earnSigils(n, why, quiet) {
  if (!(n > 0) || G.debug.on) return 0;
  ledgerAdd("earned", n);                 // cloud saves count per device (before the balance moves)
  data().sigils = (data().sigils || 0) + n;
  data().life.sigils = (data().life.sigils || 0) + n;
  G.runSigils = (G.runSigils || 0) + n;
  store.save();
  G.emit("sigils", { n, why, quiet: !!quiet });
  return n;
}
