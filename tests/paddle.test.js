import test from "node:test";
import assert from "node:assert/strict";
import {
  rgbTensor,
  decodeCTC,
  textRegions,
  mergePhysicalLines,
} from "../src/paddle/math.js";
test("Paddle inputs use RGB CHW and separate official detector/recognizer normalization", () => {
  const input = new Uint8ClampedArray([255, 0, 128, 255]);
  const rec = rgbTensor(input, 1, 1, "recognition");
  assert.equal(rec[0], 1);
  assert.equal(rec[1], -1);
  assert.ok(Math.abs(rec[2] - (128 / 255 - 0.5) / 0.5) < 1e-6);
  const det = rgbTensor(input, 1, 1, "detection");
  assert.ok(Math.abs(det[0] - (1 - 0.485) / 0.229) < 1e-6);
});
test("CTC blank separates repeated letters; uncertain glyphs retain individual probabilities", () => {
  const dict = ["A", "B"];
  const ids = [1, 1, 0, 1, 2, 3],
    values = new Float32Array(6 * 4).fill(0.01);
  ids.forEach((id, i) => (values[i * 4 + id] = i === 4 ? 0.42 : 0.95));
  const result = decodeCTC(values, [1, 6, 4], dict);
  assert.equal(result.text, "AAB ");
  assert.equal(result.characters.length, 4);
  assert.ok(Math.abs(result.characters[2].confidence - 42) < 0.001);
  assert.throws(() => decodeCTC(values, [1, 6, 5], dict));
});
test("DB regions preserve several lines, score foreground and cap work without inventing boxes", () => {
  const w = 100,
    h = 90,
    map = new Float32Array(w * h);
  for (const y of [15, 40, 65])
    for (let j = y; j < y + 5; j++)
      for (let x = 20; x < 75; x++) map[j * w + x] = 0.9;
  const result = textRegions(map, w, h);
  assert.equal(result.regions.length, 3);
  assert.equal(result.truncated, false);
  assert.ok(
    result.regions.every(
      (r) => r.detectionScore > 0.89 && r.x >= 0 && r.y >= 0 && r.x + r.w <= w,
    ),
  );
  assert.equal(textRegions(map, w, h, { maxRegions: 2 }).truncated, true);
  assert.deepEqual(textRegions(new Float32Array(w * h), w, h).regions, []);
});
test("only spatially adjacent fragments within the same physical line can be grouped", () => {
  const fragment = (text, x, y) => ({
    text,
    confidence: 90,
    characters: [...text].map((text) => ({ text, confidence: 90 })),
    box: { x, y, w: 0.15, h: 0.05 },
  });
  const result = mergePhysicalLines([
    fragment("5", 0.3, 0.4),
    fragment("Kim", 0.1, 0.1),
    fragment("P", 0.1, 0.4),
  ]);
  assert.deepEqual(
    result.map((l) => l.text),
    ["Kim", "P 5"],
  );
  assert.equal(result[1].characters[1].confidence, 20);
  const separated = mergePhysicalLines([
    fragment("LEFT", 0.05, 0.1),
    fragment("OTHER", 0.8, 0.1),
  ]);
  assert.equal(separated.length, 2);
});
