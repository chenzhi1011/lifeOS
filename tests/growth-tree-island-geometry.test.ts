import { describe, expect, it } from "vitest";
import {
  createIslandTerrainGeometry,
  islandHeightAt,
  islandRadiusAtAngle,
  ISLAND_TERRAIN_CONFIG
} from "@/src/components/growth-tree-island-geometry";

describe("growth tree island geometry", () => {
  it("uses half of the previous island diameter", () => {
    expect(ISLAND_TERRAIN_CONFIG.baseRadius).toBe(9.5 / 2);
    expect(ISLAND_TERRAIN_CONFIG.xScale).toBe(1.25);
  });

  it("creates an irregular shoreline instead of a circle", () => {
    const radii = [0, Math.PI / 4, Math.PI / 2, Math.PI]
      .map(islandRadiusAtAngle);

    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.3);
  });

  it("keeps the interior higher than the shore with uneven same-radius terrain", () => {
    const center = islandHeightAt(0, 0);
    const shore = [0, Math.PI / 2, Math.PI, Math.PI * 1.5]
      .map((angle) => {
        const radius = islandRadiusAtAngle(angle);
        return islandHeightAt(
          Math.cos(angle) * radius * ISLAND_TERRAIN_CONFIG.xScale,
          Math.sin(angle) * radius
        );
      });
    const middle = [0, Math.PI / 2, Math.PI, Math.PI * 1.5]
      .map((angle) => {
        const radius = islandRadiusAtAngle(angle) * 0.55;
        return islandHeightAt(
          Math.cos(angle) * radius * ISLAND_TERRAIN_CONFIG.xScale,
          Math.sin(angle) * radius
        );
      });

    expect(center).toBeGreaterThan(Math.max(...shore));
    expect(Math.max(...middle) - Math.min(...middle)).toBeGreaterThan(0.05);
    expect(Math.min(...shore)).toBeGreaterThan(
      ISLAND_TERRAIN_CONFIG.maximumWaterY
    );
  });

  it("builds finite indexed terrain with normals", () => {
    const geometry = createIslandTerrainGeometry();

    expect(geometry.index).not.toBeNull();
    expect(geometry.attributes.normal).toBeDefined();
    expect(Array.from(geometry.attributes.position.array).every(Number.isFinite))
      .toBe(true);
    expect(Array.from(geometry.attributes.normal.array).every(Number.isFinite))
      .toBe(true);
    geometry.dispose();
  });
});
