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

  return { ...result, confidence };
}
