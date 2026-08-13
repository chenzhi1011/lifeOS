import type { DashboardData } from "./aggregation";
import { LIFE_AREAS, type LifeAreaId } from "./life-areas";
import type { Activity } from "./types";

export type GrowthStage = 0 | 1 | 2 | 3 | 4 | 5;
export type EntityGrowthMetric = {
  entityId: string;
  lifetimePoints: number;
  maturity: number;
  activeDays: number;
  recentPoints: number;
  recentScore: number;
  stage: GrowthStage;
};
export type GrowthMetrics = { root: EntityGrowthMetric; lifeAreas: (EntityGrowthMetric & { entityId: LifeAreaId })[]; goals: EntityGrowthMetric[] };
export const GROWTH_STAGE_THRESHOLDS = [0, 5, 15, 35, 70, 140] as const;
export const MATURITY_CURVE_K = 35;

function finitePositive(value: number): number { return Number.isFinite(value) ? Math.max(0, value) : 0; }
export function growthPoints(activity: Pick<Activity, "metricType" | "value" | "unit">): number {
  const value = finitePositive(activity.value);
  const raw = activity.metricType === "duration"
    ? (activity.unit === "hour" ? value * 2 : value / 30)
    : activity.metricType === "milestone" ? value * 5 : value;
  return Number(Math.min(10, raw).toFixed(4));
}
export function maturityFromPoints(points: number): number {
  const result = -Math.expm1(-finitePositive(points) / MATURITY_CURVE_K);
  return Math.min(1, Math.max(0, result));
}
function stageFromPoints(points: number): GrowthStage {
  let result: GrowthStage = 0;
  GROWTH_STAGE_THRESHOLDS.forEach((threshold, index) => { if (points >= threshold) result = index as GrowthStage; });
  return result;
}
function metric(entityId: string, lifetime: Activity[], recent: Activity[]): EntityGrowthMetric {
  const lifetimePoints = Number(lifetime.reduce((sum, item) => sum + growthPoints(item), 0).toFixed(4));
  const recentPoints = Number(recent.reduce((sum, item) => sum + growthPoints(item), 0).toFixed(4));
  return { entityId, lifetimePoints, maturity: maturityFromPoints(lifetimePoints), activeDays: new Set(lifetime.map((item) => item.occurredOn)).size,
    recentPoints, recentScore: Math.min(1, -Math.expm1(-recentPoints / 15)), stage: stageFromPoints(lifetimePoints) };
}
export function buildGrowthMetrics(data: DashboardData, asOf: Date): GrowthMetrics {
  if (!Number.isFinite(asOf.getTime())) throw new Error("growth metrics require a valid asOf date");
  const end = asOf.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) - 29 * 86_400_000).toISOString().slice(0, 10);
  const all = data.allActivities.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const recent = all.filter((item) => item.occurredOn >= start && item.occurredOn <= end);
  const goals = [...data.goals].sort((a, b) => a.id.localeCompare(b.id)).map((goal) => metric(goal.id, all.filter((item) => item.goalId === goal.id), recent.filter((item) => item.goalId === goal.id)));
  const lifeAreas = LIFE_AREAS.map((area) => {
    const ids = new Set(data.goals.filter((goal) => goal.lifeArea === area.id).map((goal) => goal.id));
    return { ...metric(area.id, all.filter((item) => ids.has(item.goalId)), recent.filter((item) => ids.has(item.goalId))), entityId: area.id };
  });
  return { root: metric("root", all, recent), lifeAreas, goals };
}
