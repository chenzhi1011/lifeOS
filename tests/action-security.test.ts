import { describe, expect, it, vi } from "vitest";
import { authenticateActionToken, extractBearerToken, hashActionToken } from "@/src/actions/auth";
import { validateLifeEventBatchPayload } from "@/src/actions/batch-validation";
import { checkActionRateLimit, resetActionRateLimits } from "@/src/actions/rate-limit";
import { requireActionCredential } from "@/src/actions/request";
import { toParseResult, validateLifeEventPayload } from "@/src/actions/validation";

describe("Custom GPT action security", () => {
  it("extracts bearer tokens and hashes them without preserving the raw token", async () => {
    const token = "los_unit_test_token_123456";
    const request = new Request("https://example.com/api/actions/life-event", {
      headers: { authorization: `Bearer ${token}` }
    });

    expect(extractBearerToken(request)).toBe(token);
    const hash = await hashActionToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("authenticates static credentials for local and GPT action tests", async () => {
    vi.stubEnv(
      "ACTION_CREDENTIALS_JSON",
      JSON.stringify([{ userId: "friend-user", name: "friend-gpt", token: "los_unit_test_friend_123456", status: "active" }])
    );

    const credential = await authenticateActionToken("los_unit_test_friend_123456");

    expect(credential?.userId).toBe("friend-user");
    expect(credential?.name).toBe("friend-gpt");
    vi.unstubAllEnvs();
  });

  it("rejects user-controlled userId and invalid metric values", () => {
    expect(() =>
      validateLifeEventPayload({
        type: "activity",
        userId: "attacker",
        rawText: "今天学习 AWS 40 分钟",
        confidence: 0.9,
        goal: { title: "AWS", category: "职业" },
        summary: "学习 AWS",
        metric: { type: "duration", value: 40, unit: "minute" },
        date: "2026-07-25"
      })
    ).toThrow(/Unrecognized key/);

    expect(() =>
      validateLifeEventPayload({
        type: "activity",
        rawText: "bad metric",
        confidence: 0.9,
        goal: { title: "AWS", category: "职业" },
        summary: "bad metric",
        metric: { type: "duration", value: -1, unit: "minute" },
        date: "2026-07-25"
      })
    ).toThrow();
  });

  it("accepts one-off tasks and preserves their path", () => {
    const payload = validateLifeEventPayload({
      type: "task",
      path: "one_off",
      rawText: "买水",
      confidence: 0.96,
      task: { title: "买水" }
    });

    expect(payload.type).toBe("task");
    if (payload.type !== "task") {
      throw new Error("expected task payload");
    }
    expect(payload.path).toBe("one_off");
    expect(toParseResult(payload)).toMatchObject({
      type: "task",
      path: "one_off",
      task: { title: "买水" }
    });
  });

  it("enforces task path mutual exclusion", () => {
    expect(() =>
      validateLifeEventPayload({
        type: "task",
        path: "goal",
        rawText: "准备面试",
        confidence: 0.9,
        task: { title: "准备面试" }
      })
    ).toThrow(/goal path requires goal/);

    expect(() =>
      validateLifeEventPayload({
        type: "task",
        path: "one_off",
        rawText: "买水",
        confidence: 0.9,
        goal: { title: "生活", category: "日常" },
        task: { title: "买水" }
      })
    ).toThrow(/one_off forbids goal/);
  });

  it("requires a fixed life area for every new goal", () => {
    expect(() => validateLifeEventPayload({
      type: "goal",
      rawText: "持续学 React",
      confidence: 0.9,
      goal: { title: "React", category: "职业", goalType: "long_term" }
    })).toThrow();

    expect(validateLifeEventPayload({
      type: "goal",
      rawText: "持续学 React",
      confidence: 0.9,
      goal: { title: "React", category: "职业", goalType: "long_term", lifeArea: "growth" }
    })).toMatchObject({ goal: { lifeArea: "growth" } });
  });

  it("rejects duplicate normalized goal aliases before persistence", () => {
    expect(() =>
      validateLifeEventPayload({
        type: "goal",
        rawText: "准备 AWS 考试",
        confidence: 0.9,
        goal: {
          title: "AWS 考试",
          category: "职业",
          goalType: "short_term",
          lifeArea: "growth",
          aliases: ["AWS", " aws "]
        }
      })
    ).toThrow(/goal aliases must be unique/);
  });

  it("rejects a user-controlled userId in a batch payload", () => {
    expect(() =>
      validateLifeEventBatchPayload({
        idempotencyKey: "batch-security-1",
        rawText: "明天学习 AWS",
        userId: "attacker",
        events: [
          {
            type: "task",
            confidence: 0.9,
            title: "学习 AWS",
            localDate: "2026-07-28"
          }
        ]
      })
    ).toThrow(/Unrecognized key/);
  });

  it("rate limits repeated calls by credential and ip", () => {
    resetActionRateLimits();
    let last = { allowed: true, remaining: 0, resetAt: Date.now() };

    for (let index = 0; index < 20; index += 1) {
      last = checkActionRateLimit("hash-a", "127.0.0.1", 20, 60_000);
      expect(last.allowed).toBe(true);
    }

    const blocked = checkActionRateLimit("hash-a", "127.0.0.1", 20, 60_000);
    expect(blocked.allowed).toBe(false);
  });

  it("rate limits unauthenticated requests by ip before credential lookup", async () => {
    resetActionRateLimits();

    for (let index = 0; index < 60; index += 1) {
      const result = await requireActionCredential(
        new Request("https://example.com/api/actions/life-events", {
          headers: { "x-forwarded-for": "203.0.113.10" }
        })
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(401);
      }
    }

    const blocked = await requireActionCredential(
      new Request("https://example.com/api/actions/life-events", {
        headers: { "x-forwarded-for": "203.0.113.10" }
      })
    );

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(blocked.response.headers.get("x-ratelimit-reset")).toMatch(
        /^\d+$/
      );
    }

    const otherIp = await requireActionCredential(
      new Request("https://example.com/api/actions/life-events", {
        headers: { "x-forwarded-for": "203.0.113.11" }
      })
    );

    expect(otherIp.ok).toBe(false);
    if (!otherIp.ok) {
      expect(otherIp.response.status).toBe(401);
    }
  });
});
