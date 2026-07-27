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
