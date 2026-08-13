import type { DashboardData } from "./aggregation";
import { GROWTH_STAGE_THRESHOLDS, maturityFromPoints, type GrowthMetrics, type GrowthStage } from "./growth-metrics";
import { LIFE_AREAS } from "./life-areas";
import { seedFromId } from "./stable-seed";

export type BranchRecipe = { entityType: "life_area" | "long_goal" | "short_goal"; entityId: string; parentEntityId: string; stage: GrowthStage; start: number; azimuth: number; elevation: number; length: number; radius: number; gnarliness: number; childSlots: number };
export type TreeRecipe = { seed: number; trunk: { height: number; radius: number; sections: number }; lifeAreas: BranchRecipe[]; longGoals: BranchRecipe[]; shortGoals: BranchRecipe[]; canopy: { retention: number; vitality: number; youngLeafRatio: number } };
export const LIFE_AREA_BRANCH_PLACEMENTS = [
  { id: "work", azimuth: -70, start: .38 }, { id: "growth", azimuth: -20, start: .5 },
  { id: "health", azimuth: 30, start: .62 }, { id: "life", azimuth: 80, start: .74 },
  { id: "finance", azimuth: 135, start: .42 }, { id: "relationships", azimuth: 195, start: .56 },
  { id: "entertainment", azimuth: 255, start: .68 }
] as const;
function lerp(min: number, max: number, amount: number) { return min + (max - min) * Math.min(1, Math.max(0, amount)); }
function locked(stage: GrowthStage) { return maturityFromPoints(GROWTH_STAGE_THRESHOLDS[stage]); }
function branch(entityType: BranchRecipe["entityType"], entityId: string, parentEntityId: string, stage: GrowthStage, start: number, azimuth: number): BranchRecipe {
  const maturity = locked(stage);
  return { entityType, entityId, parentEntityId, stage, start, azimuth, elevation: 22 + seedFromId(entityId, "elevation") * 24,
    length: lerp(.8, 2.6, maturity), radius: lerp(.07, .28, maturity), gnarliness: .12 + seedFromId(entityId, "gnarliness") * .3,
    childSlots: 3 + stage * 2 };
}
export function buildTreeRecipe(data: DashboardData, metrics: GrowthMetrics): TreeRecipe {
  const goalMetric = new Map(metrics.goals.map((item) => [item.entityId, item]));
  const rootMaturity = locked(metrics.root.stage);
  const lifeAreas = LIFE_AREAS.map((area, index) => {
    const metric = metrics.lifeAreas[index]!;
    const { azimuth, start } = LIFE_AREA_BRANCH_PLACEMENTS[index]!;
    return branch("life_area", area.id, "root", metric.stage, start, azimuth);
  });
  const goals = [...data.goals].sort((a, b) => a.id.localeCompare(b.id)).map((goal) => {
    const stage = goalMetric.get(goal.id)?.stage ?? 0;
    return branch(goal.goalType === "long_term" ? "long_goal" : "short_goal", goal.id, goal.lifeArea, stage,
      .42 + seedFromId(goal.id, "start") * .42, -35 + seedFromId(goal.id, "azimuth") * 70);
  });
  return { seed: seedFromId("life-os", "tree"), trunk: { height: lerp(2.8, 5.2, rootMaturity), radius: lerp(.28, .62, rootMaturity), sections: 8 + metrics.root.stage * 2 },
    lifeAreas, longGoals: goals.filter((item) => item.entityType === "long_goal"), shortGoals: goals.filter((item) => item.entityType === "short_goal"),
    canopy: { retention: lerp(.45, 1, metrics.root.recentScore), vitality: metrics.root.recentScore, youngLeafRatio: lerp(.15, .65, metrics.root.recentScore) } };
}
