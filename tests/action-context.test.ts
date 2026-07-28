import { describe, expect, it } from "vitest";
import { formatActionContext } from "@/src/actions/repository";

describe("formatActionContext", () => {
  it("formats profile defaults, goal aliases, and only open tasks for the GPT action", () => {
    const context = formatActionContext(
      {
        timezone: "Asia/Tokyo",
        default_reminder_time: "09:00:00"
      },
      [
        {
          id: "goal-aws",
          title: "AWS",
          category: "职业",
          parent_goal_id: "goal-career",
          metric_type: "duration",
          status: "active",
          created_at: "2026-07-01T00:00:00.000Z"
        }
      ],
      [{ goal_id: "goal-aws", alias: "云证书" }],
      [
        {
          id: "task-open",
          title: "复习 AWS",
          goal_id: "goal-aws",
          due_at: "2026-07-28T00:00:00.000Z",
          status: "open"
        },
        {
          id: "task-completed",
          title: "完成旧课程",
          goal_id: "goal-aws",
          due_at: null,
          status: "completed"
        }
      ],
      new Date("2026-07-27T00:15:00.000Z")
    );

    expect(context).toEqual({
      timezone: "Asia/Tokyo",
      defaultReminderTime: "09:00",
      currentTime: "2026-07-27 09:15:00 Asia/Tokyo",
      goals: [
        {
          id: "goal-aws",
          title: "AWS",
          category: "职业",
          parentGoalId: "goal-career",
          metricType: "duration",
          status: "active",
          createdAt: "2026-07-01T00:00:00.000Z"
        }
      ],
      aliases: [{ goalId: "goal-aws", alias: "云证书" }],
      openTasks: [
        {
          id: "task-open",
          title: "复习 AWS",
          goalId: "goal-aws",
          dueAt: "2026-07-28T00:00:00.000Z",
          status: "open"
        }
      ]
    });
  });

  it("accepts camel-case values from the memory store", () => {
    const context = formatActionContext(
      {
        timezone: "Asia/Tokyo",
        defaultReminderTime: "08:30"
      },
      [
        {
          id: "goal-health",
          title: "健康",
          category: "健康",
          parentGoalId: null,
          metricType: "count",
          status: "active",
          createdAt: "2026-07-02T00:00:00.000Z"
        }
      ],
      [{ goalId: "goal-health", alias: "运动" }],
      [
        {
          id: "task-run",
          title: "跑步",
          goalId: "goal-health",
          dueAt: null,
          status: "open"
        }
      ],
      new Date("2026-07-27T00:15:00.000Z")
    );

    expect(context).toMatchObject({
      defaultReminderTime: "08:30",
      goals: [{ parentGoalId: null, metricType: "count" }],
      aliases: [{ goalId: "goal-health", alias: "运动" }],
      openTasks: [{ goalId: "goal-health", dueAt: null, status: "open" }]
    });
  });

  it("normalizes display fields to strings and supplies the current time by default", () => {
    const context = formatActionContext(
      {
        timezone: "Asia/Tokyo",
        defaultReminderTime: "09:00"
      },
      [
        {
          id: 42,
          title: 100,
          category: null,
          parent_goal_id: null,
          metric_type: "count",
          status: null,
          created_at: "2026-07-02T00:00:00.000Z"
        }
      ],
      [{ goal_id: 42, alias: 900 }],
      [
        {
          id: 7,
          title: 8,
          goal_id: null,
          due_at: null,
          status: { toString: () => "open" }
        }
      ]
    );

    expect(context.goals[0]).toMatchObject({
      id: "42",
      title: "100",
      category: "",
      status: "active",
      parentGoalId: null
    });
    expect(context.aliases[0]).toEqual({ goalId: "42", alias: "900" });
    expect(context.openTasks[0]).toMatchObject({
      id: "7",
      title: "8",
      dueAt: null,
      status: "open"
    });
    expect(context.currentTime).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Asia\/Tokyo$/
    );
  });
});
