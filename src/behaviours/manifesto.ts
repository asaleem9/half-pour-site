/** Act 2: each line's old phrase is struck as it scrolls in, and the new line rises word by word. */
import { gsap, ScrollTrigger, initScroll, reducedMotion, whenIdle } from "@/behaviours/scroll";

const section = document.querySelector<HTMLElement>("[data-manifesto]");

if (section && !reducedMotion()) whenIdle(() => setup(section));

function setup(section: HTMLElement) {
  initScroll();
  import("gsap/SplitText").then(({ SplitText }) => {
    gsap.registerPlugin(SplitText);
    for (const line of section.querySelectorAll<HTMLElement>("[data-manifesto-line]")) {
      const strike = line.querySelector<HTMLElement>("[data-manifesto-strike]")!;
      const old = line.querySelector<HTMLElement>("[data-manifesto-old]")!;
      const now = line.querySelector<HTMLElement>("[data-manifesto-now]")!;
      const note = line.querySelector<HTMLElement>("[data-manifesto-note]")!;
      gsap.set(strike, { scaleX: 0 });
      // autoSplit re-splits when the font loads or the width changes; the animation is rebuilt with it.
      SplitText.create(now, {
        type: "words",
        mask: "words",
        autoSplit: true,
        aria: "auto",
        onSplit(self) {
          gsap.set(self.words, { yPercent: 110 });
          const timeline = gsap
            .timeline({ scrollTrigger: { trigger: line, start: "top 78%", once: true }, defaults: { ease: "power3.out" } })
            .fromTo(old, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.45 })
            .to(strike, { scaleX: 1, duration: 0.42, ease: "power2.inOut" }, "+=0.12")
            .to(old, { opacity: 0.45, duration: 0.3 }, "<0.1")
            .add(() => window.dispatchEvent(new CustomEvent("hp:sound", { detail: { name: "whoosh" } })), "<")
            .to(self.words, { yPercent: 0, duration: 0.7, stagger: 0.08 }, "<0.05")
            .fromTo(note, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, "<0.25");
          return timeline;
        },
      });
    }
    ScrollTrigger.refresh();
  });
}
