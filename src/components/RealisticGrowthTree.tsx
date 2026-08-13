import * as THREE from "three";
import type {
  GrowthTreeViewModel,
  TreeEntityType
} from "@/src/domain/tree-visualization";
import {
  createSemanticBranchMesh,
  createSemanticLeafMesh
} from "./growth-tree-semantic-geometry";

export type TreeSelectionTarget = {
  kind: "wood" | "leaf";
  entityType: TreeEntityType | "activity";
  entityId: string;
  leafId: string | null;
  goalId: string | null;
};

export type RealisticGrowthTreeLayer = {
  group: THREE.Group;
  selectable: THREE.Object3D[];
  entityByUuid: Map<string, TreeSelectionTarget>;
  dispose: () => void;
};

export type TreeMaterialPalette = {
  baseColor: number;
  hoverColor: number;
  selectedColor: number;
  relatedColor?: number;
};

export function resolveTreeMaterialColor(
  palette: TreeMaterialPalette,
  state: { selected: boolean; hovered: boolean; related: boolean }
): number {
  if (state.selected) {
    return palette.selectedColor;
  }
  if (state.hovered) {
    return palette.hoverColor;
  }
  if (state.related) {
    return palette.relatedColor ?? palette.baseColor;
  }
  return palette.baseColor;
}

function rememberOwnedMesh(
  mesh: THREE.Mesh,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>
): void {
  geometries.add(mesh.geometry);
  const meshMaterials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of meshMaterials) {
    materials.add(material);
  }
}

export function createRealisticGrowthTreeLayer(
  viewModel: GrowthTreeViewModel
): RealisticGrowthTreeLayer {
  const group = new THREE.Group();
  group.name = "realistic-growth-tree-layer";
  const selectable: THREE.Object3D[] = [];
  const entityByUuid = new Map<string, TreeSelectionTarget>();
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  for (const segment of viewModel.branches) {
    const mesh = createSemanticBranchMesh(segment);
    const target: TreeSelectionTarget = {
      kind: "wood",
      entityType: segment.entityType,
      entityId: segment.entityId,
      leafId: null,
      goalId:
        segment.entityType === "long_goal" ||
        segment.entityType === "short_goal"
          ? segment.entityId
          : null
    };
    group.add(mesh);
    selectable.push(mesh);
    entityByUuid.set(mesh.uuid, target);
    rememberOwnedMesh(mesh, ownedGeometries, ownedMaterials);
  }

  for (const leaf of viewModel.semanticLeaves.filter((item) => item.visible)) {
    const mesh = createSemanticLeafMesh(leaf);
    const target: TreeSelectionTarget = {
      kind: "leaf",
      entityType: "activity",
      entityId: leaf.activityId,
      leafId: leaf.activityId,
      goalId: leaf.goalId
    };
    group.add(mesh);
    selectable.push(mesh);
    entityByUuid.set(mesh.uuid, target);
    rememberOwnedMesh(mesh, ownedGeometries, ownedMaterials);
  }

  let disposed = false;
  return {
    group,
    selectable,
    entityByUuid,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      group.clear();
      entityByUuid.clear();
      selectable.length = 0;
      for (const geometry of ownedGeometries) {
        geometry.dispose();
      }
      for (const material of ownedMaterials) {
        material.dispose();
      }
      ownedGeometries.clear();
      ownedMaterials.clear();
    }
  };
}
