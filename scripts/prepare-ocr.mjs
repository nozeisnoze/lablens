import { mkdir, copyFile, readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const target = new URL("../public/ocr/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  new URL("worker.min.js", target),
);
const paddle = new URL("paddle/", target);
await mkdir(paddle, { recursive: true });
const manifest = JSON.parse(
  await readFile(new URL("./paddle-models.json", import.meta.url), "utf8"),
);
for (const asset of manifest.assets) {
  const source = `node_modules/@gutenye/ocr-models/assets/${asset.file}`;
  const bytes = await readFile(source);
  if (
    bytes.length !== asset.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new Error(`Paddle model integrity mismatch: ${asset.file}`);
  await copyFile(source, new URL(asset.file, paddle));
}
for (const name of ["ort-wasm-simd.wasm", "ort-wasm.wasm"])
  await copyFile(
    `node_modules/onnxruntime-web/dist/${name}`,
    new URL(name, paddle),
  );
await copyFile(
  new URL("./paddle-models.json", import.meta.url),
  new URL("models.json", paddle),
);
await copyFile("public/paddle-LICENSE.txt", new URL("LICENSE.txt", paddle));
for (const name of await readdir("node_modules/tesseract.js-core"))
  if (/\.(wasm|js)$/.test(name))
    await copyFile(
      `node_modules/tesseract.js-core/${name}`,
      new URL(name, target),
    );
await copyFile(
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  new URL("eng.traineddata.gz", target),
);
console.log(
  "OCR worker, verified npm model package and WASM copied for same-origin offline use.",
);
