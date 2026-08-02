import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  const absolutePath = path.resolve(relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

describe("growth tree environment contract", () => {
  const environment = source(
    "src/components/growth-tree/GrowthEnvironment.ts"
  );
  const vitality = source(
    "src/components/growth-tree/VitalityElements.ts"
  );
  const config = source("src/components/growth-tree/scene-config.ts");
  const scene = source("src/components/GrowthTreeScene.tsx");
  const visualVerification = source("scripts/verify-3d-dashboard.mjs");

  it("provides layered procedural environment factories", () => {
    expect(environment).toContain("createLake");
    expect(environment).toContain("createMountainLayers");
    expect(environment).toContain("flatShading: true");
    expect(environment).toContain("GLTFLoader");
    expect(environment).toContain("asset_load_failed");
    expect(environment).not.toContain("background-image");
  });

  it("centralizes approved composition, palette, assets, and performance", () => {
    expect(config).toContain("treeOffsetX: -1.2");
    expect(config).toContain("backgroundSaturation: 0.8");
    expect(config).toContain("leaf:");
    expect(config).toContain("leafHighlight:");
    expect(config).toContain("lake:");
    expect(config).toContain("mountainNear:");
    expect(config).toContain("mountainFar:");
    expect(config).toContain("rock:");
    expect(config).toContain("tree: null");
    expect(config).toContain("mountains: null");
    expect(config).toContain("rocks: null");
    expect(config).toContain("maxPixelRatio: 1.75");
    expect(config).toContain("shadows: true");
    expect(config).toContain('lakeReflection: "simple"');
  });

  it("uses deterministic instancing and updates vitality from the scene RAF", () => {
    expect(vitality).toContain("InstancedMesh");
    expect(vitality).toContain("updateVitalityElements");
    expect(vitality).not.toContain("Math.random");
    expect(scene).toContain("updateVitalityElements(elapsedSeconds)");
    expect(scene).toContain("GROWTH_SCENE_CONFIG.performance.maxPixelRatio");
    expect(scene).toContain("GROWTH_SCENE_CONFIG.treeOffsetX");
    expect(scene).not.toContain("bg-[radial-gradient");
  });

  it("keeps desktop controls and mobile overflow checks in visual verification", () => {
    expect(visualVerification).toContain("果实面板");
    expect(visualVerification).toContain("近期生命力");
    expect(visualVerification).toContain("scrollWidth");
    expect(visualVerification).toContain("dashboard-3d-desktop.png");
    expect(visualVerification).toContain("dashboard-3d-mobile.png");
  });
});
