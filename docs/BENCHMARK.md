# OCR evidence and acceptance status

The example in chat establishes the problem: a narrow curved label with tiny
characters, multiple physical lines, and a busy background. The user clarified
that this photograph is an example of curvature, not an additional required
file delivery. We must not reconstruct it from its apparent transcription.

The inline photograph is visible to visual inspection, but its original pixels
were not exposed as a file or downloadable attachment to the execution tools.
**No OCR engine has run on that photograph. No improvement over the historical
`Kim+` result has been demonstrated.** Visual inspection suggests `Kim`, an
ambiguous middle line resembling `TM01029`, and a partial lower line. These are
observations, not engine output or verified full ground truth.

## Reproducible local benchmark

```sh
npm ci --cache /tmp/lablens-npm
npm run prepare:ocr
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- /private/path/photo.jpeg \
  --roi 0.36,0.38,0.09,0.112
```

The approximate ROI above is based on the example composition. Check the saved
variant images; use a different ROI for a different image. No photograph is
sent to a remote OCR service. Inputs and detailed results may contain sensitive
identifiers: keep them outside public Git. `reference` media, `benchmark-results`,
and runtime-generated OCR assets are ignored. An installed Playwright Chromium
can be used instead by omitting `CHROMIUM_PATH`.

The runner executes browser Tesseract.js LSTM best-int and installed native
Tesseract with its installed English model, both at PSM 11 and PSM 6, on original
and grayscale/contrast crops, at 0 and ±3 degrees. It writes actual per-line
text, confidence, crop-relative bounding boxes, and elapsed recognition time.
Original sensor/photo resolution is cropped before upscaling; scaling does not
recover lost detail. Engine initialization is not included in recognition time.
Rotation variants keep crop dimensions and can clip edges; inspect the images.
These are two runtimes in the **same engine family**, not evidence of superiority
over an independent modern engine.

Before a release, transcribe only clearly visible glyphs, mark ambiguous/hidden
positions separately, and compare each physical line, its bounding box, omissions,
extra lines, and character errors against that visible-only transcript. Do not
score guessed hidden characters as correct. High OCR confidence or repeated
agreement is not proof of accuracy. The runner deliberately does not invent a
ground-truth transcript or report an accuracy percentage without one.

## Browser engine assessment

- Tesseract.js is genuinely available in Safari JS/WASM with same-origin English
  assets and no cloud processing. It is a baseline, not a demonstrated solution
  to this photo's curvature. GPU acceleration is not assumed.
- PaddleOCR/ONNX recognition and detection are promising independent candidates.
  A production integration needs vetted weights, licensing, local model hosting,
  an actual iPhone memory/latency test, and testing on the same curved photo.
  They are not installed, evaluated, or claimed to outperform the baseline here.
- Apple Vision/VisionKit cannot be invoked directly from Safari JavaScript.
- Hosted OCR would transmit labels, potentially including patient identifiers,
  and introduce provider retention, access controls and per-request cost. It is
  not included; no upload is authorized or implemented.

## Current validation limits

Actual browser OCR has been tested on generated, flat, high-contrast three-line
text. Synthetic tests validate runtime wiring, multi-line output, confidence and
geometry extraction; they say nothing about the real photograph's accuracy.
The recorded [synthetic runtime results](synthetic-runtime.json) include all
24 outputs: browser best-int produced the exact three fixture lines in 12/12
variants; native Tesseract produced them in 8/12, misreading `5` as `9` in four
negative-rotation cases. Median recognition times were approximately 128 ms
and 152 ms respectively on this cloud CPU, excluding engine startup. These
figures must not be presented as real-label accuracy or iPhone performance.
An automated canvas video checks the continuous camera path, ROI exclusion,
fusion, confirmation and reset. It is not a real rotating-vial video.

iPhone Safari camera permissions, autofocus, low-light behavior, thermals,
processing latency and curved text remain unverified on a physical phone.
Playwright WebKit approximates browser compatibility only; it cannot certify
iOS camera behavior. No deployment or successful-release claim is made.

Use diffuse lighting, avoid specular glare, move close enough for sharp letter
strokes, and turn the vial slowly while keeping the physical lines in the ROI.
When tracking pauses, reacquire and review instead of accumulating unrelated
fragments. Release acceptance still requires measured performance on a real
curved-label image and a short rotating-tube video.
