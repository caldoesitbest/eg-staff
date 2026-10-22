/* Fixed 60 Hz simulation with interpolated rendering, so gameplay runs at the same speed
   on 60, 120 and 144 Hz screens. Also measures frame time for the auto-quality setting. */

export const STEP = 1 / 60;
const MAX_STEPS = 5;

export function startLoop({ before, update, render, timer }) {
  // timer: debug only (?headless=1): tick with setTimeout so tests run even when the page is not painting
  const next = timer ? (fn) => setTimeout(() => fn(performance.now()), 16) : (fn) => requestAnimationFrame(fn);
  let last = performance.now();
  let acc = 0;
  let running = true;
  const stats = { fps: 60, frameMs: 16.7, workMs: 0, samples: 0, sum: 0, workSum: 0, windowStart: last };

  function frame(now) {
    if (!running) return;
    next(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;           // tab was asleep: don't fast-forward
    if (dt < 0) dt = 0;
    acc += dt;
    const t0 = performance.now();
    if (before) before(dt);
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;     // too slow to catch up: drop the backlog rather than spiral
    render(acc / STEP, dt);
    const work = performance.now() - t0;

    stats.samples++;
    stats.sum += dt * 1000;
    stats.workSum += work;
    if (now - stats.windowStart >= 500) {
      stats.frameMs = stats.sum / stats.samples;
      stats.workMs = stats.workSum / stats.samples;
      stats.fps = 1000 / stats.frameMs;
      stats.samples = 0;
      stats.sum = 0;
      stats.workSum = 0;
      stats.windowStart = now;
    }
  }
  next(frame);

  return {
    stats,
    resetClock() { last = performance.now(); acc = 0; },
    stop() { running = false; },
  };
}
