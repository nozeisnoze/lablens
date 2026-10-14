# LabLens — Codex engineering handoff

## Mission
Build an accurate phone-first lab-label scanning web application (PWA) for cell cryovials and FFPE blocks. Existing Tesseract-based versions fail badly on the provided real photo (previously recognized only `Kim+`). Accuracy has priority over UI or monetization. DO NOT merely tweak Tesseract thresholds and claim improvement. The image in `reference/tube_example.jpeg` is the mandatory initial benchmark. It depicts a narrow cylindrical cryovial with multiple lines of printed label text; some characters are obscured by curvature. Never infer occluded characters as certain.

## User workflow (non-negotiable)
- iPhone Safari website/PWA as primary product; no App Store or Mac/Xcode requirement for end users.
- Continuous LIVE rear camera, no shutter, no per-frame button, minimal operations.
- Target only the vial/block label and exclude background text using a tracked region of interest, not just entire image OCR.
- Combine evidence from several video frames/angles by tracking corresponding physical text lines and character positions: consensus/temporal fusion, NOT concatenating every uncertain OCR fragment or treating distinct angles as separate tubes.
- Recognize *multiple lines* (sample ID, passage, date, notes, block number etc.).
- Flag uncertainty; show a compact editable review with lines/fields. User confirms once with OK, then record is appended to one session-wide table. Next sample starts cleanly.
- Export combined CSV and copy CSV text; protect against formula injection. Deduplicate using sample ID plus explicit box/position, but don't silently discard different aliquots.
- Prefer on-device processing for privacy/cost. If proposing hosted OCR, explain privacy, consent, security, cost, and tradeoffs. Do not upload clinical/patient identifiers without authorization.

## Engineering expectations
1. First implement a reproducible OCR benchmark against the provided image. Capture per-line recognized text, bounding boxes, confidence, and compare candidate engines. Use actual runtimes and test outputs; do not claim unrun benchmarks. Frame geometry should preserve the tiny printed letters (native sensor resolution, crop then scale). Include photo preprocessing candidates, focus/lighting guidance, orientation and contrast variants.
2. Assess capable browser OCR options realistically; iOS Apple VisionKit is native-only and cannot be directly called from Safari JS. It is acceptable to recommend a native app only after demonstrating web path constraints and obtaining user approval.
3. Architect testable ROI selection/tracking, text-line detection, temporal alignment, confidence accumulation, and UI confirmations separately. Avoid hallucinating hidden characters; report confidence and defer to human corrections.
4. Use integration tests for CSV correctness, deduplication, reset between samples, low-confidence handling, multi-line capture, and ignoring background. Prefer Playwright/browser testing including iOS Safari constraints where possible.
5. Deploy to the user's existing Vercel project *only when authorized and connected*. Provide real deployment URL and clear list of verified vs unverified behavior.
6. Treat legacy code as background reference, not a stable baseline. The existing v0.2 website and iOS prototype are in `legacy/`. There were later inline deployed iterations v0.3–0.5 that still failed real scanning; do not assume those versions solved OCR.

## Success criterion / initial acceptance test
On the supplied tube_example.jpeg, recognize clearly visible first line `Kim`, a middle line resembling `TM01029` (verify exact glyphs; don't force an expected string), and partial third line, with distinct bounding boxes. The prior OCR only recognized `Kim+`. A successful release must demonstrate measured improvement on this same image and on at least a short rotating-tube video. Ask the user for a rotating video only if necessary after the still-image benchmark.

## Product constraints
No dedicated hardware/RFID or mandatory barcodes. User is non-programmer, wants a simple shareable link on iPhone, low operating cost, minimal manual actions. Free test stage; billing is out of scope.
