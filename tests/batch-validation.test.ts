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
          category: "健康",
          lifeArea: "health"
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
      lifeArea: "health",
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

  it("accepts long-term and short-term goals with fixed life areas", () => {
    const parsed = validateLifeEventBatchPayload({
      idempotencyKey: "fixed-area-goals",
      rawText: "学习架构并通过考试",
      events: [
        {
          type: "goal",
          goalType: "long_term",
          title: "学习架构",
          category: "职业",
          lifeArea: "growth",
          metricType: "duration",
          aliases: [],
          confidence: 0.98
        },
        {
          type: "goal",
          goalType: "short_term",
          title: "通过考试",
          category: "职业",
          lifeArea: "work",
          confidence: 0.98
        }
      ]
    });

    expect(parsed.events.map((event) => event.type)).toEqual(["goal", "goal"]);
  });

  it.each([undefined, "unknown", "健康"])('rejects invalid lifeArea %o', (lifeArea) => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "typed-goal",
        rawText: "测试目标",
        events: [{
          type: "goal",
          goalType: "long_term",
          title: "学习架构",
          category: "职业",
          lifeArea,
          confidence: 0.98
        }]
      })
    ).toThrow();
  });

  it("rejects the removed ability event", () => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "removed-ability",
        rawText: "创建能力",
        events: [{ type: "ability", title: "前端能力", confidence: 0.98 }]
      })
    ).toThrow();
  });

  it.each([
    { type: "duration", value: 1, unit: "count" },
    { type: "count", value: 1, unit: "hour" },
    { type: "milestone", value: 1, unit: "minute" }
  ])("rejects an incompatible metric unit: %o", (metric) => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "invalid-metric-unit",
        rawText: "记录指标",
        events: [
          {
            type: "activity",
            summary: "记录指标",
            occurredOn: "2026-08-13",
            metric,
            confidence: 0.98
          }
        ]
      })
    ).toThrow(/invalid unit/);
  });

  it("supports default, none, and custom reminder modes", () => {
    const payload = validateLifeEventBatchPayload({
      idempotencyKey: "reminder-modes",
      rawText: "创建三个任务",
      events: [
        { ...validTask(1), reminder: { mode: "default" } },
        { ...validTask(2), reminder: { mode: "none" } },
        {
          ...validTask(3),
          reminder: {
            mode: "custom",
            remindAt: "2026-08-13T08:00:00+09:00",
            repeatRule: "weekly"
          }
        }
      ]
    });

    expect(payload.events.map((event) =>
      event.type === "task" ? event.reminder?.mode ?? "default" : null
    )).toEqual(["default", "none", "custom"]);
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
