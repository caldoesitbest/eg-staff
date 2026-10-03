/* Staff Hub illustrations: the Clanker Relay airship, the astronaut, the empty-state scenes.
   Inline SVG so they pick up the site's fonts and can be animated from staff.css. */
(function () {
  "use strict";
  let n = 0;
  function make(markup, cls) {
    const u = "eg" + (++n) + "-";
    const box = document.createElement("span");
    box.className = "art " + (cls || "");
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = markup.replace(/\{u\}/g, u);
    return box;
  }
  const OUT = 'stroke="#10132e" stroke-linejoin="round" stroke-linecap="round"';

  /* ---------- the Clanker Relay airship ---------- */
  const RELAY = `<svg viewBox="0 0 560 300" focusable="false">
  <defs>
    <linearGradient id="{u}hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#efe6ff"/><stop offset=".16" stop-color="#a684ff"/><stop offset=".5" stop-color="#4e25bd"/><stop offset="1" stop-color="#14093a"/>
    </linearGradient>
    <linearGradient id="{u}band" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#090522"/><stop offset=".5" stop-color="#1b0f4f"/><stop offset="1" stop-color="#090522"/>
    </linearGradient>
    <linearGradient id="{u}fin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5ce1"/><stop offset="1" stop-color="#6b22e8"/></linearGradient>
    <linearGradient id="{u}beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bff9ff" stop-opacity=".55"/><stop offset="1" stop-color="#63f4ff" stop-opacity="0"/></linearGradient>
    <radialGradient id="{u}exh"><stop offset="0" stop-color="#ffd1f6"/><stop offset=".35" stop-color="#ff42d0" stop-opacity=".75"/><stop offset="1" stop-color="#ff42d0" stop-opacity="0"/></radialGradient>
    <radialGradient id="{u}nose" cx=".35" cy=".35"><stop offset="0" stop-color="#e8feff"/><stop offset=".5" stop-color="#36dfff"/><stop offset="1" stop-color="#1b2470"/></radialGradient>
    <filter id="{u}glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="{u}soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="6"/></filter>
    <clipPath id="{u}clip"><path d="M52 150C70 118 150 90 275 90C405 90 494 116 494 150C494 184 405 210 275 210C150 210 70 182 52 150Z"/></clipPath>
  </defs>
  <g class="ship">
    <g transform="rotate(-9 280 150)">
      <path class="beam" d="M492 146L560 112L560 196L492 156Z" fill="url(#{u}beam)"/>
      <ellipse class="exh" cx="40" cy="150" rx="46" ry="22" fill="url(#{u}exh)"/>
      <path d="M96 118L50 66L88 68L146 110Z" fill="url(#{u}fin)" ${OUT} stroke-width="3"/>
      <path d="M96 182L50 234L88 232L146 190Z" fill="url(#{u}fin)" ${OUT} stroke-width="3"/>
      <path d="M52 150C70 118 150 90 275 90C405 90 494 116 494 150C494 184 405 210 275 210C150 210 70 182 52 150Z" fill="url(#{u}hull)" ${OUT} stroke-width="3.5"/>
      <g clip-path="url(#{u}clip)" fill="none">
        <g stroke="#fff" stroke-opacity=".13" stroke-width="2">
          <path d="M140 92Q154 150 140 208"/><path d="M200 90Q216 150 200 210"/><path d="M350 90Q366 150 350 210"/><path d="M410 92Q426 150 410 208"/><path d="M460 100Q474 150 460 200"/>
          <path d="M60 128C160 104 400 104 492 128"/><path d="M60 172C160 196 400 196 492 172"/>
        </g>
        <ellipse cx="290" cy="104" rx="170" ry="9" fill="#fff" opacity=".34" filter="url(#{u}soft)"/>
        <path d="M52 186C150 214 400 214 494 186V230H52Z" fill="#05021a" opacity=".38"/>
      </g>
      <path d="M86 184C190 206 390 206 482 176" fill="none" stroke="#63f4ff" stroke-width="2.6" filter="url(#{u}glow)" class="neon"/>
      <rect x="160" y="121" width="250" height="58" rx="13" fill="url(#{u}band)" stroke="#63f4ff" stroke-opacity=".55" stroke-width="1.5"/>
      <text x="285" y="157" text-anchor="middle" class="relay-word" font-size="41" fill="#f6f0ff" stroke="#ff42d0" stroke-width="1.2" paint-order="stroke" filter="url(#{u}glow)">CLANKER</text>
      <text x="287" y="174" text-anchor="middle" class="relay-sub" font-size="13.5" fill="#63f4ff" letter-spacing="9">RELAY</text>
      <path d="M494 150m-12 -30a42 42 0 0 1 0 60" fill="none" stroke="#63f4ff" stroke-opacity=".5" stroke-width="2"/>
      <circle cx="486" cy="150" r="9" fill="url(#{u}nose)" ${OUT} stroke-width="2.5"/>
      <g class="gondola">
        <path d="M250 207L258 196M318 207L310 196" stroke="#10132e" stroke-width="3"/>
        <rect x="236" y="205" width="96" height="26" rx="11" fill="#170c40" ${OUT} stroke-width="3"/>
        <g fill="#63f4ff" filter="url(#{u}glow)">
          <rect class="win" x="249" y="214" width="10" height="8" rx="2"/><rect class="win" x="265" y="214" width="10" height="8" rx="2"/>
          <rect class="win" x="281" y="214" width="10" height="8" rx="2"/><rect class="win" x="297" y="214" width="10" height="8" rx="2"/>
          <rect class="win" x="313" y="214" width="10" height="8" rx="2"/>
        </g>
      </g>
      <g class="pod">
        <ellipse cx="132" cy="210" rx="22" ry="10" fill="url(#{u}hull)" ${OUT} stroke-width="3"/>
        <ellipse class="prop" cx="106" cy="210" rx="3.5" ry="17" fill="#d9ccff" opacity=".85"/>
        <circle cx="108" cy="210" r="3.5" fill="#ff42d0"/>
      </g>
      <g class="antenna">
        <path d="M300 92V62" stroke="#10132e" stroke-width="3"/>
        <circle class="beacon" cx="300" cy="60" r="5" fill="#ff42d0" filter="url(#{u}glow)"/>
        <g fill="none" stroke="#63f4ff" stroke-width="2.4" stroke-linecap="round">
          <path class="wave w1" d="M290 50a14 14 0 0 1 20 0"/><path class="wave w2" d="M283 43a24 24 0 0 1 34 0"/><path class="wave w3" d="M276 36a34 34 0 0 1 48 0"/>
        </g>
      </g>
    </g>
  </g>
</svg>`;

  /* ---------- the astronaut (same outline style as the launch rocket) ---------- */
  const ASTRO = `<svg viewBox="0 0 260 260" focusable="false">
  <defs>
    <linearGradient id="{u}suit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#e8e0f5"/><stop offset="1" stop-color="#b9a6ff"/></linearGradient>
    <linearGradient id="{u}visor" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#63f4ff"/><stop offset=".35" stop-color="#1b2470"/><stop offset=".75" stop-color="#3b1680"/><stop offset="1" stop-color="#ff42d0"/>
    </linearGradient>
    <filter id="{u}glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g class="astro">
    <path class="tether" d="M118 178C80 200 40 182 30 214C22 238 48 250 70 240" fill="none" stroke="#c9d2f0" stroke-opacity=".45" stroke-width="2.5" stroke-dasharray="6 6"/>
    <g transform="rotate(-14 130 140)">
      <rect x="84" y="104" width="30" height="80" rx="11" fill="#c4b3ff" ${OUT} stroke-width="3"/>
      <g fill="none" stroke-linecap="round">
        <path d="M108 122C88 114 76 100 70 82" stroke="#10132e" stroke-width="27"/><path d="M108 122C88 114 76 100 70 82" stroke="url(#{u}suit)" stroke-width="21"/>
        <path d="M178 126C196 136 204 152 208 168" stroke="#10132e" stroke-width="27"/><path d="M178 126C196 136 204 152 208 168" stroke="url(#{u}suit)" stroke-width="21"/>
        <path d="M126 186C122 204 114 218 104 234" stroke="#10132e" stroke-width="29"/><path d="M126 186C122 204 114 218 104 234" stroke="url(#{u}suit)" stroke-width="23"/>
        <path d="M158 186C166 202 178 212 192 222" stroke="#10132e" stroke-width="29"/><path d="M158 186C166 202 178 212 192 222" stroke="url(#{u}suit)" stroke-width="23"/>
      </g>
      <circle cx="68" cy="78" r="11" fill="#a855f7" ${OUT} stroke-width="3"/>
      <circle cx="209" cy="172" r="11" fill="#a855f7" ${OUT} stroke-width="3"/>
      <rect x="88" y="226" width="30" height="20" rx="8" fill="#6d28d9" ${OUT} stroke-width="3" transform="rotate(28 103 236)"/>
      <rect x="182" y="214" width="30" height="20" rx="8" fill="#6d28d9" ${OUT} stroke-width="3" transform="rotate(38 197 224)"/>
      <path d="M104 122C102 108 114 100 128 100H158C172 100 182 110 180 124L176 178C175 188 166 194 156 194H122C112 194 104 187 104 177Z" fill="url(#{u}suit)" ${OUT} stroke-width="3.5"/>
      <rect x="104" y="170" width="74" height="10" rx="4" fill="#a855f7" ${OUT} stroke-width="2.5"/>
      <rect x="126" y="128" width="36" height="24" rx="5" fill="#2a2f55" ${OUT} stroke-width="2.5"/>
      <circle class="led l1" cx="135" cy="140" r="3.4" fill="#63f4ff" filter="url(#{u}glow)"/>
      <circle class="led l2" cx="144" cy="140" r="3.4" fill="#ff42d0" filter="url(#{u}glow)"/>
      <circle class="led l3" cx="153" cy="140" r="3.4" fill="#ffc861" filter="url(#{u}glow)"/>
      <path d="M152 40V24" stroke="#10132e" stroke-width="3"/>
      <circle class="led l2" cx="152" cy="21" r="4.5" fill="#ff42d0" filter="url(#{u}glow)"/>
      <circle cx="144" cy="80" r="46" fill="url(#{u}suit)" ${OUT} stroke-width="3.5"/>
      <rect x="110" y="56" width="70" height="52" rx="24" fill="url(#{u}visor)" ${OUT} stroke-width="3"/>
      <path d="M122 70C126 64 134 61 142 61" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="4" stroke-linecap="round"/>
      <path d="M160 96C166 94 170 90 172 85" fill="none" stroke="#63f4ff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

  /* ---------- empty states ---------- */
  const PLANET = (x, y, r) => `<g class="e-planet">
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#{u}pl)"/>
      <path d="M${x - r * 1.75} ${y + r * 0.18}A${r * 1.8} ${r * 0.48} -14 1 0 ${x + r * 1.75} ${y - r * 0.18}" fill="none" stroke="#c9b8ff" stroke-opacity=".75" stroke-width="2.4"/>
    </g>`;
  const SPARK = (x, y, s, c) => `<path class="spark" d="M${x} ${y - s}C${x + s * 0.15} ${y - s * 0.15} ${x + s * 0.15} ${y - s * 0.15} ${x + s} ${y}C${x + s * 0.15} ${y + s * 0.15} ${x + s * 0.15} ${y + s * 0.15} ${x} ${y + s}C${x - s * 0.15} ${y + s * 0.15} ${x - s * 0.15} ${y + s * 0.15} ${x - s} ${y}C${x - s * 0.15} ${y - s * 0.15} ${x - s * 0.15} ${y - s * 0.15} ${x} ${y - s}Z" fill="${c}"/>`;
  const ROCK = (x, y, s, rot) => `<path class="e-rock" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M-10 -4L-4 -11L7 -9L11 0L6 9L-5 10L-11 3Z" fill="#1a1430" stroke="#ff5ce1" stroke-opacity=".7" stroke-width="${1.6 / s}"/>`;
  const DEFS = `<defs>
    <radialGradient id="{u}pl" cx=".35" cy=".3"><stop offset="0" stop-color="#b8fbff"/><stop offset=".45" stop-color="#2aa6d8"/><stop offset="1" stop-color="#1b1460"/></radialGradient>
    <linearGradient id="{u}fA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7" stop-opacity=".55"/><stop offset="1" stop-color="#3b1680" stop-opacity=".35"/></linearGradient>
    <linearGradient id="{u}fB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff42d0" stop-opacity=".45"/><stop offset="1" stop-color="#6b22e8" stop-opacity=".3"/></linearGradient>
    <linearGradient id="{u}fC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a6e" stop-opacity=".95"/><stop offset="1" stop-color="#120a36" stop-opacity=".95"/></linearGradient>
    <filter id="{u}glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
  const FOLDER = (x, y, fill, stroke) => `<path d="M${x} ${y + 10}a10 10 0 0 1 10 -10h38l12 12h72a10 10 0 0 1 10 10v74a10 10 0 0 1 -10 10h-122a10 10 0 0 1 -10 -10z" fill="${fill}" stroke="${stroke}" stroke-width="2.2" filter="url(#{u}glow)"/>`;
  const INBOX = `<svg viewBox="0 0 320 220" focusable="false">${DEFS}
    ${PLANET(250, 62, 30)}
    ${ROCK(54, 168, 1.3, 20)}${ROCK(282, 172, 0.9, -30)}${ROCK(36, 70, 0.7, 60)}
    <g class="e-float">
      <g transform="rotate(-10 150 120)">${FOLDER(84, 64, "url(#{u}fB)", "#ff5ce1")}</g>
      <g transform="rotate(-3 150 120)">
        ${FOLDER(92, 70, "url(#{u}fA)", "#a77bff")}
        <rect x="112" y="58" width="88" height="62" rx="6" fill="#e9e3ff" fill-opacity=".9" stroke="#10132e" stroke-width="2"/>
        <path d="M124 74h52M124 86h64M124 98h40" stroke="#6d28d9" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g transform="rotate(4 150 130)">${FOLDER(100, 92, "url(#{u}fC)", "#63f4ff")}
        <path d="M118 150h70" stroke="#63f4ff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>
    ${SPARK(70, 40, 7, "#63f4ff")}${SPARK(214, 120, 5, "#ff9ae6")}${SPARK(292, 120, 6, "#fff")}${SPARK(40, 120, 4, "#c4b3ff")}
  </svg>`;
  const PICK = `<svg viewBox="0 0 320 220" focusable="false">${DEFS}
    ${PLANET(258, 58, 26)}
    ${ROCK(48, 170, 1.1, 10)}${ROCK(276, 176, 1.2, -40)}${ROCK(30, 60, 0.6, 50)}
    <g class="e-float">
      <rect x="92" y="50" width="150" height="112" rx="14" fill="url(#{u}fB)" stroke="#ff5ce1" stroke-width="2" transform="rotate(8 167 106)" filter="url(#{u}glow)"/>
      <g transform="rotate(-6 150 116)">
        <rect x="74" y="58" width="160" height="116" rx="14" fill="url(#{u}fC)" stroke="#a77bff" stroke-width="2.2" filter="url(#{u}glow)"/>
        <circle cx="114" cy="104" r="22" fill="#2a1a6e" stroke="#63f4ff" stroke-width="2.2"/>
        <circle cx="114" cy="98" r="8" fill="#63f4ff" fill-opacity=".85"/>
        <path d="M100 118a15 12 0 0 1 28 0" fill="#63f4ff" fill-opacity=".85"/>
        <path d="M148 92h62M148 106h48M148 120h56" stroke="#c4b3ff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>
        <path d="M92 146h124" stroke="#ff5ce1" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>
      </g>
    </g>
    ${SPARK(64, 34, 7, "#ff9ae6")}${SPARK(222, 26, 5, "#63f4ff")}${SPARK(296, 112, 6, "#fff")}${SPARK(46, 120, 4, "#c4b3ff")}
  </svg>`;
  /* little ringed planet used next to headings */
  const MARK = `<svg viewBox="0 0 48 48" focusable="false">
    <defs><radialGradient id="{u}m" cx=".35" cy=".3"><stop offset="0" stop-color="#ffd6fb"/><stop offset=".5" stop-color="#c13cff"/><stop offset="1" stop-color="#3b1680"/></radialGradient></defs>
    <circle cx="24" cy="24" r="11" fill="url(#{u}m)"/>
    <path d="M5 30C1 34 1 37 3 38c3 2 13-2 23-10S43 13 42 10c-1-2-5-1-9 1" fill="none" stroke="#63f4ff" stroke-width="3" stroke-linecap="round"/>
  </svg>`;

  window.EG_ART = {
    relay: () => make(RELAY, "art-relay"),
    astronaut: () => make(ASTRO, "art-astro"),
    inbox: () => make(INBOX, "art-empty"),
    pick: () => make(PICK, "art-empty"),
    mark: () => make(MARK, "art-mark")
  };
})();
