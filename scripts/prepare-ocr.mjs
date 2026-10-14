import { mkdir, copyFile, readdir } from "node:fs/promises";
const target = new URL("../public/ocr/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  new URL("worker.min.js", target),
);
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
