/** Act 8: the lockup assembles once as it scrolls in, with one burst of confetti, then holds. */
import { gsap, ScrollTrigger, initScroll, reducedMotion, watchVisible, whenNear } from "@/behaviours/scroll";
import { createRig, followPointer } from "@/behaviours/rig";

const closeAct = document.querySelector<HTMLElement>("[data-close-act]");
if (closeAct) whenNear(closeAct, () => setup(closeAct), "80% 0px");

function setup(section: HTMLElement) {
  const still = reducedMotion();
  const rig = createRig(section.querySelector<SVGSVGElement>("[data-rig]")!, { idle: false });
  followPointer(rig);
  watchVisible(section, (visible) => rig.setIdle(visible && !still));

  if (!still) {
    initScroll();
    const disc = section.querySelector<HTMLElement>("[data-close-disc]")!;
    const title = section.querySelector<HTMLElement>("[data-close-title]")!;
    const line = section.querySelector<HTMLElement>("[data-close-line]")!;
    const cta = section.querySelector<HTMLElement>("[data-close-cta]")!;
    const bits = Array.from(section.querySelectorAll<HTMLElement>("[data-close-bit]"));

    import("gsap/SplitText").then(({ SplitText }) => {
      gsap.registerPlugin(SplitText);
      const split = SplitText.create(title, { type: "chars", aria: "auto" });
      gsap.set([disc, line, cta], { opacity: 0 });
      gsap.set(split.chars, { opacity: 0 });
      gsap.set(bits, { opacity: 0 });

      ScrollTrigger.create({
        trigger: section,
        start: "top 62%",
        once: true,
        onEnter() {
          const box = section.getBoundingClientRect();
          const centre = disc.getBoundingClientRect();
          const cx = centre.left + centre.width / 2 - box.left;
          const cy = centre.top + centre.height / 2 - box.top;
          gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .fromTo(disc, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.6 })
            .add(() => {
              rig.wave();
              window.dispatchEvent(new CustomEvent("hp:sound", { detail: { name: "fanfare" } }));
              window.dispatchEvent(new CustomEvent("hp:burst", { detail: "burst-cheer" }));
            }, 0.25)
            .fromTo(split.chars, { opacity: 0, y: 60, rotation: () => gsap.utils.random(-18, 18) }, { opacity: 1, y: 0, rotation: 0, duration: 0.55, stagger: 0.045, ease: "back.out(1.6)" }, 0.3)
            .fromTo(line, { opacity: 0, scaleX: 0.2, transformOrigin: "50% 50%" }, { opacity: 1, scaleX: 1, duration: 0.55 }, 0.85)
            .fromTo(cta, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5 }, 1.1)
            // Confetti flies out from behind the disc to where it rests.
            .fromTo(
              bits,
              {
                opacity: 1,
                x: (_, el: HTMLElement) => cx - el.offsetLeft - el.offsetWidth / 2,
                y: (_, el: HTMLElement) => cy - el.offsetTop - el.offsetHeight / 2,
                scale: 0.2,
              },
              { x: 0, y: 0, scale: 1, duration: 0.9, stagger: 0.03, ease: "power3.out" },
              0.2,
            );
        },
      });
    });
  }
}
