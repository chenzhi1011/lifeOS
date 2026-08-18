import { describe, expect, it } from "vitest";

import { prepareLifeEventBatch } from "@/src/actions/batch-preparation";
import { validateLifeEventBatchPayload } from "@/src/actions/batch-validation";

const context = {
  timezone: "Asia/Tokyo",
  defaultReminderTime: "09:00",
  goals: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "每周跑步",
      goalType: "long_term" as const,
      lifeArea: "health" as const,
      metricType: "duration" as const,
      status: "active" as const
    }
  ],
  aliases: [
    {
      goalId: "11111111-1111-4111-8111-111111111111",
      alias: "跑步"
    }
  ],
  openTasks: []
};

describe("prepareLifeEventBatch", () => {
  it("prepares goals with their fixed life area", async () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "goal-life-area",
      rawText: "创建跑步目标",
      events: [
        {
          type: "goal",
          goalType: "long_term",
          lifeArea: "health",
          title: "每周跑步",
          metricType: "count",
          aliases: ["跑步"],
          confidence: 0.99
        }
      ]
    });

    const prepared = await prepareLifeEventBatch(payload, context);

    expect(prepared.events[0]).toMatchObject({
      kind: "goal",
      goalType: "long_term",
      lifeArea: "health",
      title: "每周跑步"
    });
    expect(prepared.events[0]).not.toHaveProperty("abilityId");
  });

  it("prepares default, disabled, and custom reminders without changing task classification", async () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "task-reminders",
      rawText: "安排跑步",
      events: [
        {
          type: "task",
          path: "goal",
          title: "跑步",
          localDate: "2026-08-14",
          goal: { title: "跑步", explicit: true },
          reminder: { mode: "default" },
          confidence: 0.95
        },
        {
          type: "task",
          path: "one_off",
          title: "买水",
          localDate: "2026-08-14",
          reminder: { mode: "none" },
          confidence: 0.95
        },
        {
          type: "task",
          path: "one_off",
          title: "打电话",
          localDate: "2026-08-14",
          reminder: {
            mode: "custom",
            remindAt: "2026-08-14T07:30:00+09:00",
            repeatRule: "weekly"
          },
          confidence: 0.95
        }
      ]
    });

    const prepared = await prepareLifeEventBatch(
      payload,
      context,
      new Date("2026-08-13T00:00:00Z")
    );

    expect(prepared.events[0]).toMatchObject({
      kind: "task",
      goalId: "11111111-1111-4111-8111-111111111111",
      remindAt: "2026-08-14T00:00:00.000Z",
      repeatRule: "none"
    });
    expect(prepared.events[1]).toMatchObject({
      kind: "task",
      goalId: null,
      remindAt: null,
      repeatRule: null
    });
    expect(prepared.events[2]).toMatchObject({
      kind: "task",
      goalId: null,
      remindAt: "2026-08-14T07:30:00+09:00",
      repeatRule: "weekly"
    });
  });

  it("resolves a same-batch goal for a later task", async () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "same-batch-goal",
      rawText: "准备考试并复习",
      events: [
        {
          type: "goal",
          goalType: "short_term",
          lifeArea: "growth",
          title: "通过考试",
          confidence: 0.99
        },
        {
          type: "task",
          path: "goal",
          title: "复习",
          localDate: "2026-08-14",
          goal: { title: "通过考试", explicit: true },
          reminder: { mode: "none" },
          confidence: 0.95
        }
      ]
    });

    const prepared = await prepareLifeEventBatch(payload, {
      ...context,
      goals: [],
      aliases: []
    });

    expect(prepared.events[1]).toMatchObject({
      kind: "task",
      goalId: null,
      goalTitle: "通过考试"
    });
  });

  it("sends an activity without a resolvable goal to inbox", async () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "activity-inbox",
      rawText: "练习了 30 分钟",
      events: [
        {
          type: "activity",
          summary: "练习了 30 分钟",
          occurredOn: "2026-08-13",
          metric: { type: "duration", value: 30, unit: "minute" },
          confidence: 0.8
        }
      ]
    });

    const prepared = await prepareLifeEventBatch(payload, context);

    expect(prepared.events[0]).toMatchObject({
      kind: "inbox",
      suggestedType: "activity",
      reason: "activity requires a goal"
    });
  });

  it("normalizes duration metrics to minutes before persistence", async () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "canonical-duration",
      rawText: "跑步一个半小时",
      events: [{
        type: "activity",
        summary: "跑步",
        occurredOn: "2026-08-13",
        goal: { candidateGoalId: context.goals[0]!.id, explicit: true, matchConfidence: 1 },
        metric: { type: "duration", value: 1.5, unit: "hour" },
        confidence: 0.99
      }]
    });

    const prepared = await prepareLifeEventBatch(payload, context);

    expect(prepared.events[0]).toMatchObject({
      kind: "activity",
      metricType: "duration",
      value: 90,
      unit: "minute"
    });
  });

  it("routes metrics that cannot satisfy the goal contract to inbox", async () => {
    const goal = { candidateGoalId: context.goals[0]!.id, explicit: true, matchConfidence: 1 };
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "goal-metric-contract",
      rawText: "记录跑步",
      events: [
        {
          type: "activity",
          summary: "跑步一次",
          occurredOn: "2026-08-13",
          goal,
          metric: { type: "count", value: 1, unit: "count" },
          confidence: 0.99
        },
        {
          type: "activity",
          summary: "跑步",
          occurredOn: "2026-08-13",
          goal,
          confidence: 0.99
        },
        {
          type: "task",
          path: "goal",
          title: "跑步一次",
          localDate: "2026-08-14",
          goal,
          metric: { type: "count", value: 1, unit: "count" },
          confidence: 0.99
        }
      ]
    });

    const prepared = await prepareLifeEventBatch(payload, context);

    expect(prepared.events.map((event) => event.kind)).toEqual(["inbox", "inbox", "inbox"]);
    expect(prepared.events[0]).toMatchObject({ reason: "activity metric_type must match its goal metric_type" });
    expect(prepared.events[1]).toMatchObject({ reason: "duration activity requires an explicit duration metric" });
    expect(prepared.events[2]).toMatchObject({ reason: "task metric_type must match its goal metric_type" });
  });
});
