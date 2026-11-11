/** The film dialog: opened by any [data-open-film], plays with sound, stops and rewinds when closed. */
import { warmBurst } from "@/behaviours/bursts";
import { whenNear } from "@/behaviours/scroll";

const dialog = document.querySelector<HTMLDialogElement>("[data-film-dialog]");
const video = dialog?.querySelector<HTMLVideoElement>("[data-film-video]");

if (dialog && video) {
  const announce = (playing: boolean) => {
    window.dispatchEvent(new CustomEvent("hp:film", { detail: playing }));
    window.dispatchEvent(new CustomEvent("hp:scroll-lock", { detail: playing }));
  };

  for (const opener of document.querySelectorAll<HTMLElement>("[data-open-film]")) {
    opener.addEventListener("click", () => {
      if (dialog.open) return;
      dialog.showModal();
      announce(true);
      // Started from the click, so browsers allow it to play with sound.
      video.currentTime = 0;
      void video.play().catch(() => {});
    });
  }

  const cheer = () => window.dispatchEvent(new CustomEvent("hp:burst", { detail: "burst-cheer" }));
  dialog.addEventListener("close", () => {
    video.pause();
    announce(false);
    setTimeout(cheer, 450);
  });

  // Pourie pops up from behind the poster the first time most of it is on screen.
  const poster = document.querySelector<HTMLElement>("[data-film-poster]");
  if (poster) {
    whenNear(poster, () => warmBurst("burst-cheer"), "100% 0px");
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        cheer();
      },
      { threshold: 0.7 },
    );
    seen.observe(poster);
  }
  // A click on the dimmed area around the film closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  video.addEventListener("ended", () => dialog.close());
}
