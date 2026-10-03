/* Envious Gluttony™ Code of Conduct, shown in the Staff Hub so staff can study it before the test.
   When the Code changes: edit it here, bump the version, then publish the new version in the hub (Test results). */
window.EG_COC = {
  version: "1.2",
  effective: "October 2, 2026",
  sections: [
    { h: "Principles", p: ["All enforcement actions shall be:"], list: [
      "<b>Consistent:</b> equivalent violations receive equivalent responses.",
      "<b>Impartial:</b> Staff shall not act on matters in which they are personally or emotionally involved.",
      "<b>Proportionate:</b> the response reflects the severity of the violation."
    ] },
    { h: "Progressive Discipline", list: [
      "<span class=\"lv\">Level 1</span> Verbal Warning: a reply citing the specific rule violated.",
      "<span class=\"lv\">Level 2</span> Written Warning: issued via /warn with a reason.",
      "<span class=\"lv\">Level 3</span> Timeout. <span class=\"lv\">3.1</span> 24-hour timeout (first timeout). <span class=\"lv\">3.2</span> 7-day timeout (second timeout).",
      "<span class=\"lv\">Level 4</span> Isolation. <span class=\"lv\">4.1</span> Quarantine. <span class=\"lv\">4.2</span> Temporary Ban. <span class=\"lv\">4.3</span> Permanent Removal."
    ], after: [
      "Standard path: 1 → 2 → 3.1 → 3.2 → 4.1 → 4.2 → 4.3",
      "Each rule in Section 3 lists its own path. Some start above Level 1 or skip steps. A member's level carries across rules: for a new violation, apply the rule's starting level or the next step on that rule's path above the member's current level, whichever is higher.",
      "Expedited violations skip progressive discipline and go straight to the level listed.",
      "Expiry: Warnings (Levels 1–2) expire after 90 days without further violations."
    ] },
    { h: "Rules", sub: [
      { h: "§R.1 Sourcing", p: [
        "Advertising sale/trade: Expedited → 4.3. Preserve evidence, then delete. Not appealable. Invitations to \"DM\" in a sourcing context count as advertising.",
        "All other sourcing: Delete content. Path: 2 → 3.2 → 4.1 → 4.2 → 4.3",
        "Reports of sourcing by DM: Verify screenshot evidence, including the user ID, before acting. Once verified, treat it the same as a public violation."
      ] },
      { h: "§R.2 Substance Identification", p: [
        "Delete content and reply directing the member to test kits (Level 1). Repeat offenses or confident dosage claims → 3.1.",
        "Path: 1 → 3.1 → 4.1 → 4.2 → 4.3"
      ] },
      { h: "§R.3 Encouraging Harm", p: [
        "Pressure or goading: Path: 2 → 3.1 → 3.2 → 4.1 → 4.2 → 4.3",
        "Dangerous misinformation: Publicly correct or delete the content, then Level 2. Continued promotion after correction is treated as deliberate. Path: 2 → 3.1 → 3.2 → 4.1 → 4.2 → 4.3"
      ] },
      { h: "§R.4 Respectful Conduct", p: [
        "Ask the member to stop (Level 1). In pile-ons, every participant receives action, not only the person who started it. Political, religious, and controversial topics are allowed when discussed in good faith.",
        "Path: 1 → 2 → 3.1 → 3.2 → 4.1 → 4.2 → 4.3"
      ] },
      { h: "§R.5 Privacy", p: [
        "Expedited → 4.3. Delete content immediately. Escalate serious cases to Discord Trust & Safety. Not appealable."
      ] },
      { h: "§R.6 Graphic Content", p: [
        "First instance: spoiler or delete the content and point the member to 🫦・nsfw. If posted again, Level 1.",
        "Path: 1 → 2 → 3.1 → 3.2 → 4.1 → 4.2 → 4.3"
      ] },
      { h: "§R.7 Hateful Conduct", p: [
        "Profile or live video content: One written request with a 24-hour deadline, logged. Non-compliance → 4.3. Not appealable.",
        "Content posted in the server: Expedited → 4.3. Delete content. Not appealable."
      ] }
    ] },
    { h: "Emergency Response", p: [
      "This section overrides all other enforcement procedures.",
      "When a member reports overdose symptoms, a medical emergency, or intent to self-harm:"
    ], list: [
      "(a) Pause moderation. Tell the member to call 911, or have a friend call for them. Share 988 (call or text) for crisis support. Members outside the US should use their local emergency number.",
      "(b) Notify all available Staff. One Staff member stays with the member; another manages the channel. Do not make it a public event.",
      "(c) No disciplinary action is taken for any violation that occurs while seeking help. Content may be removed once the situation is resolved."
    ] },
    { h: "Staff Conduct", p: [
      "Staff shall cite the relevant rule and level with every enforcement action (e.g. \"§R.4, Level 3.1\").",
      "Staff shall recuse themselves from any matter in which they are personally or emotionally involved.",
      "Staff are bound by this Code of Conduct. Staff found in violation of §R.1 or §R.5 will be removed from their position and subject to standard enforcement."
    ] },
    { h: "Appeals", p: [
      "All actions are appealable except §R.1 (advertising), §R.5, and §R.7.",
      "Appeals are submitted through sins_bot. The full process is still being finalized.",
      "One appeal per action is permitted. The appeal decision is final."
    ] },
    { h: "Amendments", p: ["This policy may be amended by the server owners. Material changes will be communicated to Staff before they take effect."] },
    { h: "Situations Not Covered", p: ["If something isn't covered here but you believe it warrants Staff action, contact a server owner directly before acting."] }
  ]
};
