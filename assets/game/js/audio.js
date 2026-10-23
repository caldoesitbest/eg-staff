/* Every sound is synthesized with the Web Audio API (no audio files, nothing copyrighted).
   Audio starts on the first tap/click/key (required on iOS). */

let ctx = null;
let master, sfxBus, musicBus, comp, noiseBuf;
let unlocked = false;
const vol = { sfx: 0.8, music: 0.5, muted: false };
const last = Object.create(null);     // per-sound throttle
let listenerX = 0, listenerY = 0;
let budgetT = 0, budgetN = 0;

function now() { return ctx.currentTime; }

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { return false; }
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(comp);
  musicBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 1;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  return true;
}

function applyVolumes() {
  if (!ctx) return;
  const t = now();
  master.gain.setTargetAtTime(vol.muted ? 0 : 1, t, 0.03);
  sfxBus.gain.setTargetAtTime(vol.sfx * 0.9, t, 0.03);
  musicBus.gain.setTargetAtTime(vol.music * 0.42, t, 0.05);
}

// ---------- building blocks ----------
function out(x, y, gain) {
  // Distance fade + stereo pan relative to the camera.
  let g = gain;
  let pan = 0;
  if (x !== undefined) {
    const dx = x - listenerX, dy = y - listenerY;
    const d = Math.sqrt(dx * dx + dy * dy);
    g *= Math.max(0.22, 1 - d / 1500);
    pan = Math.max(-0.7, Math.min(0.7, dx / 900));
  }
  const gn = ctx.createGain();
  gn.gain.value = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    gn.connect(p);
    p.connect(sfxBus);
  } else gn.connect(sfxBus);
  return gn;
}

function tone(dest, type, f0, f1, t0, dur, peak, attack = 0.004) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  return o;
}

function noise(dest, t0, dur, peak, filterType, f0, f1, q = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.02);
}

const jitter = (v, amt) => v * (1 + (Math.random() * 2 - 1) * amt);

// name → [minimum gap in seconds, play function]
const SOUNDS = {
  shoot: [0.05, (d) => {
    const t = now();
    tone(d, "square", jitter(880, 0.06), 330, t, 0.07, 0.07);
    tone(d, "triangle", jitter(1760, 0.05), 600, t, 0.05, 0.05);
  }],
  enemyShot: [0.06, (d) => {
    const t = now();
    tone(d, "sawtooth", jitter(420, 0.08), 180, t, 0.16, 0.08, 0.01);
  }],
  hit: [0.055, (d) => {
    const t = now();
    noise(d, t, 0.05, 0.22, "bandpass", jitter(2600, 0.2), 1200, 2);
    tone(d, "square", jitter(300, 0.1), 160, t, 0.04, 0.05);
  }],
  crit: [0.04, (d) => {
    const t = now();
    tone(d, "square", 1400, 2400, t, 0.08, 0.08);
    noise(d, t, 0.06, 0.2, "highpass", 3000, 6000);
  }],
  clank: [0.05, (d) => {          // bullet blocked by a shield or rock
    const t = now();
    tone(d, "triangle", jitter(1900, 0.1), 1500, t, 0.09, 0.09);
    tone(d, "sine", jitter(2900, 0.1), 2400, t, 0.12, 0.05);
  }],
  die: [0.045, (d) => {
    const t = now();
    noise(d, t, 0.22, 0.5, "lowpass", 3200, 200, 0.8);
    tone(d, "square", jitter(220, 0.15), 50, t, 0.18, 0.18);
  }],
  explode: [0.085, (d) => {
    const t = now();
    noise(d, t, 0.6, 0.9, "lowpass", 1800, 90, 0.7);
    tone(d, "sine", 120, 35, t, 0.5, 0.6);
  }],
  bigExplode: [0.1, (d) => {
    const t = now();
    noise(d, t, 1.4, 1, "lowpass", 2600, 60, 0.6);
    tone(d, "sine", 90, 25, t, 1.2, 0.9);
    tone(d, "sawtooth", 160, 40, t, 0.6, 0.25);
  }],
  boost: [0.08, (d) => {
    const t = now();
    noise(d, t, 0.26, 0.45, "bandpass", 500, 3800, 1.4);
    tone(d, "sine", 220, 660, t, 0.18, 0.12);
  }],
  boostReady: [0.2, (d) => {
    const t = now();
    tone(d, "sine", 1320, 1320, t, 0.06, 0.05);
  }],
  perfect: [0.2, (d) => {
    const t = now();
    [784, 1175, 1568].forEach((f, i) => tone(d, "triangle", f, f, t + i * 0.05, 0.22, 0.12));
    noise(d, t, 0.4, 0.15, "highpass", 4000, 9000);
  }],
  star: [0.05, (d, opts) => {
    const t = now();
    const step = Math.min(12, (opts && opts.pitch) || 0);
    const f = 880 * Math.pow(2, step / 12);
    tone(d, "sine", f, f * 1.5, t, 0.1, 0.12);
    tone(d, "triangle", f * 2, f * 2, t + 0.03, 0.08, 0.04);
  }],
  heart: [0.1, (d) => {
    const t = now();
    [523, 659, 784, 1047].forEach((f, i) => tone(d, "sine", f, f, t + i * 0.06, 0.25, 0.14));
  }],
  hurt: [0.1, (d) => {
    const t = now();
    tone(d, "sawtooth", 300, 60, t, 0.35, 0.35, 0.002);
    noise(d, t, 0.25, 0.5, "lowpass", 1400, 200);
  }],
  shieldHit: [0.1, (d) => {
    const t = now();
    tone(d, "triangle", 1200, 400, t, 0.25, 0.22);
    noise(d, t, 0.15, 0.2, "highpass", 2000, 5000);
  }],
  warn: [0.12, (d) => {           // telegraph chirp (ripper, gunner, boomer)
    const t = now();
    tone(d, "square", 660, 990, t, 0.09, 0.05);
  }],
  laser: [0.15, (d) => {          // sniper lock-on
    const t = now();
    tone(d, "sine", 1400, 2800, t, 0.9, 0.05, 0.3);
  }],
  snipe: [0.08, (d) => {
    const t = now();
    tone(d, "sawtooth", 2400, 200, t, 0.22, 0.2, 0.002);
    noise(d, t, 0.18, 0.3, "highpass", 3000, 800);
  }],
  charge: [0.08, (d) => {          // ripper charge
    const t = now();
    noise(d, t, 0.4, 0.35, "bandpass", 300, 1800, 2);
    tone(d, "sawtooth", 140, 280, t, 0.35, 0.12);
  }],
  spawn: [0.08, (d) => {
    const t = now();
    tone(d, "sine", 200, 520, t, 0.25, 0.07, 0.05);
  }],
  heal: [0.25, (d) => {
    const t = now();
    tone(d, "sine", 660, 990, t, 0.2, 0.05);
  }],
  steal: [0.15, (d) => {
    const t = now();
    [440, 554, 659, 880].forEach((f, i) => tone(d, "square", f, f, t + i * 0.04, 0.12, 0.06));
  }],
  charm: [0.12, (d) => {
    const t = now();
    tone(d, "sine", 520, 1040, t, 0.3, 0.12);
    tone(d, "sine", 780, 1560, t + 0.08, 0.3, 0.08);
  }],
  chomp: [0.08, (d) => {
    const t = now();
    noise(d, t, 0.2, 0.7, "lowpass", 900, 120);
    tone(d, "square", 160, 70, t, 0.16, 0.2);
  }],
  slam: [0.2, (d) => {
    const t = now();
    tone(d, "sine", 70, 30, t, 0.7, 0.9);
    noise(d, t, 0.5, 0.6, "lowpass", 600, 60);
  }],
  click: [0.04, (d) => {
    const t = now();
    tone(d, "triangle", 1200, 900, t, 0.05, 0.08);
  }],
  hover: [0.04, (d) => {
    const t = now();
    tone(d, "sine", 1800, 1800, t, 0.03, 0.025);
  }],
  pick: [0.15, (d) => {          // upgrade chosen
    const t = now();
    [659, 880, 1319, 1760].forEach((f, i) => tone(d, "triangle", f, f, t + i * 0.055, 0.3, 0.12));
    noise(d, t + 0.1, 0.5, 0.08, "highpass", 6000, 9000);
  }],
  wave: [0.3, (d) => {
    const t = now();
    [440, 554, 659].forEach((f) => tone(d, "sawtooth", f, f, t, 0.7, 0.05, 0.02));
    tone(d, "sine", 110, 110, t, 0.8, 0.25, 0.01);
    noise(d, t, 0.5, 0.15, "bandpass", 800, 6000, 0.8);
  }],
  clear: [0.3, (d) => {
    const t = now();
    [523, 659, 784, 1047].forEach((f, i) => tone(d, "triangle", f, f, t + i * 0.08, 0.4, 0.1));
  }],
  bossIntro: [1, (d) => {
    const t = now();
    tone(d, "sawtooth", 55, 55, t, 2.4, 0.3, 0.3);
    tone(d, "sawtooth", 82.4, 82.4, t, 2.4, 0.2, 0.3);
    for (let i = 0; i < 3; i++) tone(d, "square", 880, 660, t + i * 0.5, 0.35, 0.08);
  }],
  bossDown: [1, (d) => {
    const t = now();
    noise(d, t, 2.4, 1, "lowpass", 3000, 50, 0.5);
    tone(d, "sine", 80, 20, t, 2, 1);
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(d, "triangle", f, f, t + 0.6 + i * 0.09, 0.6, 0.1));
  }],
  gameOver: [1, (d) => {
    const t = now();
    [392, 330, 262, 196].forEach((f, i) => tone(d, "triangle", f, f * 0.98, t + i * 0.18, 0.5, 0.14));
  }],
  newBest: [1, (d) => {
    const t = now();
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(d, "square", f, f, t + i * 0.07, 0.2, 0.06));
  }],
  // ---- guns ----
  shotgun: [0.08, (d) => {
    const t = now();
    noise(d, t, 0.18, 0.6, "lowpass", 2600, 300, 0.7);
    tone(d, "square", jitter(180, 0.08), 60, t, 0.12, 0.16);
  }],
  smg: [0.035, (d) => {
    const t = now();
    tone(d, "square", jitter(1300, 0.08), 500, t, 0.04, 0.045);
  }],
  rail: [0.1, (d) => {
    const t = now();
    tone(d, "sawtooth", 2200, 300, t, 0.2, 0.12, 0.002);
    tone(d, "sine", 140, 60, t, 0.25, 0.25);
  }],
  launch: [0.1, (d) => {
    const t = now();
    noise(d, t, 0.16, 0.35, "bandpass", 700, 300, 1.2);
    tone(d, "sine", 300, 120, t, 0.16, 0.18);
  }],
  zap: [0.06, (d) => {
    const t = now();
    noise(d, t, 0.09, 0.3, "highpass", 3500, 7000, 1);
    tone(d, "sawtooth", jitter(900, 0.2), 1800, t, 0.07, 0.05);
  }],
  kissShot: [0.06, (d) => {
    const t = now();
    tone(d, "sine", jitter(990, 0.05), 1480, t, 0.08, 0.07);
  }],
  swap: [0.12, (d) => {
    const t = now();
    tone(d, "square", 600, 600, t, 0.04, 0.05);
    tone(d, "square", 900, 900, t + 0.05, 0.05, 0.05);
    noise(d, t, 0.06, 0.12, "highpass", 4000, 6000);
  }],
  // ---- charged shot ----
  chargeFull: [0.2, (d) => {
    const t = now();
    tone(d, "triangle", 1568, 1568, t, 0.16, 0.1);
    tone(d, "sine", 2349, 2349, t + 0.04, 0.2, 0.07);
  }],
  chargeShot: [0.08, (d) => {
    const t = now();
    noise(d, t, 0.45, 0.8, "lowpass", 3000, 120, 0.7);
    tone(d, "sawtooth", 420, 70, t, 0.35, 0.22, 0.002);
    tone(d, "sine", 110, 40, t, 0.4, 0.5);
  }],
  beam: [0.1, (d) => {
    const t = now();
    tone(d, "sawtooth", 1800, 90, t, 0.5, 0.2, 0.002);
    noise(d, t, 0.5, 0.5, "bandpass", 5000, 400, 0.8);
    tone(d, "sine", 70, 35, t, 0.5, 0.6);
  }],
  fizzle: [0.1, (d) => {
    const t = now();
    noise(d, t, 0.12, 0.12, "highpass", 2500, 900, 1);
  }],
  // ---- shop + Lust ----
  buy: [0.06, (d) => {
    const t = now();
    [988, 1319, 1976].forEach((f, i) => tone(d, "square", f, f, t + i * 0.045, 0.1, 0.06));
    noise(d, t, 0.15, 0.08, "highpass", 6000, 9000);
  }],
  deny: [0.12, (d) => {
    const t = now();
    tone(d, "square", 220, 180, t, 0.12, 0.08);
  }],
  pop: [0.05, (d) => {
    const t = now();
    tone(d, "sine", jitter(1200, 0.1), 400, t, 0.08, 0.12);
  }],
  heartbeat: [0.5, (d) => {
    const t = now();
    tone(d, "sine", 70, 45, t, 0.14, 0.4);
    tone(d, "sine", 64, 42, t + 0.18, 0.14, 0.3);
  }],
};

// The charged shot's hum: one oscillator that rises with the charge.
let hum = null;

// ---------- procedural music ----------
// A minor synthwave loop. Intensity 0 = menu pad, 1 = waves (drums), 2 = boss (lead + faster hats).
const music = {
  on: false, intensity: 0, step: 0, nextTime: 0, timer: 0, bpm: 108,
  progression: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],   // Am F G Em (MIDI)
  lead: [0, 3, 7, 10, 12, 10, 7, 3],
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleStep(t, step) {
  const bar = Math.floor(step / 16) % 4;
  const s = step % 16;
  const chord = music.progression[bar];
  const lvl = music.intensity;
  const d = musicBus;
  // bass: eighth notes on the root, octave jump on the off-beat
  if (s % 2 === 0) {
    const n = chord[0] - 24 + (s % 4 === 2 ? 12 : 0);
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = midi(n);
    f.type = "lowpass"; f.frequency.setValueAtTime(lvl ? 900 : 500, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl ? 0.32 : 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 0.26);
  }
  // pad: chord on each bar
  if (s === 0) {
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = "sawtooth"; o.frequency.value = midi(n); o.detune.value = det;
        f.type = "lowpass"; f.frequency.value = 1100;
        const len = (60 / music.bpm) * 4;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + len + 0.05);
      }
    }
  }
  if (lvl >= 1) {
    // kick on 1 and 3 (and 4-on-the-floor at boss intensity)
    if (s % (lvl >= 2 ? 4 : 8) === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.22);
    }
    // snare on 2 and 4
    if (s === 4 || s === 12) noise(d, t, 0.16, 0.22, "bandpass", 1800, 900, 0.8);
    // hats
    if (s % 2 === 1 || lvl >= 2) noise(d, t, 0.04, lvl >= 2 ? 0.07 : 0.09, "highpass", 7000, 9000);
  }
  if (lvl >= 2 && s % 2 === 0) {
    const n = chord[0] + 12 + music.lead[(s / 2) % 8];
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.15);
  }
}

function musicTick() {
  if (!ctx || !music.on) return;
  const stepDur = 60 / music.bpm / 4;
  if (music.nextTime < now() - 0.2) music.nextTime = now() + 0.05;   // woke up late: skip, don't burst
  while (music.nextTime < now() + 0.12) {
    scheduleStep(music.nextTime, music.step);
    music.step++;
    music.nextTime += stepDur;
  }
}

export const audio = {
  get unlocked() { return unlocked; },

  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!unlocked) {
      // A silent buffer is what finally wakes audio on older iOS.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      unlocked = true;
      if (music.on) { music.nextTime = now() + 0.05; }
    }
  },

  setVolumes(sfx, mus, muted) {
    vol.sfx = sfx; vol.music = mus; vol.muted = !!muted;
    applyVolumes();
  },

  setListener(x, y) { listenerX = x; listenerY = y; },

  /** play("hit", x, y, gain, opts): x/y are optional world positions for distance + panning. */
  play(name, x, y, gain = 1, opts) {
    if (!ctx || !unlocked || vol.muted || vol.sfx <= 0) return;
    if (ctx.state !== "running") return;
    const s = SOUNDS[name];
    if (!s) return;
    const t = ctx.currentTime;
    if (last[name] !== undefined && t - last[name] < s[0]) return;
    // global voice budget: at most ~28 new sounds a second, so huge fights don't choke Web Audio
    if (t - budgetT > 1) { budgetT = t; budgetN = 0; }
    if (++budgetN > 28 && name !== "hurt" && name !== "bossDown" && name !== "perfect") return;
    last[name] = t;
    try { s[1](out(x, y, gain), opts); } catch (e) { /* never let audio break the game */ }
  },

  chargeStart() {
    if (!ctx || !unlocked || vol.muted || vol.sfx <= 0 || ctx.state !== "running" || hum) return;
    try {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = "sawtooth"; o2.type = "sine";
      o.frequency.value = 110; o2.frequency.value = 220;
      f.type = "lowpass"; f.frequency.value = 600; f.Q.value = 6;
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.07, now(), 0.05);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(); o2.start();
      hum = { o, o2, g, f };
    } catch (e) { hum = null; }
  },
  chargeLevel(p) {
    if (!hum) return;
    const t = now();
    hum.o.frequency.setTargetAtTime(110 + p * 330, t, 0.03);
    hum.o2.frequency.setTargetAtTime(220 + p * 660 + (p >= 1 ? Math.sin(t * 40) * 30 : 0), t, 0.03);
    hum.f.frequency.setTargetAtTime(600 + p * 2600, t, 0.03);
  },
  chargeStop() {
    if (!hum) return;
    const h = hum;
    hum = null;
    try {
      const t = now();
      h.g.gain.setTargetAtTime(0.0001, t, 0.02);
      h.o.stop(t + 0.1); h.o2.stop(t + 0.1);
    } catch (e) { /* already stopped */ }
  },

  musicStart(intensity) {
    music.intensity = intensity || 0;
    if (music.on) return;
    music.on = true;
    if (ctx) music.nextTime = now() + 0.05;
    clearInterval(music.timer);
    music.timer = setInterval(musicTick, 30);
  },
  musicIntensity(i) { music.intensity = i; },
  musicStop() { music.on = false; clearInterval(music.timer); },

  suspend() { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); },
  resume() { if (ctx && unlocked && ctx.state === "suspended") ctx.resume().catch(() => {}); if (ctx) music.nextTime = Math.max(music.nextTime, now() + 0.05); },
};
