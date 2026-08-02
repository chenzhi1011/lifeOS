import { describe, expect, it } from "vitest";
import type { DashboardData } from "@/src/domain/aggregation";
import { buildGrowthTreeViewModel } from "@/src/domain/tree-visualization";
import type { Ability, Activity, Goal, Task } from "@/src/domain/types";

const asOf = new Date("2026-08-01T18:30:00.000Z");
const userId = "demo-user";

function ability(id: string, status: Ability["status"] = "active"): Ability {
  return {
    id,
    userId,
    title: id === "ability-a" ? "能力 A" : "能力 B",
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: status === "archived" ? "2026-07-01T00:00:00.000Z" : null
  };
}

function goal(
  id: string,
  goalType: Goal["goalType"],
  abilityId: string | null,
  status: Goal["status"] = "active"
): Goal {
  return {
    id,
    userId,
    title: id,
    category: "test",
    parentGoalId: null,
    goalType,
    abilityId,
    metricType: goalType === "short_term" ? "milestone" : "duration",
    status,
    dueAt: null,
    completedAt:
      status === "completed" ? "2026-07-20T00:00:00.000Z" : null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function activity(
  id: string,
  goalId: string,
  occurredOn: string,
  value: number
): Activity {
  return {
    id,
    userId,
    goalId,
    taskId: null,
    messageId: `message-${id}`,
    summary: id,
    metricType: "count",
    value,
    unit: "count",
    occurredOn,
    createdAt: `${occurredOn}T12:00:00.000Z`
  };
}

function oneOffTask(id: string, completedAt: string): Task {
  return {
    id,
    userId,
    goalId: null,
    messageId: `message-${id}`,
    title: id,
    status: "completed",
    dueAt: null,
    priority: "normal",
    plannedMetricType: null,
    plannedValue: null,
    plannedUnit: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    completedAt
  };
}

function fixture(): DashboardData {
  const allActivities = [
    activity("activity-recent", "long-active", "2026-08-01", 1),
    activity("activity-history", "long-completed", "2026-06-01", 100)
  ];
  return {
    abilities: [ability("ability-b"), ability("ability-a")],
    goals: [
      goal("long-active", "long_term", "ability-b"),
      goal("long-completed", "long_term", "ability-a", "completed"),
      goal("short-active", "short_term", null),
      goal("short-completed", "short_term", null, "completed"),
      goal("legacy", null, null),
      goal("missing-ability", "long_term", null),
      goal("bad-ability", "long_term", "ability-missing")
    ],
    goalStats: [],
    allActivities,
    recentActivities: [allActivities[0]!],
    recentCompletedOneOffTasks: [
      oneOffTask("oneoff-recent", "2026-08-01T08:00:00.000Z"),
      oneOffTask("oneoff-history", "2026-06-01T08:00:00.000Z")
    ],
    achievements: [],
    heatmap: [],
    inboxCount: 0
  };
}

describe("buildGrowthTreeViewModel", () => {
  it("projects valid growth entities without losing diagnostics", () => {
    const model = buildGrowthTreeViewModel(fixture(), asOf);

    expect(model.root.label).toBe("人生");
    expect(model.abilityBranches.map((branch) => branch.entityId)).toEqual([
      "ability-a",
      "ability-b"
    ]);
    expect(model.longGoalTwigs.map((twig) => twig.entityId)).toEqual([
      "long-completed",
      "long-active"
    ]);
    expect(model.longGoalTwigs.find((twig) => twig.entityId === "long-completed")?.status).toBe(
      "completed"
    );
    expect(model.shortGoalBranches.map((branch) => branch.entityId)).toEqual([
      "short-active"
    ]);
    expect(model.activityLeaves.map((leaf) => leaf.activityId)).toEqual([
      "activity-recent"
    ]);
    expect(model.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "untyped_goal", entityId: "legacy" }),
        expect.objectContaining({ code: "missing_ability", entityId: "missing-ability" }),
        expect.objectContaining({ code: "invalid_ability", entityId: "bad-ability" })
      ])
    );
  });

  it("is deterministic and uses historical totals monotonically for wood thickness", () => {
    const data = fixture();
    const first = buildGrowthTreeViewModel(data, asOf);
    const second = buildGrowthTreeViewModel(data, asOf);
    const active = first.longGoalTwigs.find((twig) => twig.entityId === "long-active")!;
    const completed = first.longGoalTwigs.find(
      (twig) => twig.entityId === "long-completed"
    )!;

    expect(second).toEqual(first);
    expect(completed.thickness).toBeGreaterThan(active.thickness);
  });

  it("rejects an invalid asOf date with a clear error", () => {
    expect(() =>
      buildGrowthTreeViewModel(fixture(), new Date(Number.NaN))
    ).toThrow(/valid asOf date/);
  });

  it("diagnoses invalid activity values without contaminating valid wood geometry", () => {
    const data = fixture();
    data.allActivities.push(
      activity("activity-nan", "long-active", "2026-08-01", Number.NaN),
      activity("activity-infinity", "long-active", "2026-08-01", Number.POSITIVE_INFINITY),
      activity("activity-zero", "long-active", "2026-08-01", 0),
      activity("activity-negative", "long-active", "2026-08-01", -1)
    );

    const model = buildGrowthTreeViewModel(data, asOf);
    const wood = [
      model.root,
      ...model.abilityBranches,
      ...model.longGoalTwigs,
      ...model.shortGoalBranches
    ];

    expect(model.longGoalTwigs.some((twig) => twig.entityId === "long-active")).toBe(true);
    expect(model.activityLeaves.map((leaf) => leaf.activityId)).toEqual([
      "activity-recent"
    ]);
    expect(model.diagnostics).toEqual(
      expect.arrayContaining(
        ["activity-nan", "activity-infinity", "activity-zero", "activity-negative"].map(
          (entityId) =>
            expect.objectContaining({ code: "invalid_activity_value", entityId })
        )
      )
    );
    for (const segment of wood) {
      expect(Number.isFinite(segment.thickness)).toBe(true);
      expect(Object.values(segment.start).every(Number.isFinite)).toBe(true);
      expect(Object.values(segment.end).every(Number.isFinite)).toBe(true);
    }
  });
});
