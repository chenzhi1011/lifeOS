import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWithMockRules } from "@/src/ai/mock-parser";
import { normalizeParseResult } from "@/src/ai/normalize";
import { localProvider } from "@/src/ai/providers";
import type { LifeEventParseResult } from "@/src/domain/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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
          goal: { title: "生活" },
          task: { title: "买水" }
        },
        "买水"
      )
    ).toThrow(/one_off forbids goal/);
  });

  it("rejects a high-confidence task without a path", () => {
    expect(() =>
      normalizeParseResult(
        {
          type: "task",
          confidence: 0.95,
          task: { title: "买水" }
        } as unknown as LifeEventParseResult,
        "买水"
      )
    ).toThrow();
  });

  it("validates local-provider JSON as unknown and falls back on malformed output", async () => {
    vi.stubEnv("LOCAL_LLM_BASE_URL", "http://local.test");
    vi.stubEnv("LOCAL_LLM_MODEL", "local-model");
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "task",
                  confidence: 0.95,
                  task: { title: "买水" }
                })
              }
            }
          ]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await localProvider.parseLifeEvent({
      userId: "user-a",
      text: "买水",
      source: "app",
      timestamp: "2026-07-25T09:00:00+09:00"
    });

    expect(result).toMatchObject({ type: "task", path: "one_off" });
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(request.messages[0].content).toMatch(/one_off.*goal/);
    expect(request.messages[0].content).toMatch(/lifeArea.*work.*growth.*health/);
  });
});
