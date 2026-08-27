import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { LIFE_AREA_IDS } from "@/src/domain/life-areas";
import { buildGrowthMetrics } from "@/src/domain/growth-metrics";
import { buildGrowthTreeViewModel } from "@/src/domain/tree-visualization";
import { createRealisticGrowthTreeLayer } from "@/src/components/RealisticGrowthTree";
import {
  createMatureGrowthTreeMockState,
  MATURE_GROWTH_TREE_MOCK_USER_ID
} from "@/src/mocks/mature-growth-tree";

describe("mature growth tree mock", () => {
  it("models many completed tasks through valid activities in all life areas", () => {
    const asOf = new Date("2026-08-26T12:00:00.000Z");
    const state = createMatureGrowthTreeMockState(asOf);
    const goalIds = new Set(state.goals.map((goal) => goal.id));
    const taskIds = new Set(state.tasks.map((task) => task.id));

    expect(new Set(state.goals.map((goal) => goal.lifeArea)))
      .toEqual(new Set(LIFE_AREA_IDS));
    expect(state.tasks.filter((task) => task.status === "completed").length)
      .toBeGreaterThan(300);
    expect(state.activities.length).toBeGreaterThan(300);
    expect(state.tasks.every(
      (task) => task.status !== "completed" || task.completedAt !== null
    )).toBe(true);
    expect(state.activities.every(
      (activity) =>
        goalIds.has(activity.goalId) &&
        activity.taskId !== null &&
        taskIds.has(activity.taskId)
    )).toBe(true);
  });

  it("projects a stage-five leafy tree, harvests, and one-off vitality", () => {
    const asOf = new Date("2026-08-26T12:00:00.000Z");
    const state = createMatureGrowthTreeMockState(asOf);
    const data = buildDashboardData(
      state,
      MATURE_GROWTH_TREE_MOCK_USER_ID,
      asOf
    );
    const metrics = buildGrowthMetrics(data, asOf);
    const model = buildGrowthTreeViewModel(data, asOf);

    expect(metrics.root.stage).toBe(5);
    expect(metrics.lifeAreas.every((area) => area.stage === 5)).toBe(true);
    expect(metrics.goals
      .filter((goal) => goal.entityId.includes("long"))
      .every((goal) => goal.stage === 5)).toBe(true);
    expect(model.lifeAreaBranches).toHaveLength(7);
    expect(model.longGoalTwigs.length).toBeGreaterThanOrEqual(18);
    expect(model.activityLeaves.length).toBeGreaterThan(200);
    expect(model.recipe.canopy.vitality).toBeGreaterThan(0.95);
    expect(model.recipe.canopy.retention).toBeGreaterThan(0.95);
    expect(model.shortGoalBranches).toHaveLength(0);
    expect(data.achievements.length).toBeGreaterThanOrEqual(10);
    expect(model.vitalityElements.length).toBeGreaterThan(0);

    const visibleActivityLeaves = model.semanticLeaves.filter(
      (leaf) => leaf.visible
    );
    const layer = createRealisticGrowthTreeLayer(model);
    expect(layer.stats.activityLeaves).toBe(visibleActivityLeaves.length);
    expect(layer.stats.activityLeaves).toBeGreaterThan(200);
    expect(layer.stats.decorativeLeaves).toBe(0);
    expect(layer.stats.totalLeaves).toBe(layer.stats.activityLeaves);
    expect(layer.activityLeafInstances.count).toBe(visibleActivityLeaves.length);
    layer.dispose();

  });
});
