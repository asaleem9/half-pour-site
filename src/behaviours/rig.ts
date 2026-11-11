/**
 * Drives the vector Pourie (components/rig/Pourie.astro). One controller per <svg data-rig>.
 * Everything is a transform on a group, except the liquid's top edge, which is redrawn while it sloshes.
 */
import { gsap } from "gsap";

export type Mouth = "open" | "smile" | "oh";
export type ArmPose = "wave" | "down" | "up";

export interface Rig {
  el: SVGSVGElement;
  /** Turn the eyes (and a little of the face) toward a point in the viewport. */
  lookAt(clientX: number, clientY: number): void;
  lookAhead(): void;
  blink(): void;
  setEyes(state: "open" | "happy"): void;
  setMouth(mouth: Mouth): void;
  setArm(pose: ArmPose, instant?: boolean): void;
  wave(): gsap.core.Timeline;
  hop(height?: number, onLand?: () => void): gsap.core.Timeline;
  cheer(): gsap.core.Timeline;
  /** Pose the walk cycle at `progress` (any number; one step pair per unit). `lean` is -1..1. */
  walk(progress: number, lean?: number): void;
  stand(): void;
  /** Kick the liquid: positive tips it to the right. */
  slosh(impulse: number): void;
  /** Put something in the raised hand (or pass null to empty it). */
  hold(src: string | null, box?: { x: number; y: number; size: number }): void;
  setIdle(on: boolean): void;
  destroy(): void;
}

const HIP = { l: "256 556", r: "378 556" } as const;
const SHOULDER = { l: "136 398", r: "494 392" } as const;
const ARM_R = { wave: 0, up: -22, down: 92 } as const;
const LIQUID_Y = 288;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The liquid's outline for a given tilt (px of rise at the right wall) and ripple. Its mean level never moves. */
function liquidPath(tilt: number, ripple: number, phase: number) {
  const left = 96;
  const right = 534;
  const steps = 14;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = left + (right - left) * t;
    const rest = Math.sin(t * Math.PI * 3.1 + 0.6) * 7;
    const y = LIQUID_Y + rest - tilt * (t - 0.5) * 2 + Math.sin(t * Math.PI * 2.2 + phase) * ripple;
    points.push([x, y]);
  }
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const mx = (px + x) / 2;
    const my = (py + y) / 2;
    d += ` Q${px.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    if (i === points.length - 1) d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L484 500 Q315 528 146 500 Z`;
}

export function createRig(el: SVGSVGElement, options: { idle?: boolean } = {}): Rig {
  const q = <T extends Element>(selector: string) => el.querySelector<T>(selector)!;
  const root = q<SVGGElement>("[data-rig-root]");
  const bob = q<SVGGElement>("[data-rig-bob]");
  const body = q<SVGGElement>("[data-rig-body]");
  const legL = q<SVGGElement>('[data-rig-leg="l"]');
  const legR = q<SVGGElement>('[data-rig-leg="r"]');
  const armL = q<SVGGElement>('[data-rig-arm="l"]');
  const armR = q<SVGGElement>('[data-rig-arm="r"]');
  const face = q<SVGGElement>("[data-rig-face]");
  const eyes = q<SVGGElement>("[data-rig-eyes]");
  const eyeDots = Array.from(el.querySelectorAll<SVGElement>("[data-rig-eye]"));
  const eyesClosed = q<SVGPathElement>("[data-rig-eye-closed]");
  const liquid = q<SVGPathElement>("[data-rig-liquid]");
  const prop = q<SVGImageElement>("[data-rig-prop]");
  const mouths = {
    open: q<SVGElement>('[data-rig-mouth="open"]'),
    smile: q<SVGElement>('[data-rig-mouth="smile"]'),
    oh: q<SVGElement>('[data-rig-mouth="oh"]'),
  };
  const still = reduced();

  gsap.set(legL, { svgOrigin: HIP.l });
  gsap.set(legR, { svgOrigin: HIP.r });
  gsap.set(armL, { svgOrigin: SHOULDER.l });
  gsap.set(armR, { svgOrigin: SHOULDER.r });
  gsap.set(body, { svgOrigin: "315 570" });
  gsap.set(eyeDots[0], { svgOrigin: "247 354" });
  gsap.set(eyeDots[1], { svgOrigin: "393 354" });

  let armPose: ArmPose = "wave";
  let eyesState: "open" | "happy" = "open";
  let idleOn = false;
  let idleTween: gsap.core.Tween | null = null;
  let blinkTimer = 0;
  let destroyed = false;

  // Eyes: quick, smoothed moves toward the pointer.
  const eyeX = gsap.quickTo(eyes, "x", { duration: 0.35, ease: "power3.out" });
  const eyeY = gsap.quickTo(eyes, "y", { duration: 0.35, ease: "power3.out" });
  const faceX = gsap.quickTo(face, "x", { duration: 0.5, ease: "power3.out" });
  const faceY = gsap.quickTo(face, "y", { duration: 0.5, ease: "power3.out" });

  function lookAt(clientX: number, clientY: number) {
    const box = eyes.getBoundingClientRect();
    if (!box.width) return;
    const scale = 640 / el.getBoundingClientRect().width; // viewBox units per CSS pixel
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, distance / 260);
    const ux = (dx / distance) * reach;
    const uy = (dy / distance) * reach;
    eyeX(ux * 11);
    eyeY(uy * 9);
    faceX(ux * 5);
    faceY(uy * 4);
    void scale;
  }
  function lookAhead() {
    eyeX(0);
    eyeY(0);
    faceX(0);
    faceY(0);
  }

  function setEyes(state: "open" | "happy") {
    eyesState = state;
    gsap.set(eyeDots, { visibility: state === "open" ? "visible" : "hidden" });
    gsap.set(eyesClosed, { visibility: state === "happy" ? "visible" : "hidden" });
  }
  function blink() {
    if (eyesState !== "open" || still) return;
    gsap.timeline().to(eyeDots, { scaleY: 0.1, duration: 0.07, ease: "power1.in" }).to(eyeDots, { scaleY: 1, duration: 0.12, ease: "power2.out" });
  }
  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    if (!idleOn || destroyed) return;
    blinkTimer = window.setTimeout(
      () => {
        blink();
        scheduleBlink();
      },
      2200 + Math.random() * 3800,
    );
  }

  function setMouth(mouth: Mouth) {
    for (const key of Object.keys(mouths) as Mouth[]) gsap.set(mouths[key], { visibility: key === mouth ? "visible" : "hidden" });
  }

  function setArm(pose: ArmPose, instant = false) {
    armPose = pose;
    gsap.to(armR, { rotation: ARM_R[pose], duration: instant || still ? 0 : 0.45, ease: "power3.out", overwrite: "auto" });
  }

  function wave() {
    const timeline = gsap.timeline();
    if (still) return timeline;
    const base = ARM_R.wave;
    timeline
      .to(armR, { rotation: base - 16, duration: 0.16, ease: "power2.out", overwrite: "auto" })
      .to(armR, { rotation: base + 10, duration: 0.2, ease: "sine.inOut" })
      .to(armR, { rotation: base - 14, duration: 0.2, ease: "sine.inOut" })
      .to(armR, { rotation: base + 8, duration: 0.2, ease: "sine.inOut" })
      .to(armR, { rotation: ARM_R[armPose], duration: 0.32, ease: "power3.out" });
    return timeline;
  }

  function hop(height = 70, onLand?: () => void) {
    const timeline = gsap.timeline();
    if (still) {
      onLand?.();
      return timeline;
    }
    timeline
      .to(body, { scaleY: 0.93, scaleX: 1.04, duration: 0.09, ease: "power2.out" })
      .to(root, { y: -height, duration: 0.26, ease: "power2.out" }, ">")
      .to(body, { scaleY: 1.05, scaleX: 0.97, duration: 0.2, ease: "power2.out" }, "<")
      .to([legL, legR], { rotation: (i) => (i === 0 ? 14 : -14), duration: 0.2, ease: "power2.out" }, "<")
      .to(root, { y: 0, duration: 0.24, ease: "power2.in" })
      .to([legL, legR], { rotation: 0, duration: 0.2, ease: "power2.in" }, "<")
      .add(() => {
        slosh(height > 40 ? 22 : 12);
        onLand?.();
      })
      .to(body, { scaleY: 0.9, scaleX: 1.06, duration: 0.08, ease: "power2.out" })
      .to(body, { scaleY: 1, scaleX: 1, duration: 0.42, ease: "elastic.out(1, 0.5)" });
    return timeline;
  }

  function cheer() {
    const timeline = gsap.timeline();
    if (still) return timeline;
    const before = armPose;
    timeline
      .add(() => {
        setEyes("happy");
        setMouth("open");
      })
      .to(armR, { rotation: ARM_R.up, duration: 0.18, ease: "power3.out", overwrite: "auto" }, 0)
      .to(armL, { rotation: 118, duration: 0.18, ease: "power3.out" }, 0)
      .add(hop(90), 0)
      .to(armL, { rotation: 0, duration: 0.4, ease: "power3.out" }, ">-0.2")
      .add(() => {
        setEyes("open");
        setArm(before);
      });
    return timeline;
  }

  function walk(progress: number, lean = 0) {
    const angle = progress * Math.PI * 2;
    const swing = Math.sin(angle);
    gsap.set(legL, { rotation: swing * 24, y: -Math.max(0, Math.cos(angle)) * 9 });
    gsap.set(legR, { rotation: -swing * 24, y: -Math.max(0, -Math.cos(angle)) * 9 });
    gsap.set(bob, { y: -Math.abs(swing) * 9, rotation: lean * 3.5 + Math.sin(angle * 2) * 1.2, svgOrigin: "315 600" });
    gsap.set(armL, { rotation: -swing * 14 });
    if (armPose === "down") gsap.set(armR, { rotation: ARM_R.down + swing * 14 });
  }
  function stand() {
    gsap.to([legL, legR], { rotation: 0, y: 0, duration: 0.25, ease: "power3.out", overwrite: "auto" });
    gsap.to(bob, { y: 0, rotation: 0, duration: 0.25, ease: "power3.out", overwrite: "auto" });
    gsap.to(armL, { rotation: 0, duration: 0.25, ease: "power3.out", overwrite: "auto" });
  }

  // Liquid: a damped spring for the tilt and a ripple that dies away. It only ticks while it has energy.
  const fluid = { tilt: 0, velocity: 0, ripple: 0, phase: 0, running: false };
  function tickFluid(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    const steps = Math.max(1, Math.round(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = -180 * fluid.tilt - 9 * fluid.velocity;
      fluid.velocity += accel * h;
      fluid.tilt += fluid.velocity * h;
    }
    fluid.ripple *= Math.exp(-2.4 * dt);
    fluid.phase += dt * 9;
    liquid.setAttribute("d", liquidPath(fluid.tilt, fluid.ripple, fluid.phase));
    if (Math.abs(fluid.tilt) < 0.15 && Math.abs(fluid.velocity) < 0.6 && fluid.ripple < 0.2) {
      fluid.tilt = 0;
      fluid.velocity = 0;
      fluid.ripple = 0;
      liquid.setAttribute("d", liquidPath(0, 0, 0));
      gsap.ticker.remove(tickFluid);
      fluid.running = false;
    }
  }
  function slosh(impulse: number) {
    if (still || destroyed) return;
    fluid.velocity += Math.max(-420, Math.min(420, impulse * 9));
    fluid.ripple = Math.min(14, fluid.ripple + Math.abs(impulse) * 0.35);
    if (!fluid.running) {
      fluid.running = true;
      gsap.ticker.add(tickFluid);
    }
  }

  function hold(src: string | null, box = { x: 522, y: 182, size: 170 }) {
    if (!src) {
      prop.setAttribute("visibility", "hidden");
      return;
    }
    prop.setAttribute("href", src);
    prop.setAttribute("x", String(box.x));
    prop.setAttribute("y", String(box.y));
    prop.setAttribute("width", String(box.size));
    prop.setAttribute("height", String(box.size));
    prop.setAttribute("visibility", "visible");
  }

  function setIdle(on: boolean) {
    if (still || destroyed || on === idleOn) return;
    idleOn = on;
    if (on) {
      idleTween = gsap.to(bob, { y: -7, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
      scheduleBlink();
    } else {
      idleTween?.kill();
      idleTween = null;
      gsap.to(bob, { y: 0, duration: 0.3 });
      window.clearTimeout(blinkTimer);
    }
  }

  function destroy() {
    destroyed = true;
    setIdle(false);
    gsap.ticker.remove(tickFluid);
    gsap.killTweensOf([root, bob, body, legL, legR, armL, armR, eyes, face, ...eyeDots]);
  }

  liquid.setAttribute("d", liquidPath(0, 0, 0));
  if (options.idle) setIdle(true);

  return { el, lookAt, lookAhead, blink, setEyes, setMouth, setArm, wave, hop, cheer, walk, stand, slosh, hold, setIdle, destroy };
}

/** Lets a rig follow the pointer while it is on screen. Returns a function that stops it. */
export function followPointer(rig: Rig) {
  if (reduced() || window.matchMedia("(pointer: coarse)").matches) return () => {};
  let visible = false;
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) rig.lookAhead();
  });
  observer.observe(rig.el);
  const onMove = (event: PointerEvent) => {
    if (visible) rig.lookAt(event.clientX, event.clientY);
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    observer.disconnect();
    window.removeEventListener("pointermove", onMove);
  };
}
