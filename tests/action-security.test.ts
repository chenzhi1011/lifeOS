import { describe, expect, it, vi } from "vitest";
import { authenticateActionToken, extractBearerToken, hashActionToken } from "@/src/actions/auth";
import { checkActionRateLimit, resetActionRateLimits } from "@/src/actions/rate-limit";
import { validateLifeEventPayload } from "@/src/actions/validation";

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
});
