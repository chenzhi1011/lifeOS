import { chromium } from "playwright";

const url = process.env.LIFE_OS_DASHBOARD_URL ?? "http://localhost:3001/dashboard?userId=demo-user";
const screenshotPaths = {
  desktop: "test-results/dashboard-3d-desktop.png",
  mobile: "test-results/dashboard-3d-mobile.png"
};

async function verifyViewport(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 10000 });
  await page.getByRole("button", { name: /果实面板/ }).waitFor();
  await page.getByRole("status", { name: "近期生命力" }).waitFor();
  await page.waitForTimeout(800);

  const sample = await page.evaluate(() => {
    const source = document.querySelector("canvas");
    if (!(source instanceof HTMLCanvasElement)) {
      return {
        hasCanvas: false,
        hasFruitButton: false,
        hasVitalitySummary: false,
        horizontalOverflow: false,
        nonBlank: 0,
        width: 0,
        height: 0
      };
    }

    const width = Math.min(96, source.width);
    const height = Math.min(96, source.height);
    const probe = document.createElement("canvas");
    probe.width = width;
    probe.height = height;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        hasCanvas: true,
        hasFruitButton: document.body.textContent?.includes("果实面板") ?? false,
        hasVitalitySummary:
          document.querySelector('[aria-label="近期生命力"]') !== null,
        horizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth + 1,
        nonBlank: 0,
        width: source.width,
        height: source.height
      };
    }

    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let nonBlank = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      if (r + g + b > 24) {
        nonBlank += 1;
      }
    }

    return {
      hasCanvas: true,
      hasFruitButton: document.body.textContent?.includes("果实面板") ?? false,
      hasVitalitySummary:
        document.querySelector('[aria-label="近期生命力"]') !== null,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      nonBlank,
      width: source.width,
      height: source.height
    };
  });

  await page.screenshot({ path: screenshotPaths[name], fullPage: true });
  await page.close();

  if (
    !sample.hasCanvas ||
    !sample.hasFruitButton ||
    !sample.hasVitalitySummary ||
    sample.width <= 0 ||
    sample.height <= 0 ||
    sample.nonBlank < 80 ||
    (name === "mobile" && sample.horizontalOverflow)
  ) {
    throw new Error(`${name} canvas check failed: ${JSON.stringify(sample)}`);
  }

  return sample;
}

const browser = await chromium.launch();
try {
  const desktop = await verifyViewport(browser, { width: 1440, height: 900 }, "desktop");
  const mobile = await verifyViewport(browser, { width: 390, height: 844 }, "mobile");
  console.log(JSON.stringify({ ok: true, desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
