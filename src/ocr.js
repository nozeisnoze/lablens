import { createWorker, PSM } from "tesseract.js";
export async function makeOCR(onProgress = () => {}) {
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    workerBlobURL: false,
    logger: onProgress,
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
  });
  return {
    async recognize(canvas, mode = PSM.SPARSE_TEXT) {
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      const { data } = await worker.recognize(
        canvas,
        {},
        { text: true, blocks: true, tsv: true },
      );
      const lines = (data.blocks || []).flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines),
      );
      return {
        raw: data.text,
        lines: lines.map((l) => ({
          text: l.text.trim(),
          confidence: l.confidence,
          box: {
            x: l.bbox.x0 / canvas.width,
            y: l.bbox.y0 / canvas.height,
            w: (l.bbox.x1 - l.bbox.x0) / canvas.width,
            h: (l.bbox.y1 - l.bbox.y0) / canvas.height,
          },
        })),
      };
    },
    terminate: () => worker.terminate(),
  };
}
export function cropLabel(source, roi, variant = "original") {
  const canvas = document.createElement("canvas");
  const scale = Math.min(3, 1400 / roi.w);
  canvas.width = Math.round(roi.w * scale);
  canvas.height = Math.round(roi.h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(
    source,
    roi.x,
    roi.y,
    roi.w,
    roi.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (variant === "contrast") {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const v =
        (image.data[i] * 0.299 +
          image.data[i + 1] * 0.587 +
          image.data[i + 2] * 0.114 -
          128) *
          1.35 +
        128;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}
