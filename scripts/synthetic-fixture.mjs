// Runtime smoke fixture only. This is never a substitute for a curved-vial photo.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
try {
  const page = await browser.newPage();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 550;
    c.height = 300;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 550, 300);
    x.fillStyle = "black";
    x.font = "40px Arial";
    ["Kim", "AB12345", "Passage 5"].forEach((s, i) =>
      x.fillText(s, 35, 65 + i * 90),
    );
    return c.toDataURL("image/png").split(",")[1];
  });
  await writeFile(
    process.argv[2] || "/tmp/lablens-synthetic.png",
    Buffer.from(png, "base64"),
  );
} finally {
  await browser.close();
}
