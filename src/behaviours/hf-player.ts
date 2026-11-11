/**
 * Live motion loops (components/media/HfPlayer.astro). Each one starts as its poster. When it nears the
 * viewport the HyperFrames player is loaded and the composition under /compositions/<name>/ runs live in
 * a frame of its own, playing only while it is on screen. If the player cannot load, or the visitor asks
 * for reduced motion, the square holds an ordinary video of the same loop instead.
 */
import type { HyperframesPlayer } from "@hyperframes/player";

/** The player needs the HyperFrames runtime inside the composition's frame. This copy is ours. */
const RUNTIME = "/compositions/runtime/hyperframe.runtime.iife.js";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function whenNear(element: Element, enter: () => void) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      enter();
    },
    { rootMargin: "60% 0px" },
  );
  observer.observe(element);
}

function whileVisible(element: Element, change: (visible: boolean) => void) {
  const observer = new IntersectionObserver((entries) => change(entries[entries.length - 1].isIntersecting), { threshold: 0.35 });
  observer.observe(element);
  return observer;
}

/** The H.264 copy of the loop. With `autoplay` it plays while on screen; without, it waits for the visitor. */
function showVideo(host: HTMLElement, autoplay: boolean) {
  if (host.dataset.hfState === "video") return;
  host.dataset.hfState = "video";
  const video = document.createElement("video");
  video.className = "hf-player__stage";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.poster = host.dataset.poster ?? "";
  video.src = host.dataset.mp4 ?? "";
  video.setAttribute("aria-hidden", "true");
  if (autoplay) {
    whileVisible(host, (visible) => {
      if (visible) void video.play().catch(() => {});
      else video.pause();
    });
    video.addEventListener("loadeddata", () => host.classList.add("is-live"), { once: true });
  } else {
    // Nothing moves until the visitor presses play. The video shows the poster itself, so the image
    // steps aside now and leaves the controls reachable.
    video.controls = true;
    video.removeAttribute("aria-hidden");
    video.setAttribute("aria-label", host.getAttribute("aria-label") ?? "");
    host.classList.add("is-live");
  }
  host.append(video);
}

async function showPlayer(host: HTMLElement) {
  try {
    await import("@hyperframes/player");
  } catch {
    showVideo(host, true);
    return;
  }
  if (host.dataset.hfState !== "poster") return;
  host.dataset.hfState = "player";

  const player = document.createElement("hyperframes-player") as HyperframesPlayer;
  player.className = "hf-player__stage";
  player.setAttribute("src", host.dataset.src ?? "");
  player.setAttribute("runtime-src", RUNTIME);
  player.setAttribute("width", host.dataset.width ?? "1080");
  player.setAttribute("height", host.dataset.height ?? "1080");
  for (const flag of ["loop", "muted", "low-power-idle", "disable-click-to-play"]) player.setAttribute(flag, "");
  // The poster stays up while the composition loads, so the player's own loading card is not needed.
  player.setAttribute("assets-loading-ui", "none");
  player.setAttribute("aria-hidden", "true");
  // The player's host paints black by default; give it the loop's own ground.
  player.style.background = host.dataset.ground ?? "transparent";

  let visible = false;
  let ready = false;
  const sync = () => {
    if (!ready) return;
    if (visible) player.play();
    else player.pause();
  };
  const watcher = whileVisible(host, (now) => {
    visible = now;
    sync();
  });

  player.addEventListener(
    "ready",
    () => {
      ready = true;
      // Pick up from the moment the poster shows, so the hand-over is not a jump.
      const from = Number(host.dataset.posterAt);
      if (from > 0) player.seek(from);
      host.classList.add("is-live");
      sync();
    },
    { once: true },
  );
  player.addEventListener(
    "error",
    () => {
      watcher.disconnect();
      player.remove();
      host.classList.remove("is-live");
      host.dataset.hfState = "failed";
      showVideo(host, true);
    },
    { once: true },
  );

  host.append(player);
}

export function initHfPlayers(root: ParentNode = document) {
  for (const host of root.querySelectorAll<HTMLElement>("[data-hf-player]:not([data-hf-state])")) {
    if (reducedMotion()) {
      showVideo(host, false);
      continue;
    }
    host.dataset.hfState = "poster";
    whenNear(host, () => void showPlayer(host));
  }
}
