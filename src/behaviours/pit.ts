/**
 * Drives the badge pit (components/acts/Pit.astro).
 *
 * Always: the card each sticker opens, and Pourie watching from the rim.
 * Where motion is welcome: the stickers become bodies in a small physics world. The engine is loaded
 * when the tray nears the viewport, steps on a fixed clock, and stops whenever everything is asleep
 * or the tray is off screen. Stickers are ordinary buttons moved with a transform; nothing is drawn.
 */
import { createRig, type Rig } from "@/behaviours/rig";

type MatterLib = typeof import("matter-js");
type Body = import("matter-js").Body;
type Constraint = import("matter-js").Constraint;
type TiltWindow = Window & { __hpTilt?: { granted?: boolean } };

interface Item {
  el: HTMLButtonElement;
  round: boolean;
  w: number;
  h: number;
  body: Body | null;
  released: boolean;
  /** The last transform written is still right (the body has not moved since). */
  clean: boolean;
}

interface Press {
  id: number;
  item: Item;
  startX: number;
  startY: number;
  t0: number;
  touch: boolean;
  drag: boolean;
  /** Decided at the first move of a touch: the finger rested long enough to mean "pick this up". */
  held: boolean | null;
  samples: Array<{ t: number; x: number; y: number }>;
}

const STEP = 1000 / 60;
const MAX_STEPS = 4;
const RAIN_GAP = 55; // ms of simulated time between stickers
const HOLD = 220; // ms a finger rests before any movement picks a sticker up
const MAX_SPEED = 42; // px per step
const GRAVITY_PER_STEP = 0.001 * STEP * STEP; // what gravity 1 adds to a body's speed each step

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const between = (low: number, high: number) => low + Math.random() * (high - low);

function sound(name: "clink" | "pop", intensity?: number) {
  window.dispatchEvent(new CustomEvent("hp:sound", { detail: intensity === undefined ? { name } : { name, intensity } }));
}

export function initPit(pit: HTMLElement) {
  const field = pit.querySelector<HTMLElement>("[data-pit-field]");
  const pile = pit.querySelector<HTMLElement>("[data-pit-pile]");
  if (!field || !pile) return;
  pit.setAttribute("data-pit-boot", "");

  const section = pit.closest<HTMLElement>("[data-pit-section]") ?? pit;
  const stickers = Array.from(pile.querySelectorAll<HTMLButtonElement>("[data-pit-sticker]"));
  const shakeButton = section.querySelector<HTMLButtonElement>("[data-pit-shake]");
  const tiltButton = section.querySelector<HTMLButtonElement>("[data-pit-tilt]");
  const tiltLabel = section.querySelector<HTMLElement>("[data-pit-tilt-label]");
  const rigEl = pit.querySelector<SVGSVGElement>("[data-rig]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  let onScreen = false;
  let suppressClickUntil = 0;

  // ---------------------------------------------------------------- Pourie

  const rig: Rig | null = rigEl ? createRig(rigEl, { idle: true }) : null;
  let lastLook = 0;
  let lastFlinch = 0;
  let mouthTimer = 0;
  let watchTimer = 0;

  function look(clientX: number, clientY: number, every = 70) {
    const now = performance.now();
    if (!rig || now - lastLook < every) return;
    lastLook = now;
    rig.lookAt(clientX, clientY);
  }
  function flinch() {
    const now = performance.now();
    if (!rig || reduced || now - lastFlinch < 1400) return;
    lastFlinch = now;
    rig.setMouth("oh");
    rig.hop(30);
    window.clearTimeout(mouthTimer);
    mouthTimer = window.setTimeout(() => rig.setMouth("open"), 700);
  }
  if (rig && finePointer && !reduced) {
    window.addEventListener(
      "pointermove",
      (event) => {
        if (onScreen && !watchTimer) look(event.clientX, event.clientY);
      },
      { passive: true },
    );
  }

  // ---------------------------------------------------------------- cards

  const nativePopover = "popover" in HTMLElement.prototype;
  const cardOf = new Map<HTMLButtonElement, HTMLElement>();
  const stickerOf = new Map<HTMLElement, HTMLButtonElement>();
  for (const sticker of stickers) {
    const card = document.getElementById(sticker.getAttribute("popovertarget") ?? "");
    if (!card) continue;
    cardOf.set(sticker, card);
    stickerOf.set(card, sticker);
  }
  let openCard: HTMLElement | null = null;

  /** Puts a card just above its sticker (below when there is no room), kept inside the viewport. */
  function place(card: HTMLElement, sticker: HTMLElement) {
    const rect = sticker.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const half = Math.min(300, viewport - 32) / 2;
    const above = rect.top > 260;
    let x = clamp(rect.left + rect.width / 2, 16 + half, viewport - 16 - half) + window.scrollX;
    let y = (above ? rect.top : rect.bottom) + window.scrollY;
    if (!nativePopover) {
      // Without the top layer the card is positioned inside the pit instead of the page.
      const base = pit.getBoundingClientRect();
      x -= base.left + window.scrollX;
      y -= base.top + window.scrollY;
    }
    card.dataset.place = above ? "above" : "below";
    card.style.setProperty("--x", `${x.toFixed(1)}px`);
    card.style.setProperty("--y", `${y.toFixed(1)}px`);
  }

  function closeCard() {
    if (!openCard) return;
    const card = openCard;
    openCard = null;
    if (nativePopover) {
      if (card.matches(":popover-open")) card.hidePopover();
    } else {
      card.classList.remove("is-open");
      stickerOf.get(card)?.setAttribute("aria-expanded", "false");
    }
  }

  if (nativePopover) {
    // The browser opens and closes the cards (the buttons carry popovertarget); this only places them.
    pile.addEventListener(
      "beforetoggle",
      (event) => {
        const card = event.target as HTMLElement;
        const sticker = stickerOf.get(card);
        if (!sticker) return;
        if ((event as ToggleEvent).newState === "open") {
          place(card, sticker);
          openCard = card;
        } else if (openCard === card) {
          openCard = null;
        }
      },
      true,
    );
  } else {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !openCard) return;
      const sticker = stickerOf.get(openCard);
      closeCard();
      sticker?.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target as Element | null;
      if (openCard && !target?.closest("[data-pit-card], [data-pit-sticker]")) closeCard();
    });
  }

  pile.addEventListener(
    "click",
    (event) => {
      const sticker = (event.target as Element).closest<HTMLButtonElement>("[data-pit-sticker]");
      if (!sticker) return;
      if (performance.now() < suppressClickUntil) {
        // The end of a drag, not a tap.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      sound("pop");
      if (nativePopover) return;
      const card = cardOf.get(sticker);
      if (!card) return;
      const wasOpen = openCard === card;
      closeCard();
      if (wasOpen) return;
      place(card, sticker);
      card.classList.add("is-open");
      sticker.setAttribute("aria-expanded", "true");
      openCard = card;
    },
    true,
  );

  // ---------------------------------------------------------------- physics

  if (reduced) return;

  let loading = false;
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || loading) return;
      loading = true;
      near.disconnect();
      for (const img of pile.querySelectorAll("img")) img.loading = "eager";
      import("matter-js")
        .then((module) => arm((module as { default?: MatterLib }).default ?? (module as MatterLib)))
        .catch(() => {
          // No engine: fall back to the still pile.
          if (pit.getAttribute("data-pit-state") !== "live") pit.removeAttribute("data-pit-state");
        });
    },
    { rootMargin: "100% 0px" },
  );
  near.observe(field);

  function arm(Matter: MatterLib) {
    const { Engine, Bodies, Body, Composite, Constraint, Events, Sleeping } = Matter;

    let width = field!.clientWidth;
    let height = field!.clientHeight;
    const items: Item[] = stickers.map((el) => ({
      el,
      round: el.dataset.pitSticker === "badge",
      w: el.offsetWidth,
      h: el.offsetHeight,
      body: null,
      released: false,
      clean: false,
    }));
    const itemOf = new Map<HTMLButtonElement, Item>(items.map((item) => [item.el, item]));
    pit.setAttribute("data-pit-state", "live");

    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.x = 0;
    engine.gravity.y = 1;
    const world = engine.world;

    function makeBody(item: Item) {
      const options = { restitution: 0.3, friction: 0.35, frictionStatic: 0.5, frictionAir: 0.012, sleepThreshold: 45 };
      item.body = item.round
        ? Bodies.circle(0, 0, item.w / 2, options)
        : Bodies.rectangle(0, 0, item.w, item.h, { ...options, chamfer: { radius: Math.min(item.w, item.h) * 0.24 } });
    }
    for (const item of items) makeBody(item);

    // Walls. They run well above the tray so the rain is fenced in; the lid goes on once it is all in.
    let walls: Body[] = [];
    let lidOn = false;
    function buildWalls() {
      if (walls.length) Composite.remove(world, walls);
      const thick = 400;
      const options = { isStatic: true, friction: 0.4, restitution: 0.2 };
      walls = [
        Bodies.rectangle(width / 2, height + thick / 2, width + thick * 2, thick, options),
        Bodies.rectangle(-thick / 2, -height / 2, thick, height * 4, options),
        Bodies.rectangle(width + thick / 2, -height / 2, thick, height * 4, options),
      ];
      if (lidOn) walls.push(Bodies.rectangle(width / 2, -thick / 2, width + thick * 2, thick, options));
      Composite.add(world, walls);
    }
    buildWalls();

    /** Pulls a body back inside if it is outside the tray (after a resize, or a throw that got past a wall). */
    function contain(item: Item, margin: number) {
      const body = item.body!;
      const halfW = item.w / 2;
      const halfH = item.h / 2;
      const { x, y } = body.position;
      const outside = x < -margin || x > width + margin || y > height + margin || (lidOn && y < -margin);
      if (!outside) return;
      Body.setPosition(body, {
        x: clamp(x, halfW + 2, width - halfW - 2),
        y: lidOn ? clamp(y, halfH + 2, height - halfH - 2) : Math.min(y, height - halfH - 2),
      });
      Body.setVelocity(body, { x: 0, y: 0 });
      Sleeping.set(body, false);
    }

    // ---- the loop

    let running = false;
    let frameId = 0;
    let last = 0;
    let backlog = 0;
    let clock = 0; // simulated ms
    let rainStarted = false;
    let rainIndex = 0;
    let rainDone = 0; // clock time the last sticker was let go
    let press: Press | null = null;
    let grip: Constraint | null = null;
    const target = { x: 0, y: 0 };
    let fieldLeft = 0;
    let fieldTop = 0;

    function release(item: Item, index: number) {
      const body = item.body!;
      const margin = item.w / 2 + 6;
      // Each drop lands well away from the one before it, with enough scatter that no columns form.
      const slot = (index * 0.618034 + 0.31 + between(-0.07, 0.07) + 1) % 1;
      Body.setPosition(body, { x: margin + slot * Math.max(0, width - margin * 2), y: -item.h / 2 - 6 });
      Body.setAngle(body, between(-0.6, 0.6));
      Body.setVelocity(body, { x: between(-2.4, 2.4), y: 3 });
      Body.setAngularVelocity(body, between(-0.07, 0.07));
      Composite.add(world, body);
      item.released = true;
      item.clean = false;
    }

    function step() {
      clock += STEP;
      if (grip && press) {
        Sleeping.set(press.item.body!, false);
        grip.pointA = { x: target.x, y: target.y };
      }
      while (rainIndex < items.length && clock >= rainIndex * RAIN_GAP) {
        release(items[rainIndex], rainIndex);
        rainIndex += 1;
        if (rainIndex === items.length) rainDone = clock;
      }
      Engine.update(engine, STEP);
      for (const item of items) if (item.released) contain(item, 60);
      if (!lidOn && rainIndex === items.length) {
        const allIn = items.every((item) => item.body!.position.y - item.h / 2 > 6);
        if (allIn || clock - rainDone > 3000) {
          lidOn = true;
          for (const item of items) contain(item, 0);
          buildWalls();
        }
      }
    }

    function render() {
      for (const item of items) {
        if (!item.released) continue;
        const body = item.body!;
        if (item.clean && body.isSleeping) continue;
        const x = body.position.x - item.w / 2;
        const y = body.position.y - item.h / 2;
        item.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${body.angle.toFixed(3)}rad)`;
        item.clean = body.isSleeping;
      }
    }

    function settled() {
      if (press?.drag || rainIndex < items.length || !lidOn) return false;
      for (const item of items) if (!item.body!.isSleeping) return false;
      return true;
    }

    function frame(now: number) {
      frameId = 0;
      if (!running) return;
      let elapsed = now - last;
      last = now;
      if (elapsed > 250) elapsed = STEP; // the tab was in the background
      backlog += elapsed;
      let steps = 0;
      while (backlog >= STEP && steps < MAX_STEPS) {
        step();
        backlog -= STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS) backlog = 0;
      if (steps) render();
      if (settled()) {
        stop();
        return;
      }
      frameId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || !onScreen || !rainStarted) return;
      running = true;
      last = performance.now();
      backlog = 0;
      pile!.classList.add("is-running");
      frameId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      pile!.classList.remove("is-running");
    }
    function wakeAll() {
      for (const item of items) if (item.released) Sleeping.set(item.body!, false);
      start();
    }

    // ---- collisions: a clink for the sound module, and a start for Pourie

    let lastClink = 0;
    Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
        if (speed < 5) continue;
        const now = performance.now();
        if (!a.isStatic && !b.isStatic && now - lastClink > 125) {
          lastClink = now;
          sound("clink", Math.min(1, speed / 24));
        }
        const moving = a.isStatic ? b : a;
        if (speed > 11 && moving.position.x > width - Math.max(380, width * 0.36)) flinch();
      }
    });

    // ---- drag and throw

    function pointerInField(event: PointerEvent) {
      target.x = clamp(event.clientX - fieldLeft, 0, width);
      target.y = clamp(event.clientY - fieldTop, 0, height);
    }

    function beginDrag(event: PointerEvent) {
      if (!press) return;
      const body = press.item.body!;
      press.drag = true;
      closeCard();
      pointerInField(event);
      Sleeping.set(body, false);
      grip = Constraint.create({
        pointA: { x: target.x, y: target.y },
        bodyB: body,
        pointB: { x: clamp(target.x - body.position.x, -press.item.w / 2, press.item.w / 2), y: clamp(target.y - body.position.y, -press.item.h / 2, press.item.h / 2) },
        length: 0,
        stiffness: 0.22,
        damping: 0.12,
      });
      Composite.add(world, grip);
      press.item.el.classList.add("is-held");
      window.clearInterval(watchTimer);
      watchTimer = 0;
      start();
    }

    function endPress(event: PointerEvent, cancelled: boolean) {
      if (!press || event.pointerId !== press.id) return;
      const { item, drag, samples } = press;
      press = null;
      if (item.el.hasPointerCapture(event.pointerId)) item.el.releasePointerCapture(event.pointerId);
      if (!drag) return;
      const body = item.body!;
      if (grip) Composite.remove(world, grip);
      grip = null;
      item.el.classList.remove("is-held");
      suppressClickUntil = performance.now() + 400;
      if (!cancelled) {
        // Throw with the pointer's own speed over its last tenth of a second.
        const recent = samples.filter((sample) => event.timeStamp - sample.t <= 100);
        let vx = 0;
        let vy = 0;
        if (recent.length >= 2) {
          const first = recent[0];
          const final = recent[recent.length - 1];
          const span = Math.max(8, final.t - first.t);
          vx = ((final.x - first.x) / span) * STEP;
          vy = ((final.y - first.y) / span) * STEP;
        }
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_SPEED) {
          vx *= MAX_SPEED / speed;
          vy *= MAX_SPEED / speed;
        }
        Sleeping.set(body, false);
        Body.setVelocity(body, { x: vx, y: vy });
      }
      // Pourie follows the throw for a moment, then goes back to the pointer.
      if (rig) {
        const until = performance.now() + 1300;
        window.clearInterval(watchTimer);
        watchTimer = window.setInterval(() => {
          if (performance.now() > until || press?.drag) {
            window.clearInterval(watchTimer);
            watchTimer = 0;
            if (!finePointer && !press?.drag) rig.lookAhead();
            return;
          }
          look(fieldLeft + body.position.x, fieldTop + body.position.y, 0);
        }, 90);
      }
      start();
    }

    pile!.addEventListener("pointerdown", (event) => {
      if (press || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      const el = (event.target as Element).closest<HTMLButtonElement>("[data-pit-sticker]");
      const item = el ? itemOf.get(el) : undefined;
      if (!item || !item.released) return;
      const rect = field!.getBoundingClientRect();
      fieldLeft = rect.left + field!.clientLeft;
      fieldTop = rect.top + field!.clientTop;
      press = {
        id: event.pointerId,
        item,
        startX: event.clientX,
        startY: event.clientY,
        t0: performance.now(),
        touch: event.pointerType === "touch",
        drag: false,
        held: null,
        samples: [],
      };
      try {
        item.el.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone.
      }
    });

    pile!.addEventListener("pointermove", (event) => {
      if (!press || event.pointerId !== press.id) return;
      if (!press.drag) {
        const dx = event.clientX - press.startX;
        const dy = event.clientY - press.startY;
        if (press.touch) {
          if (press.held === null) press.held = performance.now() - press.t0 >= HOLD;
          // A sideways move, or any move after resting on the sticker. A quick up or down swipe is a scroll.
          const sideways = Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
          if (!sideways && !(press.held && Math.hypot(dx, dy) > 6)) return;
        } else if (Math.hypot(dx, dy) < 4) {
          return;
        }
        beginDrag(event);
      }
      pointerInField(event);
      press.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
      if (press.samples.length > 12) press.samples.shift();
      look(event.clientX, event.clientY);
    });
    pile!.addEventListener("pointerup", (event) => endPress(event, false));
    pile!.addEventListener("pointercancel", (event) => endPress(event, true));

    // touch-action lets a vertical swipe scroll the page. Once a sticker is in hand (or the finger has
    // rested on it), the page stays put so it can be carried up and down too.
    pile!.addEventListener(
      "touchmove",
      (event) => {
        if (!press || !event.cancelable) return;
        if (press.held === null) press.held = performance.now() - press.t0 >= HOLD;
        if (press.drag || press.held) event.preventDefault();
      },
      { passive: false },
    );
    pile!.addEventListener("dragstart", (event) => event.preventDefault());

    // ---- shake

    if (shakeButton) {
      shakeButton.hidden = false;
      shakeButton.addEventListener("click", () => {
        if (!rainStarted) return;
        closeCard();
        const top = Math.sqrt(2 * GRAVITY_PER_STEP * height * 0.7);
        for (const item of items) {
          if (!item.released) continue;
          const body = item.body!;
          Sleeping.set(body, false);
          Body.setVelocity(body, { x: between(-7, 7), y: -top * between(0.45, 1) });
          Body.setAngularVelocity(body, between(-0.22, 0.22));
        }
        flinch();
        start();
      });
    }

    // ---- tilt

    let tiltOn = false;
    const woke = { x: 0, y: 1 };
    function onTilt(event: DeviceOrientationEvent) {
      if (event.beta === null || event.gamma === null) return;
      const beta = clamp(event.beta / 45, -1, 1);
      const gamma = clamp(event.gamma / 45, -1, 1);
      const turn = ((screen.orientation?.angle ?? 0) + 360) % 360;
      let x = gamma;
      let y = beta;
      if (turn === 90) [x, y] = [beta, -gamma];
      else if (turn === 270) [x, y] = [-beta, gamma];
      else if (turn === 180) [x, y] = [-gamma, -beta];
      engine.gravity.x += (x - engine.gravity.x) * 0.25;
      engine.gravity.y += (y - engine.gravity.y) * 0.25;
      // Sleeping bodies ignore gravity, so wake them when "down" has moved far enough to matter.
      if (Math.hypot(engine.gravity.x - woke.x, engine.gravity.y - woke.y) > 0.12) {
        woke.x = engine.gravity.x;
        woke.y = engine.gravity.y;
        wakeAll();
      }
    }
    function setTilt(on: boolean) {
      tiltOn = on;
      tiltButton?.setAttribute("aria-pressed", String(on));
      if (tiltLabel) tiltLabel.textContent = on ? "Tilt is on" : "Tilt to play";
      if (on) {
        window.addEventListener("deviceorientation", onTilt);
      } else {
        window.removeEventListener("deviceorientation", onTilt);
        engine.gravity.x = 0;
        engine.gravity.y = 1;
        woke.x = 0;
        woke.y = 1;
        wakeAll();
      }
    }
    if (tiltButton && !finePointer && "DeviceOrientationEvent" in window) {
      tiltButton.hidden = false;
      tiltButton.addEventListener("click", async () => {
        if (tiltOn) {
          setTilt(false);
          return;
        }
        const shared = window as TiltWindow;
        const ask = (window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
        if (!shared.__hpTilt?.granted && typeof ask === "function") {
          // iOS: the question has to be asked from inside this tap.
          let answer = "denied";
          try {
            answer = await ask.call(window.DeviceOrientationEvent);
          } catch {
            answer = "denied";
          }
          if (answer !== "granted") {
            if (tiltLabel) tiltLabel.textContent = "Tilt is switched off";
            return;
          }
        }
        if (!shared.__hpTilt?.granted) {
          shared.__hpTilt = { granted: true };
          // The same notice the shared tilt module sends, so the rest of the page knows it need not ask again.
          window.dispatchEvent(new CustomEvent("hp:tilt-granted"));
        }
        setTilt(true);
      });
    }

    // ---- size and visibility

    const resize = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1].contentRect;
      const nextWidth = Math.round(box.width);
      const nextHeight = Math.round(box.height);
      if (nextWidth === width && nextHeight === height) return;
      const across = nextWidth / Math.max(1, width);
      const floorWas = height;
      width = nextWidth;
      height = nextHeight;
      // Sticker sizes follow the tray's width in CSS; read them once here and resize the bodies to match.
      let grow = 1;
      for (const item of items) {
        const w = item.el.offsetWidth;
        const h = item.el.offsetHeight;
        if (w && w !== item.w) {
          if (item.round) grow = w / item.w;
          Body.scale(item.body!, w / item.w, h / item.h);
          item.w = w;
          item.h = h;
        }
        item.clean = false;
      }
      buildWalls();
      // Keep the pile's shape: spread it across the new width, and let it stand taller or shorter by
      // however much the stickers grew against the room they have.
      const tall = grow / across;
      for (const item of items) {
        if (!item.released) continue;
        const body = item.body!;
        const halfW = item.w / 2;
        const halfH = item.h / 2;
        const y = height - (floorWas - body.position.y) * tall;
        Body.setPosition(body, {
          x: clamp(body.position.x * across, halfW + 2, Math.max(halfW + 2, width - halfW - 2)),
          y: lidOn ? clamp(y, halfH + 2, Math.max(halfH + 2, height - halfH - 2)) : Math.min(y, height - halfH - 2),
        });
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      }
      if (rainStarted) {
        wakeAll();
        if (!running) render();
      }
    });
    resize.observe(field!);

    const visible = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (!onScreen) {
          stop();
          return;
        }
        // The rain waits until a fair slice of the tray can be seen.
        if (!rainStarted && entry.intersectionRatio >= 0.2) rainStarted = true;
        if (rainStarted && !settled()) start();
      },
      { threshold: [0, 0.2, 0.5] },
    );
    visible.observe(field!);
  }
}
