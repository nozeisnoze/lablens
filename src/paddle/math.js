// PaddleOCR model preprocessing and CTC decoding. No dictionary-based correction.
export function rgbTensor(rgba, width, height, kind) {
  const output = new Float32Array(3 * width * height);
  const mean = kind === "detection" ? [0.485, 0.456, 0.406] : [0.5, 0.5, 0.5];
  const std = kind === "detection" ? [0.229, 0.224, 0.225] : [0.5, 0.5, 0.5];
  for (let i = 0; i < width * height; i++)
    for (let c = 0; c < 3; c++)
      output[c * width * height + i] =
        (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
  return output;
}
export function decodeCTC(data, dims, dictionary) {
  if (dims.length !== 3 || dims[0] !== 1 || dims[2] !== dictionary.length + 2)
    throw new Error("Unexpected recognition model/dictionary shape");
  const chars = [];
  let last = -1;
  for (let t = 0; t < dims[1]; t++) {
    let index = 0,
      probability = -Infinity;
    for (let c = 0; c < dims[2]; c++)
      if (data[t * dims[2] + c] > probability) {
        probability = data[t * dims[2] + c];
        index = c;
      }
    if (index !== 0 && index !== last)
      chars.push({
        text: index === dictionary.length + 1 ? " " : dictionary[index - 1],
        confidence: Math.max(0, Math.min(100, probability * 100)),
      });
    last = index;
  }
  return {
    text: chars.map((c) => c.text).join(""),
    characters: chars,
    confidence: chars.length
      ? chars.reduce((s, c) => s + c.confidence, 0) / chars.length
      : 0,
  };
}
// DB detector outputs shrunken text regions. Score before expansion, then unclip.
export function textRegions(
  map,
  width,
  height,
  { threshold = 0.3, boxThreshold = 0.5, maxRegions = 64 } = {},
) {
  if (map.length !== width * height)
    throw new Error("Unexpected detection map dimensions");
  const seen = new Uint8Array(map.length),
    queue = new Int32Array(map.length),
    found = [];
  for (let seed = 0; seed < map.length; seed++) {
    if (seen[seed] || map[seed] < threshold) continue;
    let head = 0,
      tail = 1,
      x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0,
      total = 0;
    queue[0] = seed;
    seen[seed] = 1;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      total += map[p];
      for (const n of [
        x > 0 ? p - 1 : -1,
        x + 1 < width ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y + 1 < height ? p + width : -1,
      ])
        if (n >= 0 && !seen[n] && map[n] >= threshold) {
          seen[n] = 1;
          queue[tail++] = n;
        }
    }
    const score = total / tail,
      w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    if (tail < 6 || w < 3 || h < 3 || score < boxThreshold) continue;
    const pad = (1.5 * w * h) / (2 * (w + h));
    const x = Math.max(0, x0 - pad),
      y = Math.max(0, y0 - pad);
    found.push({
      x,
      y,
      w: Math.min(width, x1 + 1 + pad) - x,
      h: Math.min(height, y1 + 1 + pad) - y,
      detectionScore: score,
    });
  }
  // Bound recognition work. Prefer scored candidates, but report truncation.
  found.sort((a, b) => b.detectionScore - a.detectionScore);
  return {
    regions: found.slice(0, maxRegions).sort((a, b) => a.y - b.y || a.x - b.x),
    truncated: found.length > maxRegions,
  };
}
export function mergePhysicalLines(fragments) {
  const groups = [];
  for (const f of fragments) {
    const center = f.box.y + f.box.h / 2;
    const group = groups.find((g) => {
      const left = Math.min(...g.parts.map((p) => p.box.x)),
        right = Math.max(...g.parts.map((p) => p.box.x + p.box.w));
      const gap = Math.max(0, f.box.x - right, left - (f.box.x + f.box.w));
      return (
        Math.abs(g.center - center) < Math.min(g.height, f.box.h) * 0.45 &&
        gap <= Math.max(0.04, Math.min(g.height, f.box.h) * 2)
      );
    });
    if (group) {
      group.parts.push(f);
    } else groups.push({ center, height: f.box.h, parts: [f] });
  }
  return groups
    .sort((a, b) => a.center - b.center)
    .map((g) => {
      const parts = g.parts.sort((a, b) => a.box.x - b.box.x),
        characters = [];
      for (let i = 0; i < parts.length; i++) {
        // This is spatial grouping within ONE frame, never temporal concatenation.
        if (
          i &&
          parts[i].box.x > parts[i - 1].box.x + parts[i - 1].box.w + 0.01
        )
          characters.push({ text: " ", confidence: 20 });
        characters.push(...parts[i].characters);
      }
      const x = Math.min(...parts.map((p) => p.box.x)),
        y = Math.min(...parts.map((p) => p.box.y));
      return {
        text: characters.map((c) => c.text).join(""),
        characters,
        confidence: characters.length
          ? characters.reduce((s, c) => s + c.confidence, 0) / characters.length
          : 0,
        box: {
          x,
          y,
          w: Math.max(...parts.map((p) => p.box.x + p.box.w)) - x,
          h: Math.max(...parts.map((p) => p.box.y + p.box.h)) - y,
        },
      };
    });
}
