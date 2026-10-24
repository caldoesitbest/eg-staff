/* Fixed 60 Hz simulation with interpolated rendering, so gameplay runs at the same speed
   on 60, 120 and 144 Hz screens. Also measures frame time for the auto-quality setting. */

export const STEP = 1 / 60;
const MAX_STEPS = 5;

export function startLoop({ before, update, render, timer }) {
  if (timer) return headless({ before, update, render });
  const next = (fn) => requestAnimationFrame(fn);
  let last = performance.now();
  let acc = 0;
  let running = true;
  let gap = 0, due = 0;                  // frame-rate cap (settings): ms between drawn frames, 0 = uncapped
  const stats = { fps: 60, frameMs: 16.7, workMs: 0, samples: 0, sum: 0, workSum: 0, windowStart: last };

  function frame(now) {
    if (!running) return;
    next(frame);
    if (gap) {
      // skip display refreshes until the next frame is due (1 ms early is fine: refreshes jitter)
      if (now < due - 1) return;
      due = due + gap > now ? due + gap : now + gap;   // on schedule: keep the rhythm; fell behind: restart it
    }
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
    setCap(fps) { gap = fps > 0 ? 1000 / fps : 0; due = 0; },
    stop() { running = false; },
  };
}

/* Debug only (?headless=1): balance tests and soak runs. Steps as fast as the machine allows on a
   fixed clock (one 60 Hz step per tick, drawn every 8th), driven by a MessageChannel so it keeps
   going in a background tab where timers are throttled to once a second. */
function headless({ before, update, render }) {
  const ch = new MessageChannel();
  const stats = { fps: 60, frameMs: 16.7, workMs: 0 };
  let running = true, n = 0, drawDt = 0;
  ch.port1.onmessage = () => {
    if (!running) return;
    const t0 = performance.now();
    // a few steps per message, then yield so the page (and test scripts) stay responsive
    while (performance.now() - t0 < 8) {
      if (before) before(STEP);
      update(STEP);
      drawDt += STEP;
      if (++n % 8 === 0) { render(0, drawDt); drawDt = 0; }
    }
    ch.port2.postMessage(0);
  };
  ch.port2.postMessage(0);
  return {
    stats,
    resetClock() {},
    setCap() {},
    stop() { running = false; },
  };
}
