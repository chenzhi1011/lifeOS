import { describe, expect, it } from "vitest";
import type { DashboardData } from "@/src/domain/aggregation";
import { buildGrowthTreeViewModel } from "@/src/domain/tree-visualization";
import type { Activity, Goal, Task } from "@/src/domain/types";
import { LIFE_AREA_IDS } from "@/src/domain/life-areas";

const asOf = new Date("2026-08-01T18:30:00.000Z");
const userId = "demo-user";
function goal(id: string, goalType: Goal["goalType"], lifeArea: Goal["lifeArea"], status: Goal["status"] = "active"): Goal {
  return { id, userId, title: id, category: "test", parentGoalId: null, goalType, lifeArea,
    metricType: goalType === "short_term" ? "milestone" : "duration", status, dueAt: null,
    completedAt: status === "completed" ? "2026-07-20T00:00:00.000Z" : null,
    createdAt: "2026-01-01T00:00:00.000Z" };
}
function activity(id: string, goalId: string, occurredOn: string, value: number): Activity {
  return { id, userId, goalId, taskId: null, messageId: `message-${id}`, summary: id,
    metricType: "count", value, unit: "count", occurredOn, createdAt: `${occurredOn}T12:00:00.000Z` };
}
function oneOffTask(id: string): Task {
  return { id, userId, goalId: null, messageId: `message-${id}`, title: id, status: "completed",
    dueAt: null, priority: "normal", plannedMetricType: null, plannedValue: null, plannedUnit: null,
    createdAt: "2026-07-01T00:00:00.000Z", completedAt: "2026-08-01T08:00:00.000Z" };
}
function fixture(): DashboardData {
  const allActivities = [activity("activity-recent", "long-active", "2026-08-01", 1), activity("activity-history", "long-completed", "2026-06-01", 100)];
  return { goals: [goal("long-active", "long_term", "health"), goal("long-completed", "long_term", "growth", "completed"), goal("short-active", "short_term", "work"), goal("short-completed", "short_term", "life", "completed")],
    goalStats: [], allActivities, recentActivities: [allActivities[0]!], recentCompletedOneOffTasks: [oneOffTask("oneoff-recent")], achievements: [], heatmap: [], inboxCount: 0 };
}

describe("buildGrowthTreeViewModel", () => {
  it("always projects exactly seven fixed life-area branches", () => {
    const model = buildGrowthTreeViewModel(fixture(), asOf);
    expect(model.root.label).toBe("人生");
    expect(model.recipe.seed).toBeTypeOf("number");
    expect(model.branches.filter((branch) => branch.entityType === "life_area")).toHaveLength(7);
    expect(model.branches.find((branch) => branch.entityId === "long-active")?.parentEntityId).toBe("health");
    expect(model.lifeAreaBranches.map((branch) => branch.entityId)).toEqual(LIFE_AREA_IDS);
    expect(model.longGoalTwigs.map((twig) => twig.entityId)).toEqual(["long-completed", "long-active"]);
    expect(model.shortGoalBranches.map((branch) => branch.entityId)).toEqual(["short-active"]);
    expect(model.activityLeaves.map((leaf) => leaf.activityId)).toEqual(["activity-recent"]);
  });

  it("is deterministic and historical totals increase wood thickness", () => {
    const data = fixture();
    const first = buildGrowthTreeViewModel(data, asOf);
    expect(buildGrowthTreeViewModel(data, asOf)).toEqual(first);
    expect(first.longGoalTwigs.find((item) => item.entityId === "long-completed")!.thickness)
      .toBeGreaterThan(first.longGoalTwigs.find((item) => item.entityId === "long-active")!.thickness);
  });

  it("rejects invalid dates and diagnoses invalid activity values", () => {
    expect(() => buildGrowthTreeViewModel(fixture(), new Date(Number.NaN))).toThrow(/valid asOf date/);
    const data = fixture();
    data.allActivities.push(activity("bad", "long-active", "2026-08-01", Number.NaN));
    expect(buildGrowthTreeViewModel(data, asOf).diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid_activity_value", entityId: "bad" })
    );
  });
});
