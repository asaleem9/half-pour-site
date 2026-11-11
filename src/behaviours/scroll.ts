/**
 * One scroll source for the page: GSAP ScrollTrigger, fed by Lenis on pointer devices. Touch devices and
 * visitors who ask for reduced motion keep native scrolling.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const coarsePointer = () => window.matchMedia("(pointer: coarse)").matches;

type VelocityListener = (pixelsPerSecond: number) => void;
const velocityListeners = new Set<VelocityListener>();
/** Calls back with the page's scroll speed (positive is downward) whenever it scrolls. */
export function onScrollVelocity(listener: VelocityListener) {
  velocityListeners.add(listener);
  return () => velocityListeners.delete(listener);
}

let started = false;
export function initScroll() {
  if (started) return;
  started = true;

  let lastY = window.scrollY;
  let lastT = performance.now();
  window.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      const dt = Math.max(8, now - lastT);
      const velocity = ((window.scrollY - lastY) / dt) * 1000;
      lastY = window.scrollY;
      lastT = now;
      for (const listener of velocityListeners) listener(velocity);
    },
    { passive: true },
  );

  if (!reducedMotion() && !coarsePointer()) {
    import("lenis").then(({ default: Lenis }) => {
      const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, syncTouch: false, anchors: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      // Dialogs and anything else that needs the page to hold still.
      window.addEventListener("hp:scroll-lock", (event) => {
        if ((event as CustomEvent<boolean>).detail) lenis.stop();
        else lenis.start();
      });
    });
  }

  const refresh = () => ScrollTrigger.refresh();
  document.fonts?.ready.then(refresh);
  window.addEventListener("load", refresh, { once: true });
  let resizeTimer = 0;
  new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refresh, 150);
  }).observe(document.body);
}

/** Runs `enter` the first time an element comes near the viewport. */
export function whenNear(element: Element, enter: () => void, rootMargin = "60% 0px") {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        enter();
      }
    },
    { rootMargin },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

/** Tells a behaviour whether its element is on screen, so loops can stop when it is not. */
export function watchVisible(element: Element, change: (visible: boolean) => void, rootMargin = "0px") {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) change(entry.isIntersecting);
    },
    { rootMargin },
  );
  observer.observe(element);
  return () => observer.disconnect();
}
