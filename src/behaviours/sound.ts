/**
 * Interface sound, synthesised with Web Audio so there are no audio files to load. Off until the visitor
 * turns it on with the nav toggle. Anything can ask for a sound:
 *   window.dispatchEvent(new CustomEvent("hp:sound", { detail: { name: "pop", intensity: 0.6 } }))
 * or mark an element with data-sound="pop" to play it on click.
 */
export type SoundName = "pop" | "clink" | "splash" | "tick" | "press" | "fanfare" | "whoosh";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let muted = false; // true while the film is playing
let lastPlayed: Partial<Record<SoundName, number>> = {};

function ensureContext() {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  master = context.createGain();
  master.gain.value = 0.5;
  master.connect(compressor).connect(context.destination);
  return context;
}

function tone(options: { type?: OscillatorType; from: number; to?: number; duration: number; gain: number; delay?: number }) {
  if (!context || !master) return;
  const start = context.currentTime + (options.delay ?? 0);
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(options.from, start);
  if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(options.gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  osc.connect(amp).connect(master);
  osc.start(start);
  osc.stop(start + options.duration + 0.02);
}

function noise(options: { duration: number; gain: number; from: number; to: number; q?: number }) {
  if (!context || !master) return;
  const length = Math.floor(context.sampleRate * options.duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = options.q ?? 1.2;
  filter.frequency.setValueAtTime(options.from, context.currentTime);
  filter.frequency.exponentialRampToValueAtTime(options.to, context.currentTime + options.duration);
  const amp = context.createGain();
  amp.gain.setValueAtTime(options.gain, context.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + options.duration);
  source.connect(filter).connect(amp).connect(master);
  source.start();
}

const voices: Record<SoundName, (intensity: number) => void> = {
  pop: (i) => tone({ from: 520 + i * 180, to: 180, duration: 0.11, gain: 0.5 }),
  press: (i) => tone({ type: "triangle", from: 240 + i * 60, to: 120, duration: 0.09, gain: 0.55 }),
  tick: () => tone({ type: "square", from: 1600, to: 1200, duration: 0.03, gain: 0.12 }),
  clink: (i) => {
    tone({ from: 2100 + i * 500, to: 1900, duration: 0.22, gain: 0.16 + i * 0.12 });
    tone({ from: 3150 + i * 700, to: 2900, duration: 0.16, gain: 0.08 + i * 0.06 });
  },
  splash: (i) => {
    noise({ duration: 0.34, gain: 0.3 + i * 0.25, from: 900, to: 260, q: 0.8 });
    tone({ from: 300, to: 110, duration: 0.2, gain: 0.25 });
  },
  whoosh: () => noise({ duration: 0.3, gain: 0.18, from: 300, to: 2200, q: 0.9 }),
  fanfare: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone({ type: "triangle", from: frequency, duration: 0.26, gain: 0.3, delay: index * 0.09 }));
  },
};

/** Minimum gap between repeats of the same sound, in milliseconds. */
const gaps: Partial<Record<SoundName, number>> = { clink: 110, tick: 40, splash: 180 };

export function play(name: SoundName, intensity = 0.5) {
  if (!enabled || muted) return;
  const ctx = ensureContext();
  if (!ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (now - (lastPlayed[name] ?? 0) < (gaps[name] ?? 0)) return;
  lastPlayed[name] = now;
  voices[name]?.(Math.max(0, Math.min(1, intensity)));
}

export const soundOn = () => enabled;

function paint() {
  for (const button of document.querySelectorAll<HTMLElement>("[data-sound-toggle]")) {
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "Turn sound off" : "Turn sound on");
    button.querySelector("[data-sound-on]")?.classList.toggle("hidden", !enabled);
    button.querySelector("[data-sound-off]")?.classList.toggle("hidden", enabled);
  }
}

async function setEnabled(on: boolean, fromGesture: boolean) {
  enabled = on;
  try {
    localStorage.setItem("hp-sound", on ? "on" : "off");
  } catch {
    // The choice lasts for this page only.
  }
  if (on && fromGesture) {
    // Browsers only start audio from a tap or click.
    await ensureContext()?.resume();
    lastPlayed = {};
    play("pop", 0.7);
  }
  paint();
}

function init() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("hp-sound");
  } catch {
    saved = null;
  }
  enabled = saved === "on";
  paint();
  if (enabled) {
    // A saved "on" still needs a gesture before the browser allows audio.
    window.addEventListener("pointerdown", () => void ensureContext()?.resume(), { once: true });
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-sound-toggle]")) {
    button.addEventListener("click", () => void setEnabled(!enabled, true));
  }
  window.addEventListener("hp:sound", (event) => {
    const detail = (event as CustomEvent<{ name: SoundName; intensity?: number }>).detail;
    if (detail?.name) play(detail.name, detail.intensity);
  });
  window.addEventListener("hp:film", (event) => {
    muted = Boolean((event as CustomEvent<boolean>).detail);
  });
  document.addEventListener("click", (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-sound]");
    if (target) play(target.dataset.sound as SoundName);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && enabled) void context?.resume();
  });
}

init();
