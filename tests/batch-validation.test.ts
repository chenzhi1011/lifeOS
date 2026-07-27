import { ZodError } from "zod";
import { describe, expect, it } from "vitest";
import { validateLifeEventBatchPayload } from "@/src/actions/batch-validation";

const candidateGoalId = "11111111-1111-4111-8111-111111111111";

function validTask(index: number) {
  return {
    type: "task",
    confidence: 0.94,
    title: `任务-${index}`,
    localDate: "2026-07-28",
    priority: "normal",
    goal: {
      title: "AWS",
      explicit: true,
      candidateGoalId,
      matchConfidence: 1
    }
  };
}

describe("validateLifeEventBatchPayload", () => {
  it("parses mixed events while preserving their source order", () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "batch-mixed-1",
      rawText: "明天学习 AWS，今天练了肩",
      events: [
        validTask(1),
        {
          type: "activity",
          confidence: 0.91,
          summary: "练肩",
          occurredOn: "2026-07-26",
          goal: {
            title: "增肌",
            explicit: false,
            candidateGoalId: "22222222-2222-4222-8222-222222222222",
            matchConfidence: 0.9
          }
        }
      ]
    });

    expect(payload.events.map((event) => event.type)).toEqual(["task", "activity"]);
  });

  it("accepts exactly 20 events", () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "batch-20",
      rawText: "二十个任务",
      events: Array.from({ length: 20 }, (_, index) => validTask(index))
    });

    expect(payload.events).toHaveLength(20);
  });

  it("applies goal and task defaults", () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "batch-defaults",
      rawText: "创建增肌目标，明天练肩",
      events: [
        {
          type: "goal",
          confidence: 0.97,
          title: "增肌",
          category: "健康"
        },
        {
          type: "task",
          confidence: 0.92,
          title: "练肩",
          localDate: "2026-07-28"
        }
      ]
    });

    expect(payload.events[0]).toMatchObject({
      type: "goal",
      metricType: "count",
      aliases: []
    });
    expect(payload.events[1]).toMatchObject({
      type: "task",
      priority: "normal"
    });
  });

  it("accepts a strict activity metric", () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "batch-activity-metric",
      rawText: "今天练肩 40 分钟",
      events: [
        {
          type: "activity",
          confidence: 0.91,
          summary: "练肩",
          occurredOn: "2026-07-26",
          metric: { type: "duration", value: 40, unit: "minute" }
        }
      ]
    });

    expect(payload.events[0]).toMatchObject({
      type: "activity",
      metric: { type: "duration", value: 40, unit: "minute" }
    });
  });

  it("rejects a goal reference without a title or candidate id", () => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "batch-invalid-goal-reference",
        rawText: "明天学习",
        events: [
          {
            type: "task",
            confidence: 0.9,
            title: "学习",
            localDate: "2026-07-28",
            goal: { explicit: true }
          }
        ]
      })
    ).toThrow(/goal reference requires title or candidateGoalId/);
  });

  it("requires an inbox id when dismissing an inbox item", () => {
    expect.assertions(2);

    try {
      validateLifeEventBatchPayload({
        idempotencyKey: "batch-invalid-dismiss",
        rawText: "忽略这个收件箱项目",
        events: [
          {
            type: "inbox",
            confidence: 0.98,
            reason: "用户要求忽略",
            suggestedTypes: ["inbox"],
            resolution: "dismiss"
          }
        ]
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      if (!(error instanceof ZodError)) {
        return;
      }
      expect(error.issues.map((issue) => issue.path)).toContainEqual([
        "events",
        0,
        "resolvesInboxItemId"
      ]);
    }
  });

  it("accepts dismissing an identified inbox item", () => {
    const resolvesInboxItemId = "33333333-3333-4333-8333-333333333333";
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "batch-valid-dismiss",
      rawText: "忽略这个收件箱项目",
      events: [
        {
          type: "inbox",
          confidence: 0.98,
          reason: "用户要求忽略",
          suggestedTypes: ["inbox"],
          resolution: "dismiss",
          resolvesInboxItemId
        }
      ]
    });

    expect(payload.events[0]).toMatchObject({ type: "inbox", resolution: "dismiss", resolvesInboxItemId });
  });

  it.each([
    ["an empty event list", []],
    ["more than 20 events", Array.from({ length: 21 }, (_, index) => validTask(index))]
  ])("rejects %s", (_description, events) => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "batch-invalid-size",
        rawText: "无效批量",
        events
      })
    ).toThrow();
  });

  it("rejects userId at the payload and event levels", () => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "batch-top-level-user",
        rawText: "明天学习 AWS",
        userId: "attacker",
        events: [validTask(1)]
      })
    ).toThrow(/Unrecognized key/);

    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "batch-event-user",
        rawText: "明天学习 AWS",
        events: [{ ...validTask(1), userId: "attacker" }]
      })
    ).toThrow(/Unrecognized key/);
  });
});
