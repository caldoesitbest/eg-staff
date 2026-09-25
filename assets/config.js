/* =====================================================================
   SETTINGS: the only file you need to edit
   ===================================================================== */
window.EG_CONFIG = {
  // From Supabase → Project Settings → API. Both are safe to have on a public website.
    SUPABASE_URL: "https://ybtsdtpcxinttnshbicl.supabase.co",          // looks like https://abcdefgh.supabase.co
  SUPABASE_KEY: "sb_publishable_OxlLbOFv4jUFr9ZYZZouMg_zk9qagSR",      // the publishable (or "anon") key

  // The Discord link in the menu and the "Back to the server" button.
  DISCORD_INVITE: "https://discord.gg/enviousgluttony",

  // Sign-in buttons. Turn one off with false.
  DISCORD_LOGIN: true,
  GOOGLE_LOGIN: true,

  // Set to false to close applications. The page stays up but the quiz hides.
  APPLICATIONS_OPEN: true,

  FORM_ID: "eg-staff-v2",

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
  ]
};
