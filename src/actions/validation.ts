import type { LifeEventParseResult } from "@/src/domain/types";
import { lifeEventActionPayloadSchema } from "@/src/domain/life-event-schema";

export { lifeEventActionPayloadSchema as lifeEventPayloadSchema } from "@/src/domain/life-event-schema";

export type LifeEventActionPayload = LifeEventParseResult & { rawText: string };

export function validateLifeEventPayload(payload: unknown): LifeEventActionPayload {
  return lifeEventActionPayloadSchema.parse(payload) as LifeEventActionPayload;
}

export function toParseResult(payload: LifeEventActionPayload): LifeEventParseResult {
  return payload;
}
