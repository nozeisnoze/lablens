import test from "node:test";
import assert from "node:assert/strict";
import {
  toSourceBox,
  evaluateLines,
  validateTruth,
} from "../src/benchmark-metrics.js";
const box = (x, y, w = 0.3, h = 0.08) => ({ x, y, w, h });
const truth = {
  kind: "synthetic",
  localProcessingAuthorized: true,
  lines: [
    { text: "AB1", box: box(0.2, 0.1) },
    { text: "Kim", box: box(0.2, 0.4) },
    { text: null, box: box(0.2, 0.7) },
  ],
};
test("real-label evaluation reports omissions, substitutions and background false positives separately", () => {
  const result = evaluateLines(truth, [
    { text: "ABI", box: box(0.2, 0.1) },
    { text: "ambiguous observed", box: box(0.2, 0.7) },
    { text: "background", box: box(0.7, 0.1, 0.2, 0.08) },
  ]);
  assert.equal(result.omissions, 1);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.scoredCharacters, 6);
  assert.equal(result.characterErrors, 4);
  assert.equal(result.lines[2].characterErrors, null);
});
test("several predictions cannot all match one physical ground-truth line", () => {
  const p = { text: "AB1", box: box(0.2, 0.1) };
  const result = evaluateLines(truth, [p, p]);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.omissions, 2);
});
test("rotated-crop boxes map back to source coordinates without mixing crop and source units", () => {
  const mapped = toSourceBox(
    box(0.1, 0.2, 0.4, 0.3),
    { x: 200, y: 100, w: 400, h: 500 },
    0,
    1000,
    1000,
  );
  for (const [key, value] of Object.entries({
    x: 0.24,
    y: 0.2,
    w: 0.16,
    h: 0.15,
  }))
    assert.ok(Math.abs(mapped[key] - value) < 1e-10);
  const rotated = toSourceBox(
    box(0.1, 0.2, 0.4, 0.3),
    { x: 200, y: 100, w: 400, h: 500 },
    3,
    1000,
    1000,
  );
  assert.ok(rotated.w > mapped.w);
  assert.ok(rotated.h > mapped.h);
});
test("evaluation rejects unauthorized processing and ambiguous guesses as scored ground truth", () => {
  assert.throws(() =>
    validateTruth({ ...truth, localProcessingAuthorized: false }),
  );
  assert.throws(() =>
    validateTruth({ ...truth, lines: [{ text: "AB?", box: box(0.2, 0.1) }] }),
  );
});
