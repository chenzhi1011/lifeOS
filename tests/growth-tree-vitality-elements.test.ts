import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createVitalityElements } from "@/src/components/growth-tree/VitalityElements";
import { activityLeafSurfaceFrame } from "@/src/components/growth-tree/activity-leaf-transform";
import type { SemanticLeaf } from "@/src/domain/semantic-tree-skeleton";
import type { VitalityElement } from "@/src/domain/vitality";

const water: VitalityElement = {
  id: "vitality-water-test",
  taskId: "task-water-test",
  type: "water",
  source: "one_off_completion",
  position: { x: 4, y: 3, z: 2 }
};

const leaf: SemanticLeaf = {
  activityId: "activity-leaf-test",
  goalId: "goal-test",
  twigId: "twig-test",
  side: -1,
  terminal: false,
  twigProgress: .5,
  petiole: {
    id: "petiole-test",
    parentEntityId: "twig-test",
    controlPoints: [
      { x: 1, y: 2, z: 3 },
      { x: 1.01, y: 2, z: 3 },
      { x: 1.02, y: 2, z: 3 },
      { x: 1.03, y: 2, z: 3 }
    ],
    baseRadius: .004,
    tipRadius: .004
  },
  midrib: {
    id: "midrib-test",
    parentEntityId: "petiole-test",
    controlPoints: [
      { x: 1.03, y: 2, z: 3 },
      { x: 1.08, y: 2, z: 3 },
      { x: 1.13, y: 2, z: 3 },
      { x: 1.18, y: 1.98, z: 3 }
    ],
    baseRadius: .003,
    tipRadius: .002
  },
  anchor: { x: 1.03, y: 2, z: 3 },
  direction: { x: 1, y: 0, z: 0 },
  twigTangent: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  roll: .35,
  rotation: { x: 0, y: 0, z: 0 },
  scale: .6,
  visible: true,
  recent: true
};

function leafAt(activityId: string, x: number): SemanticLeaf {
  return {
    ...leaf,
    activityId,
    anchor: { ...leaf.anchor, x },
    petiole: { ...leaf.petiole, id: `petiole-${activityId}` },
    midrib: { ...leaf.midrib, id: `midrib-${activityId}` }
  };
}

describe("growth tree vitality elements", () => {
  it("does not float water beside the tree when there are no visible leaves", () => {
    const layer = createVitalityElements([water], []);
    expect(layer.group.getObjectByName("vitality-water")).toBeUndefined();
    layer.dispose();
  });

  it("places a small translucent non-emissive water bead on a leaf", () => {
    const layer = createVitalityElements([water], [leaf]);
    const mesh = layer.group.getObjectByName("vitality-water") as THREE.InstancedMesh;
    const transform = new THREE.Matrix4();
    const position = new THREE.Vector3();
    mesh.getMatrixAt(0, transform);
    position.setFromMatrixPosition(transform);
    mesh.geometry.computeBoundingSphere();
    const surface = activityLeafSurfaceFrame(leaf, .16);
    const centerOffset = position.clone().sub(surface.position);
    const heightAboveSurface = centerOffset.dot(surface.normal);
    const beadHalfHeight = .035 * .55;

    expect(centerOffset.clone().addScaledVector(
      surface.normal,
      -heightAboveSurface
    ).length()).toBeLessThan(.0001);
    expect(Math.abs(heightAboveSurface - beadHalfHeight)).toBeLessThan(.004);
    expect(mesh.geometry.boundingSphere!.radius).toBeLessThan(.05);
    expect(mesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeGreaterThanOrEqual(.45);
    expect(material.opacity).toBeLessThanOrEqual(.65);
    expect(material.emissive.getHex()).toBe(0);
    expect(material.emissiveIntensity).toBe(1);
    layer.dispose();
  });

  it("recomputes the bead transform from its bound leaf when that leaf moves", () => {
    const movingLeaf = leafAt("activity-moving", 1.03);
    const layer = createVitalityElements([water], [movingLeaf]);
    const mesh = layer.group.getObjectByName("vitality-water") as THREE.InstancedMesh;
    const beforeMatrix = new THREE.Matrix4();
    const afterMatrix = new THREE.Matrix4();
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    mesh.getMatrixAt(0, beforeMatrix);
    before.setFromMatrixPosition(beforeMatrix);

    movingLeaf.anchor.x += 2;
    layer.updateVitalityElements(1);
    mesh.getMatrixAt(0, afterMatrix);
    after.setFromMatrixPosition(afterMatrix);

    expect(after.x - before.x).toBeCloseTo(2, 5);
    layer.dispose();
  });

  it("binds at most one water bead to each randomly selected visible leaf", () => {
    const waters = Array.from({ length: 4 }, (_, index): VitalityElement => ({
      ...water,
      id: `water-${index}`,
      taskId: `task-${index}`
    }));
    const leaves = [
      leafAt("activity-a", -3),
      leafAt("activity-b", 0),
      leafAt("activity-c", 3)
    ];
    const layer = createVitalityElements(waters, leaves);
    const mesh = layer.group.getObjectByName("vitality-water") as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const positions = Array.from({ length: mesh.count }, (_, index) => {
      mesh.getMatrixAt(index, matrix);
      return new THREE.Vector3().setFromMatrixPosition(matrix).x.toFixed(4);
    });

    expect(mesh.count).toBe(3);
    expect(new Set(positions).size).toBe(3);
    layer.dispose();
  });
});
