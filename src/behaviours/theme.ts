/**
 * Day and night. The saved choice lives on <html data-theme>; the clock chip in the nav flips it with a
 * circular reveal from the chip when the browser supports same-document view transitions.
 */
type Theme = "light" | "dark";

const root = document.documentElement;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function currentTheme(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

/** Other behaviours (the rewind) take over the clock text while they run. */
let clockOwner: string | null = null;
export function setClockText(text: string, owner: string) {
  clockOwner = owner;
  for (const el of document.querySelectorAll<HTMLElement>("[data-clock-text]")) el.textContent = text;
}
export function releaseClock(owner: string) {
  if (clockOwner !== owner) return;
  clockOwner = null;
  paintClock();
}

function paintClock() {
  if (clockOwner) return;
  const dark = currentTheme() === "dark";
  for (const el of document.querySelectorAll<HTMLElement>("[data-clock-text]")) el.textContent = dark ? "12:00 AM" : "9:00 AM";
  for (const chip of document.querySelectorAll<HTMLElement>("[data-clock-chip]")) {
    chip.setAttribute("aria-pressed", String(dark));
    chip.setAttribute("aria-label", dark ? "Switch to day" : "Switch to night");
  }
}

function apply(theme: Theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem("hp-theme", theme);
  } catch {
    // Private browsing: the choice lasts for this page only.
  }
  paintClock();
  window.dispatchEvent(new CustomEvent("hp:theme", { detail: theme }));
}

export function toggleTheme(origin?: { x: number; y: number }) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const startViewTransition = (document as Document & { startViewTransition?: (cb: () => void) => ViewTransition }).startViewTransition;
  if (!startViewTransition || reducedMotion() || !origin) {
    apply(next);
    return;
  }
  root.classList.add("theme-reveal");
  const transition = startViewTransition.call(document, () => apply(next));
  const { x, y } = origin;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  transition.finished.finally(() => root.classList.remove("theme-reveal"));
}

function init() {
  paintClock();
  for (const chip of document.querySelectorAll<HTMLElement>("[data-clock-chip]")) {
    chip.addEventListener("click", () => {
      if (clockOwner) return; // read-only while the rewind is telling the time
      const box = chip.getBoundingClientRect();
      toggleTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    });
  }
  // Follow the system setting until the visitor chooses.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("hp-theme");
    } catch {
      saved = null;
    }
    if (!saved) {
      root.dataset.theme = event.matches ? "dark" : "light";
      paintClock();
    }
  });
}

init();
