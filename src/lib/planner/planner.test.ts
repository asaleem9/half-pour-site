import { test } from "node:test";
import assert from "node:assert/strict";
import { initialNight, reduce, score, verdict, overBy, rushedGaps, dryGaps, paceProgress, type Action, type Night } from "./planner.ts";

const run = (actions: Action[], cap = 4): Night => actions.reduce(reduce, reduce(initialNight(cap), { type: "start" }));
const wait = (minutes: number): Action => ({ type: "tick", minutes });
const drink: Action = { type: "drink" };
const water: Action = { type: "water" };

test("a paced, watered night on plan scores 100", () => {
  const night = run([drink, water, wait(60), drink, water, wait(60), drink, { type: "close" }]);
  assert.equal(score(night).total, 100);
  assert.equal(verdict(night).badge?.name, "Pacer");
});

test("a dry night out scores 100", () => {
  const night = run([water, wait(60), water, { type: "close" }]);
  assert.equal(score(night).total, 100);
});

test("rushing costs pacing points, skipping water costs water points", () => {
  const night = run([drink, wait(10), drink, wait(10), drink]);
  assert.equal(rushedGaps(night), 2);
  assert.equal(dryGaps(night), 2);
  const rows = Object.fromEntries(score(night).rows.map((row) => [row.key, row.points]));
  assert.equal(rows.pacing, 25 - 18);
  assert.equal(rows.water, 15 - 10);
});

test("going over the number costs points but never zeroes the night", () => {
  const night = run([drink, drink, drink, drink, drink, drink, { type: "close" }], 2);
  assert.equal(overBy(night), 4);
  assert.ok(score(night).total > 0);
  assert.equal(verdict(night).over, true);
  assert.equal(verdict(night).badge?.name, "Honest Log");
});

test("the pace ring fills over an hour", () => {
  let night = run([drink]);
  assert.equal(paceProgress(night), 0);
  night = reduce(night, wait(30));
  assert.equal(paceProgress(night), 0.5);
  night = reduce(night, wait(45));
  assert.equal(paceProgress(night), 1);
});

test("the number can only change before the night starts", () => {
  let night = initialNight(4);
  night = reduce(night, { type: "setCap", cap: 99 });
  assert.equal(night.cap, 8);
  night = reduce(night, { type: "start" });
  assert.equal(reduce(night, { type: "setCap", cap: 2 }).cap, 8);
});

// The property the whole demo rests on: one more drink never raises the score, whatever came before it
// and however long the visitor waited first.
test("logging another drink never raises the score", () => {
  const alphabet: Action[] = [drink, water, wait(20), wait(60)];
  const sequences: Action[][] = [[]];
  for (let length = 1; length <= 7; length++) {
    const next: Action[][] = [];
    for (const sequence of sequences.filter((s) => s.length === length - 1)) for (const action of alphabet) next.push([...sequence, action]);
    sequences.push(...next);
  }
  let checked = 0;
  for (const cap of [1, 3, 8]) {
    for (const sequence of sequences) {
      const before = run(sequence, cap);
      for (const pause of [0, 20, 60, 200]) {
        const after = reduce(reduce(before, wait(pause)), drink);
        assert.ok(score(after).total <= score(before).total, `cap ${cap}: ${JSON.stringify(sequence)} then wait ${pause} and drink raised the score`);
        checked++;
      }
    }
  }
  assert.ok(checked > 50000);
});
