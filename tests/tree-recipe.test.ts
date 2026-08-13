import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { buildGrowthMetrics } from "@/src/domain/growth-metrics";
import { createInitialState } from "@/src/domain/seed";
import { buildTreeRecipe } from "@/src/domain/tree-recipe";
import { LIFE_AREA_IDS } from "@/src/domain/life-areas";

const asOf = new Date("2026-08-01T12:00:00Z");
function recipe() { const data = buildDashboardData(createInitialState(), "demo-user", asOf); return buildTreeRecipe(data, buildGrowthMetrics(data, asOf)); }

describe("tree recipe", () => {
  it("is deterministic, bounded, and always contains fixed branches", () => {
    const first = recipe();
    expect(recipe()).toEqual(first);
    expect(first.trunk.height).toBeGreaterThanOrEqual(2.8);
    expect(first.trunk.height).toBeLessThanOrEqual(5.2);
    expect(first.lifeAreas.map((item) => item.entityId)).toEqual(LIFE_AREA_IDS);
    expect(first.lifeAreas.map((item) => [item.azimuth, item.start])).toEqual([[-70, .38], [-20, .5], [30, .62], [80, .74], [135, .42], [195, .56], [255, .68]]);
  });

  it("does not move fixed branches when goals or unfinished tasks change", () => {
    const state = createInitialState();
    const beforeData = buildDashboardData(state, "demo-user", asOf);
    const before = buildTreeRecipe(beforeData, buildGrowthMetrics(beforeData, asOf));
    state.tasks.push({ id: "open", userId: "demo-user", goalId: "aws", messageId: "m", title: "todo", status: "open", dueAt: null, priority: "normal", plannedMetricType: null, plannedValue: null, plannedUnit: null, createdAt: asOf.toISOString(), completedAt: null });
    state.goals.push({ ...state.goals[0]!, id: "new-goal", title: "New" });
    const afterData = buildDashboardData(state, "demo-user", asOf);
    const after = buildTreeRecipe(afterData, buildGrowthMetrics(afterData, asOf));
    expect(after.lifeAreas).toEqual(before.lifeAreas);
    expect(after.longGoals).toContainEqual(expect.objectContaining({ entityId: "new-goal", parentEntityId: "work" }));
  });

  it("replaces a completed short-term branch with its harvested fruit", () => {
    const result = recipe();

    expect(result.shortGoals).toContainEqual(expect.objectContaining({ entityId: "job-change" }));
    expect(result.shortGoals).not.toContainEqual(expect.objectContaining({ entityId: "portfolio-launch" }));
  });
});
