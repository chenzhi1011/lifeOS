import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildCanopyStructure,
  createDecorativeCanopy,
  createDecorativeCanopyTwigs,
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
  it("organizes every decorative leaf on a deterministic fine twig", () => {
    const lifeArea = branch("life_area", "health");
    const recipe = {
      seed: 1,
      trunk: { height: 3, radius: 0.3, sections: 8 },
      lifeAreas: [],
      longGoals: [],
      shortGoals: [],
      canopy: { retention: 0.7, vitality: 0.6, youngLeafRatio: 0.4 }
    };
    const structure = buildCanopyStructure([lifeArea], recipe);
    const twigById = new Map(structure.twigs.map((twig) => [twig.id, twig]));

    expect(structure).toEqual(buildCanopyStructure([lifeArea], recipe));
    expect(structure.twigs.length).toBeGreaterThan(0);
    expect(structure.leaves.length).toBeGreaterThan(structure.twigs.length);
    expect(structure.twigs.length).toBeGreaterThanOrEqual(6);
    expect(structure.leaves.length).toBeGreaterThanOrEqual(
      structure.twigs.length * 4
    );
    expect(structure.leaves.every((leaf) => twigById.has(leaf.twigId))).toBe(true);
    expect(structure.leaves.every((leaf) => leaf.scale <= 0.72)).toBe(true);
    const pairedNodes = new Map<string, typeof structure.leaves>();
    for (const leaf of structure.leaves.filter((item) => item.side !== 0)) {
      pairedNodes.set(leaf.nodeId, [
        ...(pairedNodes.get(leaf.nodeId) ?? []),
        leaf
      ]);
    }
    expect([...pairedNodes.values()].every((pair) => pair.length === 2)).toBe(true);
    expect(
      [...pairedNodes.values()].every((pair) => {
        const left = pair.find((leaf) => leaf.side === -1)!;
        const right = pair.find((leaf) => leaf.side === 1)!;
        const leftOffset = new THREE.Vector3(
          left.anchor.x - left.attachment.x,
          left.anchor.y - left.attachment.y,
          left.anchor.z - left.attachment.z
        );
        const rightOffset = new THREE.Vector3(
          right.anchor.x - right.attachment.x,
          right.anchor.y - right.attachment.y,
          right.anchor.z - right.attachment.z
        );
        return (
          leftOffset.length() > 0.03 &&
          rightOffset.length() > 0.03 &&
          leftOffset.dot(rightOffset) < 0
        );
      })
    ).toBe(true);
    expect(structure.leaves.every((leaf) => leaf.direction.y <= 0.02)).toBe(true);
    expect(structure.leaves.every((leaf) => leaf.side !== 0)).toBe(true);
    expect(
      structure.leaves.every((leaf) =>
        Math.hypot(
          leaf.anchor.x - leaf.attachment.x,
          leaf.anchor.y - leaf.attachment.y,
          leaf.anchor.z - leaf.attachment.z
        ) <= 0.05
      )
    ).toBe(true);
    expect(new Set(structure.leaves.map((leaf) =>
      `${leaf.anchor.x}:${leaf.anchor.y}:${leaf.anchor.z}:${leaf.direction.x}:${leaf.direction.y}:${leaf.direction.z}`
    )).size).toBe(structure.leaves.length);
    expect(structure.petioles).toHaveLength(structure.leaves.length);
    expect(new Set(structure.twigs.map((twig) => twig.baseRadius)).size).toBe(1);
    expect(structure.twigs.every((twig) => twig.baseRadius === twig.tipRadius)).toBe(true);
    expect(new Set(structure.petioles.map((petiole) => petiole.baseRadius)).size).toBe(1);
    expect(structure.petioles.every((petiole) => petiole.baseRadius === petiole.tipRadius)).toBe(true);
    expect(
      structure.leaves.every((leaf) => {
        const twig = twigById.get(leaf.twigId)!;
        return twig.controlPoints.some((point) =>
          Math.hypot(
            point.x - leaf.attachment.x,
            point.y - leaf.attachment.y,
            point.z - leaf.attachment.z
          ) < 0.0001
        );
      })
    ).toBe(true);

    const twigMesh = createDecorativeCanopyTwigs([
      ...structure.twigs,
      ...structure.petioles
    ]);
    expect(twigMesh.name).toBe("decorative-canopy-twigs");
    expect(twigMesh.geometry.attributes.position.count).toBeGreaterThan(0);
    twigMesh.geometry.dispose();
    twigMesh.material.dispose();
  });

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
