/** Act 4: draws lib/planner's demo night and lets Pourie react to it. */
import { gsap, reducedMotion, watchVisible } from "@/behaviours/scroll";
import { createRig, followPointer } from "@/behaviours/rig";
import {
  initialNight,
  reduce,
  drinks,
  overBy,
  paceProgress,
  sinceLastDrink,
  score,
  verdict,
  PACE_MINUTES,
  MAX_DRINKS,
  type Action,
  type Night,
} from "@/lib/planner/planner";

const section = document.querySelector<HTMLElement>("[data-planner]");

if (section) {
  const card = section.querySelector<HTMLElement>("[data-planner-card]")!;
  const q = <T extends Element = HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
  const views = Array.from(card.querySelectorAll<HTMLElement>("[data-phase-view]"));
  const capEl = q("[data-cap]");
  const capEcho = q("[data-cap-echo]");
  const capTokens = q("[data-cap-tokens]");
  const countEl = q("[data-count]");
  const tokens = q("[data-tokens]");
  const status = q("[data-status]");
  const paceRing = q<SVGCircleElement>("[data-pace-ring]");
  const paceText = q("[data-pace-text]");
  const pace = q("[data-pace]");
  const drinkButton = q<HTMLButtonElement>("[data-drink]");
  const drinkSub = q("[data-drink-sub]");
  const scoreEl = q("[data-score]");
  const scoreRing = q<SVGCircleElement>("[data-score-ring]");
  const scoreLabel = q("[data-score-label]");
  const verdictEl = q("[data-verdict]");
  const verdictLine = q("[data-verdict-line]");
  const badge = q("[data-badge]");
  const badgeArt = q<HTMLImageElement>("[data-badge-art]");
  const badgeName = q("[data-badge-name]");
  const badgeBlurb = q("[data-badge-blurb]");
  const RING = 257.6;
  const still = reducedMotion();
  /** Demo minutes per real second: an hour takes six seconds. */
  const SPEED = PACE_MINUTES / 6;

  const rig = createRig(section.querySelector<SVGSVGElement>("[data-rig]")!, { idle: false });
  rig.setArm("down", true);
  followPointer(rig);

  let night: Night = initialNight(4);
  let visible = false;
  let lastTick = 0;
  const sound = (name: string, intensity = 0.5) => window.dispatchEvent(new CustomEvent("hp:sound", { detail: { name, intensity } }));
  const pop = (el: Element) => {
    if (!still) gsap.fromTo(el, { scale: 0.4 }, { scale: 1, duration: 0.45, ease: "back.out(2.4)" });
  };

  function token(fill: string) {
    const el = document.createElement("span");
    el.className = "planner-token";
    if (fill) el.dataset.fill = fill;
    return el;
  }

  function paintPlan() {
    capEl.textContent = String(night.cap);
    capEcho.textContent = String(night.cap);
    capTokens.replaceChildren(...Array.from({ length: night.cap }, () => token("")));
  }

  function paintTokens(popLast: boolean) {
    const made: HTMLElement[] = [];
    let count = 0;
    for (const event of night.events) {
      if (event.kind === "water") made.push(token("water"));
      else {
        count++;
        made.push(token(count > night.cap ? "over" : "drink"));
      }
    }
    for (let i = count; i < night.cap; i++) made.push(token(""));
    tokens.replaceChildren(...made);
    if (popLast && night.events.length) {
      const index = night.events.length - 1;
      // Empty slots come after every logged event, so the newest event's token is at its own index.
      pop(made[index]);
    }
  }

  function paintPace() {
    const progress = paceProgress(night);
    paceRing.style.strokeDashoffset = String(RING * (1 - progress));
    const since = sinceLastDrink(night);
    const ready = progress >= 1;
    paceRing.style.stroke = ready ? "var(--success)" : "var(--brand)";
    if (since === null) {
      paceText.innerHTML = "Good<br>to go";
      pace.setAttribute("aria-label", "Pace: good to go");
    } else if (ready) {
      paceText.innerHTML = "On<br>pace";
      pace.setAttribute("aria-label", "Pace: an hour has passed, the next one is on pace");
    } else {
      const left = Math.max(1, Math.ceil(PACE_MINUTES - since));
      paceText.innerHTML = `${left}<br>min`;
      pace.setAttribute("aria-label", `Pace: next one in ${left} minutes`);
    }
    drinkSub.textContent = since === null ? "Tap to log" : ready ? "On pace" : "A little early";
  }

  function paintLive(popLast = false) {
    const count = drinks(night).length;
    const over = overBy(night);
    countEl.textContent = String(count);
    card.toggleAttribute("data-over", over > 0);
    paintTokens(popLast);
    paintPace();
    drinkButton.toggleAttribute("disabled", count >= MAX_DRINKS);
  }

  function paintClosed() {
    const result = score(night);
    const call = verdict(night);
    verdictEl.textContent = call.headline;
    verdictLine.textContent = call.line;
    scoreRing.style.stroke = call.over ? "var(--over)" : "var(--success)";
    scoreLabel.setAttribute("aria-label", `Night Score: ${result.total} out of 100`);
    for (const row of result.rows) {
      const li = card.querySelector<HTMLElement>(`[data-row="${row.key}"]`)!;
      li.querySelector("[data-row-points]")!.textContent = String(row.points);
      const bar = li.querySelector<HTMLElement>("[data-row-bar]")!;
      bar.style.background = row.points < row.of && row.key === "cap" ? "var(--over)" : "var(--success)";
      if (still) bar.style.transform = `scaleX(${row.points / row.of})`;
      else gsap.fromTo(bar, { scaleX: 0 }, { scaleX: row.points / row.of, duration: 0.7, ease: "power3.out", delay: 0.5 + result.rows.indexOf(row) * 0.07 });
    }
    if (call.badge) {
      badge.classList.replace("hidden", "flex");
      badgeArt.src = `/art/${call.badge.slug}-200.webp`;
      badgeName.textContent = call.badge.name;
      badgeBlurb.textContent = call.badge.blurb;
    } else {
      badge.classList.replace("flex", "hidden");
    }
    if (still) {
      scoreEl.textContent = String(result.total);
      scoreRing.style.strokeDashoffset = String(RING * (1 - result.total / 100));
      return;
    }
    const counter = { value: 0 };
    gsap.to(counter, {
      value: result.total,
      duration: 1.1,
      ease: "power2.out",
      onUpdate() {
        scoreEl.textContent = String(Math.round(counter.value));
        scoreRing.style.strokeDashoffset = String(RING * (1 - counter.value / 100));
      },
      onComplete() {
        sound(call.over ? "pop" : "fanfare");
        if (call.badge) {
          pop(badge);
          window.dispatchEvent(new CustomEvent("hp:burst", { detail: "burst-badge" }));
        }
        if (call.over) {
          rig.setMouth("smile");
          rig.wave();
        } else {
          rig.cheer();
        }
      },
    });
  }

  function showPhase() {
    card.dataset.phase = night.phase;
    for (const view of views) view.hidden = view.dataset.phaseView !== night.phase;
    const shown = views.find((view) => !view.hidden);
    if (shown && !still) gsap.fromTo(shown, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" });
  }

  function dispatch(action: Action) {
    const before = night;
    night = reduce(night, action);
    if (night === before) return;
    if (night.phase !== before.phase) {
      showPhase();
      if (night.phase === "planning") {
        paintPlan();
        rig.setArm("down");
        rig.setMouth("open");
        rig.setEyes("open");
      }
      if (night.phase === "live") {
        status.textContent = "The night is on. Log the first one when it arrives.";
        paintLive();
        rig.wave();
      }
      if (night.phase === "closed") paintClosed();
      return;
    }
    if (action.type === "setCap") paintPlan();
    else if (action.type === "drink") {
      const over = overBy(night);
      const early = (sinceLastDrink(before) ?? PACE_MINUTES) < PACE_MINUTES;
      paintLive(true);
      sound("pop", over ? 0.3 : 0.7);
      rig.slosh(18);
      if (over > 0) {
        status.textContent = over === 1 ? "Over plan. It is lilac, not red, and it still counts as logged." : `${over} over plan. Still logged, still honest.`;
        rig.setMouth("smile");
      } else if (early) {
        status.textContent = "Logged. That one came a little early for the pace.";
        rig.setMouth("oh");
      } else {
        status.textContent = drinks(night).length === night.cap ? "Logged. That is your number." : "Logged, right on pace.";
        rig.setMouth("open");
        rig.hop(40);
      }
    } else if (action.type === "water") {
      paintLive(true);
      sound("splash", 0.3);
      status.textContent = "Water round logged.";
      rig.setEyes("happy");
      rig.slosh(-14);
      gsap.delayedCall(0.9, () => rig.setEyes("open"));
    } else if (action.type === "tick") {
      paintPace();
    }
  }

  // Wiring.
  for (const button of card.querySelectorAll<HTMLButtonElement>("[data-cap-step]")) {
    button.addEventListener("click", () => {
      dispatch({ type: "setCap", cap: night.cap + Number(button.dataset.capStep) });
      pop(capEl);
    });
  }
  q("[data-start]").addEventListener("click", () => dispatch({ type: "start" }));
  drinkButton.addEventListener("click", () => dispatch({ type: "drink" }));
  q("[data-water]").addEventListener("click", () => dispatch({ type: "water" }));
  q("[data-wait]").addEventListener("click", () => {
    dispatch({ type: "tick", minutes: PACE_MINUTES });
    status.textContent = "An hour later.";
  });
  q("[data-close]").addEventListener("click", () => dispatch({ type: "close" }));
  q("[data-again]").addEventListener("click", () => dispatch({ type: "reset" }));

  // The demo clock only runs while the card is on screen and a night is live.
  watchVisible(section, (now) => {
    visible = now;
    lastTick = 0;
    rig.setIdle(now && !still);
  });
  gsap.ticker.add((time) => {
    if (!visible || night.phase !== "live" || still) {
      lastTick = 0;
      return;
    }
    const dt = lastTick ? Math.min(0.25, time - lastTick) : 0;
    lastTick = time;
    if (dt > 0) dispatch({ type: "tick", minutes: dt * SPEED });
  });

  paintPlan();
  showPhase();
}
