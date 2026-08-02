import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createActivityLeafMesh,
  createWoodSegmentMesh
} from "@/src/components/growth-tree-geometry";
import * as realisticGrowthTree from "@/src/components/RealisticGrowthTree";
import type {
  GrowthTreeViewModel,
  GrowthTreeLeaf,
  GrowthTreeWoodSegment
} from "@/src/domain/tree-visualization";

const segment: GrowthTreeWoodSegment = {
  entityType: "long_goal",
  entityId: "career",
  label: "职业",
  category: "职业",
  start: { x: 0, y: 1, z: 0 },
  end: { x: 1, y: 2.5, z: 0.5 },
  thickness: 0.2,
  status: "active",
  totalValue: 12,
  activityCount: 3,
  recentActivities: []
};

const leaf: GrowthTreeLeaf = {
  activityId: "activity-1",
  goalId: "career",
  position: { x: 1, y: 2.3, z: 0.2 },
  rotation: { x: 0.2, y: 0.4, z: 0.6 },
  scale: 1,
  activities: []
};

const viewModel: GrowthTreeViewModel = {
  root: {
    ...segment,
    entityType: "root",
    entityId: "root",
    label: "人生"
  },
  abilityBranches: [
    {
      ...segment,
      entityType: "ability",
      entityId: "ability-a",
      label: "前端能力"
    }
  ],
  longGoalTwigs: [segment],
  shortGoalBranches: [],
  activityLeaves: [leaf],
  vitalityElements: [],
  diagnostics: []
};

type LayerFactory = (
  input: GrowthTreeViewModel
) => {
  group: THREE.Group;
  selectable: THREE.Object3D[];
  entityByUuid: Map<
    string,
    {
      kind: "wood" | "leaf";
      entityType: string;
      entityId: string;
      leafId: string | null;
      goalId: string | null;
    }
  >;
  dispose: () => void;
};

function layerFactory(): LayerFactory | undefined {
  return (
    realisticGrowthTree as typeof realisticGrowthTree & {
      createRealisticGrowthTreeLayer?: LayerFactory;
    }
  ).createRealisticGrowthTreeLayer;
}

describe("growth tree geometry", () => {
  it("aligns wood geometry and stores the entity identity", () => {
    const mesh = createWoodSegmentMesh(segment);

    expect(mesh.userData.entityType).toBe(segment.entityType);
    expect(mesh.userData.entityId).toBe(segment.entityId);
    expect(mesh.userData.leafId).toBeNull();
    expect(mesh.userData.goalId).toBe(segment.entityId);
    expect(mesh.material.userData.baseColor).toBeTypeOf("number");
    expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(mesh.position.y).toBeGreaterThan(0);
  });

  it("creates a non-spherical activity leaf with leaf metadata", () => {
    const mesh = createActivityLeafMesh(leaf);

    expect(mesh.userData.entityType).toBe("activity");
    expect(mesh.userData.entityId).toBe(leaf.activityId);
    expect(mesh.userData.leafId).toBe(leaf.activityId);
    expect(mesh.userData.goalId).toBe(leaf.goalId);
    expect(mesh.material.userData.baseColor).toBeTypeOf("number");
    expect(mesh.geometry).toBeInstanceOf(THREE.ShapeGeometry);
    expect(mesh.geometry).not.toBeInstanceOf(THREE.SphereGeometry);
  });

  it("dims paused wood and keeps completed long-term wood non-active", () => {
    const active = createWoodSegmentMesh(segment);
    const paused = createWoodSegmentMesh({ ...segment, status: "paused" });
    const completed = createWoodSegmentMesh({ ...segment, status: "completed" });
    const activeHsl = { h: 0, s: 0, l: 0 };
    const pausedHsl = { h: 0, s: 0, l: 0 };
    active.material.color.getHSL(activeHsl);
    paused.material.color.getHSL(pausedHsl);

    expect(pausedHsl.s).toBeLessThan(activeHsl.s);
    expect(pausedHsl.l).toBeLessThan(activeHsl.l);
    expect(completed.userData.entityType).toBe("long_goal");
    expect(completed.material.userData.hoverColor).toBe(
      completed.material.userData.baseColor
    );
  });

  it("builds selectable identity targets and disposes owned resources once", () => {
    const createLayer = layerFactory();
    expect(createLayer).toBeTypeOf("function");
    if (!createLayer) {
      return;
    }

    const layer = createLayer(viewModel);
    const meshes = layer.group.children.filter(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh
    );
    const geometryDisposals = meshes.map((mesh) =>
      vi.spyOn(mesh.geometry, "dispose")
    );
    const materialDisposals = meshes.map((mesh) =>
      vi.spyOn(mesh.material as THREE.Material, "dispose")
    );

    expect(layer.selectable).toHaveLength(4);
    expect(layer.entityByUuid.size).toBe(layer.selectable.length);
    expect(
      layer.selectable.map((object) => layer.entityByUuid.get(object.uuid))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "wood",
          entityType: "root",
          entityId: "root",
          leafId: null,
          goalId: null
        }),
        expect.objectContaining({
          kind: "wood",
          entityType: "long_goal",
          entityId: "career",
          leafId: null,
          goalId: "career"
        }),
        expect.objectContaining({
          kind: "leaf",
          entityType: "activity",
          entityId: "activity-1",
          leafId: "activity-1",
          goalId: "career"
        })
      ])
    );

    layer.dispose();
    layer.dispose();

    for (const dispose of geometryDisposals) {
      expect(dispose).toHaveBeenCalledOnce();
    }
    for (const dispose of materialDisposals) {
      expect(dispose).toHaveBeenCalledOnce();
    }
    expect(layer.group.children).toHaveLength(0);
  });
});
