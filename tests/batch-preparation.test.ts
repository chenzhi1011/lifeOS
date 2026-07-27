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
  goals: [
    { id: "goal-aws", title: "AWS", status: "active" },
    { id: "goal-muscle", title: "增肌", status: "active" }
  ],
  aliases: [],
  openTasks: [
    {
      id: "task-shoulder",
      title: "练肩",
      goalId: "goal-muscle",
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
});

describe("prepareLifeEventBatch", () => {
  it("prepares a resolved task and a metric-free matched activity", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "task",
          title: "学习 AWS",
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
          title: " 家庭 ",
          category: "生活",
          metricType: "count",
          aliases: [],
          confidence: 0.99
        },
        {
          type: "task",
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
      parentGoalId: null,
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

  it("keeps forward goal references in inbox when the goal appears later", async () => {
    const result = await prepareLifeEventBatch(
      payload([
        {
          type: "task",
          title: "买菜",
          localDate: "2026-07-28",
          priority: "normal",
          confidence: 0.94,
          goal: { title: "家庭", explicit: true }
        },
        {
          type: "goal",
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
