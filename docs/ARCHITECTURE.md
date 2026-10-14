# Scanner workflow

`tracker.js` locks a grayscale template inside the selected sensor-space ROI and
searches nearby translations and scales. It is a lightweight conservative
tracker, not cylinder reconstruction, optical-flow line tracking or a trained
label detector. The user initially places the label inside the guide or adjusts
the rectangle once. A confidence drop pauses OCR; reacquiring clears evidence.
Background pixels outside the ROI cannot enter the OCR crop. Background inside
a poorly selected ROI can still be recognized: ROI selection matters.

`ocr.js` crops `videoWidth × videoHeight` frames before scaling. A same-origin
Tesseract worker returns multiple lines and their geometry. At most one OCR
request runs at once, separated by at least 900 ms. Slow devices naturally run
less often. Original/contrast crops alternate. Workers and camera tracks stop
when the camera is stopped or the page is hidden. No backend or image upload
exists. In-memory session records are lost if the page is closed.

`fusion.js` matches lines by normalized vertical geometry inside the tracked ROI,
then aligns characters with insertion/deletion-aware edit distance. Each aligned
position accumulates weighted character votes. Disagreement, low support,
crop-edge text and missing characters remain uncertain. There is no sample-ID
dictionary and no forced completion of `TM01029` or any other expected string.
Weighted agreement is explicitly shown as agreement, not calibrated confidence.
Three observations and weighted support are required before any character is
shown without uncertainty. Closely spaced frames, low contrast and lost tracking
do not add evidence.

This correspondence model handles small pose changes; large rotations or
vertical shifts can break it and must trigger reacquisition. Repeated systematic
OCR errors can still win consensus. A curved-label detector, stronger independent
recognizer, and real-video evaluation are still needed before calling it an
accurate scanner. User edits never get overwritten by subsequent OCR.

Confirmation appends exactly one record to `session.js`. All line evidence,
pending OCR generations, sample ID and location fields reset. The old target
must leave before automatic acquisition resumes. Visually similar labels may
not be reliably distinguished by the template; use Reset label tracking when
needed. Low-confidence records can be confirmed after checking; their exported
OCR-uncertainty marker is retained.

Deduplication prompts only on an exact nonempty sample ID + box + position match;
it never silently drops unspecified locations or distinct aliquots. Users can
explicitly keep a duplicate. CSV preserves multiline values and quotes, uses a
single session-wide schema, and neutralizes spreadsheet formula prefixes in
every field. Download and copy share the same CSV serializer. A clipboard
failure exposes text for manual copying.

The service worker caches only same-origin static app/engine assets, never
recognized records or camera frames. Model files are downloaded once to the
browser over HTTPS from the same application. No cloud OCR keys are needed.
