import { describe, expect, it } from "vitest";
import type { LifeEventBatchPayload } from "@/src/actions/batch-validation";
import {
  prepareLifeEventBatch,
  type BatchPreparationContext
} from "@/src/actions/batch-preparation";
import { hashCanonicalJson } from "@/src/actions/idempotency";

const context: BatchPreparationContext = {
  timezone: "Asia/Tokyo",
  defaultReminderTime: "09:00",
  abilities: [
    { id: "ability-frontend", title: "前端能力", status: "active" },
    { id: "ability-health", title: "健康能力", status: "active" }
  ],
  goals: [
    {
      id: "goal-aws",
      title: "AWS",
      goalType: "long_term",
      abilityId: "ability-frontend",
      status: "active"
    },
    {
      id: "goal-muscle",
      title: "增肌",
      goalType: "long_term",
      abilityId: "ability-health",
      status: "active"
    }
  ],
  aliases: [],
  openTasks: [
    {
      id: "task-shoulder",
      title: "练肩",
      goalId: "goal-muscle",
      dueAt: "2026-07-26T00:00:00.000Z",
      status: "open"
    },
    {
      id: "task-unassigned-running",
      title: "跑步",
      goalId: null,
      dueAt: "2026-07-26T00:00:00.000Z",
      status: "open"
    }
  ]
};

const now = new Date("2026-07-27T00:00:00.000Z");

function payload(events: LifeEventBatchPayload["events"]): LifeEventBatchPayload {
  return {
    idempotencyKey: "message-2026-07-27",
    rawText: "整理这些生活事件",
    events
  };
}

describe("hashCanonicalJson", () => {
  it("is stable across object key order while preserving array order", async () => {
    const first = await hashCanonicalJson({
      nested: { b: 2, a: 1 },
      events: ["task", "activity"]
    });
    const reorderedObject = await hashCanonicalJson({
      events: ["task", "activity"],
      nested: { a: 1, b: 2 }
    });
    const reorderedArray = await hashCanonicalJson({
      events: ["activity", "task"],
      nested: { a: 1, b: 2 }
    });

    expect(first).toBe(reorderedObject);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(reorderedArray);
  });

  it("orders Unicode keys independently of locale collation and insertion order", async () => {
    const composedFirst = Object.fromEntries([
      ["é", "composed"],
      ["e\u0301", "decomposed"]
    ]);
    const decomposedFirst = Object.fromEntries([
      ["e\u0301", "decomposed"],
      ["é", "composed"]
    ]);

    expect(await hashCanonicalJson(composedFirst)).toBe(
      await hashCanonicalJson(decomposedFirst)
    );
  });
});

describe("prepareLifeEventBatch", () => {
  it("prepares a resolved task and a metric-free matched activity", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "task",
          title: "学习 AWS",
          path: "goal",
          localDate: "2026-07-28",
          priority: "normal",
          confidence: 0.98,
          goal: { title: "AWS", explicit: true }
        },
        {
          type: "activity",
          summary: "练肩",
          occurredOn: "2026-07-26",
          confidence: 0.96,
          goal: { title: "增肌", explicit: true },
          taskMatch: {
            candidateTaskId: "task-shoulder",
            confidence: 0.95
          }
        }
      ]),
      context,
      now
    );

    expect(result).toMatchObject({
      idempotencyKey: "message-2026-07-27",
      rawText: "整理这些生活事件"
    });
    expect(result.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.events).toEqual([
      {
        kind: "task",
        title: "学习 AWS",
        goalId: "goal-aws",
        dueAt: "2026-07-28T00:00:00.000Z",
        remindAt: "2026-07-28T00:00:00.000Z",
        priority: "normal",
        plannedMetricType: null,
        plannedValue: null,
        plannedUnit: null,
        confidence: 0.98
      },
      {
        kind: "activity",
        summary: "练肩",
        goalId: "goal-muscle",
        matchedTaskId: "task-shoulder",
        metricType: "count",
        value: 1,
        unit: "count",
        occurredOn: "2026-07-26",
        confidence: 0.96
      }
    ]);
  });

  it("routes a missing explicit goal to inbox without blocking clear sibling events", async () => {
    const originalTask: LifeEventBatchPayload["events"][number] = {
      type: "task",
      path: "goal",
      title: "买牛奶",
      localDate: "2026-07-28",
      priority: "high",
      confidence: 0.9,
      goal: { title: "家庭", explicit: true },
      resolvesInboxItemId: "55555555-5555-4555-8555-555555555555"
    };

    const result = await prepareLifeEventBatch(
      payload([
        originalTask,
        {
          type: "task",
          path: "goal",
          title: "复习 AWS",
          localDate: "2026-07-28",
          priority: "low",
          confidence: 0.97,
          goal: { title: "AWS", explicit: true }
        }
      ]),
      context,
      now
    );

    expect(result.events[0]).toEqual({
      kind: "inbox",
      suggestedType: "task",
      reason: "explicit goal does not exist: 家庭",
      suggestedEvent: originalTask,
      confidence: 0.9,
      resolvesInboxItemId: "55555555-5555-4555-8555-555555555555"
    });
    expect(result.events[1]).toMatchObject({
      kind: "task",
      title: "复习 AWS",
      goalId: "goal-aws"
    });
  });

  it("allows a dependent task to reference a goal created earlier in the same batch", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "goal",
          goalType: "short_term",
          title: " 家庭 ",
          category: "生活",
          metricType: "count",
          aliases: [],
          confidence: 0.99
        },
        {
          type: "task",
          path: "goal",
          title: "买菜",
          localDate: "2026-07-28",
          priority: "normal",
          confidence: 0.94,
          goal: { title: "家庭", explicit: true }
        }
      ]),
      context,
      now
    );

    expect(result.events[0]).toEqual({
      kind: "goal",
      title: "家庭",
      category: "生活",
      goalType: "short_term",
      abilityId: null,
      metricType: "count",
      aliases: [],
      confidence: 0.99
    });
    expect(result.events[1]).toMatchObject({
      kind: "task",
      title: "买菜",
      goalId: null,
      goalTitle: "家庭"
    });
  });

  it("prepares a one-off task without resolving a goal and preserves its planned metric", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "task",
          path: "one_off",
          title: "买水",
          localDate: "2026-07-28",
          priority: "normal",
          metric: { type: "count", value: 2, unit: "count" },
          confidence: 0.96
        }
      ]),
      context,
      now
    );

    expect(result.events[0]).toMatchObject({
      kind: "task",
      title: "买水",
      goalId: null,
      plannedMetricType: "count",
      plannedValue: 2,
      plannedUnit: "count"
    });
  });

  it("resolves an ability created earlier in the same batch for a long-term goal", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "ability",
          title: "音乐能力",
          confidence: 0.99
        },
        {
          type: "goal",
          goalType: "long_term",
          title: "练琴",
          category: "兴趣",
          ability: { title: "音乐能力" },
          metricType: "duration",
          aliases: [],
          confidence: 0.98
        }
      ]),
      context,
      now
    );

    expect(result.events).toEqual([
      {
        kind: "ability",
        title: "音乐能力",
        confidence: 0.99
      },
      {
        kind: "goal",
        goalType: "long_term",
        title: "练琴",
        category: "兴趣",
        abilityId: null,
        abilityTitle: "音乐能力",
        metricType: "duration",
        aliases: [],
        confidence: 0.98
      }
    ]);
  });

  it("routes a forward ability reference to inbox", async () => {
    const goal = {
      type: "goal" as const,
      goalType: "long_term" as const,
      title: "练琴",
      category: "兴趣",
      ability: { title: "音乐能力" },
      metricType: "duration" as const,
      aliases: [],
      confidence: 0.98
    };
    const result = await prepareLifeEventBatch(
      payload([
        goal,
        { type: "ability", title: "音乐能力", confidence: 0.99 }
      ]),
      context,
      now
    );

    expect(result.events[0]).toEqual({
      kind: "inbox",
      suggestedType: "goal",
      reason: "ability does not exist: 音乐能力",
      suggestedEvent: goal,
      confidence: 0.98
    });
    expect(result.events[1]).toMatchObject({
      kind: "ability",
      title: "音乐能力"
    });
  });

  it("routes a persisted-title and earlier same-batch ability collision to inbox", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        { type: "ability", title: "前端能力", confidence: 0.99 },
        {
          type: "goal",
          goalType: "long_term",
          title: "学习架构",
          category: "职业",
          ability: { title: "前端能力" },
          metricType: "duration",
          aliases: [],
          confidence: 0.98
        }
      ]),
      context,
      now
    );

    expect(result.events[1]).toMatchObject({
      kind: "inbox",
      suggestedType: "goal",
      reason: "multiple active abilities match: 前端能力"
    });
  });

  it("keeps forward goal references in inbox when the goal appears later", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "task",
          path: "goal",
          title: "买菜",
          localDate: "2026-07-28",
          priority: "normal",
          confidence: 0.94,
          goal: { title: "家庭", explicit: true }
        },
        {
          type: "goal",
          goalType: "short_term",
          title: "家庭",
          category: "生活",
          metricType: "count",
          aliases: [],
          confidence: 0.99
        }
      ]),
      context,
      now
    );

    expect(result.events[0]).toMatchObject({
      kind: "inbox",
      suggestedType: "task",
      reason: "explicit goal does not exist: 家庭"
    });
    expect(result.events[1]).toMatchObject({
      kind: "goal",
      title: "家庭"
    });
  });

  it("routes task and activity to inbox when context and an earlier same-batch goal both match", async () => {
    const ambiguousContext: BatchPreparationContext = {
      ...context,
      goals: [
        ...context.goals,
        {
          id: "goal-household-system",
          title: "家务系统",
          goalType: "long_term",
          abilityId: "ability-health",
          status: "active"
        }
      ],
      aliases: [
        ...context.aliases,
        { goalId: "goal-household-system", alias: "家庭" }
      ]
    };

    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "goal",
          goalType: "short_term",
          title: "家庭",
          category: "生活",
          metricType: "count",
          aliases: [],
          confidence: 0.99
        },
        {
          type: "task",
          path: "goal",
          title: "买菜",
          localDate: "2026-07-28",
          priority: "normal",
          confidence: 0.94,
          goal: { title: "家庭", explicit: true }
        },
        {
          type: "activity",
          summary: "买菜",
          occurredOn: "2026-07-27",
          confidence: 0.95,
          goal: { title: "家庭", explicit: true }
        }
      ]),
      ambiguousContext,
      now
    );

    expect(result.events[1]).toMatchObject({
      kind: "inbox",
      suggestedType: "task",
      reason: "multiple active goals match: 家庭"
    });
    expect(result.events[2]).toMatchObject({
      kind: "inbox",
      suggestedType: "activity",
      reason: "multiple active goals match: 家庭"
    });
  });

  it("does not match an existing unassigned task to an activity under a same-batch goal", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "goal",
          goalType: "short_term",
          title: "健康",
          category: "生活",
          metricType: "count",
          aliases: [],
          confidence: 0.99
        },
        {
          type: "activity",
          summary: "跑步",
          occurredOn: "2026-07-26",
          confidence: 0.95,
          goal: { title: "健康", explicit: true },
          taskMatch: {
            candidateTaskId: "task-unassigned-running",
            confidence: 0.95
          }
        }
      ]),
      context,
      now
    );

    expect(result.events[1]).toMatchObject({
      kind: "activity",
      summary: "跑步",
      goalId: null,
      goalTitle: "健康",
      matchedTaskId: null
    });
  });

  it("normalizes a direct inbox event and preserves dismissal metadata", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "inbox",
          reason: "用户要求忽略",
          suggestedTypes: ["activity", "task"],
          resolution: "dismiss",
          resolvesInboxItemId: "44444444-4444-4444-8444-444444444444",
          confidence: 0.8
        }
      ]),
      context,
      now
    );

    expect(result.events[0]).toMatchObject({
      kind: "inbox",
      suggestedType: "activity",
      reason: "用户要求忽略",
      resolution: "dismiss",
      resolvesInboxItemId: "44444444-4444-4444-8444-444444444444",
      confidence: 0.8
    });
  });
});
