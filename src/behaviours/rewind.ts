/**
 * Act 3. One scroll position decides everything on the stage: the clock, the colour of the sky, where the
 * sun and moon sit, which moment of the app footage shows, which panel of copy is up and what Pourie is
 * doing. Nothing here runs on its own clock, so scrolling back plays it all in reverse.
 */
import { gsap, ScrollTrigger, initScroll, reducedMotion, whenNear } from "@/behaviours/scroll";
import { createRig, type Rig } from "@/behaviours/rig";
import { currentTheme, setClockText, releaseClock } from "@/behaviours/theme";

interface Stop {
  name: string;
  time: string;
  theme: string;
  start: number;
  end: number;
  at: number;
  title: string;
  prop: string;
  scene: string;
}
interface Data {
  src: string;
  duration: number;
  stops: Stop[];
}

const section = document.querySelector<HTMLElement>("[data-rewind]");
const dataEl = document.getElementById("rewind-data");

// Where each part of the story sits in the scroll, as fractions of the section.
const INTRO = 0.07;
const STOPS: Array<[number, number]> = [
  [0.07, 0.27],
  [0.34, 0.52],
  [0.58, 0.75],
  [0.82, 0.955],
];
// Minutes on the clock at each stop, counted so that later stops are earlier in the night.
const MINUTES = [540, 0, -90, -360];
const FADE = 0.03;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));

function formatClock(minutes: number) {
  const day = ((Math.round(minutes / 5) * 5) % 1440 + 1440) % 1440;
  const hours = Math.floor(day / 60);
  const mins = day % 60;
  const suffix = hours < 12 ? "AM" : "PM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

if (section && dataEl && !reducedMotion()) {
  initScroll();
  const data = JSON.parse(dataEl.textContent || "{}") as Data;
  const stage = section.querySelector<HTMLElement>("[data-rewind-stage]")!;
  const timeEl = section.querySelector<HTMLElement>("[data-rewind-time]")!;
  const glyph = section.querySelector<SVGElement>("[data-rewind-glyph]")!;
  const sun = section.querySelector<HTMLElement>("[data-rewind-sun]")!;
  const moon = section.querySelector<HTMLElement>("[data-rewind-moon]")!;
  const stars = section.querySelector<HTMLElement>("[data-rewind-stars]")!;
  const device = section.querySelector<HTMLElement>("[data-rewind-device]")!;
  const video = section.querySelector<HTMLVideoElement>("[data-rewind-video]")!;
  const pourieEl = section.querySelector<HTMLElement>("[data-rewind-pourie]")!;
  const panel = (name: string) => section.querySelector<HTMLElement>(`[data-rewind-panel="${name}"]`)!;
  const panels = { intro: panel("intro"), outro: panel("outro"), stops: data.stops.map((stop) => panel(stop.name)) };
  const posters = data.stops.map((stop) => section.querySelector<HTMLImageElement>(`[data-rewind-poster="${stop.name}"]`)!);
  const scenes = data.stops.map((stop) => section.querySelector<HTMLElement>(`[data-rewind-scene="${stop.name}"]`));
  const dots = data.stops.map((stop) => section.querySelector<HTMLElement>(`[data-rewind-dot="${stop.name}"]`)!);

  section.classList.add("is-live");
  const rig: Rig = createRig(pourieEl.querySelector<SVGSVGElement>("[data-rig]")!);
  rig.setArm("wave", true);

  let stageW = 0;
  let stageH = 0;
  const measure = () => {
    stageW = stage.clientWidth;
    stageH = stage.clientHeight;
  };
  measure();
  new ResizeObserver(measure).observe(stage);

  // The footage: fetched whole when the section is near, so seeking never waits on the network.
  let videoReady = false;
  let videoTarget = 0;
  let videoShown = -1;
  whenNear(
    section,
    () => {
      fetch(data.src)
        .then((response) => response.blob())
        .then((blob) => {
          video.src = URL.createObjectURL(blob);
          video.load();
          video.addEventListener(
            "loadeddata",
            () => {
              videoReady = true;
              for (const poster of posters) poster.style.opacity = "0";
            },
            { once: true },
          );
        })
        .catch(() => {});
    },
    "150% 0px",
  );

  let lastClock = "";
  let lastStop = -2;
  let lastHeld = "";
  let active = false;

  // Each body has its own arc, placed so it never sits behind the copy: the sun circles the phone, the
  // moon climbs through the gap between the copy and the phone. On narrow screens both keep to the top right.
  interface Arc {
    cx: number;
    rx: number;
    horizon: number;
    ry: number;
  }
  const arcs = (): { sun: Arc; moon: Arc } =>
    stageW < 860
      ? { sun: { cx: 0.86, rx: 0.1, horizon: 0.27, ry: 0.14 }, moon: { cx: 0.86, rx: 0.06, horizon: 0.27, ry: 0.14 } }
      : { sun: { cx: 0.72, rx: 0.25, horizon: 0.84, ry: 0.6 }, moon: { cx: 0.52, rx: 0.2, horizon: 0.84, ry: 0.62 } };

  function place(el: HTMLElement, hour: number, rise: number, set: number, arc: Arc) {
    // 0 at the eastern horizon, half way at the top of the sky, 1 at the western horizon.
    const t = (hour - rise) / (set - rise);
    const visible = t > -0.04 && t < 1.04;
    const angle = t * Math.PI;
    const x = stageW * (arc.cx - Math.cos(angle) * arc.rx);
    const y = stageH * (arc.horizon - Math.sin(angle) * arc.ry);
    const size = el.offsetWidth;
    el.style.transform = `translate3d(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px, 0)`;
    el.style.opacity = visible ? String(clamp01(Math.sin(angle) * 6)) : "0";
  }

  function render(p: number) {
    // Which stop we are in, or between.
    let stopIndex = -1;
    let between = -1; // index of the stop we are leaving, when travelling to the next
    let travel = 0;
    for (let i = 0; i < STOPS.length; i++) {
      if (p >= STOPS[i][0] && p <= STOPS[i][1]) stopIndex = i;
      if (i < STOPS.length - 1 && p > STOPS[i][1] && p < STOPS[i + 1][0]) {
        between = i;
        travel = span(p, STOPS[i][1], STOPS[i + 1][0]);
      }
    }

    // The clock.
    let minutes = MINUTES[0];
    if (stopIndex >= 0) minutes = MINUTES[stopIndex];
    else if (between >= 0) minutes = lerp(MINUTES[between], MINUTES[between + 1], smooth(travel));
    else if (p > STOPS[3][1]) minutes = MINUTES[3];
    const text = formatClock(minutes);
    if (text !== lastClock) {
      lastClock = text;
      timeEl.textContent = text;
      if (active) setClockText(text, "rewind");
    }
    glyph.style.transform = between >= 0 ? `translateX(${(-Math.sin(travel * Math.PI) * 7).toFixed(1)}px)` : "";

    // The sky's colour. It starts and ends on whatever the visitor's own theme is, so nothing snaps.
    const home = currentTheme() === "dark" ? 1 : 0;
    let night = 0;
    let dusk = 0;
    if (p < INTRO) night = lerp(home, 0, smooth(span(p, 0.01, INTRO)));
    else if (p < STOPS[0][1]) night = 0;
    else if (p < STOPS[1][0]) night = smooth(span(p, STOPS[0][1], STOPS[1][0]));
    else if (p < STOPS[2][1]) night = 1;
    else if (p < STOPS[3][0]) {
      night = 1 - smooth(span(p, STOPS[2][1], STOPS[3][0]));
      dusk = 1 - night;
    } else if (p <= STOPS[3][1]) dusk = 1;
    else {
      const out = smooth(span(p, STOPS[3][1], 0.995));
      dusk = 1 - out;
      night = lerp(0, home, out);
    }
    stage.style.setProperty("--night", night.toFixed(3));
    stage.style.setProperty("--dusk", dusk.toFixed(3));
    stars.style.opacity = (night * night).toFixed(3);

    // Sun and moon. The sun is up from about a quarter past five to a quarter to seven in the evening.
    const hour = ((((minutes % 1440) + 1440) % 1440) / 60 + 24) % 24;
    const sky = arcs();
    place(sun, hour, 5.25, 18.75, sky.sun);
    place(moon, hour < 12 ? hour + 24 : hour, 18.75, 29.25, sky.moon);

    // Copy panels: each fades up as its stop arrives and away as it leaves.
    const show = (el: HTMLElement, weight: number, direction: number) => {
      const w = smooth(weight);
      el.style.opacity = w.toFixed(3);
      el.style.visibility = w > 0.01 ? "visible" : "hidden";
      el.style.transform = `translate3d(0, ${((1 - w) * 28 * direction).toFixed(1)}px, 0)`;
    };
    show(panels.intro, 1 - span(p, INTRO - FADE * 1.4, INTRO - 0.005), -1);
    data.stops.forEach((_, i) => {
      const [from, to] = STOPS[i];
      const rising = span(p, from - 0.012, from + FADE);
      const falling = 1 - span(p, to - 0.005, to + FADE);
      show(panels.stops[i], Math.min(rising, falling), p < from + FADE ? 1 : -1);
    });
    show(panels.outro, span(p, STOPS[3][1] + 0.012, 0.99), 1);

    // The phone. It rises during the intro, and between stops it flips to the next screen.
    let footage = stopIndex >= 0 ? stopIndex : between >= 0 ? (travel < 0.5 ? between : between + 1) : p < STOPS[0][0] ? 0 : 3;
    const stop = data.stops[footage];
    if (stopIndex >= 0) {
      const local = span(p, STOPS[stopIndex][0] + 0.01, STOPS[stopIndex][1] - 0.015);
      // The score footage opens on a few frames of the app launching; skip them.
      const from = stop.name === "score" ? stop.start + 0.34 : stop.start;
      videoTarget = lerp(from, stop.end - 0.07, local);
    } else if (between >= 0) {
      const next = data.stops[between + 1];
      videoTarget = travel < 0.5 ? data.stops[between].end - 0.07 : next.name === "score" ? next.start + 0.34 : next.start;
    } else {
      videoTarget = p < STOPS[0][0] ? stop.start : stop.end - 0.07;
    }
    const flip = between >= 0 ? Math.cos(travel * Math.PI) : 1;
    const entry = smooth(span(p, 0.0, INTRO - 0.01));
    device.style.transform = `translate3d(0, ${((1 - entry) * 70).toFixed(2)}svh, 0) rotateY(${((1 - Math.abs(flip)) * (flip < 0 ? -90 : 90)).toFixed(2)}deg)`;
    if (!videoReady) {
      posters.forEach((poster, i) => {
        poster.style.opacity = i === footage ? "1" : "0";
      });
    }

    // Pourie: moonwalks between stops, and at each stop holds something from that hour.
    const settled = stopIndex >= 0 ? stopIndex : p < STOPS[0][0] ? -1 : between >= 0 ? -1 : 3;
    if (between >= 0) {
      rig.walk(travel * 3, -0.9);
    } else if (lastStop !== settled || lastStop === -2) {
      rig.stand();
    }
    const held = settled >= 0 ? data.stops[settled].prop : "";
    if (held !== lastHeld) {
      lastHeld = held;
      rig.hold(held ? `/art/${held}-400.webp` : null, { x: 508, y: 178, size: 190 });
      rig.setArm(held ? "wave" : "down");
    }
    if (settled !== lastStop) {
      lastStop = settled;
      if (settled >= 0) {
        rig.setEyes("open");
        rig.setMouth(settled === 1 ? "smile" : "open");
        rig.blink();
        window.dispatchEvent(new CustomEvent("hp:sound", { detail: { name: "tick" } }));
      }
      dots.forEach((dot, i) => dot.toggleAttribute("data-on", i === settled));
    }
    scenes.forEach((scene, i) => {
      if (!scene) return;
      const [from, to] = STOPS[i];
      const w = smooth(Math.min(span(p, from - 0.01, from + 0.03), 1 - span(p, to - 0.01, to + 0.03)));
      scene.style.opacity = w.toFixed(3);
      scene.style.transform = `translate3d(0, ${((1 - w) * 40).toFixed(1)}px, 0)`;
    });
  }

  // Scrub: the scroll position eases toward where the page is, so wheel steps read as travel.
  const state = { p: 0 };
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    onToggle(self) {
      active = self.isActive;
      if (active) setClockText(lastClock || "9:00 AM", "rewind");
      else releaseClock("rewind");
    },
    onUpdate(self) {
      gsap.to(state, { p: self.progress, duration: 0.5, ease: "power2.out", overwrite: true, onUpdate: () => render(state.p) });
    },
  });
  state.p = trigger.progress;
  render(state.p);

  // The footage follows its target a frame at a time; setting currentTime more often than that is wasted.
  gsap.ticker.add(() => {
    if (!videoReady || !active) return;
    if (Math.abs(videoTarget - videoShown) > 1 / 30) {
      videoShown = videoTarget;
      video.currentTime = Math.max(0, Math.min(data.duration - 0.04, videoTarget));
    }
  });
  window.addEventListener("hp:theme", () => render(state.p));
}
