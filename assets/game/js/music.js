/* The soundtrack: procedural and adaptive. Every Sin has a theme with two arrangements (its chapter
   and its boss fight), plus the menu theme. All of it plays on one small fixed graph of voices that
   are built once (a bass synth, a pad, two arps, a lead, and a drum kit); a note is just a few
   AudioParam changes, so music creates no audio nodes while it plays. That keeps it cheap even on slow
   machines.

   Intensity: 0 calm (pad + arp), 1 combat (+ drums + bass), 2 high threat (fuller drums, open filters),
   3 boss (the boss arrangement + its lead), 4 boss phase two (distortion, double hats, lead up an
   octave, fills). Themes change on a bar line so it never cuts mid-phrase. */

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

// Patterns are 16 steps (one bar of 16ths). Drums: X accent, x hit, g ghost, . rest.
// Bass: a digit is a scale degree above the bar's chord root ('7' = octave), - holds, . rest.
// Lead: space-separated tokens, one per 16th over two bars: a scale degree from the key's root
// (negative = below, + adds an octave), - holds, . rest.
const THEMES = {
  menu: {
    chapter: {
      bpm: 104, root: 45, scale: "minor", prog: [0, 5, 6, 4], swing: 0,
      pad: { type: "sawtooth", cutoff: 1100, gain: 0.045 },
      arp: { type: "triangle", notes: [0, 2, 4, 7, 4, 2], every: 2, oct: 2, cutoff: 2600, gain: 0.05 },
      bass: { type: "sawtooth", type2: "square", cutoff: 380, env: 900, gain: 0.2, pat: "0.0.7.0.0.0.7.0." },
      kit: "punch",
      drums: { kick: "x.......x.......", snare: "....x.......x...", hat: "..x...x...x...x." },
    },
  },
  sloth: {
    chapter: {
      bpm: 82, root: 38, scale: "dorian", prog: [0, 3, 0, 4], swing: 0.16,
      pad: { type: "triangle", cutoff: 900, gain: 0.06, detune: 14 },
      arp: { type: "sine", notes: [0, 4, 2, 6, 4, 2], every: 2, oct: 2, cutoff: 2000, gain: 0.06, vib: 6 },
      bass: { type: "sine", type2: "sine", cutoff: 300, env: 200, gain: 0.34, glide: 0.06, drive: 0.35, pat: "0-------0-----4-" },
      kit: "808",
      drums: { kick: "x......x..x.....", snare: "........x.......", hat: "x.x.x.x.x.x.x.xg" },
    },
    boss: {
      bpm: 140, root: 38, scale: "phrygian", prog: [0, 0, 1, 6], swing: 0.06,
      pad: { type: "sawtooth", cutoff: 700, gain: 0.05, detune: 18 },
      arp: { type: "sine", notes: [0, 2, 4, 2], every: 4, oct: 2, cutoff: 1800, gain: 0.05 },
      bass: { type: "sine", type2: "sine", cutoff: 260, env: 160, gain: 0.42, glide: 0.09, drive: 0.55, pat: "0-----0---0-4-1-" },
      lead: { type: "sine", type2: "triangle", gain: 0.11, vib: 9, glide: 0.08, cutoff: 2400,
        mel: "4 - - - 3 - 1 - 0 - - - - - . . 4 - - - 3 - 1 - 2 - - - 1 - 0 -" },
      kit: "808",
      drums: { kick: "x......x..x...x.", snare: "........X.......", hat: "x.x.x.xxx.x.x.xx", ohat: ".............x.." },
    },
  },
  glutton: {
    chapter: {
      bpm: 126, root: 40, scale: "phrygian", prog: [0, 0, 1, 0], swing: 0,
      pad: { type: "sawtooth", cutoff: 650, gain: 0.04 },
      arp: { type: "square", notes: [0, 0, 1, 0, 7, 0, 1, 3], every: 1, oct: 2, cutoff: 1500, gain: 0.035 },
      bass: { type: "sawtooth", type2: "sawtooth", cutoff: 300, env: 1400, gain: 0.22, drive: 0.5, pat: "0.00.00.0.00.0.0" },
      kit: "hard",
      drums: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.", perc: "...x..x....x..x." },
    },
    boss: {
      bpm: 132, root: 40, scale: "phrygian", prog: [0, 0, 1, 5], swing: 0,
      pad: { type: "sawtooth", cutoff: 800, gain: 0.04 },
      arp: { type: "square", notes: [0, 1, 0, 7, 0, 3, 1, 0], every: 1, oct: 2, cutoff: 2200, gain: 0.035 },
      bass: { type: "sawtooth", type2: "square", cutoff: 340, env: 2000, gain: 0.24, drive: 0.75, pat: "0000.000.00.0010" },
      lead: { type: "sawtooth", type2: "square", gain: 0.07, cutoff: 1800, glide: 0.02,
        mel: "7 . 7 . 8 - 7 . 5 - 4 - 3 - 1 - 7 . 7 . 8 - 10 - 8 - 7 - 5 - 4 -" },
      kit: "hard",
      drums: { kick: "x..xx...x..x.x..", snare: "....X.......X...", hat: "xxxxxxxxxxxxxxxx", perc: "...x..x..x.x..x." },
    },
  },
  // Greed: a dark, extravagant casino in space, run by someone very rich and very dangerous.
  // G harmonic minor (the augmented second between E♭ and F♯ is the villain's smile); the swing
  // stays, slower and more confident; "vault" drums ring like coins on steel. The chapter is a lounge
  // after hours (low arpeggio, sub bass, no stabs); the boss is the same room with the lights off
  // (driving bass, dark stabs, a cat-and-mouse lead built on that augmented second).
  greed: {
    chapter: {
      bpm: 96, root: 43, scale: "harmonic", prog: [0, 5, 4, 0], swing: 0.14,
      pad: { type: "sawtooth", type2: "triangle", cutoff: 900, gain: 0.05, detune: 12, attack: 0.3 },
      arp: { type: "triangle", notes: [0, 2, 4, 6, 4, 2], every: 2, oct: 2, cutoff: 2000, gain: 0.04 },
      bass: { type: "sine", type2: "sawtooth", cutoff: 360, env: 420, gain: 0.22, glide: 0.035, pat: "0-----0.4---3-2-" },
      kit: "vault",
      drums: { kick: "x.......x..x....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.xg", perc: "..x.......x....." },
    },
    boss: {
      bpm: 112, root: 43, scale: "harmonic", prog: [0, 5, 1, 4], swing: 0.08,
      pad: { type: "sawtooth", cutoff: 1400, gain: 0.058, detune: 14, stab: "x.....x...x....." },
      arp: { type: "triangle", notes: [0, 4, 7, 6, 4, 2], every: 1, oct: 2, cutoff: 2200, gain: 0.026 },
      bass: { type: "sawtooth", type2: "square", cutoff: 420, env: 1400, gain: 0.21, drive: 0.45, glide: 0.02, pat: "0.00.0.00.0.00.3" },
      lead: { type: "sawtooth", type2: "square", gain: 0.07, cutoff: 2000, glide: 0.03, vib: 4,
        mel: "4 - - 5 4 - 2 - 6 - - - 7 - - - 4 - - 5 4 - 2 - 1 - 2 - 6 - - -" },
      kit: "vault",
      drums: { kick: "x.....x.x.....x.", snare: "....X.......X...", hat: "x.xxx.x.x.xxx.x.", ohat: "..x...x...x...x.", perc: "..x...x...x..x.x" },
    },
  },
  lust: {
    chapter: {
      bpm: 100, root: 42, scale: "minor", prog: [0, 5, 2, 6], swing: 0,
      pad: { type: "sawtooth", cutoff: 1300, gain: 0.055, detune: 16 },
      arp: { type: "sawtooth", notes: [0, 2, 4, 2, 7, 4, 2, 4], every: 1, oct: 2, cutoff: 1700, gain: 0.03 },
      bass: { type: "sawtooth", type2: "square", cutoff: 500, env: 900, gain: 0.2, pat: "0.7.0.7.0.7.0.7." },
      kit: "punch",
      drums: { kick: "x.x.....x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
    },
    boss: {
      bpm: 108, root: 42, scale: "harmonic", prog: [0, 5, 3, 4], swing: 0,
      pad: { type: "sawtooth", cutoff: 1500, gain: 0.055, detune: 20 },
      arp: { type: "sawtooth", notes: [0, 2, 4, 7, 4, 2], every: 1, oct: 2, cutoff: 2200, gain: 0.03 },
      bass: { type: "sawtooth", type2: "square", cutoff: 560, env: 1200, gain: 0.22, pat: "0.7.0.7.0.7.4.7." },
      lead: { type: "square", type2: "sawtooth", gain: 0.07, vib: 5, cutoff: 2600, glide: 0.04,
        mel: "7 - - 6 4 - 2 - 4 - - - . . 6 - 7 - - 9 8 - 7 - 6 - - - 4 - . ." },
      kit: "punch",
      drums: { kick: "x.x.....x.x...x.", snare: "....X.......X...", hat: "x.xxx.x.x.xxx.x.", ohat: "..............x." },
    },
  },
  wrath: {
    chapter: {
      bpm: 170, root: 36, scale: "minor", prog: [0, 0, 5, 4], swing: 0,
      pad: { type: "sawtooth", cutoff: 900, gain: 0.04 },
      arp: { type: "square", notes: [0, 7, 3, 7], every: 2, oct: 2, cutoff: 1400, gain: 0.03 },
      bass: { type: "sawtooth", type2: "sawtooth", cutoff: 420, env: 600, gain: 0.22, reese: 22, pat: "0-------0-----3-" },
      kit: "hard",
      drums: { kick: "x.........x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
    },
    boss: {
      bpm: 174, root: 36, scale: "minor", prog: [0, 0, 5, 6], swing: 0,
      pad: { type: "sawtooth", cutoff: 1000, gain: 0.04 },
      arp: { type: "square", notes: [0, 3, 7, 10], every: 1, oct: 2, cutoff: 1800, gain: 0.025 },
      bass: { type: "sawtooth", type2: "sawtooth", cutoff: 480, env: 900, gain: 0.24, reese: 26, drive: 0.5, pat: "0-------0---3-4-" },
      lead: { type: "sawtooth", type2: "square", gain: 0.07, cutoff: 3000, glide: 0.015,
        mel: "7 - 7 - 10 - 7 - 6 - 5 - 3 - 5 - 7 - 7 - 10 - 12 - 10 - 8 - 7 - - -" },
      kit: "hard",
      drums: { kick: "x.x.......xx....", snare: "....X..g.g..X..g", hat: "xxxxxxxxxxxxxxxx" },
    },
  },
  pride: {
    chapter: {
      bpm: 92, root: 46, scale: "harmonic", prog: [0, 5, 3, 4], swing: 0,
      pad: { type: "triangle", type2: "sawtooth", cutoff: 1800, gain: 0.065, attack: 0.25 },
      arp: { type: "triangle", notes: [0, 2, 4, 7, 9, 7, 4, 2], every: 1, oct: 2, cutoff: 3000, gain: 0.035 },
      bass: { type: "sawtooth", type2: "triangle", cutoff: 360, env: 300, gain: 0.2, pat: "0-------4-------" },
      kit: "epic",
      drums: { tom: "x.......x.x.....", snare: "............x...", hat: "x...x...x...x..." },
    },
    boss: {
      bpm: 100, root: 46, scale: "harmonic", prog: [0, 3, 5, 4], swing: 0,
      pad: { type: "triangle", type2: "sawtooth", cutoff: 2200, gain: 0.07, attack: 0.2 },
      arp: { type: "triangle", notes: [0, 4, 7, 4], every: 1, oct: 2, cutoff: 3200, gain: 0.03 },
      bass: { type: "sawtooth", type2: "square", cutoff: 420, env: 500, gain: 0.22, pat: "0---0-7-0---4-4-" },
      lead: { type: "sawtooth", type2: "sawtooth", gain: 0.08, cutoff: 2000, attack: 0.04, glide: 0.03,
        mel: "0 - - 4 7 - - - 6 - 7 - 8 - - - 7 - - 4 7 - 9 - 8 - - 7 6 - 4 -" },
      kit: "epic",
      drums: { kick: "x.......x.......", tom: "x.......x.x.x...", snare: "....x...x.xx.xxx", hat: "x.x.x.x.x.x.x.x." },
    },
  },
  envy: {
    chapter: {
      bpm: 140, root: 47, scale: "phrygian", prog: [0, 1, 0, 6], swing: 0,
      pad: { type: "sawtooth", cutoff: 1000, gain: 0.045, detune: 22 },
      arp: { type: "square", notes: [0, 2, 4, 7, 4, 2], every: 1, oct: 2, cutoff: 2000, gain: 0.028, mirror: true },
      bass: { type: "square", type2: "sawtooth", cutoff: 420, env: 1200, gain: 0.2, pat: "0.0.0.0.1.0.0.7." },
      kit: "hard",
      drums: { kick: "x..x..x...x..x..", snare: "....x.......x...", hat: "xxx.x.xxx.x.x.xx" },
    },
    boss: {
      bpm: 150, root: 47, scale: "harmonic", prog: [0, 1, 5, 4], swing: 0,
      pad: { type: "sawtooth", cutoff: 1200, gain: 0.045, detune: 26 },
      arp: { type: "square", notes: [0, 4, 7, 11, 7, 4], every: 1, oct: 2, cutoff: 2600, gain: 0.028, mirror: true },
      bass: { type: "sawtooth", type2: "square", cutoff: 460, env: 1600, gain: 0.23, drive: 0.4, pat: "0.0.0.0.1.0.4.7." },
      // Envy's lead steals: it cycles through every boss's melody, in its own key
      lead: { type: "square", type2: "sawtooth", gain: 0.07, cutoff: 2600, glide: 0.02, steal: true,
        mel: "7 - 6 - 4 - 1 - 0 - - - 1 - 4 - 7 - 8 - 7 - 4 - 6 - - - 4 - - -" },
      kit: "hard",
      drums: { kick: "x..x..x...x..x.x", snare: "....X.......X...", hat: "xxx.x.xxx.x.xxxx", ohat: "...x.......x...." },
    },
  },
};
const STEAL_ORDER = ["sloth", "glutton", "greed", "lust", "wrath", "pride"];

// Patterns are parsed once here, so the sequencer only reads arrays while it plays.
for (const id in THEMES) {
  for (const part in THEMES[id]) {
    const th = THEMES[id][part];
    for (const k in th.drums) th.drums[k] = (th.drums[k] || "").padEnd(16, ".").slice(0, 16);
    th.bass.pat = th.bass.pat.padEnd(16, ".").slice(0, 16);
    if (th.pad.stab) th.pad.stab = th.pad.stab.padEnd(16, ".").slice(0, 16);
    if (th.lead) th.lead.toks = th.lead.mel.trim().split(/\s+/);
  }
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function degree(scale, d) {
  const s = SCALES[scale] || SCALES.minor;
  const o = Math.floor(d / 7);
  return s[((d % 7) + 7) % 7] + 12 * o;
}
function curve(drive) {
  const n = 512, c = new Float32Array(n), k = 1 + drive * 30;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

export function createMusic(ctx, bus, noiseBuf) {
  let built = false, on = false;
  let N = null;                        // the voice graph
  let theme = THEMES.menu.chapter, themeId = "menu", part = "chapter";
  let want = { id: "menu", part: "chapter" };
  let intensity = 0, nextIntensity = 0;
  let step = 0, nextTime = 0, timer = 0;
  const curves = new Map();

  function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f || 110; o.start(); return o; }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function filter(type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; return b; }
  function pan(p) { if (!ctx.createStereoPanner) return gain(1); const s = ctx.createStereoPanner(); s.pan.value = p; return s; }

  function build() {
    const n = {};
    // master: voices -> mix -> duck filter -> bus (the music volume)
    n.mix = gain(1);
    n.duck = filter("lowpass", 20000, 0.5);
    n.mix.connect(n.duck); n.duck.connect(bus);
    n.pump = gain(1);                 // sidechain: the kick ducks the bass and pad
    n.pump.connect(n.mix);
    // delay for leads + arps (dotted eighth)
    n.delay = ctx.createDelay(1.5);
    n.fb = gain(0.32); n.wet = gain(0.22);
    n.delay.connect(n.fb); n.fb.connect(n.delay); n.delay.connect(n.wet); n.wet.connect(n.mix);
    // bass: two oscillators -> lowpass -> drive -> amp
    n.b1 = osc("sawtooth"); n.b2 = osc("square");
    n.bFilt = filter("lowpass", 400, 4);
    n.bDrive = ctx.createWaveShaper();
    n.bAmp = gain(0);
    n.b1.connect(n.bFilt); n.b2.connect(n.bFilt); n.bFilt.connect(n.bDrive); n.bDrive.connect(n.bAmp); n.bAmp.connect(n.pump);
    // pad: three chord tones, two oscillators each
    n.pFilt = filter("lowpass", 1100, 0.8);
    n.pAmp = gain(0);
    n.pFilt.connect(n.pAmp); n.pAmp.connect(n.pump);
    n.pad = [];
    for (let i = 0; i < 3; i++) {
      const a = osc("sawtooth"), b = osc("sawtooth");
      a.connect(n.pFilt); b.connect(n.pFilt);
      n.pad.push([a, b]);
    }
    // arps (the second one mirrors the first on the other side, for Envy)
    n.a1 = osc("triangle"); n.aFilt = filter("lowpass", 2400, 2); n.aAmp = gain(0); n.aPan = pan(-0.35);
    n.a1.connect(n.aFilt); n.aFilt.connect(n.aAmp); n.aAmp.connect(n.aPan); n.aPan.connect(n.mix); n.aAmp.connect(n.delay);
    n.a2 = osc("triangle"); n.a2Amp = gain(0); n.a2Pan = pan(0.45);
    n.a2.connect(n.a2Amp); n.a2Amp.connect(n.a2Pan); n.a2Pan.connect(n.mix);
    // lead: two oscillators + vibrato
    n.l1 = osc("sawtooth"); n.l2 = osc("square");
    n.lfo = osc("sine", 5.5); n.lfoAmt = gain(0);
    n.lfo.connect(n.lfoAmt); n.lfoAmt.connect(n.l1.frequency); n.lfoAmt.connect(n.l2.frequency);
    n.lFilt = filter("lowpass", 2400, 1.5); n.lAmp = gain(0);
    n.l1.connect(n.lFilt); n.l2.connect(n.lFilt); n.lFilt.connect(n.lAmp); n.lAmp.connect(n.mix); n.lAmp.connect(n.delay);
    // drums: kick (a pitched sine), snare (noise + body), hats, toms, perc, crash, riser
    n.kick = osc("sine", 50); n.kAmp = gain(0); n.kick.connect(n.kAmp); n.kAmp.connect(n.mix);
    n.noise = ctx.createBufferSource(); n.noise.buffer = noiseBuf; n.noise.loop = true; n.noise.start();
    n.sF = filter("bandpass", 1800, 0.9); n.sAmp = gain(0); n.noise.connect(n.sF); n.sF.connect(n.sAmp); n.sAmp.connect(n.mix);
    n.sBody = osc("triangle", 190); n.sbAmp = gain(0); n.sBody.connect(n.sbAmp); n.sbAmp.connect(n.mix);
    n.hF = filter("highpass", 7200, 0.8); n.hAmp = gain(0); n.noise.connect(n.hF); n.hF.connect(n.hAmp); n.hAmp.connect(n.mix);
    n.tom = osc("sine", 90); n.tAmp = gain(0); n.tom.connect(n.tAmp); n.tAmp.connect(n.mix);
    n.perc = osc("square", 800); n.pcF = filter("bandpass", 2400, 6); n.pcAmp = gain(0); n.perc.connect(n.pcF); n.pcF.connect(n.pcAmp); n.pcAmp.connect(n.mix);
    n.cF = filter("highpass", 3500, 0.5); n.cAmp = gain(0); n.noise.connect(n.cF); n.cF.connect(n.cAmp); n.cAmp.connect(n.mix);
    n.rF = filter("bandpass", 400, 3); n.rAmp = gain(0); n.noise.connect(n.rF); n.rF.connect(n.rAmp); n.rAmp.connect(n.mix);
    N = n;
    built = true;
    applyTheme(ctx.currentTime);
  }

  function destroy() {
    if (!N) return;
    const n = N;
    N = null;
    built = false;
    try { n.duck.disconnect(); } catch (e) { /* ignore */ }
    for (const k in n) { const v = n[k]; try { if (v && v.stop) v.stop(); } catch (e) { /* not started */ } }
    for (const pair of n.pad) for (const o of pair) { try { o.stop(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- theme setup
  function applyTheme(t) {
    const n = N, th = theme;
    n.b1.type = th.bass.type; n.b2.type = th.bass.type2 || th.bass.type;
    n.b2.detune.setValueAtTime(th.bass.reese || 7, t);
    n.bFilt.Q.setValueAtTime(th.bass.reese ? 2 : 4, t);
    setDrive(th.bass.drive || 0);
    n.pFilt.frequency.setTargetAtTime(th.pad.cutoff, t, 0.2);
    for (const [a, b] of n.pad) {
      a.type = th.pad.type; b.type = th.pad.type2 || th.pad.type;
      b.detune.setValueAtTime(th.pad.detune || 9, t); a.detune.setValueAtTime(-(th.pad.detune || 9), t);
    }
    n.a1.type = th.arp.type; n.a2.type = th.arp.type;
    if (th.lead) { n.l1.type = th.lead.type; n.l2.type = th.lead.type2 || th.lead.type; n.l2.detune.setValueAtTime(8, t); }
    n.delay.delayTime.setTargetAtTime(Math.min(1.4, (60 / th.bpm) * 0.75), t, 0.05);
  }
  function setDrive(d) {
    if (!N) return;
    if (d <= 0.01) { N.bDrive.curve = null; return; }
    const key = Math.round(d * 20);
    if (!curves.has(key)) curves.set(key, curve(key / 20));
    N.bDrive.curve = curves.get(key);
  }

  // ---------------------------------------------------------------- notes
  function env(p, t, peak, attack, decayTc, sustain) {
    p.cancelScheduledValues(t - 0.006);
    p.setTargetAtTime(0, t - 0.006, 0.0015);
    p.setTargetAtTime(peak, t, attack);
    p.setTargetAtTime(peak * sustain, t + attack * 3, decayTc);
  }
  function release(p, t, tc) { p.setTargetAtTime(0, t, tc); }

  function pitch(o, f, t, glide) {
    o.frequency.cancelScheduledValues(t - 0.006);
    if (glide) o.frequency.setTargetAtTime(f, t, glide); else o.frequency.setValueAtTime(f, t);
  }
  function bassNote(t, f, dur, vel) {
    const n = N, b = theme.bass;
    pitch(n.b1, f, t, b.glide);
    pitch(n.b2, f, t, b.glide);
    n.bFilt.frequency.cancelScheduledValues(t - 0.006);
    n.bFilt.frequency.setValueAtTime(b.cutoff + b.env * vel * (intensity >= 4 ? 1.4 : 1), t);
    n.bFilt.frequency.setTargetAtTime(b.cutoff, t, 0.09);
    env(n.bAmp.gain, t, b.gain * vel, 0.004, 0.25, b.type === "sine" ? 0.9 : 0.55);
    release(n.bAmp.gain, t + dur, 0.04);
  }
  function arpNote(t, f, vel, which) {
    const n = N, a = theme.arp;
    const o = which ? n.a2 : n.a1, amp = which ? n.a2Amp : n.aAmp;
    o.frequency.setValueAtTime(f, t);
    if (a.vib) o.frequency.setTargetAtTime(f * 1.004, t + 0.05, 0.1);
    if (!which) {
      n.aFilt.frequency.cancelScheduledValues(t - 0.006);
      n.aFilt.frequency.setValueAtTime(a.cutoff * (intensity >= 2 ? 1.5 : 1), t);
      n.aFilt.frequency.setTargetAtTime(a.cutoff * 0.5, t, 0.08);
    }
    env(amp.gain, t, a.gain * vel, 0.003, 0.06, 0.25);
  }
  function leadNote(t, f, dur, vel) {
    const n = N, l = theme.lead;
    pitch(n.l1, f, t, l.glide);
    pitch(n.l2, f, t, l.glide);
    n.lfoAmt.gain.setTargetAtTime(l.vib ? f * 0.006 * (l.vib / 5) : f * 0.003, t + 0.12, 0.15);
    n.lFilt.frequency.setTargetAtTime(l.cutoff * (intensity >= 4 ? 1.4 : 1), t, 0.02);
    env(n.lAmp.gain, t, l.gain * vel, l.attack || 0.006, 0.4, 0.7);
    release(n.lAmp.gain, t + dur, 0.06);
  }
  function chord(t, rootDeg) {
    const n = N, th = theme;
    for (let i = 0; i < 3; i++) {
      const f = midi(th.root + 12 + degree(th.scale, rootDeg + i * 2));
      for (const o of n.pad[i]) o.frequency.setTargetAtTime(f, t, 0.03);
    }
  }
  function padLevel(t, level) {
    const p = theme.pad;
    if (p.stab) return;
    N.pAmp.gain.setTargetAtTime(level, t, p.attack || 0.12);
  }
  function stab(t, vel) {
    env(N.pAmp.gain, t, theme.pad.gain * 1.6 * vel, 0.004, 0.08, 0.3);
    release(N.pAmp.gain, t + 0.18, 0.05);
  }

  // drums
  function kick(t, vel) {
    const n = N, k = theme.kit;
    const start = k === "808" ? 120 : k === "hard" ? 170 : k === "vault" ? 135 : 150, end = k === "808" || k === "vault" ? 42 : 48, drop = k === "808" ? 0.2 : k === "vault" ? 0.13 : 0.09;
    n.kick.frequency.cancelScheduledValues(t - 0.006);
    n.kick.frequency.setValueAtTime(start, t);
    n.kick.frequency.exponentialRampToValueAtTime(end, t + drop);
    n.kAmp.gain.cancelScheduledValues(t - 0.006);
    n.kAmp.gain.setTargetAtTime(0, t - 0.006, 0.0015);
    n.kAmp.gain.setTargetAtTime(0.9 * vel, t, 0.002);
    n.kAmp.gain.setTargetAtTime(0, t + 0.02, k === "808" ? 0.28 : k === "vault" ? 0.11 : 0.07);
    // pump: duck the bass and pad under the kick
    n.pump.gain.cancelScheduledValues(t - 0.006);
    n.pump.gain.setTargetAtTime(0.35, t, 0.004);
    n.pump.gain.setTargetAtTime(1, t + 0.03, 0.09);
  }
  function snare(t, vel) {
    const n = N, clap = theme.kit === "808" || theme.kit === "hard" || theme.kit === "vault";
    n.sF.frequency.setValueAtTime(theme.kit === "vault" ? 1100 : clap ? 1400 : 1900, t);
    n.sAmp.gain.cancelScheduledValues(t - 0.006);
    n.sAmp.gain.setTargetAtTime(0, t - 0.006, 0.0015);
    if (clap) {
      // a clap: three quick bursts and a tail
      for (let i = 0; i < 3; i++) { n.sAmp.gain.setTargetAtTime(0.5 * vel, t + i * 0.011, 0.001); n.sAmp.gain.setTargetAtTime(0.05, t + i * 0.011 + 0.004, 0.003); }
      n.sAmp.gain.setTargetAtTime(0.4 * vel, t + 0.034, 0.002);
      n.sAmp.gain.setTargetAtTime(0, t + 0.04, 0.05);
    } else {
      n.sAmp.gain.setTargetAtTime(0.45 * vel, t, 0.002);
      n.sAmp.gain.setTargetAtTime(0, t + 0.01, 0.045);
    }
    n.sBody.frequency.setValueAtTime(220, t); n.sBody.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    n.sbAmp.gain.cancelScheduledValues(t - 0.006);
    n.sbAmp.gain.setTargetAtTime(0, t - 0.006, 0.0015);
    n.sbAmp.gain.setTargetAtTime(0.25 * vel, t, 0.002);
    n.sbAmp.gain.setTargetAtTime(0, t + 0.01, 0.04);
  }
  function hat(t, vel, open) {
    const n = N;
    n.hAmp.gain.cancelScheduledValues(t - 0.004);
    n.hAmp.gain.setTargetAtTime(0, t - 0.004, 0.001);
    n.hAmp.gain.setTargetAtTime(0.16 * vel, t, 0.001);
    n.hAmp.gain.setTargetAtTime(0, t + 0.004, open ? 0.12 : 0.018);
  }
  function tom(t, vel) {
    const n = N;
    n.tom.frequency.cancelScheduledValues(t - 0.006);
    n.tom.frequency.setValueAtTime(130, t); n.tom.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    n.tAmp.gain.cancelScheduledValues(t - 0.006);
    n.tAmp.gain.setTargetAtTime(0, t - 0.006, 0.0015);
    n.tAmp.gain.setTargetAtTime(0.6 * vel, t, 0.003);
    n.tAmp.gain.setTargetAtTime(0, t + 0.02, 0.22);
  }
  function perc(t, vel, f, ring) {
    const n = N;
    n.perc.frequency.setValueAtTime(f, t);
    n.pcF.frequency.setValueAtTime(ring ? f : 2400, t);
    n.pcF.Q.setValueAtTime(ring ? 14 : 6, t);
    n.pcAmp.gain.cancelScheduledValues(t - 0.004);
    n.pcAmp.gain.setTargetAtTime(0, t - 0.004, 0.001);
    n.pcAmp.gain.setTargetAtTime((ring ? 0.085 : 0.12) * vel, t, 0.001);
    n.pcAmp.gain.setTargetAtTime(0, t + 0.004, ring ? 0.09 : 0.03);   // a coin rings a little longer
  }
  function crash(t, vel) {
    const n = N;
    n.cAmp.gain.cancelScheduledValues(t - 0.004);
    n.cAmp.gain.setTargetAtTime(0.22 * vel, t, 0.002);
    n.cAmp.gain.setTargetAtTime(0, t + 0.01, 0.6);
  }

  // ---------------------------------------------------------------- the sequencer
  const hit = (pat, s) => { const c = pat ? pat[s] : "."; return c === "X" ? 1.15 : c === "x" ? 0.85 : c === "g" ? 0.35 : 0; };

  function scheduleStep(t, st) {
    const th = theme, bar = Math.floor(st / 16), s = st % 16;
    const rootDeg = th.prog[bar % th.prog.length];
    const lvl = intensity;
    const d = th.drums;
    if (s === 0) {
      chord(t, rootDeg);
      padLevel(t, lvl === 0 ? th.pad.gain : th.pad.gain * 0.8);
      if (bar % 8 === 0 && lvl >= 3) crash(t, 0.9);
    }
    if (th.pad.stab && lvl >= 1 && hit(th.pad.stab, s)) stab(t, 1);
    if (th.pad.stab && lvl === 0 && s === 0) stab(t, 0.6);
    // drums
    if (lvl >= 1) {
      const fill = lvl >= 2 && bar % 4 === 3 && s >= 12;
      const k = hit(d.kick, s);
      if (k) kick(t, k);
      const sn = fill ? 0.4 + (s - 12) * 0.2 : hit(d.snare, s);
      if (sn) snare(t, sn);
      if (d.tom) { const tm = hit(d.tom, s); if (tm) tom(t, tm); }
      let h = hit(d.hat, s);
      if (lvl >= 4 && !h) h = 0.45;                    // phase two: the hats double up
      if (lvl === 1 && h && s % 2) h *= 0.6;
      if (h) hat(t, h, false);
      const oh = hit(d.ohat, s);
      if (oh && lvl >= 2) hat(t, oh, true);
      if (d.perc && (lvl >= 2 || th.kit === "vault")) {
        const p = hit(d.perc, s);
        // vault: coins on steel, two inharmonic pitches (3:2 apart reads as metal, not a melody)
        if (p) th.kit === "vault" ? perc(t, p, s % 4 === 2 ? 3150 : 4720, true) : perc(t, p, th.kit === "hard" ? 1800 + (s % 3) * 400 : 2600);
      }
    } else if (s % 4 === 2) hat(t, 0.25, false);
    // bass
    if (lvl >= 1) {
      const pat = th.bass.pat, c = pat[s];
      if (c >= "0" && c <= "9") {
        let len = 1;
        while (len < 16 && pat[(s + len) % 16] === "-" && s + len < 16) len++;
        const deg = rootDeg + Number(c);
        bassNote(t, midi(th.root - 12 + degree(th.scale, deg)), len * stepDur() * 0.95, 1);
      }
    }
    // arp
    const a = th.arp;
    if (s % a.every === 0) {
      const i = Math.floor(st / a.every);
      const deg = rootDeg + a.notes[i % a.notes.length];
      const f = midi(th.root + 12 * a.oct - 12 + degree(th.scale, deg));
      arpNote(t, f, lvl === 0 ? 0.7 : 1, 0);
      if (a.mirror) {
        // Envy's mirror: the same arp, upside down, on the other side
        const inv = rootDeg + 7 - a.notes[i % a.notes.length];
        arpNote(t + stepDur() * 0.5, midi(th.root + 12 * a.oct - 12 + degree(th.scale, inv)), 0.8, 1);
      }
    }
    // lead (boss fights)
    if (lvl >= 3 && th.lead) {
      let toks = th.lead.toks;
      const key = th;
      if (th.lead.steal && lvl >= 4) {
        // stolen: phrase by phrase, every other sin's boss melody (in Envy's key)
        toks = THEMES[STEAL_ORDER[Math.floor(bar / 4) % STEAL_ORDER.length]].boss.lead.toks;
      }
      const ti = st % 32, tok = toks[ti % toks.length];
      if (tok && tok !== "-" && tok !== ".") {
        let len = 1;
        while (len < 8 && toks[(ti + len) % toks.length] === "-") len++;
        const deg = Number(tok);
        const oct = lvl >= 4 ? 12 : 0;
        leadNote(t, midi(key.root + 12 + oct + degree(key.scale, deg)), len * stepDur() * 0.92, 1);
      } else if (tok === ".") release(N.lAmp.gain, t, 0.04);
    } else if (s === 0) release(N.lAmp.gain, t, 0.08);
  }

  const stepDur = () => 60 / theme.bpm / 4;

  function tick() {
    if (!on || !N) return;
    const now = ctx.currentTime;
    if (nextTime < now - 0.2) nextTime = now + 0.05;      // woke up late: skip ahead, don't burst
    while (nextTime < now + 0.12) {
      // theme / intensity changes land on a bar line
      if (step % 16 === 0) {
        if (want.id !== themeId || want.part !== part) {
          const t = THEMES[want.id] || THEMES.menu;
          theme = t[want.part] || t.chapter;
          themeId = want.id; part = want.part;
          step = 0;
          applyTheme(nextTime);
          if (part === "boss") crash(nextTime, 1);
        }
        intensity = nextIntensity;
      }
      const sw = step % 2 ? theme.swing * stepDur() : 0;
      scheduleStep(nextTime + sw, step);
      step++;
      nextTime += stepDur();
    }
  }

  return {
    get playing() { return on; },
    /** id: "menu" | a sin ("sloth", "glutton", ...); part: "chapter" | "boss". */
    setTheme(id, p) { want = { id: THEMES[id] ? id : "menu", part: p === "boss" && THEMES[id] && THEMES[id].boss ? "boss" : "chapter" }; },
    setIntensity(i) {
      nextIntensity = i;
      // calming down can wait for the bar; heating up shouldn't
      if (i > intensity && step % 16 >= 8) intensity = Math.min(i, intensity + 1);
    },
    start() {
      if (on) return;
      if (!built) build();
      on = true;
      nextTime = ctx.currentTime + 0.06;
      clearInterval(timer);
      timer = setInterval(tick, 25);
    },
    stop() {
      on = false;
      clearInterval(timer);
      if (N) for (const p of [N.bAmp, N.pAmp, N.aAmp, N.a2Amp, N.lAmp]) p.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => { if (!on) destroy(); }, 400);
    },
    resync() { if (on) nextTime = Math.max(nextTime, ctx.currentTime + 0.05); },
    /** A quick muffle of the whole soundtrack (a perfect boost, a big hit). */
    duck(depth, time) {
      if (!N) return;
      const t = ctx.currentTime, f = N.duck.frequency;
      f.cancelScheduledValues(t);
      f.setTargetAtTime(400 + (1 - depth) * 4000, t, 0.015);
      f.setTargetAtTime(20000, t + time, 0.12);
    },
    /** Muffled (paused, between waves) or not. */
    muffle(onOff) {
      if (!N) return;
      const f = N.duck.frequency;
      f.cancelScheduledValues(ctx.currentTime);
      f.setTargetAtTime(onOff ? 900 : 20000, ctx.currentTime, 0.2);
    },
    /** A rising sweep into a boss entrance. */
    riser(time) {
      if (!N) return;
      const t = ctx.currentTime, n = N;
      n.rF.frequency.cancelScheduledValues(t);
      n.rF.frequency.setValueAtTime(300, t);
      n.rF.frequency.exponentialRampToValueAtTime(5000, t + time);
      n.rAmp.gain.cancelScheduledValues(t);
      n.rAmp.gain.setValueAtTime(0.0001, t);
      n.rAmp.gain.exponentialRampToValueAtTime(0.28, t + time);
      n.rAmp.gain.setTargetAtTime(0, t + time, 0.08);
    },
    /** A cymbal + kick on the downbeat (a boss arrives, a phase changes). */
    impact() { if (N) { const t = ctx.currentTime + 0.01; crash(t, 1.2); kick(t, 1.2); } },
  };
}

export const MUSIC_THEMES = Object.keys(THEMES);
