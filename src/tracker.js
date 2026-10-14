// Translation/scale template tracking inside a user-selected label ROI.
// Conservative rejection is essential: background or a lost target cannot feed OCR.
const SIDE = 32;
function signature(ctx, r) {
  const c = document.createElement("canvas");
  c.width = c.height = SIDE;
  const cc = c.getContext("2d", { willReadFrequently: true });
  cc.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, SIDE, SIDE);
  const data = cc.getImageData(0, 0, SIDE, SIDE).data;
  const values = Array.from(
    { length: SIDE * SIDE },
    (_, i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3,
  );
  const mean = values.reduce((a, b) => a + b) / values.length;
  const norm = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0));
  return {
    values: values.map((v) => (v - mean) / (norm || 1)),
    contrast: norm / Math.sqrt(values.length),
  };
}
const score = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export class Tracker {
  reset() {
    this.anchor = null;
    this.roi = null;
  }
  lock(ctx, roi) {
    this.roi = { ...roi };
    this.anchor = signature(ctx, roi);
    return this.anchor.contrast >= 8;
  }
  update(ctx) {
    if (!this.anchor) return null;
    let best = { confidence: -1 };
    for (const scale of [0.97, 1, 1.03])
      for (const dx of [-0.06, 0, 0.06])
        for (const dy of [-0.045, 0, 0.045]) {
          const r = {
            x: this.roi.x + dx * this.roi.w,
            y: this.roi.y + dy * this.roi.h,
            w: this.roi.w * scale,
            h: this.roi.h * scale,
          };
          if (
            r.x < 0 ||
            r.y < 0 ||
            r.x + r.w > ctx.canvas.width ||
            r.y + r.h > ctx.canvas.height
          )
            continue;
          const s = signature(ctx, r);
          const confidence = score(this.anchor.values, s.values);
          if (confidence > best.confidence)
            best = { roi: r, confidence, contrast: s.contrast };
        }
    if (best.confidence >= 0.65) this.roi = best.roi;
    return best;
  }
}
