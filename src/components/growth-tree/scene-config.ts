export const GROWTH_SCENE_CONFIG = {
  treeOffsetX: -1.2,
  // Orbit around the trunk axis, not around a separate composition point.
  // 相机围绕树干中轴旋转，不再围绕独立的构图偏移点。
  treeOrbitTarget: { x: -1.2, y: 2.45, z: 0 },
  initialCameraOffset: { x: 1.15, y: 1.25, z: 11.6 },
  models: {
    tree: null,
    mountains: null,
    rocks: null
  },
  performance: {
    maxPixelRatio: 1.75,
    shadows: true,
    lakeReflection: "simple"
  }
} as const;

export { LIFE_AREA_BRANCH_PLACEMENTS } from "@/src/domain/tree-recipe";

export type GrowthSceneAsset = keyof typeof GROWTH_SCENE_CONFIG.models;
