import { describe, expect, it } from "vitest";
import { buildGrowthMetrics, growthPoints, maturityFromPoints } from "@/src/domain/growth-metrics";
import { createInitialState } from "@/src/domain/seed";
import { buildDashboardData } from "@/src/domain/aggregation";
import { LIFE_AREA_IDS } from "@/src/domain/life-areas";

describe("growth metrics", () => {
  it("normalizes units and caps one record", () => {
    expect(growthPoints({ metricType: "duration", value: 60, unit: "minute" })).toBe(2);
    expect(growthPoints({ metricType: "duration", value: 1, unit: "hour" })).toBe(2);
    expect(growthPoints({ metricType: "count", value: 1000, unit: "count" })).toBe(10);
    expect(growthPoints({ metricType: "milestone", value: 1, unit: "count" })).toBe(5);
  });

  it("uses a fast-early and slow-mature exponential curve", () => {
    expect(maturityFromPoints(0)).toBe(0);
    expect(maturityFromPoints(5)).toBeCloseTo(0.133, 3);
    expect(maturityFromPoints(35)).toBeCloseTo(0.632, 3);
    expect(maturityFromPoints(140)).toBeCloseTo(0.982, 3);
    expect(maturityFromPoints(5)).toBeGreaterThan(maturityFromPoints(75) - maturityFromPoints(70));
    for (let points = 0; points < 300; points += 1) {
      expect(maturityFromPoints(points + 1)).toBeGreaterThanOrEqual(maturityFromPoints(points));
      expect(maturityFromPoints(points)).toBeLessThanOrEqual(1);
    }
  });

  it("always returns seven areas and excludes future activity from recent state", () => {
    const state = createInitialState();
    state.activities.push({ ...state.activities[0]!, id: "future", occurredOn: "2026-09-01" });
    const data = buildDashboardData(state, "demo-user", new Date("2026-08-01T12:00:00Z"));
    const metrics = buildGrowthMetrics(data, new Date("2026-08-01T12:00:00Z"));
    expect(metrics.lifeAreas.map((item) => item.entityId)).toEqual(LIFE_AREA_IDS);
    expect(metrics.root.lifetimePoints).toBeGreaterThan(metrics.root.recentPoints);
    expect(metrics.lifeAreas.find((item) => item.entityId === "entertainment")).toMatchObject({ lifetimePoints: 0, stage: 0 });
  });

  it("is independent of input order and unfinished task data", () => {
    const state = createInitialState();
    const first = buildGrowthMetrics(buildDashboardData(state, "demo-user"), new Date("2026-08-01T12:00:00Z"));
    state.activities.reverse();
    state.tasks.push({ id: "open", userId: "demo-user", goalId: "aws", messageId: "m", title: "todo", status: "open", dueAt: null, priority: "normal", plannedMetricType: null, plannedValue: null, plannedUnit: null, createdAt: "2026-08-01T00:00:00Z", completedAt: null });
    const second = buildGrowthMetrics(buildDashboardData(state, "demo-user"), new Date("2026-08-01T12:00:00Z"));
    expect(second).toEqual(first);
  });
});
