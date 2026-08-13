import { describe, expect, it, vi } from "vitest";
import { formatActionContext, readActionContext } from "@/src/actions/repository";
import type { BatchPreparationContext } from "@/src/actions/batch-preparation";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("formatActionContext", () => {
  it("formats fixed life areas, aliases, and only open tasks", () => {
    const context = formatActionContext(
      { timezone: "Asia/Tokyo", default_reminder_time: "09:00:00" },
      [{
        id: "goal-aws",
        title: "AWS",
        category: "职业",
        parent_goal_id: null,
        goal_type: "long_term",
        life_area: "work",
        metric_type: "duration",
        status: "active",
        created_at: "2026-07-01T00:00:00.000Z"
      }],
      [{ goal_id: "goal-aws", alias: "云证书" }],
      [
        { id: "task-open", title: "复习 AWS", goal_id: "goal-aws", due_at: null, status: "open" },
        { id: "task-done", title: "旧课程", goal_id: "goal-aws", due_at: null, status: "completed" }
      ],
      new Date("2026-07-27T00:15:00.000Z")
    );
    const preparationContext: BatchPreparationContext = context;

    expect(context).toMatchObject({
      timezone: "Asia/Tokyo",
      defaultReminderTime: "09:00",
      currentTime: "2026-07-27 09:15:00 Asia/Tokyo",
      goals: [{ id: "goal-aws", goalType: "long_term", lifeArea: "work" }],
      aliases: [{ goalId: "goal-aws", alias: "云证书" }],
      openTasks: [{ id: "task-open", status: "open" }]
    });
    expect("abilities" in context).toBe(false);
    expect(preparationContext.goals[0]?.lifeArea).toBe("work");
  });

  it("rejects a goal with an unknown life area", () => {
    expect(() => formatActionContext(
      { timezone: "Asia/Tokyo", defaultReminderTime: "09:00" },
      [{
        id: "goal-1",
        title: "目标",
        category: "职业",
        parentGoalId: null,
        goalType: "short_term",
        lifeArea: "career",
        metricType: "count",
        status: "active",
        createdAt: "2026-07-01T00:00:00.000Z"
      }],
      [],
      []
    )).toThrow("invalid action context");
  });
});

function createQueryBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn() };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockResolvedValue(result);
  builder.single.mockResolvedValue(result);
  return builder;
}

describe("readActionContext", () => {
  it("scopes all four context queries to the authenticated user", async () => {
    const profile = createQueryBuilder({ data: { timezone: "Asia/Tokyo", default_reminder_time: "09:00:00" }, error: null });
    const goals = createQueryBuilder({ data: [], error: null });
    const aliases = createQueryBuilder({ data: [], error: null });
    const tasks = createQueryBuilder({ data: [], error: null });
    const builders = { profiles: profile, goals, goal_aliases: aliases, tasks };
    const from = vi.fn((table: keyof typeof builders) => builders[table]);

    await readActionContext("user-123", { from } as unknown as SupabaseClient);

    expect(from.mock.calls.map(([table]) => table)).toEqual(["profiles", "goals", "goal_aliases", "tasks"]);
    for (const builder of Object.values(builders)) {
      expect(builder.eq).toHaveBeenCalledWith("user_id", "user-123");
    }
    expect(tasks.eq).toHaveBeenCalledWith("status", "open");
  });

  it("propagates a Supabase query error", async () => {
    const profile = createQueryBuilder({ data: { timezone: "Asia/Tokyo" }, error: null });
    const goals = createQueryBuilder({ data: [], error: null });
    const aliases = createQueryBuilder({ data: null, error: { message: "aliases unavailable" } });
    const tasks = createQueryBuilder({ data: [], error: null });
    const builders = { profiles: profile, goals, goal_aliases: aliases, tasks };

    await expect(readActionContext(
      "user-123",
      { from: vi.fn((table: keyof typeof builders) => builders[table]) } as unknown as SupabaseClient
    )).rejects.toThrow("aliases unavailable");
  });
});
