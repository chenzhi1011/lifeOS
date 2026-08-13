import type { LifeEventParseResult } from "@/src/domain/types";
import { lifeEventParseResultSchema } from "@/src/domain/life-event-schema";
import { z } from "zod";

const parseEnvelopeSchema = z
  .object({
    type: z.enum(["task", "activity", "goal", "reminder", "inbox"]),
    confidence: z.number()
  })
  .passthrough();

export function normalizeParseResult(result: unknown, rawText: string): LifeEventParseResult {
  const envelope = parseEnvelopeSchema.parse(result);
  const confidence = Math.max(0, Math.min(1, envelope.confidence));

  if (confidence < 0.7 || envelope.type === "inbox") {
    const candidate = result as Record<string, unknown>;
    return lifeEventParseResultSchema.parse({
      type: "inbox",
      confidence,
      rawText,
      suggestedTypes: candidate.suggestedTypes ?? [envelope.type],
      reason: candidate.reason ?? "置信度低，等待用户确认。"
    }) as LifeEventParseResult;
  }

  return lifeEventParseResultSchema.parse({
    ...(result as Record<string, unknown>),
    confidence
  }) as LifeEventParseResult;
}
