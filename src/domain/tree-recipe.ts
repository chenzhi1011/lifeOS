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
function shapeSeed(entityId: string, salt: string): number {
  let value = Math.floor(seedFromId(entityId, salt) * 4_294_967_296) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}
function branch(entityType: BranchRecipe["entityType"], entityId: string, parentEntityId: string, stage: GrowthStage, start: number, azimuth: number): BranchRecipe {
  const maturity = locked(stage);
  const isLifeArea = entityType === "life_area";
  const baseLength = lerp(isLifeArea ? 1.65 : .72, isLifeArea ? 2.25 : 1.08, maturity);
  const lengthVariation = isLifeArea
    ? 1
    : .72 + shapeSeed(entityId, "length-variation") * .43;
  return { entityType, entityId, parentEntityId, stage, start, azimuth, elevation: (isLifeArea ? 22 : 36) + (isLifeArea ? seedFromId(entityId, "elevation") : shapeSeed(entityId, "elevation")) * (isLifeArea ? 24 : 30),
    length: baseLength * lengthVariation, radius: lerp(isLifeArea ? .12 : .055, isLifeArea ? .2 : .14, maturity), gnarliness: .12 + seedFromId(entityId, "gnarliness") * .3,
    childSlots: 3 + stage * 2 };
}

function siblingGoalStarts(entityIds: string[]): Map<string, number> {
  const sortedIds = [...entityIds].sort((left, right) => left.localeCompare(right));
  const minimum = .3;
  const maximum = .9;
  const slotWidth = (maximum - minimum) / Math.max(1, sortedIds.length);
  let previous = minimum - .12;
  return new Map(sortedIds.map((entityId, index) => {
    const stratumStart = minimum + slotWidth * index;
    const candidate = stratumStart
      + slotWidth * (.12 + shapeSeed(entityId, "start-jitter") * .76);
    const start = Math.min(maximum, Math.max(candidate, previous + .12));
    previous = start;
    return [entityId, Number(start.toFixed(4))];
  }));
}

export function buildTreeRecipe(data: DashboardData, metrics: GrowthMetrics): TreeRecipe {
  const goalMetric = new Map(metrics.goals.map((item) => [item.entityId, item]));
  const rootMaturity = locked(metrics.root.stage);
  const lifeAreas = LIFE_AREAS.map((area, index) => {
    const metric = metrics.lifeAreas[index]!;
    const { azimuth, start } = LIFE_AREA_BRANCH_PLACEMENTS[index]!;
    return branch("life_area", area.id, "root", metric.stage, start, azimuth);
  });
  const visibleGoals = data.goals.filter(
    (goal) => goal.goalType === "long_term" || goal.status !== "completed"
  );
  const startByGoalId = new Map(
    LIFE_AREAS.flatMap((area) => {
      const areaGoalIds = visibleGoals
        .filter((goal) => goal.lifeArea === area.id)
        .map((goal) => goal.id);
      return [...siblingGoalStarts(areaGoalIds)];
    })
  );
  const goals = visibleGoals.sort((a, b) => a.id.localeCompare(b.id)).map((goal) => {
    const stage = goalMetric.get(goal.id)?.stage ?? 0;
    return branch(goal.goalType === "long_term" ? "long_goal" : "short_goal", goal.id, goal.lifeArea, stage,
      startByGoalId.get(goal.id) ?? .6, shapeSeed(goal.id, "azimuth") * 360);
  });
  return { seed: seedFromId("life-os", "tree"), trunk: { height: lerp(3.2, 4.2, rootMaturity), radius: lerp(.3, .48, rootMaturity), sections: 8 + metrics.root.stage * 2 },
    lifeAreas, longGoals: goals.filter((item) => item.entityType === "long_goal"), shortGoals: goals.filter((item) => item.entityType === "short_goal"),
    canopy: { retention: lerp(.45, 1, metrics.root.recentScore), vitality: metrics.root.recentScore, youngLeafRatio: lerp(.15, .65, metrics.root.recentScore) } };
}
