import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createActivityLeafMesh,
  createWoodSegmentMesh
} from "@/src/components/growth-tree-geometry";
import type {
  GrowthTreeLeaf,
  GrowthTreeWoodSegment
} from "@/src/domain/tree-visualization";

const segment: GrowthTreeWoodSegment = {
  goalId: "career",
  parentGoalId: "root",
  depth: 1,
  label: "职业",
  category: "职业",
  startPosition: { x: 0, y: 1, z: 0 },
  endPosition: { x: 1, y: 2.5, z: 0.5 },
  thickness: 0.2,
  totalValue: 12,
  activityCount: 3,
  intensity: 0.5,
  recentActivities: []
};

const leaf: GrowthTreeLeaf = {
  id: "career-leaf-0",
  goalId: "career",
  position: { x: 1, y: 2.3, z: 0.2 },
  rotation: { x: 0.2, y: 0.4, z: 0.6 },
  scale: 1,
  activities: []
};

describe("growth tree geometry", () => {
  it("aligns wood geometry and stores the goal id", () => {
    const mesh = createWoodSegmentMesh(segment);

    expect(mesh.userData.goalId).toBe(segment.goalId);
    expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(mesh.position.y).toBeGreaterThan(0);
  });

  it("creates a non-spherical activity leaf with leaf metadata", () => {
    const mesh = createActivityLeafMesh(leaf);

    expect(mesh.userData.leafId).toBe(leaf.id);
    expect(mesh.userData.goalId).toBe(leaf.goalId);
    expect(mesh.geometry).toBeInstanceOf(THREE.ShapeGeometry);
    expect(mesh.geometry).not.toBeInstanceOf(THREE.SphereGeometry);
  });
});
