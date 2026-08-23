import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { buildGrowthMetrics } from "@/src/domain/growth-metrics";
import { createInitialState } from "@/src/domain/seed";
import { buildSemanticTreeSkeleton } from "@/src/domain/semantic-tree-skeleton";
import { buildTreeRecipe } from "@/src/domain/tree-recipe";
import { branchesCollide } from "@/src/domain/tree-branch-collision";

const asOf = new Date("2026-08-01T12:00:00Z");
function skeleton(state = createInitialState()) {
  const data = buildDashboardData(state, "demo-user", asOf);
  const recipe = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));
  return buildSemanticTreeSkeleton(data, recipe, asOf);
}

function radiusAt(
  branch: ReturnType<typeof skeleton>["branches"][number],
  progress: number
): number {
  const smooth = progress * progress * (3 - 2 * progress);
  return branch.baseRadius + (branch.tipRadius - branch.baseRadius) * smooth;
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
    state.tasks.push({ id: "open", userId: "demo-user", goalId: "aws", sourceMessageId: "m", title: "todo", status: "open", dueAt: null, priority: "normal", plannedMetricType: null, plannedValue: null, plannedUnit: null, createdAt: asOf.toISOString(), completedAt: null });
    expect(skeleton(state).branches.filter((item) => item.entityType === "life_area")).toEqual(fixedBefore);
    state.goals.push({ ...state.goals[0]!, id: "new-goal", title: "New" });
    expect(skeleton(state).branches).toContainEqual(expect.objectContaining({ entityId: "new-goal", parentEntityId: "work" }));
  });

  it("uses deterministic leaf visibility from canopy retention", () => {
    const result = skeleton();
    expect(result.leaves.every((leaf) => typeof leaf.visible === "boolean")).toBe(true);
    expect(
      result.leaves.every(
        (leaf) =>
          leaf.twig.parentEntityId === leaf.goalId &&
          leaf.petiole.controlPoints[0].x === leaf.twig.controlPoints[3].x &&
          leaf.petiole.controlPoints[0].y === leaf.twig.controlPoints[3].y &&
          leaf.petiole.controlPoints[0].z === leaf.twig.controlPoints[3].z &&
          leaf.petiole.controlPoints[3].x === leaf.anchor.x &&
          leaf.petiole.controlPoints[3].y === leaf.anchor.y &&
          leaf.petiole.controlPoints[3].z === leaf.anchor.z &&
          Math.hypot(
            leaf.anchor.x - leaf.petiole.controlPoints[0].x,
            leaf.anchor.y - leaf.petiole.controlPoints[0].y,
            leaf.anchor.z - leaf.petiole.controlPoints[0].z
          ) <= .05 &&
          leaf.direction.y <= 0.02
      )
    ).toBe(true);
    expect(result.leaves.every((leaf) => leaf.scale <= 0.72)).toBe(true);
    expect(skeleton().leaves).toEqual(result.leaves);
  });

  it("keeps every child root narrower than its parent at the fork", () => {
    const state = createInitialState();
    const data = buildDashboardData(state, "demo-user", asOf);
    const recipe = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));
    const result = buildSemanticTreeSkeleton(data, recipe, asOf);
    const branchById = new Map(result.branches.map((item) => [item.entityId, item]));
    const recipeById = new Map([
      ...recipe.lifeAreas,
      ...recipe.longGoals,
      ...recipe.shortGoals
    ].map((item) => [item.entityId, item]));

    for (const child of result.branches.filter((item) => item.parentEntityId)) {
      const parent = branchById.get(child.parentEntityId!)!;
      const childRecipe = recipeById.get(child.entityId)!;
      const maximumRatio = child.entityType === "life_area" ? 0.68 : 0.62;

      expect(child.baseRadius).toBeLessThanOrEqual(
        radiusAt(parent, childRecipe.start) * maximumRatio + Number.EPSILON
      );
    }
  });

  it("keeps branch paths out of every non-permitted branch capsule", () => {
    const result = skeleton();

    for (let leftIndex = 0; leftIndex < result.branches.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < result.branches.length; rightIndex += 1) {
        const left = result.branches[leftIndex]!;
        const right = result.branches[rightIndex]!;
        const candidate = left.parentEntityId === right.entityId ? left : right;
        const obstacle = candidate === left ? right : left;

        expect(
          branchesCollide(candidate, obstacle),
          `${candidate.entityId} collides with ${obstacle.entityId}`
        ).toBe(false);
      }
    }
  });
});
