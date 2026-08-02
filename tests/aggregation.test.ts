import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { createInitialState } from "@/src/domain/seed";
import type { Activity, Task } from "@/src/domain/types";

const asOf = new Date("2026-08-01T18:30:00Z");

function completedTask(
  id: string,
  completedAt: string,
  goalId: string | null = null,
  status: Task["status"] = "completed"
): Task {
  return {
    id,
    userId: "demo-user",
    goalId,
    messageId: `message-${id}`,
    title: id,
    status,
    dueAt: null,
    priority: "normal",
    plannedMetricType: null,
    plannedValue: null,
    plannedUnit: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    completedAt
  };
}

function activity(id: string, occurredOn: string): Activity {
  return {
    id,
    userId: "demo-user",
    goalId: "aws",
    taskId: null,
    messageId: `message-${id}`,
    summary: id,
    metricType: "count",
    value: 1,
    unit: "count",
    occurredOn,
    createdAt: `${occurredOn}T12:00:00.000Z`
  };
}

describe("dashboard aggregation", () => {
  it("builds user-scoped goal stats", () => {
    const data = buildDashboardData(createInitialState(), "demo-user", asOf);
    const aws = data.goalStats.find((stat) => stat.goalId === "aws");
    expect(aws?.activityCount).toBe(3);
    expect(aws?.totalValue).toBe(190);
    expect(aws?.intensity).toBeGreaterThan(0);
  });

  it("builds heatmap points by date", () => {
    const data = buildDashboardData(createInitialState(), "demo-user", asOf);
    expect(data.heatmap.some((point) => point.date === "2026-07-01" && point.count === 1)).toBe(true);
  });

  it("does not leak another user's data", () => {
    const data = buildDashboardData(createInitialState(), "other-user", asOf);
    expect(data.goalStats).toHaveLength(0);
    expect(data.recentActivities).toHaveLength(0);
  });

  it("returns complete dashboard collections without exposing unfinished todos", () => {
    const state = createInitialState();
    state.tasks.push(
      completedTask("at-window-start", "2026-07-03T00:00:00.000Z"),
      completedTask("before-window", "2026-07-02T23:59:59.999Z"),
      completedTask("goal-task", "2026-07-20T00:00:00.000Z", "aws"),
      completedTask("open-one-off", "2026-07-20T00:00:00.000Z", null, "open")
    );
    state.achievements.push({
      ...state.achievements[0]!,
      id: "legacy-achievement",
      shortGoalId: null
    });

    const data = buildDashboardData(state, "demo-user", asOf);

    expect(data.abilities).toEqual(state.abilities);
    expect(data.allActivities).toEqual(state.activities);
    expect(data.recentCompletedOneOffTasks.map((task) => task.id)).toEqual([
      "at-window-start"
    ]);
    expect(
      data.recentCompletedOneOffTasks.every(
        (task) => task.goalId === null && task.status === "completed"
      )
    ).toBe(true);
    expect(data.achievements.every((item) => item.shortGoalId !== null)).toBe(true);
  });

  it("uses an inclusive UTC 30-day activity window", () => {
    const state = createInitialState();
    state.activities = [
      activity("window-start", "2026-07-03"),
      activity("before-window", "2026-07-02"),
      activity("as-of-date", "2026-08-01"),
      activity("future", "2026-08-02")
    ];

    const data = buildDashboardData(state, "demo-user", asOf);

    expect(data.allActivities.map((item) => item.id)).toEqual([
      "window-start",
      "before-window",
      "as-of-date",
      "future"
    ]);
    expect(data.recentActivities.map((item) => item.id)).toEqual([
      "as-of-date",
      "window-start"
    ]);
    expect(data.goalStats.find((stat) => stat.goalId === "aws")?.activityCount).toBe(4);
  });
});
