import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { buildGrowthMetrics } from "@/src/domain/growth-metrics";
import { createInitialState } from "@/src/domain/seed";
import {
  activityLeafProgresses,
  buildSemanticTreeSkeleton
} from "@/src/domain/semantic-tree-skeleton";
import { buildTreeRecipe } from "@/src/domain/tree-recipe";
import { branchesCollide } from "@/src/domain/tree-branch-collision";
import type { LifeOSState } from "@/src/domain/types";

const asOf = new Date("2026-08-01T12:00:00Z");
function skeleton(state = createInitialState()) {
  const data = buildDashboardData(state, "demo-user", asOf);
  const recipe = buildTreeRecipe(data, buildGrowthMetrics(data, asOf));
  return buildSemanticTreeSkeleton(data, recipe, asOf);
}

function stateWithAwsActivities(count: number): LifeOSState {
  const state = createInitialState();
  const template = state.activities.find((activity) => activity.goalId === "aws")!;
  state.activities = [
    ...state.activities.filter((activity) => activity.goalId !== "aws"),
    ...Array.from({ length: count }, (_, index) => ({
      ...template,
      id: `aws-activity-${String(index).padStart(3, "0")}`,
      summary: `AWS activity ${index}`,
      occurredOn: `2026-07-${String(3 + index % 25).padStart(2, "0")}`,
      createdAt: `2026-07-${String(3 + index % 25).padStart(2, "0")}T09:00:00Z`
    }))
  ];
  return state;
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

  it("uses deterministic accumulated leaf visibility and recent-state metadata", () => {
    const result = skeleton();
    const twigById = new Map(result.leafTwigs.map((twig) => [twig.id, twig]));
    expect(result.leaves.every((leaf) => typeof leaf.visible === "boolean")).toBe(true);
    expect(
      result.leaves.every(
        (leaf) =>
          twigById.get(leaf.twigId)?.parentEntityId === leaf.goalId &&
          leaf.petiole.controlPoints[3].x === leaf.anchor.x &&
          leaf.petiole.controlPoints[3].y === leaf.anchor.y &&
          leaf.petiole.controlPoints[3].z === leaf.anchor.z &&
          Math.hypot(
            leaf.anchor.x - leaf.petiole.controlPoints[0].x,
            leaf.anchor.y - leaf.petiole.controlPoints[0].y,
            leaf.anchor.z - leaf.petiole.controlPoints[0].z
          ) <= .05 &&
          leaf.normal.y >= .75
      )
    ).toBe(true);
    expect(result.leaves.every((leaf) => leaf.scale <= 0.72)).toBe(true);
    expect(skeleton().leaves).toEqual(result.leaves);
  });

  it("keeps all accumulated leaves through 500 and replaces old leaves gradually above the cap", () => {
    const atCap = skeleton(stateWithAwsActivities(500));
    const aboveCap = skeleton(stateWithAwsActivities(600));
    const afterOneMore = skeleton(stateWithAwsActivities(601));
    const visibleIds = (result: ReturnType<typeof skeleton>) => new Set(
      result.leaves
        .filter((leaf) => leaf.goalId === "aws" && leaf.visible)
        .map((leaf) => leaf.activityId)
    );
    const atCapIds = visibleIds(atCap);
    const aboveCapIds = visibleIds(aboveCap);
    const afterOneMoreIds = visibleIds(afterOneMore);
    const retainedAfterOneMore = [...aboveCapIds]
      .filter((id) => afterOneMoreIds.has(id)).length;

    expect(atCapIds.size).toBe(500);
    expect(aboveCapIds.size).toBe(500);
    expect(afterOneMoreIds.size).toBe(500);
    expect(retainedAfterOneMore).toBeGreaterThanOrEqual(498);
    expect(stateWithAwsActivities(601).activities
      .filter((activity) => activity.goalId === "aws")).toHaveLength(601);
  });

  it("uses stable varied capacities from 5 to 20 without a tiny remainder twig", () => {
    const counts = [21, 41, 100].map((activityCount) => {
      const result = skeleton(stateWithAwsActivities(activityCount));
      const twigs = result.leafTwigs.filter(
        (twig) => twig.parentEntityId === "aws"
      );
      const leaves = result.leaves.filter((leaf) => leaf.goalId === "aws");
      const leafCounts = twigs.map((twig) =>
        leaves.filter((leaf) => leaf.twigId === twig.id).length
      );
      return { activityCount, twigCount: twigs.length, leafCounts };
    });

    for (const item of counts) {
      expect(item.leafCounts.reduce((sum, count) => sum + count, 0))
        .toBe(item.activityCount);
      expect(item.leafCounts.every((count) => count >= 5 && count <= 20))
        .toBe(true);
    }
    expect(new Set(counts.at(-1)!.leafCounts).size).toBeGreaterThan(1);
    expect(skeleton(stateWithAwsActivities(100)).leafTwigs)
      .toEqual(skeleton(stateWithAwsActivities(100)).leafTwigs);
  });

  it("shortens a fine twig when it carries fewer activity leaves", () => {
    const twigLength = (activityCount: number): number => {
      const twig = skeleton(stateWithAwsActivities(activityCount)).leafTwigs
        .find((item) => item.parentEntityId === "aws")!;
      const start = twig.controlPoints[0];
      const end = twig.controlPoints[3];
      return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    };

    expect(twigLength(3)).toBeLessThan(twigLength(8) * .8);
  });

  it("stratifies goal twigs across the secondary branch and rotates sectors", () => {
    const result = skeleton(stateWithAwsActivities(100));
    const twigs = result.leafTwigs.filter(
      (twig) => twig.parentEntityId === "aws"
    );
    const progresses = twigs.map((twig) => twig.attachmentProgress!);

    expect(twigs.length).toBeGreaterThan(5);
    expect(progresses.every((progress) => progress >= .25 && progress <= .9))
      .toBe(true);
    for (let index = 1; index < progresses.length; index += 1) {
      expect(progresses[index]! - progresses[index - 1]!)
        .toBeGreaterThanOrEqual(.06);
    }
    expect(new Set(twigs.map((twig) => twig.directionSector)).size).toBe(4);
    expect(new Set(twigs.map((twig) => JSON.stringify(twig.controlPoints[0]))).size)
      .toBe(twigs.length);
    expect(skeleton(stateWithAwsActivities(100)).leafTwigs).toEqual(result.leafTwigs);
  });

  it("keeps fine twigs outside the near-vertical up and down cones", () => {
    const twigs = skeleton(stateWithAwsActivities(100)).leafTwigs
      .filter((twig) => twig.parentEntityId === "aws");
    const verticalComponents = twigs.map((twig) => {
      const start = twig.controlPoints[0];
      const end = twig.controlPoints[3];
      const x = end.x - start.x;
      const y = end.y - start.y;
      const z = end.z - start.z;
      return y / Math.hypot(x, y, z);
    });

    expect(verticalComponents.every((y) => y <= Math.sin(Math.PI / 3)))
      .toBe(true);
    expect(verticalComponents.every((y) => y >= -Math.sin(Math.PI / 9)))
      .toBe(true);
  });

  it("places activity leaves on staggered opposite sides of their shared twig", () => {
    const result = skeleton(stateWithAwsActivities(20));
    const twig = result.leafTwigs.find((item) => item.parentEntityId === "aws")!;
    const leaves = result.leaves.filter(
      (leaf) => leaf.twigId === twig.id && leaf.visible
    );

    expect(Math.abs(
      leaves.filter((leaf) => leaf.side === -1).length
      - leaves.filter((leaf) => leaf.side === 1).length
    )).toBeLessThanOrEqual(1);
    expect(leaves.filter((leaf) => leaf.side === 0)).toHaveLength(1);
    expect(new Set(leaves.map((leaf) => JSON.stringify(leaf.petiole.controlPoints[0]))).size)
      .toBe(leaves.length);
    expect(new Set(leaves.map((leaf) => leaf.roll)).size).toBeGreaterThan(4);
    expect(leaves.every((leaf) => leaf.normal.y >= .75)).toBe(true);
    expect(leaves.every((leaf) => {
      const start = leaf.petiole.controlPoints[0];
      return Math.hypot(
        leaf.anchor.x - start.x,
        leaf.anchor.y - start.y,
        leaf.anchor.z - start.z
      ) <= .0351;
    })).toBe(true);
    expect(leaves.every((leaf) => {
      const petioleEnd = leaf.petiole.controlPoints[3];
      const midribStart = leaf.midrib.controlPoints[0];
      return (
        petioleEnd.x === leaf.anchor.x &&
        petioleEnd.y === leaf.anchor.y &&
        petioleEnd.z === leaf.anchor.z &&
        midribStart.x === leaf.anchor.x &&
        midribStart.y === leaf.anchor.y &&
        midribStart.z === leaf.anchor.z
      );
    })).toBe(true);
    expect(leaves.every((leaf) => leaf.normal.y >= .75)).toBe(true);
    expect(leaves.every((leaf) => {
      const tip = leaf.midrib.controlPoints[3];
      const undroopedTip = {
        x: leaf.anchor.x + leaf.direction.x * .36 * leaf.scale * .72,
        y: leaf.anchor.y + leaf.direction.y * .36 * leaf.scale * .72,
        z: leaf.anchor.z + leaf.direction.z * .36 * leaf.scale * .72
      };
      const droopAlongNormal =
        (undroopedTip.x - tip.x) * leaf.normal.x
        + (undroopedTip.y - tip.y) * leaf.normal.y
        + (undroopedTip.z - tip.z) * leaf.normal.z;
      return droopAlongNormal > .02;
    })).toBe(true);
  });

  it("aims every leaf tip forward at a 30 to 40 degree angle from its twig", () => {
    const result = skeleton(stateWithAwsActivities(20));
    const twig = result.leafTwigs.find((item) => item.parentEntityId === "aws")!;
    const leaves = result.leaves.filter(
      (leaf) => leaf.twigId === twig.id && leaf.visible
    );

    for (const leaf of leaves.filter((item) => !item.terminal)) {
      const dot =
        leaf.direction.x * leaf.twigTangent.x
        + leaf.direction.y * leaf.twigTangent.y
        + leaf.direction.z * leaf.twigTangent.z;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

      expect(dot).toBeGreaterThan(0);
      expect(angle).toBeGreaterThanOrEqual(29.9);
      expect(angle).toBeLessThanOrEqual(40.1);
    }
  });

  it("tapers every fine twig into exactly one forward terminal leaf", () => {
    const result = skeleton(stateWithAwsActivities(41));
    const twigs = result.leafTwigs.filter((item) => item.parentEntityId === "aws");

    for (const twig of twigs) {
      const leaves = result.leaves.filter((leaf) => leaf.twigId === twig.id);
      const terminalLeaves = leaves.filter((leaf) => leaf.terminal);

      expect(twig.tipRadius).toBeLessThanOrEqual(twig.baseRadius * .45);
      expect(terminalLeaves).toHaveLength(1);
      const terminal = terminalLeaves[0]!;
      expect(terminal.petiole.controlPoints[0]).toEqual(twig.controlPoints[3]);
      const dot =
        terminal.direction.x * terminal.twigTangent.x
        + terminal.direction.y * terminal.twigTangent.y
        + terminal.direction.z * terminal.twigTangent.z;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      expect(angle).toBeLessThanOrEqual(8.1);
    }
  });

  it("fills lateral leaves up to the short taper without isolating the terminal leaf", () => {
    const result = skeleton(stateWithAwsActivities(20));
    const twig = result.leafTwigs.find((item) => item.parentEntityId === "aws")!;
    const leaves = result.leaves.filter(
      (leaf) => leaf.twigId === twig.id && leaf.visible
    );
    const lateralProgresses = leaves
      .filter((leaf) => !leaf.terminal)
      .map((leaf) => leaf.twigProgress);

    expect(Math.min(...lateralProgresses)).toBeGreaterThan(.2);
    expect(Math.max(...lateralProgresses)).toBeGreaterThanOrEqual(.949);
    expect(Math.max(...lateralProgresses)).toBeLessThanOrEqual(.951);
    expect(1 - Math.max(...lateralProgresses)).toBeLessThanOrEqual(.051);
    expect(leaves.filter((leaf) => leaf.twigProgress > .951))
      .toEqual([expect.objectContaining({ terminal: true, twigProgress: 1 })]);
  });

  it("divides the 0.20 to 0.95 range by the actual lateral leaf count", () => {
    expect(activityLeafProgresses(3)).toEqual([.45, .7, .95]);
    expect(activityLeafProgresses(5)).toEqual([.35, .5, .65, .8, .95]);
  });

  it("does not reserve visible layout slots for hidden activities", () => {
    const result = skeleton(stateWithAwsActivities(20));
    const twig = result.leafTwigs.find((item) => item.parentEntityId === "aws")!;
    const visibleLeaves = result.leaves.filter(
      (leaf) => leaf.twigId === twig.id && leaf.visible
    );
    const lateral = visibleLeaves.filter((leaf) => !leaf.terminal);

    expect(visibleLeaves.filter((leaf) => leaf.terminal)).toHaveLength(1);
    expect(lateral.map((leaf) => leaf.twigProgress))
      .toEqual(activityLeafProgresses(lateral.length));
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
