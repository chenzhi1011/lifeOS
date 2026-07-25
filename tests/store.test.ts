import { describe, expect, it } from "vitest";
import { createInitialState } from "@/src/domain/seed";
import { createLifeOSStore } from "@/src/domain/store";

describe("Life OS store", () => {
  it("creates demo data owned by the demo user", () => {
    const state = createInitialState();
    expect(state.currentUserId).toBe("demo-user");
    expect(state.goals.every((goal) => goal.userId === "demo-user")).toBe(true);
    expect(state.activities.every((activity) => activity.userId === "demo-user")).toBe(true);
  });

  it("writes activity input into messages and activities", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "今天学习 AWS 40 分钟", {
      type: "activity",
      confidence: 0.92,
      goal: { title: "AWS", category: "职业" },
      summary: "学习 AWS",
      metric: { type: "duration", value: 40, unit: "minute" },
      date: "2026-07-25"
    });

    expect(result.message.status).toBe("processed");
    expect(result.activity?.value).toBe(40);
    expect(store.getState().activities.some((activity) => activity.messageId === result.message.id)).toBe(true);
  });

  it("does not reuse seed ids when writing new records", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "今天学习 AWS 40 分钟", {
      type: "activity",
      confidence: 0.92,
      goal: { title: "AWS", category: "职业" },
      summary: "学习 AWS",
      metric: { type: "duration", value: 40, unit: "minute" },
      date: "2026-07-25"
    });

    const ids = store.getState().activities.map((activity) => activity.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.activity?.id).not.toBe("act-1");
    expect(result.activity?.id).not.toBe("act-2");
  });

  it("routes low-confidence parses into inbox", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "下周 Sansan", {
      type: "inbox",
      confidence: 0.48,
      rawText: "下周 Sansan",
      suggestedTypes: ["task", "goal"],
      reason: "不确定"
    });

    expect(result.message.status).toBe("inbox");
    expect(result.inboxItem?.status).toBe("pending");
  });

  it("keeps users isolated", () => {
    const store = createLifeOSStore(createInitialState());
    expect(store.getDashboardData("other-user").goals).toHaveLength(0);
  });
});
