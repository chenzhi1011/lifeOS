import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createDecorativeCanopy,
  createSemanticBranchMesh
} from "@/src/components/growth-tree-semantic-geometry";
import type { SemanticBranch } from "@/src/domain/semantic-tree-skeleton";

const controlPoints = [
  { x: 0, y: 1, z: 0 },
  { x: 0.2, y: 1.4, z: 0 },
  { x: 0.5, y: 1.8, z: 0.2 },
  { x: 1, y: 2, z: 0.3 }
] as const;

function branch(
  entityType: SemanticBranch["entityType"],
  entityId: string
): SemanticBranch {
  return {
    entityType,
    entityId,
    parentEntityId: entityType === "root" ? null : "root",
    controlPoints,
    baseRadius: entityType === "root" ? 0.4 : 0.2,
    tipRadius: entityType === "root" ? 0.15 : 0.07,
    radialSegments: 8
  };
}

describe("semantic geometry", () => {
  it("creates tapered identity-bearing geometry for every wood level", () => {
    const root = createSemanticBranchMesh(branch("root", "root"));
    const lifeArea = createSemanticBranchMesh(branch("life_area", "health"));
    const goal = createSemanticBranchMesh(branch("long_goal", "fitness"));

    expect(lifeArea.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(lifeArea.geometry).not.toBeInstanceOf(THREE.TubeGeometry);
    expect(lifeArea.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(lifeArea.userData).toMatchObject({
      entityType: "life_area",
      entityId: "health",
      goalId: null,
      leafId: null
    });
    expect(goal.userData.goalId).toBe("fitness");
    expect(root.geometry.attributes.position.count)
      .toBeGreaterThan(lifeArea.geometry.attributes.position.count);
    expect(lifeArea.geometry.attributes.position.count)
      .toBeGreaterThan(goal.geometry.attributes.position.count);
  });

  it("bounds decorative canopy and increases it with vitality", () => {
    const lifeArea = branch("life_area", "health");
    const base = {
      seed: 1,
      trunk: { height: 3, radius: 0.3, sections: 8 },
      lifeAreas: [],
      longGoals: [],
      shortGoals: [],
      canopy: { retention: 0.45, vitality: 0, youngLeafRatio: 0.2 }
    };
    const low = createDecorativeCanopy([lifeArea], base);
    const high = createDecorativeCanopy([lifeArea], {
      ...base,
      canopy: { retention: 1, vitality: 1, youngLeafRatio: 0.6 }
    });

    expect(high.count).toBeGreaterThan(low.count);
    expect(high.count).toBeLessThanOrEqual(1500);
  });
});
