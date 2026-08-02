import { chromium } from "playwright";

const url = process.env.LIFE_OS_DASHBOARD_URL ?? "http://localhost:3001/dashboard?userId=demo-user";
const screenshotPaths = {
  desktop: "test-results/dashboard-3d-desktop.png",
  mobile: "test-results/dashboard-3d-mobile.png"
};

async function verifyViewport(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const canvas = page.locator('canvas[data-scene-ready="true"]');
  await canvas.waitFor({ state: "visible", timeout: 20000 });
  await page.getByRole("button", { name: /果实面板/ }).waitFor();
  await page.getByRole("status", { name: "近期生命力" }).waitFor();

  const sceneObjects = JSON.parse(
    (await canvas.getAttribute("data-scene-objects")) ?? "{}"
  );
  const sample = await page.evaluate((objects) => {
    const source = document.querySelector("canvas");
    if (!(source instanceof HTMLCanvasElement)) {
      return {
        hasCanvas: false,
        hasFruitButton: false,
        hasVitalitySummary: false,
        horizontalOverflow: false,
        sceneObjects: objects,
        width: 0,
        height: 0
      };
    }

    return {
      hasCanvas: true,
      hasFruitButton: document.body.textContent?.includes("果实面板") ?? false,
      hasVitalitySummary:
        document.querySelector('[aria-label="近期生命力"]') !== null,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      sceneObjects: objects,
      width: source.width,
      height: source.height
    };
  }, sceneObjects);

  const screenshot = await page.screenshot({
    path: screenshotPaths[name],
    fullPage: true
  });
  sample.screenshotBytes = screenshot.byteLength;
  await page.close();

  if (
    !sample.hasCanvas ||
    !sample.hasFruitButton ||
    !sample.hasVitalitySummary ||
    sample.width <= 0 ||
    sample.height <= 0 ||
    sample.screenshotBytes < 12000 ||
    sample.sceneObjects.lake < 1 ||
    sample.sceneObjects.mountains < 1 ||
    sample.sceneObjects.tree < 1 ||
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
