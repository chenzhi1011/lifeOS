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
    expect(treeSource).toContain("createRealisticGrowthTreeLayer");
    expect(treeSource).toContain("createWoodSegmentMesh");
    expect(treeSource).toContain("createActivityLeafMesh");
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
