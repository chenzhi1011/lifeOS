export const GROWTH_SCENE_CONFIG = {
  treeOffsetX: -1.2,
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
