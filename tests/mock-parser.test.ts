import { describe, expect, it } from "vitest";
import { parseWithMockRules } from "@/src/ai/mock-parser";
import { normalizeParseResult } from "@/src/ai/normalize";

describe("parseWithMockRules", () => {
  it("parses duration activities", () => {
    const result = parseWithMockRules("今天学习 AWS 40 分钟", "2026-07-25T09:00:00+09:00");
    expect(result.type).toBe("activity");
    if (result.type === "activity") {
      expect(result.goal?.title).toBe("AWS");
      expect(result.metric?.value).toBe(40);
      expect(result.metric?.unit).toBe("minute");
    }
  });

  it("parses future tasks", () => {
    const result = parseWithMockRules("明天下午练肩", "2026-07-25T09:00:00+09:00");
    expect(result.type).toBe("task");
    if (result.type === "task") {
      expect(result.goal?.title).toBe("增肌");
      expect(result.task.title).toBe("练肩");
    }
  });

  it("parses everyday errands as one-off tasks without a goal", () => {
    const parsed = parseWithMockRules("买水", "2026-07-25T09:00:00+09:00");
    const result = normalizeParseResult(parsed, "买水");

    expect(result).toMatchObject({
      type: "task",
      path: "one_off",
      task: { title: "买水" }
    });
    if (result.type === "task") {
      expect(result.goal).toBeUndefined();
    }
  });

  it("routes ambiguous messages to inbox", () => {
    const result = parseWithMockRules("下周 Sansan", "2026-07-25T09:00:00+09:00");
    expect(result.type).toBe("inbox");
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("does not silently normalize an invalid one-off task", () => {
    expect(() =>
      normalizeParseResult(
        {
          type: "task",
          path: "one_off",
          confidence: 0.95,
          goal: { title: "生活", category: "日常" },
          task: { title: "买水" }
        },
        "买水"
      )
    ).toThrow(/one_off forbids goal/);
  });
});
