import type { LifeEventParseResult } from "@/src/domain/types";

export function normalizeParseResult(result: LifeEventParseResult, rawText: string): LifeEventParseResult {
  const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));

  if (confidence < 0.7 || result.type === "inbox") {
    return {
      type: "inbox",
      confidence,
      rawText,
      suggestedTypes: result.suggestedTypes ?? [result.type],
      reason: result.reason ?? "置信度低，等待用户确认。"
    };
  }

  if (result.type === "task") {
    if (result.path === "one_off" && result.goal) {
      throw new Error("one_off forbids goal");
    }
    if (result.path === "goal" && !result.goal) {
      throw new Error("goal path requires goal");
    }
  }

  if ("goal" in result && result.goal) {
    const reference = result.goal.ability;
    if (reference && ((!reference.id && !reference.title) || (reference.id && reference.title))) {
      throw new Error("ability reference requires exactly one of id or title");
    }
    if (result.goal.goalType === "long_term" && !reference) {
      throw new Error("long_term goal requires ability");
    }
    if (result.goal.goalType === "short_term" && reference) {
      throw new Error("short_term goal forbids ability");
    }
  }

  return { ...result, confidence };
}
