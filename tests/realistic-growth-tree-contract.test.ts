import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("RealisticGrowthTree renderer contract", () => {
  it("keeps the scene runtime out of the pure tree layer", () => {
    const treeSource = readFileSync(
      path.resolve("src/components/RealisticGrowthTree.tsx"),
      "utf8"
    );
    const scenePath = path.resolve("src/components/GrowthTreeScene.tsx");
    const sceneSource = existsSync(scenePath)
      ? readFileSync(scenePath, "utf8")
      : "";

    expect(sceneSource).toContain("OrbitControls");
    expect(sceneSource).toContain("createRealisticGrowthTreeLayer");
    expect(sceneSource).toContain("WebGLRenderer");
    expect(sceneSource).toContain("Raycaster");
    expect(sceneSource).toContain("beginPointerGesture");
    expect(sceneSource).toContain("movePointerGesture");
    expect(sceneSource).toContain("endPointerGesture");
    expect(sceneSource).toContain("cancelPointerGesture");
    expect(sceneSource).toContain("resolveTreeMaterialColor");
    expect(sceneSource).toContain("targetForIntersection");
    expect(sceneSource).toContain("activityLeafInstances.setColorAt");
    expect(sceneSource).toContain("instanceColor.needsUpdate");
    expect(sceneSource).toContain("controls.enablePan = false");
    expect(sceneSource).toContain("GROWTH_TREE_CAMERA_LIMITS.minimumPolarAngle");
    expect(sceneSource).toContain("resolveMaximumPolarAngle");
    expect(sceneSource).toContain("GROWTH_SCENE_CONFIG.treeOrbitTarget");
    expect(sceneSource).not.toContain("controls.target.set(-0.45, 2.45, -0.8)");
    expect(sceneSource).toContain("forceContextLoss");
    expect(sceneSource).toContain("role=\"switch\"");
    expect(sceneSource).toContain("aria-checked={rainEnabled}");
    expect(sceneSource).toContain("TODO：未来根据天气、用户状态或 Life OS 业务条件");
    expect(sceneSource).toContain("setRainEnabled(rainEnabled)");
    expect(sceneSource).toContain("renderer.domElement.style.filter");
    expect(sceneSource).toContain("RAINY_SCENE_FILTER");
    expect(sceneSource).toContain("renderer.domElement.style.transition");
    expect(sceneSource).not.toContain("preserveDrawingBuffer");
    expect(treeSource).toContain("createRealisticGrowthTreeLayer");
    expect(treeSource).toContain("createSemanticBranchMesh");
    expect(treeSource).toContain("createActivityLeafInstances");
    expect(treeSource).toContain("createActivityLeafTwigBatch");
    expect(treeSource).not.toContain("createDecorativeCanopy(");
    expect(treeSource).not.toContain("createDecorativeCanopyTwigs(");
    expect(treeSource).not.toContain("buildCanopyStructure(");
    expect(treeSource).not.toContain("WebGLRenderer");
    expect(treeSource).not.toContain("THREE.Scene");
    expect(treeSource).not.toContain("PerspectiveCamera");
    expect(treeSource).not.toContain("OrbitControls");
    expect(treeSource).not.toContain("Raycaster");
    expect(treeSource).not.toContain("addEventListener");
    expect(treeSource).not.toContain("GrowthTreeDetailsPanel");
    expect(treeSource).not.toContain("buildGrowthTreeViewModel");
  });

  it("makes the dashboard render the scene boundary", () => {
    const dashboardSource = readFileSync(
      path.resolve("src/components/GrowthTreeDashboard.tsx"),
      "utf8"
    );

    expect(dashboardSource).toContain("GrowthTreeScene");
    expect(dashboardSource).not.toContain(
      'import { RealisticGrowthTree } from "./RealisticGrowthTree"'
    );
  });
});
