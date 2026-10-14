import { makeOCR } from "./ocr.js";
// A comparison flag, not a claim that a new engine has passed real-label acceptance.
export async function makeRecognitionEngine(search = location.search) {
  const engine = new URLSearchParams(search).get("engine") || "tesseract";
  if (engine === "tesseract") return makeOCR();
  if (engine === "paddle") {
    const { makePaddleOCR } = await import("./paddle/engine.js");
    return makePaddleOCR();
  }
  throw new Error(`Unknown OCR engine: ${engine}`);
}
