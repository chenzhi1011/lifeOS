export const GROWTH_SCENE_CONFIG = {
  treeOffsetX: -1.2,
  backgroundSaturation: 0.8,
  colors: {
    leaf: 0x4f8b3d,
    leafHighlight: 0x78a94c,
    lake: 0x6f9ea4,
    mountainNear: 0x788795,
    mountainFar: 0x9aa7b3,
    rock: 0x91877d
  },
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
