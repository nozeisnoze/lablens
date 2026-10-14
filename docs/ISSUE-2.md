# Issue #2 remains open: real cryovial accuracy is unverified

This adds independent browser-executable PaddleOCR PP-OCRv4 detection/recognition
and a comparison harness. No real cryovial image bytes or rotating video exist
in the checkout/workspace. The inline example cannot be passed to OCR runtimes.
No real-image or physical iPhone improvement is claimed. The private reference
location has been requested separately. No patient data is uploaded or invented
as a substitute. The scanner UI is unchanged; no deployment is performed.

## Candidate pipeline

`?engine=paddle` enables the experimental engine. The default remains Tesseract
pending real-label acceptance; there is no silent fallback. Both share the same
tracked ROI crops, multi-frame alignment, editable confirmation and aggregate
CSV. PaddleOCR runs in a module worker with single-threaded ONNX WASM, without
SharedArrayBuffer or WebGPU. Worker OffscreenCanvas is required; physical iPhone
compatibility is unverified.

Detection uses RGB ImageNet normalization, a DB probability map and scored
connected text regions. Recognition crops original input pixels, normalizes to
[-1,1] and uses height-48 variable-width CTC decoding. Blank tokens and duplicate
timesteps are handled explicitly; no sample-ID vocabulary is used. The custom
DB postprocessor uses axis-aligned regions, not polygon rectification or cylinder
reconstruction. Detection long edge is bounded at 960 px, recognition width at
1024 px and candidates at 64; truncation is reported. These limits need real
evaluation. Large rotations can still break template tracking.

Only nearby in-frame fragments can group into a physical line. Across frames,
fusion aligns characters in corresponding tracks with horizontal overlap.
Individual weak glyph probabilities remain uncertain even after many repetitions;
high line-average confidence cannot hide them. Repeated systematic errors remain
possible and every record still requires review.

## Private real-label benchmark

```sh
npm ci --cache /tmp/lablens-npm
npm run prepare:ocr
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- /private/tube.jpeg \
  --roi 0.36,0.38,0.09,0.112 --truth /private/tube-visible-lines.json \
  --out /private/lablens-results/tube
```

Choose the ROI for the actual image. Keep images, transcripts and outputs outside
public Git. Ground truth uses normalized source-image coordinates, for example:

```json
{
  "kind": "real-cryovial",
  "localProcessingAuthorized": true,
  "lines": [
    {
      "text": "VISIBLE TEXT ONLY",
      "box": { "x": 0.37, "y": 0.4, "w": 0.06, "h": 0.02 }
    },
    { "text": null, "box": { "x": 0.37, "y": 0.43, "w": 0.06, "h": 0.02 } }
  ]
}
```

These are schema examples, not real-label text/boxes. Dataset kind and visible
transcription are provider assertions, not facts proven by the runner. Ambiguous
lines receive detection metrics only. Compare the same authorized files and ROI
across both engines; do not pick favorable variants using test transcripts and
call that independent accuracy evidence. Hold out real samples for validation.

Reports include per-line outputs, boxes, confidence, omissions, unmatched false
positives, initialization/recognition timing and character errors. Boxes map back
from rotated crops to source coordinates before matching. Missing/failed native
Tesseract is reported as failed/unrun.

## Required release evidence: currently unmet

1. Private, authorized real curved multi-line cryovial photos and visible-only
   transcripts, with reproducible PaddleOCR versus browser Tesseract outputs.
2. Per-line evidence demonstrating improvement on failing labels, including
   omissions and background false positives.
3. A real rotating-tube video showing physical-line correspondence, uncertainty
   and sample reset without temporal fragment concatenation.
4. Physical iPhone Safari checks for initialization, inference latency, memory,
   focus, lighting, thermal behavior and camera workflow.

Cloud timings, generated fixtures and canvas videos are runtime/regression
evidence only. Keep Issue #2 open and the new engine experimental until these
gates pass.
