/**
 * Phone tilt, shared by the hero and the playground. iOS only grants motion access from inside a tap,
 * so callers ask from a button; one grant serves the whole page.
 */
type TiltListener = (gamma: number, beta: number) => void;

declare global {
  interface Window {
    __hpTilt?: { granted: boolean };
  }
}

const listeners = new Set<TiltListener>();
let listening = false;

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

export function tiltNeedsPermission() {
  return typeof (window.DeviceOrientationEvent as OrientationCtor | undefined)?.requestPermission === "function";
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener(
    "deviceorientation",
    (event) => {
      if (event.gamma == null || event.beta == null) return;
      // Landscape swaps the axes; portrait is what the page is designed for.
      const angle = (screen.orientation?.angle ?? 0) % 360;
      const gamma = angle === 90 ? event.beta : angle === 270 ? -event.beta : event.gamma;
      for (const listener of listeners) listener(gamma, event.beta);
    },
    { passive: true },
  );
}

/** Ask for motion access. Call from a tap or click handler. Resolves to whether tilt is available. */
export async function requestTilt(): Promise<boolean> {
  if (!("DeviceOrientationEvent" in window)) return false;
  if (window.__hpTilt?.granted) {
    listen();
    return true;
  }
  const Ctor = window.DeviceOrientationEvent as OrientationCtor;
  try {
    if (typeof Ctor.requestPermission === "function") {
      const answer = await Ctor.requestPermission();
      if (answer !== "granted") return false;
    }
  } catch {
    return false;
  }
  window.__hpTilt = { granted: true };
  listen();
  window.dispatchEvent(new CustomEvent("hp:tilt-granted"));
  return true;
}

export function onTilt(listener: TiltListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
