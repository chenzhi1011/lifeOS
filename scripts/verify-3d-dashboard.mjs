import { chromium } from "playwright";

const url = process.env.LIFE_OS_DASHBOARD_URL ?? "http://localhost:3001/dashboard?userId=demo-user";
const screenshotPaths = {
  desktop: "test-results/dashboard-3d-desktop.png",
  mobile: "test-results/dashboard-3d-mobile.png"
};

async function withStageTimeout(stageName, timeoutMs, operation) {
  console.error(`[visual:${stageName}:start]`);
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${stageName} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  try {
    const result = await Promise.race([operation(), timeout]);
    console.error(`[visual:${stageName}:end]`);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyViewport(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  try {
    await withStageTimeout(`${name}:navigation`, 30000, () =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    );
    const canvas = page.locator('canvas[data-scene-ready="true"]');
    await withStageTimeout(`${name}:scene-ready`, 20000, () =>
      Promise.all([
        canvas.waitFor({ state: "visible", timeout: 20000 }),
        page.getByRole("button", { name: /果实面板/ }).waitFor({ timeout: 20000 }),
        page
          .getByRole("status", { name: "近期生命力" })
          .waitFor({ timeout: 20000 })
      ])
    );

    const metadata = await withStageTimeout(`${name}:metadata`, 5000, async () => ({
      sceneObjects: JSON.parse(
        (await canvas.getAttribute("data-scene-objects")) ?? "{}"
      ),
      width: Number(await canvas.getAttribute("width")),
      height: Number(await canvas.getAttribute("height"))
    }));

    console.error(`[visual:${name}:screenshot:start]`);
    const screenshot = await withStageTimeout(`${name}:screenshot`, 20000, () =>
      page.screenshot({ path: screenshotPaths[name], timeout: 15000 })
    );
    console.error(`[visual:${name}:screenshot:end]`);

    const metrics = await withStageTimeout(`${name}:layout-metrics`, 5000, async () => {
      const session = await page.context().newCDPSession(page);
      try {
        return await session.send("Page.getLayoutMetrics");
      } finally {
        await session.detach();
      }
    });
    const sample = {
      hasCanvas: true,
      hasFruitButton: true,
      hasVitalitySummary: true,
      horizontalOverflow:
        metrics.contentSize.width > metrics.layoutViewport.clientWidth + 1,
      sceneObjects: metadata.sceneObjects,
      width: metadata.width,
      height: metadata.height,
      screenshotBytes: screenshot.byteLength
    };

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
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch();
try {
  const desktop = await verifyViewport(browser, { width: 1440, height: 900 }, "desktop");
  const mobile = await verifyViewport(browser, { width: 390, height: 844 }, "mobile");
  console.log(JSON.stringify({ ok: true, desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
