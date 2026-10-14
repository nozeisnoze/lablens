# LabLens

Experimental iPhone-first, on-device continuous label scanner. Review every line;
accuracy on real curved labels is **not yet verified**. See
[OCR evidence](docs/BENCHMARK.md) and [workflow limits](docs/ARCHITECTURE.md).

```sh
cd /workspace/lablens
npm ci --cache /tmp/lablens-npm
npm run prepare:ocr
npm run dev
```

For camera access on iPhone, serve over HTTPS. Opening an insecure LAN address
does not enable Safari camera access. No App Store, Xcode, paid account or OCR
API key is required. `npm run build` produces static files in `dist` for a
same-origin HTTPS host. This task does not deploy to Vercel.

Start the rear camera, frame the label in the guide (or drag a tighter ROI), and
rotate slowly. Review uncertain characters and edit the lines, enter sample ID
and optional box/position, then press OK once. Remove that tube before presenting
the next one. Export or copy the entire session before closing the page.

```sh
npm test
# With the system browser available in this cloud environment:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- --project=chromium
# Else install Playwright browsers, then run both Chromium and phone WebKit:
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run test:browser
```

Browser downloads require `cdn.playwright.dev` and
`playwright.download.prss.microsoft.com` egress. System Chromium is sufficient
for the tested cloud workflow; WebKit and physical iPhone coverage must be
reported separately. Use the existing checkout in this isolated task; do not
create a Git worktree unless requested.
