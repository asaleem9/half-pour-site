/**
 * Joins the page's `hp:burst` event to the celebration overlays, so a section can ask for one by name
 * without knowing how it is played: window.dispatchEvent(new CustomEvent("hp:burst", { detail: "burst-badge" })).
 */
import { playBurst, warmBurst } from "@/behaviours/alpha-burst";

window.addEventListener("hp:burst", (event) => {
  const name = (event as CustomEvent<string>).detail;
  if (name) playBurst(name);
});

export { warmBurst };
