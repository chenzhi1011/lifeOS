import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { buildGrowthMetrics } from "@/src/domain/growth-metrics";
import { createInitialState } from "@/src/domain/seed";
import { buildTreeRecipe } from "@/src/domain/tree-recipe";
import { LIFE_AREA_IDS } from "@/src/domain/life-areas";
import {
  createMatureGrowthTreeMockState,
  MATURE_GROWTH_TREE_MOCK_USER_ID
} from "@/src/mocks/mature-growth-tree";

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
    state.tasks.push({ id: "open", userId: "demo-user", goalId: "aws", sourceMessageId: "m", title: "todo", status: "open", dueAt: null, priority: "normal", plannedMetricType: null, plannedValue: null, plannedUnit: null, createdAt: asOf.toISOString(), completedAt: null });
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

  it("keeps a mature tree inside a compact envelope and child-length hierarchy", () => {
    const state = createMatureGrowthTreeMockState(asOf);
    const data = buildDashboardData(
      state,
      MATURE_GROWTH_TREE_MOCK_USER_ID,
      asOf
    );
    const mature = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));

    expect(mature.trunk.height).toBeLessThanOrEqual(4.2);
    expect(mature.trunk.radius).toBeLessThanOrEqual(0.48);
    expect(Math.max(...mature.lifeAreas.map((branch) => branch.length)))
      .toBeLessThanOrEqual(2.25);
    expect(Math.max(...mature.longGoals.map((branch) => branch.length)))
      .toBeLessThanOrEqual(1.25);
  });

  it("allocates sibling goals to stable separated slots on each parent", () => {
    const state = createMatureGrowthTreeMockState(asOf);
    const data = buildDashboardData(
      state,
      MATURE_GROWTH_TREE_MOCK_USER_ID,
      asOf
    );
    const mature = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));

    for (const areaId of LIFE_AREA_IDS) {
      const starts = mature.longGoals
        .filter((goal) => goal.parentEntityId === areaId)
        .map((goal) => goal.start)
        .sort((left, right) => left - right);
      for (let index = 1; index < starts.length; index += 1) {
        expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(0.12);
      }
    }
  });

  it("gives secondary branches full-circle directions and visibly varied lengths", () => {
    const state = createMatureGrowthTreeMockState(asOf);
    const data = buildDashboardData(
      state,
      MATURE_GROWTH_TREE_MOCK_USER_ID,
      asOf
    );
    const mature = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));
    const goals = mature.longGoals;
    const occupiedQuadrants = new Set(
      goals.map((goal) => Math.floor(goal.azimuth / 90) % 4)
    );
    const lengths = goals.map((goal) => goal.length);

    expect(goals.every((goal) => goal.azimuth >= 0 && goal.azimuth < 360))
      .toBe(true);
    expect(occupiedQuadrants.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...goals.map((goal) => goal.azimuth))
      - Math.min(...goals.map((goal) => goal.azimuth))).toBeGreaterThan(180);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(.2);
  });

  it("uses irregular rather than evenly stratified attachment positions", () => {
    const state = createMatureGrowthTreeMockState(asOf);
    const data = buildDashboardData(
      state,
      MATURE_GROWTH_TREE_MOCK_USER_ID,
      asOf
    );
    const mature = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));
    const starts = mature.longGoals
      .filter((goal) => goal.parentEntityId === "work")
      .map((goal) => goal.start)
      .sort((left, right) => left - right);
    const gaps = starts.slice(1).map((start, index) => start - starts[index]!);

    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(.04);
  });
});
