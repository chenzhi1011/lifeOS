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
    path: "goal",
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
          goalType: "short_term",
          confidence: 0.97,
          title: "增肌",
          category: "健康"
        },
        {
          type: "task",
          confidence: 0.92,
          title: "练肩",
          localDate: "2026-07-28",
          path: "one_off"
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
      path: "one_off",
      priority: "normal"
    });
  });

  it.each([
    [
      {
        path: "one_off",
        goal: { title: "AWS", explicit: true }
      },
      "one_off forbids goal"
    ],
    [{ path: "goal" }, "goal path requires goal"]
  ])("rejects an inconsistent task path: %o", (extra, message) => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "task-path",
        rawText: "测试",
        events: [
          {
            type: "task",
            confidence: 0.9,
            title: "学习",
            localDate: "2026-08-01",
            priority: "normal",
            ...extra
          }
        ]
      })
    ).toThrow(message);
  });

  it("accepts an ability followed by a typed long-term goal", () => {
    const parsed = validateLifeEventBatchPayload({
      idempotencyKey: "ability-goal",
      rawText: "培养前端能力并学习架构",
      events: [
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
      ]
    });

    expect(parsed.events.map((event) => event.type)).toEqual([
      "ability",
      "goal"
    ]);
  });

  it.each([
    [
      {
        type: "goal",
        goalType: "long_term",
        title: "学习架构",
        category: "职业",
        confidence: 0.98
      },
      "long_term goal requires ability"
    ],
    [
      {
        type: "goal",
        goalType: "short_term",
        title: "通过考试",
        category: "职业",
        ability: { title: "前端能力" },
        confidence: 0.98
      },
      "short_term goal forbids ability"
    ]
  ])("rejects an inconsistent typed goal: %o", (event, message) => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "typed-goal",
        rawText: "测试目标",
        events: [event]
      })
    ).toThrow(message);
  });

  it.each([
    {},
    { title: "   " },
    { id: "not-a-uuid" }
  ])("rejects an invalid ability reference: %o", (ability) => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "invalid-ability-reference",
        rawText: "学习架构",
        events: [
          {
            type: "goal",
            goalType: "long_term",
            title: "学习架构",
            category: "职业",
            ability,
            confidence: 0.98
          }
        ]
      })
    ).toThrow();
  });

  it("rejects an ability reference that supplies both id and title", () => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "conflicting-ability-reference",
        rawText: "学习架构",
        events: [
          {
            type: "goal",
            goalType: "long_term",
            title: "学习架构",
            category: "职业",
            ability: {
              id: "44444444-4444-4444-8444-444444444444",
              title: "前端能力"
            },
            confidence: 0.98
          }
        ]
      })
    ).toThrow("ability reference requires exactly one of id or title");
  });

  it("requires all three planned metric fields by accepting only a complete metric", () => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "incomplete-task-metric",
        rawText: "明天学习 40 分钟",
        events: [
          {
            type: "task",
            path: "one_off",
            title: "学习",
            localDate: "2026-08-01",
            confidence: 0.9,
            metric: { type: "duration", value: 40 }
          }
        ]
      })
    ).toThrow();
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
            path: "one_off",
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
