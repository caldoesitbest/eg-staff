/* Keyboard + mouse, twin-stick touch (floating sticks) and gamepad.
   The control mode follows whatever the player actually touched last, not the user agent. */

const STICK_RADIUS = 56;     // CSS px for full deflection
const DEAD = 0.14;
const PAD_DEAD = 0.22;

function makeStick() {
  return { id: -1, active: false, ox: 0, oy: 0, cx: 0, cy: 0, x: 0, y: 0, mag: 0, startedAt: 0 };
}

export const input = {
  mode: "kbm",               // "kbm" | "touch" | "gamepad"
  enabled: false,            // sticks and fire only while playing
  move: { x: 0, y: 0 },
  aimMode: "none",           // "mouse" (screen point) | "stick" (direction) | "none"
  aimX: 1, aimY: 0,          // direction for stick aiming
  fire: false,
  charge: false,             // holding the charged-shot button (right-click, E, LT, or the touch button)
  mouse: { x: 0, y: 0, inside: false, down: false, charge: false, seen: false },
  sticks: { move: makeStick(), aim: makeStick() },
  keys: new Set(),
  pad: { connected: false, index: -1, prevButtons: [], navCooldown: 0 },
  queued: { boost: false, swap: false },
  swapTo: undefined,         // a slot for the queued swap (1/2 keys), or undefined to flip
  touchCharge: false,
  onHotkey: null,            // (code) for in-game keys main.js handles (T: auto-aim)
  onModeChange: null,
  onPause: null,
  onMenuNav: null,            // (dir: "up"|"down"|"left"|"right") for gamepad menu navigation
  onMenuConfirm: null,
  onMenuBack: null,
  rect: { left: 0, top: 0, width: 1, height: 1 },

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    if (this.onModeChange) this.onModeChange(m);
  },

  consumeBoost() {
    const b = this.queued.boost;
    this.queued.boost = false;
    return b;
  },
  consumeSwap() {
    const b = this.queued.swap;
    this.queued.swap = false;
    return b;
  },

  releaseAll() {
    this.keys.clear();
    this.mouse.down = false;
    this.mouse.charge = false;
    this.touchCharge = false;
    this.fire = false;
    this.charge = false;
    this.queued.boost = false;
    this.queued.swap = false;
    for (const s of [this.sticks.move, this.sticks.aim]) { s.active = false; s.id = -1; s.x = s.y = s.mag = 0; }
    this.move.x = this.move.y = 0;
  },

  init({ root, layer, boostButton, chargeButton }) {
    const self = this;
    const updateRect = () => {
      const r = root.getBoundingClientRect();
      self.rect = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", updateRect);
    this.updateRect = updateRect;

    // ---------- keyboard ----------
    const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyQ"]);
    window.addEventListener("keydown", (e) => {
      if (e.repeat && !GAME_KEYS.has(e.code)) return;
      const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA");
      if (!typing && e.key !== "Tab") self.setMode("kbm");
      if (e.code === "Escape" || e.code === "KeyP") {
        if (self.onPause && self.onPause(e)) e.preventDefault();
        return;
      }
      if (!self.enabled) return;
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat && (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight")) self.queued.boost = true;
        if (!e.repeat && e.code === "KeyQ") { self.queued.swap = true; self.swapTo = undefined; }
      }
      if (!e.repeat && (e.code === "Digit1" || e.code === "Digit2")) { self.queued.swap = true; self.swapTo = e.code === "Digit1" ? 0 : 1; }
      if (!e.repeat && e.code === "KeyT" && self.onHotkey) self.onHotkey(e.code);
      self.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => { self.keys.delete(e.code); });
    window.addEventListener("blur", () => self.releaseAll());

    // ---------- pointer (mouse + touch) on the play layer ----------
    const prevent = (e) => { e.preventDefault(); };
    root.addEventListener("contextmenu", prevent);
    root.addEventListener("dblclick", prevent);
    root.addEventListener("selectstart", prevent);
    // iOS pinch zoom
    document.addEventListener("gesturestart", prevent);

    layer.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") {
        self.setMode("kbm");
        self.mouse.x = e.clientX - self.rect.left;
        self.mouse.y = e.clientY - self.rect.top;
        self.mouse.seen = true;
        if (!self.enabled) return;
        if (e.button === 0) self.mouse.down = true;
        if (e.button === 2) self.mouse.charge = true;
        if (e.button === 1) { self.queued.swap = true; self.swapTo = undefined; }
        try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
        return;
      }
      // touch / pen
      self.setMode("touch");
      e.preventDefault();
      if (!self.enabled) return;
      const x = e.clientX - self.rect.left, y = e.clientY - self.rect.top;
      const left = x < self.rect.width * 0.5;
      const s = left ? self.sticks.move : self.sticks.aim;
      if (s.active) return;
      s.active = true; s.id = e.pointerId;
      s.ox = s.cx = x; s.oy = s.cy = y;
      s.x = s.y = s.mag = 0;
      s.startedAt = performance.now();
      try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }, { passive: false });

    layer.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") {
        const x = e.clientX - self.rect.left, y = e.clientY - self.rect.top;
        const thumbs = self.sticks.move.active || self.sticks.aim.active;
        if (self.mode !== "kbm" && !thumbs && (Math.abs(x - self.mouse.x) + Math.abs(y - self.mouse.y) > 3)) self.setMode("kbm");
        self.mouse.x = x; self.mouse.y = y; self.mouse.inside = true; self.mouse.seen = true;
        return;
      }
      const s = e.pointerId === self.sticks.move.id ? self.sticks.move : e.pointerId === self.sticks.aim.id ? self.sticks.aim : null;
      if (!s) return;
      e.preventDefault();
      const x = e.clientX - self.rect.left, y = e.clientY - self.rect.top;
      let dx = x - s.ox, dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      // The base follows the thumb if it slides past the edge.
      if (d > STICK_RADIUS) {
        const k = (d - STICK_RADIUS) / d;
        s.ox += dx * k; s.oy += dy * k;
        dx = x - s.ox; dy = y - s.oy;
      }
      s.cx = x; s.cy = y;
      const m = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
      s.mag = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
      const len = Math.hypot(dx, dy) || 1;
      s.x = (dx / len) * s.mag; s.y = (dy / len) * s.mag;
    }, { passive: false });

    const end = (e) => {
      if (e.pointerType === "mouse") {
        if (e.button === 0 || e.type === "pointercancel") self.mouse.down = false;
        if (e.button === 2 || e.type === "pointercancel") self.mouse.charge = false;
        return;
      }
      for (const s of [self.sticks.move, self.sticks.aim]) {
        if (s.id === e.pointerId) { s.active = false; s.id = -1; s.x = s.y = s.mag = 0; }
      }
    };
    layer.addEventListener("pointerup", end);
    layer.addEventListener("pointercancel", end);
    layer.addEventListener("lostpointercapture", end);
    layer.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") self.mouse.inside = false; });
    window.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse") return;
      if (e.button === 0) self.mouse.down = false;
      if (e.button === 2) self.mouse.charge = false;
    });
    // mouse wheel swaps guns (throttled so one flick is one swap)
    let wheelAt = 0;
    layer.addEventListener("wheel", (e) => {
      if (!self.enabled) return;
      e.preventDefault();
      const t = performance.now();
      if (Math.abs(e.deltaY) < 4 || t - wheelAt < 220) return;
      wheelAt = t;
      self.queued.swap = true; self.swapTo = undefined;
    }, { passive: false });

    // ---------- boost button (touch) ----------
    if (boostButton) {
      boostButton.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerType !== "mouse") self.setMode("touch");
        if (self.enabled) self.queued.boost = true;
        boostButton.classList.add("pressed");
      });
      const up = () => boostButton.classList.remove("pressed");
      boostButton.addEventListener("pointerup", up);
      boostButton.addEventListener("pointercancel", up);
      boostButton.addEventListener("pointerleave", up);
    }
    // ---------- charge button (touch): hold to charge, let go to fire ----------
    if (chargeButton) {
      chargeButton.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerType !== "mouse") self.setMode("touch");
        if (self.enabled) self.touchCharge = true;
        chargeButton.classList.add("pressed");
        try { chargeButton.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      const up = () => { self.touchCharge = false; chargeButton.classList.remove("pressed"); };
      chargeButton.addEventListener("pointerup", up);
      chargeButton.addEventListener("pointercancel", up);
      chargeButton.addEventListener("lostpointercapture", up);
    }

    window.addEventListener("gamepadconnected", (e) => { self.pad.connected = true; self.pad.index = e.gamepad.index; });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === self.pad.index) { self.pad.connected = false; self.pad.index = -1; }
    });
  },

  /** Called once per rendered frame: reads the gamepad and combines everything. */
  poll(dt) {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) my -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my += 1;
    if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }

    let fire = false;
    let charge = false;
    let aimMode = "none";

    if (this.mode === "kbm") {
      if (this.mouse.seen) aimMode = "mouse";
      fire = this.mouse.down;
      charge = this.mouse.charge || k.has("KeyE");
    }
    if (this.touchCharge) charge = true;

    const ms = this.sticks.move, as = this.sticks.aim;
    if (ms.active && ms.mag > 0) { mx = ms.x; my = ms.y; }
    if (as.active) {
      fire = true;
      if (as.mag > 0.2) { aimMode = "stick"; const l = Math.hypot(as.x, as.y) || 1; this.aimX = as.x / l; this.aimY = as.y / l; }
      else aimMode = "hold";      // finger down but not pushed: keep the last direction (or auto-aim)
    }

    // ---------- gamepad ----------
    this.pad.navCooldown -= dt;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    let gp = null;
    if (pads) {
      if (this.pad.index >= 0) gp = pads[this.pad.index];
      if (!gp) for (const p of pads) if (p && p.connected) { gp = p; this.pad.index = p.index; break; }
    }
    if (gp) {
      const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < PAD_DEAD ? 0 : v; };
      const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const prev = this.pad.prevButtons;
      const pressed = (i) => btn(i) && !prev[i];
      let any = false;
      for (let i = 0; i < gp.buttons.length; i++) if (btn(i)) { any = true; break; }
      const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
      if (any || lx || ly || rx || ry) this.setMode("gamepad");

      if (this.mode === "gamepad") {
        if (this.enabled) {
          if (lx || ly) { const m = Math.min(1, Math.hypot(lx, ly)); const l = Math.hypot(lx, ly) || 1; mx = (lx / l) * m; my = (ly / l) * m; }
          if (btn(12)) my = -1; if (btn(13)) my = 1; if (btn(14)) mx = -1; if (btn(15)) mx = 1;
          const rm = Math.hypot(rx, ry);
          if (rm > 0.35) { aimMode = "stick"; this.aimX = rx / rm; this.aimY = ry / rm; fire = true; }
          if (btn(7)) { fire = true; if (aimMode === "none") aimMode = "hold"; }
          if (btn(6)) charge = true;
          if (pressed(0) || pressed(4) || pressed(5) || pressed(10)) this.queued.boost = true;
          if (pressed(3)) { this.queued.swap = true; this.swapTo = undefined; }
          if (pressed(9) && this.onPause) this.onPause(null);
        } else {
          // Menu navigation
          let dir = null;
          if (btn(12) || ly < -0.6) dir = "up";
          else if (btn(13) || ly > 0.6) dir = "down";
          else if (btn(14) || lx < -0.6) dir = "left";
          else if (btn(15) || lx > 0.6) dir = "right";
          if (dir && this.pad.navCooldown <= 0 && this.onMenuNav) { this.onMenuNav(dir); this.pad.navCooldown = 0.2; }
          if (!dir) this.pad.navCooldown = Math.min(this.pad.navCooldown, 0);
          if (pressed(0) && this.onMenuConfirm) this.onMenuConfirm();
          if ((pressed(1) || pressed(9)) && this.onMenuBack) this.onMenuBack(pressed(9));
        }
      }
      for (let i = 0; i < gp.buttons.length; i++) prev[i] = btn(i);
    }

    this.move.x = mx; this.move.y = my;
    this.fire = this.enabled && fire;
    this.charge = this.enabled && charge;
    this.aimMode = aimMode;
  },
};
