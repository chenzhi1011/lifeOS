import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("RealisticGrowthTree renderer contract", () => {
  it("uses only the procedural wood and non-spherical activity leaf builders", () => {
    const source = readFileSync(
      path.resolve("src/components/RealisticGrowthTree.tsx"),
      "utf8"
    );

    expect(source).not.toContain("TDSLoader");
    expect(source).not.toContain("SphereGeometry");
    expect(source).not.toContain("createFallbackTree");
    expect(source).not.toContain("createTrunkVolume");
    expect(source).toContain("createWoodSegmentMesh");
    expect(source).toContain("createActivityLeafMesh");
    expect(source).toContain("<GrowthTreeDetailsPanel");
  });
});
