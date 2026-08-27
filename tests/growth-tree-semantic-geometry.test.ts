import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createActivityLeafGeometry,
  createActivityLeafTwigBatch,
  createSemanticBranchMesh
} from "@/src/components/growth-tree-semantic-geometry";
import type { LeafTwig, SemanticBranch, SemanticLeaf } from "@/src/domain/semantic-tree-skeleton";

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
  it("builds an upward-facing leaf from its root with a drooping tip", () => {
    const geometry = createActivityLeafGeometry();
    const position = geometry.getAttribute("position");
    const vertices = Array.from({ length: position.count }, (_, index) => ({
      x: position.getX(index),
      y: position.getY(index),
      z: position.getZ(index)
    }));
    const rootVertices = vertices.filter((vertex) => Math.abs(vertex.y) < .0001);
    const middleHeight = Math.max(
      ...vertices.filter((vertex) => vertex.y > .15 && vertex.y < .25)
        .map((vertex) => vertex.z)
    );
    const tipHeight = Math.min(
      ...vertices.filter((vertex) => vertex.y > .34).map((vertex) => vertex.z)
    );

    expect(rootVertices.length).toBeGreaterThan(0);
    expect(vertices.every((vertex) => vertex.y >= 0)).toBe(true);
    expect(tipHeight).toBeLessThan(middleHeight);
    expect(geometry.getAttribute("normal")).toBeDefined();
    const normal = geometry.getAttribute("normal");
    const averageNormalZ = Array.from(
      { length: normal.count },
      (_, index) => normal.getZ(index)
    ).reduce((sum, value) => sum + value, 0) / normal.count;
    expect(averageNormalZ).toBeGreaterThan(.5);
  });

  it("merges a shared activity twig once and each leaf petiole once", () => {
    const sharedTwig: LeafTwig = {
      id: "goal-leaf-twig-goal-0",
      parentEntityId: "goal",
      controlPoints,
      baseRadius: .014,
      tipRadius: .014,
      attachmentProgress: .4,
      directionSector: 0
    };
    const leaf = (id: string, side: -1 | 1): SemanticLeaf => ({
      activityId: id,
      goalId: "goal",
      twigId: sharedTwig.id,
      side,
      terminal: false,
      twigProgress: .4,
      petiole: {
        id: `${id}-petiole`,
        parentEntityId: sharedTwig.id,
        controlPoints: [
          controlPoints[1],
          { x: .21, y: 1.41, z: 0 },
          { x: .22, y: 1.42, z: 0 },
          { x: .23, y: 1.43, z: 0 }
        ],
        baseRadius: .004,
        tipRadius: .004
      },
      midrib: {
        id: `${id}-midrib`,
        parentEntityId: `${id}-petiole`,
        controlPoints: [
          { x: .23, y: 1.43, z: 0 },
          { x: .27, y: 1.438, z: 0 },
          { x: .31, y: 1.435, z: 0 },
          { x: .35, y: 1.41, z: 0 }
        ],
        baseRadius: .003,
        tipRadius: .002
      },
      anchor: { x: .23, y: 1.43, z: 0 },
      direction: { x: side, y: -.2, z: 0 },
      twigTangent: { x: 1, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      roll: side * .1,
      rotation: { x: 0, y: 0, z: 0 },
      scale: .6,
      visible: true
    });

    const mesh = createActivityLeafTwigBatch(
      [sharedTwig],
      [leaf("left", -1), leaf("right", 1)]
    );

    expect(mesh.userData.sharedTwigCount).toBe(1);
    expect(mesh.userData.petioleCount).toBe(2);
    expect(mesh.userData.midribCount).toBe(2);
  });

  it("renders a fine twig with a visibly narrower final ring", () => {
    const twig: LeafTwig = {
      id: "tapered-twig",
      parentEntityId: "goal",
      controlPoints,
      baseRadius: .02,
      tipRadius: .008,
      attachmentProgress: .4,
      directionSector: 0
    };
    const mesh = createActivityLeafTwigBatch([twig], []);
    const position = mesh.geometry.getAttribute("position");
    const distanceFrom = (index: number, center: typeof controlPoints[number]) =>
      Math.hypot(
        position.getX(index) - center.x,
        position.getY(index) - center.y,
        position.getZ(index) - center.z
      );
    const baseRadius = distanceFrom(0, controlPoints[0]);
    const finalRingRadius = distanceFrom(100, controlPoints[3]);

    expect(finalRingRadius).toBeLessThan(baseRadius * .6);
  });

  it("uses the same uniform wood color on trunks and fine twigs", () => {
    const trunk = createSemanticBranchMesh(branch("root", "root"));
    const twig = createActivityLeafTwigBatch([], []);
    expect(trunk.geometry.getAttribute("color")).toBeUndefined();
    expect((trunk.material as THREE.MeshLambertMaterial).vertexColors).toBe(false);
    expect((twig.material as THREE.MeshLambertMaterial).color.getHex())
      .toBe((trunk.material as THREE.MeshLambertMaterial).color.getHex());
    expect(trunk.material.userData.selectedColor)
      .toBe(new THREE.Color("#A98276").getHex());
    expect(trunk.material.userData.hoverColor)
      .toBe(new THREE.Color("#916F65").getHex());
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

});
