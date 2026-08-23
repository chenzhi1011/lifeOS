import * as THREE from "three";
import type {
  GrowthTreeViewModel,
  TreeEntityType
} from "@/src/domain/tree-visualization";
import {
  createSemanticBranchMesh,
  createSemanticLeafMesh,
  createDecorativeCanopy,
  buildCanopyStructure,
  createDecorativeCanopyTwigs,
  createActivityLeafTwigMesh
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
  stats: { totalLeaves: number; decorativeLeaves: number; activityLeaves: number; maxRadialSegments: number };
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
  // Selection color order / 颜色优先级：选中 > 悬停 > 关联 > 默认
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
  // This layer builds the visible tree body: canopy, branches, and leaves.
  // 这一层负责真正“看得见的树”：树冠、树枝、叶片。
  const selectable: THREE.Object3D[] = [];
  const entityByUuid = new Map<string, TreeSelectionTarget>();
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  // Decorative canopy is the soft background foliage used to make the tree fuller.
  // 装饰性树冠是让树看起来更丰满的背景叶层。
  const canopyStructure = buildCanopyStructure(
    viewModel.branches,
    viewModel.recipe
  );
  const canopyTwigs = createDecorativeCanopyTwigs([
    ...canopyStructure.twigs,
    ...canopyStructure.petioles
  ]);
  const canopy = createDecorativeCanopy(viewModel.branches, viewModel.recipe);
  const visibleActivityLeaves = viewModel.semanticLeaves
    .filter((item) => item.visible)
    .sort((left, right) => left.activityId.localeCompare(right.activityId))
    .slice(0, 100);
  group.add(canopyTwigs, canopy);
  rememberOwnedMesh(canopyTwigs, ownedGeometries, ownedMaterials);
  rememberOwnedMesh(canopy, ownedGeometries, ownedMaterials);
  for (const segment of viewModel.branches) {
    // Semantic branches are the structural wood pieces derived from the tree recipe.
    // 语义树枝是根据 tree recipe 生成的结构层木枝。
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

  for (const leaf of visibleActivityLeaves) {
    // Activity leaves are the user-facing growth markers attached to goals.
    // 活动叶片代表用户行为留下的成长痕迹，挂在对应目标上。
    const twigMesh = createActivityLeafTwigMesh(leaf);
    const mesh = createSemanticLeafMesh(leaf);
    const target: TreeSelectionTarget = {
      kind: "leaf",
      entityType: "activity",
      entityId: leaf.activityId,
      leafId: leaf.activityId,
      goalId: leaf.goalId
    };
    group.add(twigMesh, mesh);
    rememberOwnedMesh(twigMesh, ownedGeometries, ownedMaterials);
    selectable.push(mesh);
    entityByUuid.set(mesh.uuid, target);
    rememberOwnedMesh(mesh, ownedGeometries, ownedMaterials);
  }

  let disposed = false;
  return {
    group,
    selectable,
    entityByUuid,
    stats: {
      totalLeaves: canopy.count + visibleActivityLeaves.length,
      decorativeLeaves: canopy.count,
      activityLeaves: visibleActivityLeaves.length,
      maxRadialSegments: Math.max(0, ...viewModel.branches.map((item) => Math.min(10, item.radialSegments)))
    },
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
      canopy.dispose();
      for (const material of ownedMaterials) {
        material.dispose();
      }
      ownedGeometries.clear();
      ownedMaterials.clear();
    }
  };
}
