import { align } from "./fusion.js";
const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);
export function iou(a, b) {
  const intersection =
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return intersection / (area(a) + area(b) - intersection || 1);
}
export function toSourceBox(box, roi, degrees, sourceWidth, sourceHeight) {
  const radians = (-degrees * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  const rw = roi.w,
    rh = roi.h;
  const points = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ].map(([x, y]) => {
    const dx = (x - 0.5) * rw,
      dy = (y - 0.5) * rh;
    return {
      x: (roi.x + rw / 2 + dx * c - dy * s) / sourceWidth,
      y: (roi.y + rh / 2 + dx * s + dy * c) / sourceHeight,
    };
  });
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...points.map((p) => p.x)) - x,
    h: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function validateTruth(truth) {
  if (
    !Array.isArray(truth.lines) ||
    !truth.lines.length ||
    truth.localProcessingAuthorized !== true
  )
    throw new Error(
      "Ground truth requires authorized local processing and at least one physical line.",
    );
  if (!["real-cryovial", "synthetic", "other"].includes(truth.kind))
    throw new Error("Ground truth must identify its dataset kind.");
  for (const l of truth.lines) {
    if (
      !l.box ||
      ["x", "y", "w", "h"].some((k) => !Number.isFinite(l.box[k])) ||
      l.box.x < 0 ||
      l.box.y < 0 ||
      l.box.w <= 0 ||
      l.box.h <= 0 ||
      l.box.x + l.box.w > 1 ||
      l.box.y + l.box.h > 1
    )
      throw new Error(
        "Truth boxes must be normalized source-image coordinates.",
      );
    if (
      l.text !== null &&
      (typeof l.text !== "string" || !l.text.length || l.text.includes("?"))
    )
      throw new Error(
        "Use null for ambiguous transcripts; never score guessed or hidden characters.",
      );
  }
}
export function evaluateLines(truth, predictions) {
  validateTruth(truth);
  const candidates = [];
  truth.lines.forEach((expected, i) =>
    predictions.forEach((actual, j) => {
      const overlap = iou(expected.box, actual.box);
      if (overlap >= 0.15) candidates.push({ i, j, overlap });
    }),
  );
  candidates.sort((a, b) => b.overlap - a.overlap);
  const matched = new Map(),
    used = new Set();
  for (const c of candidates)
    if (!matched.has(c.i) && !used.has(c.j)) {
      matched.set(c.i, c);
      used.add(c.j);
    }
  let errors = 0,
    characters = 0;
  const lines = truth.lines.map((expected, i) => {
    const match = matched.get(i),
      actual = match ? predictions[match.j] : null;
    const distance =
      expected.text === null
        ? null
        : align(expected.text, actual?.text || "").distance;
    if (distance !== null) {
      errors += distance;
      characters += [...expected.text].length;
    }
    return {
      expected: expected.text,
      actual: actual?.text || null,
      omitted: !actual,
      iou: match?.overlap || 0,
      characterErrors: distance,
      box: expected.box,
    };
  });
  return {
    kind: truth.kind,
    omissions: lines.filter((l) => l.omitted).length,
    falsePositives: predictions.length - used.size,
    scoredCharacters: characters,
    characterErrors: characters ? errors : null,
    characterErrorRate: characters ? errors / characters : null,
    lines,
    limits: [
      "Ambiguous lines have detection metrics only, never a guessed transcript.",
      "IoU threshold 0.15 establishes one-to-one physical-line matches.",
      "Character error rate can exceed 1 and does not certify clinical correctness.",
      "Cloud browser timing is not iPhone latency.",
    ],
  };
}
