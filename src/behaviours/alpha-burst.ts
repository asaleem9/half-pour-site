/**
 * One-shot celebration overlays (components/media/AlphaBurst.astro): short videos with an alpha channel,
 * laid over whatever the caller positions them on. Safari plays the HEVC file, everything else the VP9 one.
 * A browser that can play neither with transparency gets nothing rather than a black square, and so does
 * a visitor who asked for reduced motion.
 */
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Safari on the Mac and every browser on iOS: WebKit decodes VP9 but drops its alpha, and wants HEVC. */
function isWebKit() {
  if ("GestureEvent" in window) return true;
  const agent = navigator.userAgent;
  return /AppleWebKit/.test(agent) && !/Chrome|Chromium|Edg|OPR|Android/.test(agent);
}

let chosen: "hevc" | "webm" | null | undefined;
function format(video: HTMLVideoElement) {
  if (chosen !== undefined) return chosen;
  const hevc = video.canPlayType('video/mp4; codecs="hvc1"') !== "";
  const webm = video.canPlayType('video/webm; codecs="vp9"') !== "" || video.canPlayType('video/webm; codecs="vp09.00.10.08"') !== "";
  if (isWebKit()) chosen = hevc ? "hevc" : null;
  else chosen = webm ? "webm" : null;
  return chosen;
}

function overlays(name: string) {
  return Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-alpha-burst]")).filter((video) => video.dataset.alphaBurst === name);
}

/** Points the video at the file this browser can show with transparency. False when there is none. */
function arm(video: HTMLVideoElement) {
  if (video.dataset.armed) return video.dataset.armed === "yes";
  const kind = format(video);
  const src = kind === "hevc" ? video.dataset.hevc : kind === "webm" ? video.dataset.webm : undefined;
  video.dataset.armed = src ? "yes" : "no";
  if (!src) return false;
  video.src = src;
  const hide = () => {
    video.hidden = true;
  };
  video.addEventListener("ended", hide);
  video.addEventListener("error", hide);
  return true;
}

/** Start fetching a burst before it is needed, for example when its button scrolls into view. */
export function warmBurst(name: string): void {
  if (reducedMotion()) return;
  for (const video of overlays(name)) {
    if (!arm(video)) continue;
    // A burst that is already playing, or already fetched, is left alone: load() would cut a play short.
    if (!video.hidden || video.dataset.warmed) continue;
    video.dataset.warmed = "yes";
    video.preload = "auto";
    video.load();
  }
}

/** Play the named burst once, on every overlay of that name on the page, then hide it again. */
export function playBurst(name: string): void {
  if (reducedMotion()) return;
  for (const video of overlays(name)) {
    if (!arm(video)) continue;
    video.hidden = false;
    if (video.readyState > 0) video.currentTime = 0;
    void video.play().catch(() => {
      video.hidden = true;
    });
  }
}
