/* =====================================================================
   HOMEPAGE CONTENT: edit numbers and text here, the page updates itself.
   Members, online count and boosts also refresh live from Discord when
   a visitor's browser can reach it; the numbers below are the fallback.
   ===================================================================== */
window.EG_HOME = {
  founded: "2026-09-02",          // the day the server opened (used for "per day" math)
  updated: "2026-09-25",          // when you last copied the stats below from the bot

  stats: {
    members: 280,
    boosts: 31,
    inVoice: 10,                  // shown until Discord's live online count loads
    messages: 11199,
    voiceHours: 4240,
    voicePeople: 223,
    joins24h: 9,
    joins7d: 68,
    xpPeople: 262,
    commands: [                   // any order; the page sorts them
      { cmd: "!toke", uses: 191 },
      { cmd: "!dab", uses: 63 },
      { cmd: "!shot", uses: 62 },
      { cmd: "!line", uses: 288 }
    ]
  },

  nextGoal: 500,                  // "Next stop" on the milestones and the progress bar

  /* big: the huge label on the card. color: cyan | violet | magenta | amber | mint */
  milestones: [
    { date: "Sep 02", big: "Day 1", color: "cyan", title: "The doors open",
      text: "Envious Gluttony™ goes live, with two Nitro gifts dropped in the very first message." },
    { date: "Sep 03", big: "24/7", color: "violet", title: "The bot never sleeps",
      text: "Gluttony™ moved to dedicated hosting and stays online around the clock through 09/02/2027." },
    { date: "Sep 04", big: "100", color: "magenta", title: "Member #100",
      text: "Our 100th sinner walked in to a month of Nitro. Everyone else got a shot at $25 on DoorDash." },
    { date: "Sep 09", big: "1 wk", color: "mint", title: "One-week serversary",
      text: "154 sinners and 31 boosts, seven days in." },
    { date: "Sep 22", big: "250", color: "amber", title: "250 sinners",
      text: "Celebrated the only way we know how: another $25 giveaway, CashApp or BTC." },
    { date: "Now", big: "live", color: "cyan", title: "And counting", now: true,
      text: "Giveaways keep coming. So do the sinners." }
  ],

  /* "What makes EG different". icon names come from assets/icons.js */
  features: [
    { icon: "message-square-heart", color: "#ff5fd8", title: "Confessions",
      text: "The sins you earn. The vices you confess. Pick yours and wear it with pride.", chip: "6 on the menu" },
    { icon: "gift", color: "#ffc861", title: "Giveaways",
      text: "Nitro, cash and gift cards, dropped for every milestone and sometimes just because.", chip: "Nitro · $25 drops" },
    { icon: "drama", color: "#a57bff", title: "Roles & identity",
      text: "Colors, titles and a spot on the member list that actually says something about you.", chip: "#get-roles-here" },
    { icon: "chart-no-axes-column-increasing", color: "#63f4ff", title: "Leveling & XP",
      text: "Talk, hang out in voice, climb the ladder. Seven sins and one very exclusive top spot.", chip: "{xpPeople} ranked" },
    { icon: "mic", color: "#73ffce", title: "Voice",
      text: "Actual conversation with actual people. Day, night and the weird hours in between.", chip: "{voiceHours} hrs logged" },
    { icon: "lightbulb", color: "#ff8a5c", title: "Community-led",
      text: "The suggestions forum is open. Members asked for a music bot and Jockie Music showed up.", chip: "Your idea next" }
  ],

  /* Confession roles. emoji = file in assets/home/emoji/. count: null hides the number. */
  roles: [
    { name: "Garbage Head", emoji: "garbage-head", c1: "#8b7dff", c2: "#6f86ff",
      text: "Downers, and whatever else is going round.", count: 21 },
    { name: "Speed Freak", emoji: "speed-freak", c1: "#ffc21a", c2: "#ff7a1d",
      text: "Uppers. Hasn't sat down since Tuesday.", count: 35 },
    { name: "Psychonaut", emoji: "psychonaut", c1: "#e07dff", c2: "#9d9cff",
      text: "Psychedelics. Currently negotiating with the carpet.", count: 32 },
    { name: "Pot-Head", emoji: "pot-head", c1: "#6ad35a", c2: "#b4ea4f",
      text: "Cannabinoids. Will get to it in a minute.", count: 49 },
    { name: "Freak", emoji: "freak", c1: "#ff2d55", c2: "#c21fe0", adult: true,
      text: "NSFW. Opens the back room.", count: 54 },
    { name: "Sobriety", emoji: "sobriety", c1: "#b8ffe4", c2: "#6fe6ab",
      text: "Clean. Watching the rest of you with quiet interest.", count: null }
  ],

  /* The Ladder, lowest to highest. level: null = cannot be earned. */
  ladder: [
    { name: "Sloth", emoji: "sloth", level: 1, members: 46, c1: "#b8bfe0", c2: "#8e97c7" },
    { name: "Gluttony", emoji: "gluttony", level: 5, members: 36, c1: "#ff4f8b", c2: "#c2307a" },
    { name: "Greed", emoji: "greed", level: 12, members: 19, c1: "#ffd45c", c2: "#e8a820" },
    { name: "Lust", emoji: "lust", level: 20, members: 12, c1: "#d77fb0", c2: "#a64a7b" },
    { name: "Wrath", emoji: "wrath", level: 30, members: 2, c1: "#ff9448", c2: "#e05ad6" },
    { name: "Pride", emoji: "pride", level: 45, members: 0, c1: "#a98bff", c2: "#8a6cf0" },
    { name: "Envy", emoji: "envy", level: null, members: 1, c1: "#6d7bff", c2: "#4a2ff0" }
  ],

  /* Ground rules: short = homepage summary, full = the "Read the full rules" window. */
  rules: [
    { code: "R1", icon: "shopping-cart", title: "No sourcing",
      short: "No vendors, markets, plugs, shop names, identifying product branding, sourcing requests, or arranging sales and trades. Legal or illegal, even as a joke.",
      warn: "Advertising a sale or trade, even hand-to-hand, even off-platform, is an instant, permanent, no-appeal ban. Not negotiable. Not personal.",
      full: [
        "Do not post, hint at, ask for, or DM anything that helps anyone obtain a substance. Legal or illegal, no exceptions.",
        "That means: no vendors, no markets, no plugs, no shop names, no brand names or logos, no photos of packaging, carts, bags, or pressed product with identifying marks. No \"how do I get my doc to write me…\". No dead markets, no \"it's offline anyway.\" No joke sourcing. We can't read minds and neither can Discord.",
        "Harm-reduction supplies and paraphernalia are fine only if the source doesn't also move drugs. Alcohol, caffeine, and nicotine are exempt.",
        "Advertising a sale or trade here, even hand-to-hand, even off-platform, is an instant, permanent, no-appeal ban. This rule is not negotiable and it is not personal."
      ] },
    { code: "R2", icon: "pill", title: "No substance ID",
      short: "Nobody can identify a substance from a photo. Test kits exist. Use them.",
      full: [
        "Nobody can tell you what you have, or how much of it you have, from a photo. Not staff, not the guy with 4,000 messages. Test kits exist. Use them.",
        "Anyone confidently eyeballing a stranger's pills is getting removed."
      ] },
    { code: "R3", icon: "triangle-alert", title: "Don't encourage harm",
      short: "No daring or pressuring, and no false info about doses, combos or interactions.",
      full: [
        "Do not encourage, dare, goad, or pressure anyone into use. Do not spread false or dangerous information about doses, combos, or interactions. \"Send it\" is not harm reduction.",
        "If someone posts a plan that's going to hurt them, say so. That's what this place is for."
      ] },
    { code: "R4", icon: "message-circle", title: "Banter yes, harassment no",
      short: "Roast freely while everyone's laughing. Drop it when asked. No pile-ons.",
      full: [
        "Roast each other freely. The line is simple: if one party isn't laughing, it's over. Drop it when told.",
        "No targeted harassment. No pile-ons. New members get the same grace you got."
      ] },
    { code: "R5", icon: "lock", title: "No doxxing",
      short: "Never share anyone's private information. Ever.",
      full: ["No doxxing. Never share anyone's private or identifying information."] },
    { code: "R6", icon: "eye-off", title: "Spoiler your gore",
      short: "Graphic or disturbing images go behind a spoiler tag.",
      full: ["Put spoilers on gore and anything graphic or disturbing."] },
    { code: "R7", icon: "ban", title: "No Nazi / hate-group content",
      short: "Hate-group iconography gets one request to change it. Then a ban.",
      full: ["Nazi and hate-group iconography on profiles gets you asked to change it once. If you don't, you will be banned."] }
  ]
};
