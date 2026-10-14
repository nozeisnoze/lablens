# OCR model provenance and licenses

Weights/dictionary come from exact npm package `@gutenye/ocr-models@1.4.2`,
distributing converted PaddleOCR PP-OCRv4 assets. npm tarball integrity is pinned
in `package-lock.json`. `scripts/paddle-models.json` records SHA-256 checksums
and sizes, verified before copying to same-origin assets. Do not change expected
hashes to make mismatched artifacts pass.

The package's MIT code license does not cover the upstream model/dictionary
assets, which retain [PaddleOCR's Apache-2.0 license](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE).
The full license is redistributed as `public/paddle-LICENSE.txt` and alongside
prepared models. The custom adapter does not use Gutenye's browser wrapper.

ONNX Runtime Web 1.17.3 is MIT; Tesseract.js is Apache-2.0. All assets are
same-origin for users; no remote OCR API exists. Model licensing/availability
does not establish clinical suitability or accuracy.
