import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { createInitialState } from "@/src/domain/seed";
import { buildGrowthTreeScene } from "@/src/domain/tree-visualization";
import type { Activity, Goal } from "@/src/domain/types";

function goal(id: string, parentGoalId: string | null, title = id): Goal {
  return {
    id,
    userId: "demo-user",
    title,
    category: id === "root" ? "root" : "test",
    parentGoalId,
    goalType: null,
    abilityId: null,
    metricType: "count",
    status: "active",
    dueAt: null,
    completedAt: null,
    createdAt: `2026-07-01T00:00:00.000Z-${id}`
  };
}

function activity(id: string, goalId: string, occurredOn: string): Activity {
  return {
    id,
    userId: "demo-user",
    goalId,
    taskId: null,
    messageId: "test",
    summary: id,
    metricType: "count",
    value: 1,
    unit: "count",
    occurredOn,
    createdAt: `${occurredOn}T00:00:00.000Z`
  };
}

describe("buildGrowthTreeScene", () => {
  it("maps goals and stats into a growth tree scene model", () => {
    const state = createInitialState();
    state.goals = [
      goal("life", null, "人生"),
      goal("career", "life", "职业"),
      goal("health", "life", "健康"),
      goal("interest", "life", "兴趣"),
      goal("wealth", "life", "财富"),
      goal("aws", "career", "AWS"),
      goal("ai", "career", "AI"),
      goal("job-change", "career", "转职"),
      goal("portfolio-launch", "career", "作品集上线"),
      goal("muscle", "health", "增肌")
    ];
    const dashboard = buildDashboardData(state, "demo-user");
    const scene = buildGrowthTreeScene(dashboard.goals, dashboard.goalStats, dashboard.recentActivities);

    expect(scene.root?.label).toBe("人生");
    expect(scene.branches.filter((branch) => branch.depth === 1).map((branch) => branch.label)).toEqual(["职业", "健康", "兴趣", "财富"]);
    expect(scene.branches.some((branch) => branch.goalId === "aws" && branch.activityCount === 3)).toBe(true);
    expect(scene.leaves.some((leaf) => leaf.goalId === "aws" && leaf.activities.length === 3)).toBe(true);
  });

  it("uses stable positions for repeated renders", () => {
    const dashboard = buildDashboardData(createInitialState(), "demo-user");
    const first = buildGrowthTreeScene(dashboard.goals, dashboard.goalStats, dashboard.recentActivities);
    const second = buildGrowthTreeScene(dashboard.goals, dashboard.goalStats, dashboard.recentActivities);

    expect(first.branches.map((branch) => [branch.startPosition, branch.endPosition])).toEqual(
      second.branches.map((branch) => [branch.startPosition, branch.endPosition])
    );
    expect(first.leaves.map((leaf) => leaf.position)).toEqual(second.leaves.map((leaf) => leaf.position));
  });

  it("renders goal branches through depth three and excludes deeper goals", () => {
    const goals = [
      goal("root", null),
      goal("level-1", "root"),
      goal("level-2", "level-1"),
      goal("level-3", "level-2"),
      goal("level-4", "level-3")
    ];

    const scene = buildGrowthTreeScene(goals, [], []);

    expect(scene.root?.goalId).toBe("root");
    expect(scene.branches.map((branch) => [branch.goalId, branch.depth])).toEqual([
      ["level-1", 1],
      ["level-2", 2],
      ["level-3", 3]
    ]);
    expect(scene.branches.some((branch) => branch.goalId === "level-4")).toBe(false);
  });

  it("does not render goals whose parent is missing", () => {
    const scene = buildGrowthTreeScene([goal("root", null), goal("orphan", "missing-parent")], [], []);

    expect(scene.branches).toHaveLength(0);
  });

  it("groups ordered activities into non-empty leaves of at most five", () => {
    const goals = [goal("root", null), goal("career", "root")];
    const activities = Array.from({ length: 12 }, (_, index) =>
      activity(`activity-${index}`, "career", `2026-07-${String(index + 1).padStart(2, "0")}`)
    );

    const scene = buildGrowthTreeScene(goals, [], activities);
    const leaves = scene.leaves.filter((leaf) => leaf.goalId === "career");

    expect(leaves.map((leaf) => leaf.activities.length)).toEqual([5, 5, 2]);
    expect(leaves.flatMap((leaf) => leaf.activities).map((item) => item.id)).toEqual(
      [...activities].reverse().map((item) => item.id)
    );
  });

  it("does not create leaves for hidden goals", () => {
    const goals = [
      goal("root", null),
      goal("level-1", "root"),
      goal("level-2", "level-1"),
      goal("level-3", "level-2"),
      goal("level-4", "level-3")
    ];
    const scene = buildGrowthTreeScene(goals, [], [activity("hidden", "level-4", "2026-07-01")]);

    expect(scene.leaves).toHaveLength(0);
  });
});
