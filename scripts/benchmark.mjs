import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import {
  evaluateLines,
  toSourceBox,
  validateTruth,
} from "../src/benchmark-metrics.js";
const args = process.argv.slice(2),
  input = args[0];
if (!input) {
  console.error(
    "Usage: npm run benchmark -- IMAGE [--roi x,y,width,height] [--truth /private/visible-lines.json] [--out benchmark-results/RUN]\nROI uses normalized source coordinates. Keep private images and results out of Git.",
  );
  process.exit(2);
}
const option = (name) => args[args.indexOf(name) + 1];
const truth = args.includes("--truth")
  ? JSON.parse(await readFile(option("--truth"), "utf8"))
  : null;
if (truth) validateTruth(truth);
const roi = args.includes("--roi")
  ? option("--roi").split(",").map(Number)
  : [0, 0, 1, 1];
if (
  roi.length !== 4 ||
  roi.some((v) => !Number.isFinite(v) || v < 0) ||
  roi[2] <= 0 ||
  roi[3] <= 0 ||
  roi[0] + roi[2] > 1 ||
  roi[1] + roi[3] > 1
)
  throw new Error("Invalid normalized ROI");
const out = resolve(
  args.includes("--out") ? option("--out") : `benchmark-results/${Date.now()}`,
);
await mkdir(out, { recursive: true });
const bytes = await readFile(input);
const server = await createServer({
  server: { host: "127.0.0.1", port: 4174, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  );
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4174/benchmark.html");
  const browserResults = await page.evaluate(
    async ({ data, roi }) => {
      const { makeOCR, cropLabel } = await import("/src/ocr.js");
      const { makePaddleOCR } = await import("/src/paddle/engine.js");
      const image = new Image();
      image.src = "data:image/jpeg;base64," + data;
      await image.decode();
      const r = {
        x: roi[0] * image.width,
        y: roi[1] * image.height,
        w: roi[2] * image.width,
        h: roi[3] * image.height,
      };
      const started = performance.now();
      const ocr = await makeOCR();
      const baselineInitializeMs = performance.now() - started;
      const paddleStarted = performance.now();
      const paddle = await makePaddleOCR();
      const paddleInitializeMs = performance.now() - paddleStarted;
      const results = [];
      try {
        for (const variant of ["original", "contrast"])
          for (const degrees of [0, -3, 3])
            for (const mode of [11, 6]) {
              const crop = cropLabel(image, r, variant);
              const canvas = document.createElement("canvas");
              canvas.width = crop.width;
              canvas.height = crop.height;
              const ctx = canvas.getContext("2d");
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((degrees * Math.PI) / 180);
              ctx.drawImage(crop, -crop.width / 2, -crop.height / 2);
              const started = performance.now();
              const result = await ocr.recognize(canvas, mode);
              results.push({
                engine: "Tesseract.js 6 / LSTM best-int",
                variant,
                degrees,
                psm: mode,
                elapsedMs: performance.now() - started,
                ...result,
                boxCoordinates: "normalized rotated crop",
                png: canvas.toDataURL("image/png").split(",")[1],
              });
            }
        for (const variant of ["original", "contrast"])
          for (const degrees of [0, -3, 3]) {
            const crop = cropLabel(image, r, variant),
              canvas = document.createElement("canvas");
            canvas.width = crop.width;
            canvas.height = crop.height;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((degrees * Math.PI) / 180);
            ctx.drawImage(crop, -crop.width / 2, -crop.height / 2);
            const began = performance.now(),
              result = await paddle.recognize(canvas);
            results.push({
              engine: result.engine,
              variant,
              degrees,
              psm: null,
              elapsedMs: performance.now() - began,
              ...result,
              boxCoordinates: "normalized rotated crop",
              png: canvas.toDataURL("image/png").split(",")[1],
            });
          }
      } finally {
        await ocr.terminate();
        await paddle.terminate();
      }
      return {
        source: { width: image.width, height: image.height, roi: r },
        initialization: {
          tesseractMs: baselineInitializeMs,
          paddleMs: paddleInitializeMs,
        },
        results,
      };
    },
    { data: bytes.toString("base64"), roi },
  );
  const results = [];
  for (let i = 0; i < browserResults.results.length; i++) {
    const { png, ...run } = browserResults.results[i];
    const path = resolve(out, `variant-${i}.png`);
    await writeFile(path, Buffer.from(png, "base64"));
    results.push(run);
    if (run.engine.startsWith("PaddleOCR")) continue;
    const started = performance.now();
    try {
      const { stdout } = await promisify(execFile)(
        "tesseract",
        [path, "stdout", "-l", "eng", "--psm", String(run.psm), "tsv"],
        {
          maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, OMP_THREAD_LIMIT: "2" },
        },
      );
      const groups = new Map();
      for (const row of stdout.trim().split("\n").slice(1)) {
        const columns = row.split("\t");
        if (columns[0] !== "5" || !columns.slice(11).join("\t").trim())
          continue;
        const key = columns.slice(1, 5).join(":");
        const word = {
          x: +columns[6],
          y: +columns[7],
          w: +columns[8],
          h: +columns[9],
          confidence: +columns[10],
          text: columns.slice(11).join("\t"),
        };
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(word);
      }
      const width = Math.round(
          Math.min(3, 1400 / browserResults.source.roi.w) *
            browserResults.source.roi.w,
        ),
        height = Math.round(
          Math.min(3, 1400 / browserResults.source.roi.w) *
            browserResults.source.roi.h,
        );
      const lines = [...groups.values()].map((words) => {
        const x = Math.min(...words.map((w) => w.x)),
          y = Math.min(...words.map((w) => w.y));
        return {
          text: words.map((w) => w.text).join(" "),
          confidence:
            words.reduce((a, w) => a + w.confidence, 0) / words.length,
          box: {
            x: x / width,
            y: y / height,
            w: (Math.max(...words.map((w) => w.x + w.w)) - x) / width,
            h: (Math.max(...words.map((w) => w.y + w.h)) - y) / height,
          },
        };
      });
      results.push({
        engine: "Native Tesseract / installed eng model",
        variant: run.variant,
        degrees: run.degrees,
        psm: run.psm,
        elapsedMs: performance.now() - started,
        lines,
        boxCoordinates: "normalized rotated crop",
      });
    } catch (error) {
      results.push({
        engine: "Native Tesseract",
        variant: run.variant,
        degrees: run.degrees,
        psm: run.psm,
        status: "unrun-or-failed",
        error: error.message,
      });
    }
  }
  const report = {
    date: new Date().toISOString(),
    input: resolve(input),
    source: browserResults.source,
    initialization: browserResults.initialization,
    datasetKind: truth?.kind || "unclassified-no-ground-truth",
    iPhoneLatency: "UNTESTED",
    limitations: [
      "PaddleOCR PP-OCRv4 is independent of the Tesseract baselines; this comparison alone does not establish a stronger engine on real cryovials.",
      "Engine confidence is not an accuracy probability.",
      "No character accuracy score without a human-verified visible-only transcript.",
      "Boxes are normalized in each rotated ROI; variant images accompany results.",
      "Do not fill occluded glyphs from an expected sample ID.",
    ],
    results,
  };
  for (const run of results)
    if (run.lines) {
      run.sourceLines = run.lines.map((line) => ({
        ...line,
        box: toSourceBox(
          line.box,
          report.source.roi,
          run.degrees,
          report.source.width,
          report.source.height,
        ),
      }));
      if (truth) run.metrics = evaluateLines(truth, run.sourceLines);
    }
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Wrote ${results.length} runtime results with text, boxes, confidence and timings to ${out}`,
  );
  for (const run of results)
    console.log(
      `${run.engine} ${run.variant} ${run.degrees}° PSM${run.psm}: ${run.lines?.map((l) => l.text).join(" | ") || run.status}`,
    );
} finally {
  await browser?.close();
  await server.close();
}
