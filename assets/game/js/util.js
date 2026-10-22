/* Small math helpers, a seedable RNG and a fixed-size object pool. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);   // frame-rate independent lerp factor

// Random numbers go through rng() so a seeded daily run can swap it later.
let seedState = 0;
let seeded = false;
export function rng() {
  if (!seeded) return Math.random();
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function seedRng(s) { seeded = s !== null && s !== undefined; seedState = s | 0; }

/** Runs fn with rng() seeded (Daily Challenge: the same waves and cards for everyone that day). */
export function withSeed(seed, fn) {
  const was = seeded, st = seedState;
  seeded = true; seedState = seed | 0;
  try { return fn(); } finally { seeded = was; seedState = st; }
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

export const rand = (a, b) => a + rng() * (b - a);
export const randInt = (a, b) => Math.floor(a + rng() * (b - a + 1));
export const chance = (p) => rng() < p;
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const randRange = (pair) => pair[0] + rng() * (pair[1] - pair[0]);
// Rounds a fractional amount randomly: 1.4 → 1 (60%) or 2 (40%).
export const fracRound = (v) => { const f = Math.floor(v); return f + (rng() < v - f ? 1 : 0); };

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}
export function turnTowards(a, target, maxStep) {
  const d = angDiff(a, target);
  return a + (d > maxStep ? maxStep : d < -maxStep ? -maxStep : d);
}
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Pre-allocated objects. Iterate 0..count-1; kill with free(i) only in a compaction pass. */
export class Pool {
  constructor(make, size) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = make();
    this.count = 0;
    this.cap = size;
    this.limit = size;          // soft cap (quality settings lower it for particles)
  }
  get() {
    if (this.count >= this.limit) return null;
    return this.items[this.count++];
  }
  free(i) {
    const last = --this.count;
    if (i !== last) {
      const t = this.items[i];
      this.items[i] = this.items[last];
      this.items[last] = t;
    }
  }
  /** Removes every item whose dead flag is set. */
  sweep() {
    for (let i = this.count - 1; i >= 0; i--) if (this.items[i].dead) this.free(i);
  }
  clear() { this.count = 0; }
}

/** Uniform-grid spatial hash over the arena, rebuilt every tick. No allocations after construction. */
export class SpatialHash {
  constructor(w, h, cell, maxItems) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell) + 2;
    this.rows = Math.ceil(h / cell) + 2;
    this.head = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(maxItems);
    this.results = new Int32Array(maxItems);
    this.objs = null;
  }
  build(pool) {
    this.objs = pool.items;
    this.head.fill(-1);
    const c = this.cell, cols = this.cols, rows = this.rows;
    for (let i = 0; i < pool.count; i++) {
      const o = pool.items[i];
      let cx = Math.floor(o.x / c) + 1, cy = Math.floor(o.y / c) + 1;
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
      const k = cy * cols + cx;
      this.next[i] = this.head[k];
      this.head[k] = i;
    }
  }
  /** Fills this.results with indices of items whose cell overlaps the circle; returns the count. */
  query(x, y, r) {
    const c = this.cell, cols = this.cols, rows = this.rows;
    let x0 = Math.floor((x - r) / c) + 1, x1 = Math.floor((x + r) / c) + 1;
    let y0 = Math.floor((y - r) / c) + 1, y1 = Math.floor((y + r) / c) + 1;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= cols) x1 = cols - 1; if (y1 >= rows) y1 = rows - 1;
    let n = 0;
    const res = this.results, max = res.length;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cy * cols + cx];
        while (i !== -1 && n < max) { res[n++] = i; i = this.next[i]; }
      }
    }
    return n;
  }
}

export function formatScore(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
