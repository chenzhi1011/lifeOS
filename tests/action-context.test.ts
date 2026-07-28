import { describe, expect, it, vi } from "vitest";
import {
  formatActionContext,
  readActionContext
} from "@/src/actions/repository";
import type { BatchPreparationContext } from "@/src/actions/batch-preparation";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    const preparationContext: BatchPreparationContext = context;

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
    expect(preparationContext.timezone).toBe("Asia/Tokyo");
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

  it("supplies the current time by default for valid context rows", () => {
    const context = formatActionContext(
      {
        timezone: "Asia/Tokyo",
        defaultReminderTime: "09:00"
      },
      [
        {
          id: "goal-42",
          title: "目标",
          category: "职业",
          parent_goal_id: null,
          metric_type: "count",
          status: "active",
          created_at: "2026-07-02T00:00:00.000Z"
        }
      ],
      [{ goal_id: "goal-42", alias: "别名" }],
      [
        {
          id: "task-7",
          title: "任务",
          goal_id: null,
          due_at: null,
          status: "open"
        }
      ]
    );

    expect(context.goals[0]).toMatchObject({
      id: "goal-42",
      title: "目标",
      category: "职业",
      parentGoalId: null
    });
    expect(context.aliases[0]).toEqual({ goalId: "goal-42", alias: "别名" });
    expect(context.openTasks[0]).toMatchObject({
      id: "task-7",
      title: "任务",
      dueAt: null,
      status: "open"
    });
    expect(context.currentTime).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Asia\/Tokyo$/
    );
  });

  it.each([
    [{ title: "missing id", status: "active" }, "a missing goal id"],
    [
      { id: "goal-invalid", title: "invalid status", status: "archived" },
      "an invalid goal status"
    ]
  ])("rejects %s (%s)", (goal, _description) => {
    expect(() =>
      formatActionContext(
        { timezone: "Asia/Tokyo", defaultReminderTime: "09:00" },
        [
          {
            category: "职业",
            parentGoalId: null,
            metricType: "count",
            createdAt: "2026-07-02T00:00:00.000Z",
            ...goal
          }
        ],
        [],
        []
      )
    ).toThrow("invalid action context");
  });
});

function createQueryBuilder(
  result: { data: unknown; error: { message: string } | null }
) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn()
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockResolvedValue(result);
  builder.single.mockResolvedValue(result);
  return builder;
}

describe("readActionContext", () => {
  it("scopes all four Supabase context queries to the authenticated user", async () => {
    const profile = createQueryBuilder({
      data: { timezone: "Asia/Tokyo", default_reminder_time: "09:00:00" },
      error: null
    });
    const goals = createQueryBuilder({ data: [], error: null });
    const aliases = createQueryBuilder({ data: [], error: null });
    const tasks = createQueryBuilder({ data: [], error: null });
    const builders = { profiles: profile, goals, goal_aliases: aliases, tasks };
    const from = vi.fn((table: keyof typeof builders) => builders[table]);

    await readActionContext(
      "user-123",
      { from } as unknown as SupabaseClient,
      new Date("2026-07-27T00:15:00.000Z")
    );

    expect(profile.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(goals.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(aliases.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(tasks.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(tasks.eq).toHaveBeenCalledWith("status", "open");
  });

  it("propagates a Supabase query error", async () => {
    const profile = createQueryBuilder({
      data: { timezone: "Asia/Tokyo", default_reminder_time: "09:00:00" },
      error: null
    });
    const goals = createQueryBuilder({ data: [], error: null });
    const aliases = createQueryBuilder({
      data: null,
      error: { message: "aliases unavailable" }
    });
    const tasks = createQueryBuilder({ data: [], error: null });
    const builders = { profiles: profile, goals, goal_aliases: aliases, tasks };
    const from = vi.fn((table: keyof typeof builders) => builders[table]);

    await expect(
      readActionContext(
        "user-123",
        { from } as unknown as SupabaseClient,
        new Date("2026-07-27T00:15:00.000Z")
      )
    ).rejects.toThrow("aliases unavailable");
  });
});
