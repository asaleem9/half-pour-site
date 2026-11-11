/** Act 1: wires the liquid, the headline's colour split and Pourie together. */
import { gsap, initScroll, onScrollVelocity, reducedMotion, coarsePointer, watchVisible } from "@/behaviours/scroll";
import { createLiquid } from "@/behaviours/liquid";
import { createRig, followPointer } from "@/behaviours/rig";
import { requestTilt, onTilt, tiltNeedsPermission } from "@/behaviours/tilt";
import "@/behaviours/sound";

const hero = document.querySelector<HTMLElement>("[data-hero]");

if (hero) {
  initScroll();
  const canvas = hero.querySelector<HTMLCanvasElement>("[data-liquid-canvas]")!;
  const body = hero.querySelector<HTMLElement>("[data-liquid-body]")!;
  const head = hero.querySelector<HTMLElement>("[data-hero-head]")!;
  const under = hero.querySelector<HTMLElement>("[data-hero-under]")!;
  const pourieButton = hero.querySelector<HTMLElement>("[data-hero-pourie]")!;
  const rigSvg = pourieButton.querySelector<SVGSVGElement>("[data-rig]")!;
  const still = reducedMotion();
  const rig = createRig(rigSvg, { idle: !still });

  // Cached boxes, in document coordinates. Read on resize only, never inside the frame loop.
  let headBox = { left: 0, top: 0, width: 0, height: 0 };
  let pourieX = 0;
  function measure() {
    const h = head.getBoundingClientRect();
    headBox = { left: h.left + window.scrollX, top: h.top + window.scrollY, width: h.width, height: h.height };
    const p = pourieButton.getBoundingClientRect();
    pourieX = p.left + p.width / 2;
  }

  let float = 0;
  const liquid = createLiquid({
    canvas,
    body,
    animate: !still,
    onFrame(surfaceY, heightAt) {
      // The on-amber copy of the headline is visible only below the surface.
      const points: string[] = [];
      const samples = 18;
      for (let i = 0; i <= samples; i++) {
        const x = (headBox.width * i) / samples;
        const y = surfaceY(headBox.left + x - window.scrollX) - headBox.top;
        points.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`);
      }
      const floor = headBox.height * 1.3;
      under.style.clipPath = `polygon(${points.join(",")},${headBox.width.toFixed(1)}px ${floor.toFixed(1)}px,0px ${floor.toFixed(1)}px)`;
      // Pourie rides the surface, a little smoothed so it bobs instead of jittering.
      const target = -heightAt(pourieX);
      float += still ? target - float : (target - float) * 0.18;
      pourieButton.style.transform = `translate3d(0, ${float.toFixed(2)}px, 0)`;
    },
  });

  const remeasure = () => {
    measure();
    liquid.redraw();
  };
  remeasure();
  let resizeTimer = 0;
  new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(remeasure, 120);
  }).observe(hero);
  document.fonts?.ready.then(remeasure);

  watchVisible(hero, (visible) => {
    liquid.setRunning(visible);
    rig.setIdle(visible && !still);
  });

  if (!still) {
    followPointer(rig);

    // Scrolling sloshes the page and Pourie's own drink.
    onScrollVelocity((velocity) => {
      if (window.scrollY > window.innerHeight * 1.2) return;
      liquid.kick(velocity * 0.012);
      rig.slosh(velocity * 0.004);
    });

    // Dragging the pointer through the surface pushes it.
    let lastY = 0;
    let lastT = 0;
    hero.addEventListener(
      "pointermove",
      (event) => {
        const now = performance.now();
        const speed = lastT ? ((event.clientY - lastY) / Math.max(8, now - lastT)) * 1000 : 0;
        lastY = event.clientY;
        lastT = now;
        const box = canvas.getBoundingClientRect();
        const surface = box.top + box.height / 2 - liquid.heightAt(event.clientX);
        if (Math.abs(event.clientY - surface) < 46 && Math.abs(speed) > 140) {
          liquid.splash(event.clientX, Math.max(-320, Math.min(320, -speed * 0.16)));
        }
      },
      { passive: true },
    );

    // Tap Pourie: a hop, then a splash where it lands.
    pourieButton.addEventListener("click", () => {
      rig.setEyes("happy");
      rig.hop(coarsePointer() ? 54 : 84, () => {
        liquid.splash(pourieX, 330);
        rig.setEyes("open");
        window.dispatchEvent(new CustomEvent("hp:sound", { detail: { name: "splash", intensity: 0.7 } }));
      });
    });

    // A wave hello once the page has settled.
    gsap.delayedCall(0.9, () => rig.wave());

    // Phones: tilt the phone and the page tilts. iOS only allows this from a tap, so it sits behind a chip.
    const chip = hero.querySelector<HTMLElement>("[data-tilt-chip]");
    if (chip && coarsePointer() && "DeviceOrientationEvent" in window) {
      const start = () => {
        chip.classList.add("hidden");
        onTilt((gamma) => {
          liquid.tilt(gamma * 0.5);
        });
      };
      if (tiltNeedsPermission()) {
        chip.classList.remove("hidden");
        chip.addEventListener("click", async () => {
          if (await requestTilt()) start();
          else chip.classList.add("hidden");
        });
      } else {
        void requestTilt().then((granted) => granted && start());
      }
    }
  }
}
