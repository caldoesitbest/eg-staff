/* The Hangar's splash line (4.5): a little tilted yellow line on the Play tab that changes every visit, the way
   a certain block game does it. One of them is rare, and it's a thank-you: Envious Glider got started with
   @r0wzzy's help. Tap the line a few times (or type r0wzzy in the Hangar) and it says so on purpose. */

import { G } from "./state.js";

const LINES = [
  "Sinners vs. machines!", "Now with 100% more envy!", "Seven sins, zero chill.", "Boost through it!",
  "Perfect boosts are free real estate.", "Greed is good. Ish.", "Sloth was a teacher.", "Don't stand still!",
  "Stars are not edible.", "Gluttony approves.", "Pride comes before the crown breaks.", "Wrath management not included.",
  "Lust for loot!", "Envy can't be earned.", "Also try the Daily!", "Twice as sinful in co-op!",
  "Robots evolve. Do you?", "Hats are serious business.", "Mythic Black Hole sighted!", "Certified sin-ful.",
  "Charge it up!", "Mk III is a lifestyle.", "Now with friends!", "Ready up!", "The Warden says hi.",
  "Watch the red line.", "One more run.", "Made with spite and stardust.", "Built different. Literally.",
  "Sigils don't grow on asteroids.", "Ask the Lancer about personal space.",
];
const CREDIT = "It all started with @r0wzzy.";
const RARE = 1 / 20;
let taps = 0, tapT = 0, typed = "", revealed = false;

function show(text, credit) {
  const n = document.getElementById("splash");
  if (!n) return;
  n.textContent = text;
  n.classList.toggle("credit", !!credit);
  n.classList.remove("pop"); void n.offsetWidth; n.classList.add("pop");
}
function reveal(sfx, toast) {
  revealed = true;
  show(CREDIT, true);
  const n = document.getElementById("splash");
  if (n) {
    // a little shower of stars from the line
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("i");
      s.className = "splash-star";
      s.style.setProperty("--dx", (Math.random() * 2 - 1) * 120 + "px");
      s.style.setProperty("--dy", (-40 - Math.random() * 90) + "px");
      s.style.animationDelay = Math.random() * 0.25 + "s";
      n.append(s);
      setTimeout(() => s.remove(), 1500);
    }
  }
  if (sfx) sfx("achv");
  if (toast) toast("Thanks for helping start Envious Glider, @r0wzzy.", 3200);
}

export const splash = {
  /** A new line for this visit to the Hangar (rarely, the credit). */
  roll() {
    if (revealed) return;
    if (Math.random() < RARE) show(CREDIT, true);
    else show(LINES[Math.floor(Math.random() * LINES.length)], false);
  },
  init(o) {
    const n = document.getElementById("splash");
    if (!n) return;
    n.addEventListener("click", () => {
      const t = performance.now();
      taps = t - tapT < 900 ? taps + 1 : 1;
      tapT = t;
      if (taps >= 5) { taps = 0; reveal(o.sfx, o.toast); return; }
      if (!revealed) show(LINES[Math.floor(Math.random() * LINES.length)], false);
    });
    window.addEventListener("keydown", (e) => {
      if (G.state !== "menu" || !e.key || e.key.length !== 1 || (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"))) return;
      typed = (typed + e.key.toLowerCase()).slice(-6);
      if (typed === "r0wzzy") reveal(o.sfx, o.toast);
    });
    this.roll();
  },
};
