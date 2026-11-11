/**
 * The hero's liquid. The page is a glass that is exactly half full: a row of spring-coupled columns makes
 * the surface, which sloshes when the page scrolls, when the pointer cuts through it, when Pourie lands,
 * and when a phone is tilted. Only a band around the waterline is drawn on a canvas; below it is a plain
 * amber block. The simulation steps at a fixed 1/60 s so a 30 fps browser shows the same motion.
 */
export interface Liquid {
  /** Height of the surface above the resting waterline, in CSS pixels, at a viewport x. */
  heightAt(clientX: number): number;
  /** Drop something in at a viewport x. */
  splash(clientX: number, strength: number): void;
  /** Kick the whole surface, for example from scroll speed. */
  kick(amount: number): void;
  /** Lean the surface, as if the page were tilted by this many degrees. */
  tilt(degrees: number): void;
  setRunning(on: boolean): void;
  /** Draw once, for when something the frame callback reads has changed while the loop is stopped. */
  redraw(): void;
  destroy(): void;
}

interface Options {
  canvas: HTMLCanvasElement;
  /** The amber block under the canvas; its colour is the liquid's colour. */
  body: HTMLElement;
  /** Called every frame so text can be clipped to the surface and things can float on it. */
  onFrame?: (surfaceY: (clientX: number) => number, heightAt: (clientX: number) => number) => void;
  animate: boolean;
}

const SPACING = 14;
const TENSION = 34;
const DAMPING = 3.2;
const SPREAD = 0.22;
const STEP = 1 / 60;
const LIMIT = 96;

export function createLiquid({ canvas, body, onFrame, animate }: Options): Liquid {
  const ctx = canvas.getContext("2d")!;
  let width = 0;
  let band = 0;
  let left = 0;
  let top = 0;
  let count = 0;
  let heights = new Float32Array(0);
  let velocities = new Float32Array(0);
  let colour = "#ffb02e";
  let slope = 0;
  let slopeTarget = 0;
  let clock = 0;
  let accumulator = 0;
  let last = 0;
  let frame = 0;
  let running = false;

  function measure() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = box.width;
    band = box.height;
    left = box.left + window.scrollX;
    top = box.top + window.scrollY;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(band * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const next = Math.min(140, Math.max(24, Math.round(width / SPACING) + 1));
    if (next !== count) {
      count = next;
      heights = new Float32Array(count);
      velocities = new Float32Array(count);
    }
    colour = getComputedStyle(body).backgroundColor || colour;
    draw();
  }

  /** The surface's resting shape: a slow swell, plus the lean from tilt. */
  function rest(i: number) {
    const t = i / (count - 1);
    const swell = animate ? Math.sin(t * 7.2 + clock * 0.9) * 5 + Math.sin(t * 3.1 - clock * 0.55) * 7 : Math.sin(t * 7.2) * 5 + Math.sin(t * 3.1) * 7;
    return swell + (t - 0.5) * width * slope;
  }

  function step() {
    slope += (slopeTarget - slope) * 0.06;
    for (let i = 0; i < count; i++) {
      const stretch = heights[i] - rest(i);
      velocities[i] += (-TENSION * stretch - DAMPING * velocities[i]) * STEP;
      heights[i] += velocities[i] * STEP;
    }
    // Let each column pull on its neighbours, twice, so a splash travels.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < count; i++) {
        if (i > 0) velocities[i - 1] += SPREAD * (heights[i] - heights[i - 1]);
        if (i < count - 1) velocities[i + 1] += SPREAD * (heights[i] - heights[i + 1]);
      }
    }
    for (let i = 0; i < count; i++) {
      if (heights[i] > LIMIT) heights[i] = LIMIT;
      else if (heights[i] < -LIMIT) heights[i] = -LIMIT;
    }
  }

  function sample(x: number) {
    const position = Math.max(0, Math.min(count - 1, (x / width) * (count - 1)));
    const i = Math.floor(position);
    const f = position - i;
    const a = heights[i] ?? 0;
    const b = heights[Math.min(count - 1, i + 1)] ?? a;
    return a + (b - a) * f;
  }

  function draw() {
    if (!count) return;
    const mid = band / 2;
    ctx.clearRect(0, 0, width, band);
    ctx.beginPath();
    ctx.moveTo(0, mid - heights[0]);
    const gap = width / (count - 1);
    for (let i = 1; i < count; i++) {
      const px = (i - 1) * gap;
      const py = mid - heights[i - 1];
      const x = i * gap;
      const y = mid - heights[i];
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
    }
    ctx.lineTo(width, mid - heights[count - 1]);
    ctx.lineTo(width, band);
    ctx.lineTo(0, band);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    onFrame?.(surfaceY, heightAt);
  }

  /** Document y of the surface at a viewport x, in CSS pixels. */
  const surfaceY = (clientX: number) => top + band / 2 - sample(clientX + window.scrollX - left);
  const heightAt = (clientX: number) => sample(clientX + window.scrollX - left);

  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : STEP);
    last = now;
    clock += dt;
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard++ < 8) {
      step();
      accumulator -= STEP;
    }
    draw();
    frame = requestAnimationFrame(loop);
  }

  function setRunning(on: boolean) {
    if (!animate || on === running) return;
    running = on;
    if (on) {
      last = 0;
      frame = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(frame);
    }
  }

  function splash(clientX: number, strength: number) {
    if (!animate || !count) return;
    const centre = ((clientX + window.scrollX - left) / width) * (count - 1);
    for (let i = 0; i < count; i++) {
      const distance = Math.abs(i - centre);
      if (distance < 6) velocities[i] -= strength * (1 - distance / 6);
    }
  }

  function kick(amount: number) {
    if (!animate || !count) return;
    const clamped = Math.max(-260, Math.min(260, amount));
    for (let i = 0; i < count; i++) {
      velocities[i] += clamped * (0.55 * Math.sin(i * 0.42 + clock * 3) + 0.45 * Math.sin(i * 0.17 - clock * 2));
    }
  }

  function tilt(degrees: number) {
    const limited = Math.max(-14, Math.min(14, degrees));
    slopeTarget = Math.tan((limited * Math.PI) / 180) * 0.5;
  }

  const onTheme = () => {
    // The colour is read after the theme has changed.
    requestAnimationFrame(() => {
      colour = getComputedStyle(body).backgroundColor || colour;
      if (!running) draw();
    });
  };
  window.addEventListener("hp:theme", onTheme);
  let resizeTimer = 0;
  const resize = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 100);
  });
  resize.observe(canvas);
  measure();
  // Start from the resting shape so the first frame is already a wave.
  for (let i = 0; i < count; i++) heights[i] = rest(i);
  draw();

  return {
    heightAt,
    splash,
    kick,
    tilt,
    setRunning,
    redraw: draw,
    destroy() {
      setRunning(false);
      resize.disconnect();
      window.removeEventListener("hp:theme", onTheme);
    },
  };
}
