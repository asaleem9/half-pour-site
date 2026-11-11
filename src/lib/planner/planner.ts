/**
 * The demo night behind "Plan your night, live". Pure logic, no DOM.
 *
 * It borrows the app's Night Score weights but counts penalties instead of using ratios, so that logging
 * one more drink can never raise the score (tested in planner.test.ts). It is a taste of the idea, not the
 * app's scorer, and the page says so.
 */
export type Phase = "planning" | "live" | "closed";
export type EventKind = "drink" | "water";

export interface NightEvent {
  kind: EventKind;
  /** Minutes since the night started, on the demo clock. */
  at: number;
}

export interface Night {
  phase: Phase;
  /** The number picked for tonight. */
  cap: number;
  events: NightEvent[];
  /** Minutes since the night started. */
  now: number;
}

export type Action =
  | { type: "setCap"; cap: number }
  | { type: "start" }
  | { type: "drink" }
  | { type: "water" }
  | { type: "tick"; minutes: number }
  | { type: "close" }
  | { type: "reset" };

export const PACE_MINUTES = 60;
export const MIN_CAP = 1;
export const MAX_CAP = 8;
/** The demo stops taking drinks here; a real night is the visitor's own business. */
export const MAX_DRINKS = 10;

export const WEIGHTS = { showedUp: 20, pacing: 25, water: 15, cap: 20, lastCall: 10, planAhead: 5, liveLogging: 5 } as const;

export const initialNight = (cap = 4): Night => ({ phase: "planning", cap, events: [], now: 0 });

export function reduce(night: Night, action: Action): Night {
  switch (action.type) {
    case "setCap":
      if (night.phase !== "planning") return night;
      return { ...night, cap: Math.max(MIN_CAP, Math.min(MAX_CAP, Math.round(action.cap))) };
    case "start":
      return night.phase === "planning" ? { ...night, phase: "live", now: 0, events: [] } : night;
    case "drink":
      if (night.phase !== "live" || drinks(night).length >= MAX_DRINKS) return night;
      return { ...night, events: [...night.events, { kind: "drink", at: night.now }] };
    case "water":
      return night.phase === "live" ? { ...night, events: [...night.events, { kind: "water", at: night.now }] } : night;
    case "tick":
      return night.phase === "live" ? { ...night, now: night.now + Math.max(0, action.minutes) } : night;
    case "close":
      return night.phase === "live" ? { ...night, phase: "closed" } : night;
    case "reset":
      return initialNight(night.cap);
  }
}

export const drinks = (night: Night) => night.events.filter((event) => event.kind === "drink");
export const waters = (night: Night) => night.events.filter((event) => event.kind === "water");
export const overBy = (night: Night) => Math.max(0, drinks(night).length - night.cap);

/** Minutes since the last drink, or null before the first one. */
export function sinceLastDrink(night: Night): number | null {
  const all = drinks(night);
  return all.length ? night.now - all[all.length - 1].at : null;
}

/** 0 to 1: how far through the pace the visitor is. 1 means the next drink is on pace. */
export function paceProgress(night: Night): number {
  const since = sinceLastDrink(night);
  return since === null ? 1 : Math.max(0, Math.min(1, since / PACE_MINUTES));
}

/** Gaps between drinks that were shorter than the pace. */
export function rushedGaps(night: Night): number {
  const all = drinks(night);
  let rushed = 0;
  for (let i = 1; i < all.length; i++) if (all[i].at - all[i - 1].at < PACE_MINUTES) rushed++;
  return rushed;
}

/** Drinks, after the first, that followed the previous drink with no water in between. */
export function dryGaps(night: Night): number {
  let gaps = 0;
  let seenDrink = false;
  let waterSince = false;
  for (const event of night.events) {
    if (event.kind === "water") {
      waterSince = true;
    } else {
      if (seenDrink && !waterSince) gaps++;
      seenDrink = true;
      waterSince = false;
    }
  }
  return gaps;
}

export interface Score {
  total: number;
  rows: Array<{ key: keyof typeof WEIGHTS; label: string; points: number; of: number }>;
}

export function score(night: Night): Score {
  const rows: Score["rows"] = [
    { key: "showedUp", label: "Showed up and logged", points: WEIGHTS.showedUp, of: WEIGHTS.showedUp },
    { key: "pacing", label: "Pacing", points: Math.max(0, WEIGHTS.pacing - 9 * rushedGaps(night)), of: WEIGHTS.pacing },
    { key: "water", label: "Water", points: Math.max(0, WEIGHTS.water - 5 * dryGaps(night)), of: WEIGHTS.water },
    { key: "cap", label: "Your number", points: Math.max(0, WEIGHTS.cap - 8 * overBy(night)), of: WEIGHTS.cap },
    { key: "lastCall", label: "Closed the tab yourself", points: WEIGHTS.lastCall, of: WEIGHTS.lastCall },
    { key: "planAhead", label: "Planned ahead", points: WEIGHTS.planAhead, of: WEIGHTS.planAhead },
    { key: "liveLogging", label: "Logged as you went", points: WEIGHTS.liveLogging, of: WEIGHTS.liveLogging },
  ];
  return { total: rows.reduce((sum, row) => sum + row.points, 0), rows };
}

export interface Verdict {
  headline: string;
  line: string;
  /** A real badge from the app that this demo night would have earned, by its art slug. */
  badge: { slug: string; name: string; blurb: string } | null;
  over: boolean;
}

export function verdict(night: Night): Verdict {
  const count = drinks(night).length;
  const over = overBy(night) > 0;
  if (over) {
    return {
      headline: "Over plan. Logged in full.",
      line: "The score reflects it and nothing resets. Tomorrow you are back on plan.",
      badge: { slug: "badge-honest-log", name: "Honest Log", blurb: "Logged a night that went over, in full. Logging it is the win." },
      over,
    };
  }
  if (count === 0) {
    return { headline: "A dry night out.", line: "You showed up, stuck to water and closed the tab. That is a full score.", badge: null, over };
  }
  if (count >= 2 && rushedGaps(night) === 0) {
    return {
      headline: "That's a clean night.",
      line: "On your number, and every drink an hour apart.",
      badge: { slug: "badge-pacer", name: "Pacer", blurb: "Every drink at least an hour apart, all night." },
      over,
    };
  }
  if (count >= 2 && dryGaps(night) === 0) {
    return {
      headline: "On plan, and well watered.",
      line: "A water between every drink.",
      badge: { slug: "badge-hydro-homie", name: "Hydro Homie", blurb: "Water between every drink." },
      over,
    };
  }
  return { headline: "On plan.", line: "You stayed at or under your number. Pacing and water are where the rest of the points live.", badge: null, over };
}
