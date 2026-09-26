/* =====================================================================
   SETTINGS: the only file you need to edit
   ===================================================================== */
window.EG_CONFIG = {
  // From Supabase → Project Settings → API. Both are safe to have on a public website.
  SUPABASE_URL: "https://ybtsdtpcxinttnshbicl.supabase.co",   // your project API URL (not the dashboard link)
  SUPABASE_KEY: "sb_publishable_OxlLbOFv4jUFr9ZYZZouMg_zk9qagSR",  // publishable key (safe to be public)

  // The Discord link in the menu and the "Back to the server" button.
  DISCORD_INVITE: "https://discord.gg/enviousgluttony",

  // Sign-in buttons. Turn one off with false.
  DISCORD_LOGIN: true,
  GOOGLE_LOGIN: false,   // off for now; flip to true once Google is set up in Supabase

  // Set to false to close applications. The page stays up but the quiz hides.
  APPLICATIONS_OPEN: true,

  FORM_ID: "eg-staff-v2",

  // Set to false to stop taking ban appeals. The page stays up so people can still check on one.
  APPEALS_OPEN: true,
  APPEAL_FORM_ID: "eg-appeal-v1",

  /* Questions. Reword freely.
     - id:    unique, lowercase, no spaces. Keep name, discord_username and age.
     - short: the label shown on the admin page and in Discord.
     - type:  text | number | textarea */
  recruitment: [
    { n: "01", icon: "user", q: "What is your name and username?", fields: [
      { id: "name", short: "Name", label: "Name", type: "text", required: true, maxLength: 60, placeholder: "Your name" },
      { id: "discord_username", short: "Discord username", label: "Discord username", type: "text", required: true,
        maxLength: 40, pattern: "discord", placeholder: "e.g. nightowl.eg" }
    ] },
    { n: "02", icon: "cake", q: "How old are you?", fields: [
      { id: "age", short: "Age", type: "number", required: true, min: 13, max: 99, placeholder: "Your answer..." }
    ] },
    { n: "03", icon: "users", q: "Why do you want to become staff on Envious Gluttony?", fields: [
      { id: "why_staff", short: "Why staff", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "04", icon: "settings", q: "What experience do you have moderating or helping in online communities?", fields: [
      { id: "experience", short: "Experience", type: "textarea", required: true, minLength: 10, maxLength: 1500 }
    ] },
    { n: "05", icon: "message-square", q: "How would you handle an argument between members?", fields: [
      { id: "argument", short: "Handling arguments", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "06", icon: "clock", q: "How active can you be each week?", fields: [
      { id: "activity", short: "Weekly activity", type: "textarea", rows: 2, required: true, maxLength: 500 }
    ] },
    { n: "07", icon: "star", q: "What makes you a great staff member?", fields: [
      { id: "great_staff", short: "Why they'd be great", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "08", icon: "file-text", q: "Is there anything else you'd like us to know?", fields: [
      { id: "anything_else", short: "Anything else", type: "textarea", maxLength: 1500 }
    ] }
  ],

  rules: [
    { code: "R1", icon: "shopping-cart", text: "No Sourcing" },
    { code: "R2", icon: "pill", text: "No Substance ID" },
    { code: "R3", icon: "triangle-alert", text: "No Encouraging Harm" },
    { code: "R4", icon: "message-circle", text: "Banter Yes, Harassment No" },
    { code: "R5", icon: "lock", text: "No Doxxing" },
    { code: "R6", icon: "eye-off", text: "Spoiler Gore" },
    { code: "R7", icon: "users-round", text: "No Nazi / Hate-Group Content" }
  ],

  judgment: [
    { n: "1", q: "In your own words, what does Rule 1: No Sourcing mean?", fields: [
      { id: "rule1_meaning", short: "R1 in their words", type: "textarea", required: true, minLength: 15, maxLength: 1500 }
    ] },
    { n: "2", q: "A member posts a vendor name, plug, shop, or asks where to get something. What would you do?", fields: [
      { id: "vendor_post", short: "Vendor / plug post", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "3", q: "Someone asks staff to identify a pill or substance from a photo. How would you respond?", fields: [
      { id: "pill_id", short: "Pill ID request", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "4", q: "A user encourages another member to take a risky dose or harmful combo. What action would you take?", fields: [
      { id: "risky_dose", short: "Encouraging harm", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "5", q: "When does banter cross the line into harassment, and how should staff handle it?", fields: [
      { id: "banter_line", short: "Banter vs harassment", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "6", q: "Why are these rules important, and how would you enforce them fairly?", fields: [
      { id: "fair_enforcement", short: "Enforcing fairly", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] }
  ],

  /* Ban appeal questions (the /appeal/ page). Reword freely, but keep discord_username and discord_id. */
  appeal: [
    { n: "01", icon: "user", q: "What is your Discord username and user ID?", fields: [
      { id: "discord_username", short: "Discord username", label: "Discord username", type: "text", required: true,
        maxLength: 40, pattern: "discord", placeholder: "e.g. nightowl.eg" },
      { id: "discord_id", short: "User ID", label: "User ID", type: "text", required: true, maxLength: 24, pattern: "snowflake",
        numeric: true, placeholder: "e.g. 123456789012345678",
        hint: "Turn on Developer Mode (Discord Settings → Advanced), then open your profile and tap Copy User ID." }
    ] },
    { n: "02", icon: "calendar-days", q: "When were you banned, and if you know, what was the reason given?", fields: [
      { id: "banned_when", short: "When + reason given", type: "textarea", required: true, minLength: 5, maxLength: 800 }
    ] },
    { n: "03", icon: "message-square", q: "In your own words, what happened that led to the ban?", fields: [
      { id: "what_happened", short: "What happened", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "04", icon: "file-text", q: "Do you understand which rule(s) you broke? Explain briefly.", fields: [
      { id: "rules_broken", short: "Rules broken", type: "textarea", required: true, minLength: 10, maxLength: 1000 }
    ] },
    { n: "05", icon: "scale", q: "Why do you believe your appeal should be accepted?", fields: [
      { id: "why_accept", short: "Why accept", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "06", icon: "lightbulb", q: "What would you do differently if you were allowed back into the server?", fields: [
      { id: "do_differently", short: "Would do differently", type: "textarea", required: true, minLength: 20, maxLength: 1500 }
    ] },
    { n: "07", icon: "book-open", q: "Have you read the rules again, and can you follow them moving forward?", rules: true, fields: [
      { id: "read_rules", short: "Read the rules again", type: "textarea", required: true, minLength: 5, maxLength: 800 }
    ] },
    { n: "08", icon: "message-circle-more", q: "Is there anything else you want the staff team to know?", fields: [
      { id: "anything_else", short: "Anything else", type: "textarea", maxLength: 1500 }
    ] }
  ]
};
