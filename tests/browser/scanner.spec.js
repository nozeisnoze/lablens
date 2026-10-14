import { test, expect } from "@playwright/test";
// Worker fetches must be observable; a cached model must not mask a simulated failure.
test.use({ serviceWorkers: "block" });
test("failed Paddle model loading stops camera and never silently runs Tesseract", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.cameraTracks = [];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 480);
        const stream = c.captureStream(10);
        window.cameraTracks = stream.getTracks();
        return stream;
      },
    });
  });
  const tesseractRequests = [];
  context.on("request", (r) => {
    if (
      r.url().includes("eng.traineddata") ||
      r.url().endsWith("/ocr/worker.min.js")
    )
      tesseractRequests.push(r.url());
  });
  await context.route("**/ocr/paddle/ppocr_keys_v1.txt", (route) =>
    route.fulfill({ status: 404, body: "Unavailable test model" }),
  );
  await page.goto("/?engine=paddle");
  await page.locator("#start").click();
  await expect(page.locator("#status")).toContainText(
    "Missing same-origin PaddleOCR dictionary",
    { timeout: 30000 },
  );
  expect(tesseractRequests).toEqual([]);
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await expect(page.locator("#start")).toBeEnabled();
});
test("actual independent PaddleOCR worker detects and recognizes a three-line runtime fixture", async ({
  page,
  context,
}) => {
  const external = [];
  context.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { makePaddleOCR } = await import("/src/paddle/engine.js");
    const c = document.createElement("canvas");
    c.width = 550;
    c.height = 300;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "black";
    ctx.font = "40px Arial";
    ["Kim", "AB12345", "Passage 5"].forEach((s, i) =>
      ctx.fillText(s, 35, 65 + i * 90),
    );
    const started = performance.now(),
      ocr = await makePaddleOCR(),
      loaded = performance.now();
    try {
      return { ...(await ocr.recognize(c)), initializeMs: loaded - started };
    } finally {
      await ocr.terminate();
    }
  });
  console.log(
    "Independent PaddleOCR synthetic runtime output:",
    JSON.stringify(result),
  );
  expect(result.lines.map((l) => l.text)).toEqual([
    "Kim",
    "AB12345",
    "Passage 5",
  ]);
  expect(
    result.lines.every(
      (l) => l.box.w > 0 && l.box.h > 0 && l.characters.length,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});
test("canceling a pending camera permission cannot leave camera tracks active", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.cameraTracks = [];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = 720;
        const stream = canvas.captureStream(10);
        window.cameraTracks = stream.getTracks();
        return stream;
      },
    });
  });
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#stop").click();
  await expect
    .poll(() => page.evaluate(() => window.cameraTracks.length))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      window.cameraTracks.every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await expect(page.locator("#start")).toBeEnabled();
});
for (const engine of ["tesseract", "paddle"])
  test(`continuous camera ${engine} path crops background, captures multiple lines, confirms once and stops tracks`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 720;
      const ctx = c.getContext("2d");
      function paint() {
        ctx.fillStyle = "#777";
        ctx.fillRect(0, 0, 960, 720);
        ctx.fillStyle = "#fff";
        ctx.fillRect(340, 200, 250, 300);
        ctx.fillStyle = "#000";
        ctx.font = "28px Arial";
        ctx.fillText("Background text", 20, 100);
        ["Kim", "AB12345", "Passage 5"].forEach((s, i) =>
          ctx.fillText(s, 360, 270 + i * 80),
        );
      }
      paint();
      setInterval(paint, 100);
      window.cameraTracks = [];
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const stream = c.captureStream(10);
          window.cameraTracks = stream.getTracks();
          return stream;
        },
      });
    });
    await page.goto(`/?engine=${engine}`);
    await page.locator("#start").click();
    await expect(page.locator("#lines")).toHaveValue(
      "Kim\nAB12345\nPassage 5",
      {
        timeout: 30000,
      },
    );
    await expect(page.locator("#evidence")).not.toContainText("Background");
    await expect(page.locator("#evidence")).toContainText("3 observations", {
      timeout: 30000,
    });
    await page.locator("#sampleId").fill("AB12345");
    await page.locator("#confirm").click();
    await expect(page.locator("#count")).toHaveText("1");
    await expect(page.locator("#lines")).toHaveValue("");
    await page.waitForTimeout(1500);
    await expect(page.locator("#lines")).toHaveValue("");
    await expect(page.locator("#count")).toHaveText("1");
    await page.locator("#stop").click();
    await expect(page.locator("#status")).toContainText("Camera stopped");
    expect(
      await page.evaluate(() =>
        window.cameraTracks.every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
  });
test("editable review, one confirmation, duplicate prompts, safe CSV and sample reset", async ({
  page,
  context,
}) => {
  await page.goto("/");
  // Exercise the actual public UI; mocked OCR input is explicitly not a photo accuracy test.
  await page.locator("#lines").fill("Kim\nTM01029\npartial line");
  await page.locator("#sampleId").fill("TM01029");
  await page.locator("#box").fill("A");
  await page.locator("#position").fill("1");
  await page.locator("#confirm").click();
  await expect(page.locator("#count")).toHaveText("1");
  await expect(page.locator("#lines")).toHaveValue("");
  await expect(page.locator("#sampleId")).toHaveValue("");
  await expect(page.locator("#position")).toHaveValue("");
  await expect(page.locator("#confirm")).toBeDisabled();
  await page.locator("#lines").fill("Kim\nTM01029");
  await page.locator("#sampleId").fill("TM01029");
  await page.locator("#box").fill("A");
  await page.locator("#position").fill("1");
  await page.locator("#confirm").click();
  await expect(page.locator("#duplicate")).toBeVisible();
  await expect(page.locator("#count")).toHaveText("1");
  await page.locator("#duplicate").click();
  await expect(page.locator("#count")).toHaveText("2");
  await page.locator("#lines").fill('=CMD()\n"quoted", line');
  await page.locator("#sampleId").fill("+ALIAS");
  await page.locator("#confirm").click();
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"\'+ALIAS"');
  expect(csv).toContain('"\'=CMD()"');
  expect(csv).toContain('""quoted""');
  expect(csv).toContain("Review required");
  await expect(page.locator("#records tr")).toHaveCount(3);
});
test("fusion can reject out-of-label input in the browser runtime", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { Fusion } = await import("/src/fusion.js");
    const f = new Fusion();
    for (let i = 0; i < 4; i++)
      f.ingest(
        [
          {
            text: "Kim",
            confidence: 95,
            box: { x: 0.2, y: 0.2, w: 0.4, h: 0.1 },
          },
          {
            text: "Background",
            confidence: 99,
            box: { x: 1.2, y: 0.2, w: 0.4, h: 0.1 },
          },
        ],
        { time: i * 900 },
      );
    return f.results();
  });
  expect(result).toHaveLength(1);
  expect(result[0].text).toBe("Kim");
  expect(result[0].uncertain).toBe(false);
});
test("actual same-origin WASM OCR reads a synthetic three-line crop without network uploads", async ({
  page,
  context,
}) => {
  const external = [];
  context.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { makeOCR } = await import("/src/ocr.js");
    const c = document.createElement("canvas");
    c.width = 550;
    c.height = 300;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 550, 300);
    ctx.fillStyle = "#000";
    ctx.font = "40px Arial";
    ["Kim", "AB12345", "Passage 5"].forEach((s, i) =>
      ctx.fillText(s, 35, 65 + i * 90),
    );
    const ocr = await makeOCR();
    try {
      return await ocr.recognize(c);
    } finally {
      await ocr.terminate();
    }
  });
  expect(result.lines.map((l) => l.text)).toEqual([
    "Kim",
    "AB12345",
    "Passage 5",
  ]);
  expect(
    result.lines.every((l) => l.confidence > 60 && l.box.w > 0 && l.box.h > 0),
  ).toBe(true);
  expect(external).toEqual([]);
});
