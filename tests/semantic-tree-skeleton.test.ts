import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { buildGrowthMetrics } from "@/src/domain/growth-metrics";
import { createInitialState } from "@/src/domain/seed";
import { buildSemanticTreeSkeleton } from "@/src/domain/semantic-tree-skeleton";
import { buildTreeRecipe } from "@/src/domain/tree-recipe";

const asOf = new Date("2026-08-01T12:00:00Z");
function skeleton(state = createInitialState()) {
  const data = buildDashboardData(state, "demo-user", asOf);
  const recipe = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));
  return buildSemanticTreeSkeleton(data, recipe, asOf);
}
describe("semantic tree skeleton", () => {
  it("creates a root and exactly seven stable life-area curves", () => {
    const first = skeleton();
    expect(first.branches.filter((item) => item.entityType === "life_area")).toHaveLength(7);
    expect(first.branches[0]).toMatchObject({ entityType: "root", entityId: "root", parentEntityId: null });
    expect(skeleton()).toEqual(first);
    expect(first.branches.every((item) => item.controlPoints[3].y >= item.controlPoints[0].y)).toBe(true);
  });

  it("keeps existing identities stable when adding tasks, activity, or a goal", () => {
    const state = createInitialState();
    const before = skeleton(state);
    const fixedBefore = before.branches.filter((item) => item.entityType === "life_area");
    state.tasks.push({ id: "open", userId: "demo-user", goalId: "aws", messageId: "m", title: "todo", status: "open", dueAt: null, priority: "normal", plannedMetricType: null, plannedValue: null, plannedUnit: null, createdAt: asOf.toISOString(), completedAt: null });
    expect(skeleton(state).branches.filter((item) => item.entityType === "life_area")).toEqual(fixedBefore);
    state.goals.push({ ...state.goals[0]!, id: "new-goal", title: "New" });
    expect(skeleton(state).branches).toContainEqual(expect.objectContaining({ entityId: "new-goal", parentEntityId: "work" }));
  });

  it("uses deterministic leaf visibility from canopy retention", () => {
    const result = skeleton();
    expect(result.leaves.every((leaf) => typeof leaf.visible === "boolean")).toBe(true);
    expect(skeleton().leaves).toEqual(result.leaves);
  });
});
