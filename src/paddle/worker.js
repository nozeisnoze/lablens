import * as ort from "onnxruntime-web";
import {
  rgbTensor,
  decodeCTC,
  textRegions,
  mergePhysicalLines,
} from "./math.js";
ort.env.wasm.numThreads = 1; // Safari: no SharedArrayBuffer/COOP/COEP prerequisite.
ort.env.wasm.wasmPaths = "/ocr/paddle/";
ort.env.wasm.proxy = false;
let detector, recognizer, dictionary;
const createCanvas = (w, h) => new OffscreenCanvas(w, h);
async function initialize() {
  if (!self.OffscreenCanvas)
    throw new Error(
      "This browser lacks worker OffscreenCanvas; PaddleOCR is not enabled.",
    );
  const response = await fetch("/ocr/paddle/ppocr_keys_v1.txt");
  if (!response.ok) throw new Error("Missing same-origin PaddleOCR dictionary");
  // The trailing newline is not an extra class. Blank CTC and space are appended separately.
  dictionary = (await response.text())
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n");
  const options = {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  };
  detector = await ort.InferenceSession.create(
    "/ocr/paddle/ch_PP-OCRv4_det_infer.onnx",
    options,
  );
  try {
    recognizer = await ort.InferenceSession.create(
      "/ocr/paddle/ch_PP-OCRv4_rec_infer.onnx",
      options,
    );
  } catch (error) {
    await detector.release();
    detector = null;
    throw error;
  }
}
async function recognize({ data, width, height }) {
  if (!detector || !recognizer) throw new Error("PaddleOCR is not initialized");
  const source = createCanvas(width, height),
    sourceCtx = source.getContext("2d", { willReadFrequently: true });
  sourceCtx.putImageData(
    new ImageData(new Uint8ClampedArray(data), width, height),
    0,
    0,
  );
  const ratio = Math.min(1, 960 / Math.max(width, height)),
    dw = Math.max(32, Math.ceil((width * ratio) / 32) * 32),
    dh = Math.max(32, Math.ceil((height * ratio) / 32) * 32);
  const detection = createCanvas(dw, dh),
    dc = detection.getContext("2d", { willReadFrequently: true });
  dc.drawImage(source, 0, 0, dw, dh);
  const input = new ort.Tensor(
    "float32",
    rgbTensor(dc.getImageData(0, 0, dw, dh).data, dw, dh, "detection"),
    [1, 3, dh, dw],
  );
  const output = await detector.run({ [detector.inputNames[0]]: input }),
    map = output[detector.outputNames[0]];
  if (map.dims.length !== 4 || map.dims[0] !== 1 || map.dims[1] !== 1)
    throw new Error("Unexpected DB detection shape");
  const { regions, truncated } = textRegions(
    map.data,
    map.dims[3],
    map.dims[2],
  );
  const fragments = [];
  for (const r of regions) {
    const crop = {
      x: (r.x / map.dims[3]) * width,
      y: (r.y / map.dims[2]) * height,
      w: (r.w / map.dims[3]) * width,
      h: (r.h / map.dims[2]) * height,
    };
    const rw = Math.max(16, Math.min(1024, Math.ceil((crop.w / crop.h) * 48))),
      line = createCanvas(rw, 48),
      lc = line.getContext("2d", { willReadFrequently: true });
    lc.fillStyle = "white";
    lc.fillRect(0, 0, rw, 48);
    lc.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, rw, 48);
    const tensor = new ort.Tensor(
      "float32",
      rgbTensor(lc.getImageData(0, 0, rw, 48).data, rw, 48, "recognition"),
      [1, 3, 48, rw],
    );
    const prediction = await recognizer.run({
        [recognizer.inputNames[0]]: tensor,
      }),
      logits = prediction[recognizer.outputNames[0]];
    const decoded = decodeCTC(logits.data, logits.dims, dictionary);
    if (decoded.text.trim())
      fragments.push({
        ...decoded,
        box: {
          x: crop.x / width,
          y: crop.y / height,
          w: crop.w / width,
          h: crop.h / height,
        },
        detectionScore: r.detectionScore,
      });
  }
  const lines = mergePhysicalLines(fragments);
  return {
    raw: lines.map((l) => l.text).join("\n"),
    lines,
    engine: "PaddleOCR PP-OCRv4 / ONNX WASM",
    warnings: truncated
      ? ["Detection candidate limit reached; review omitted lines."]
      : [],
  };
}
// Main thread serializes jobs: one inference at a time, with transferable pixels.
self.onmessage = async ({ data: message }) => {
  try {
    const result =
      message.type === "initialize"
        ? (await initialize(), { ready: true })
        : await recognize(message.image);
    self.postMessage({ id: message.id, result });
  } catch (error) {
    self.postMessage({ id: message.id, error: String(error.message || error) });
  }
};
