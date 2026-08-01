import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { PreparedBatch } from "./batch-preparation";

export class BatchStorageUnavailableError extends Error {
  constructor() {
    super("batch storage is unavailable");
    this.name = "BatchStorageUnavailableError";
  }
}

export class BatchIdempotencyConflictError extends Error {
  constructor() {
    super("idempotency key was already used with different content");
    this.name = "BatchIdempotencyConflictError";
  }
}

export interface BatchWriteResult {
  batchId: string;
  duplicate: boolean;
  results: BatchEventWriteResult[];
}

export interface BatchEventWriteResult {
  eventIndex: number;
  kind: "ability" | "goal" | "task" | "activity" | "inbox";
  messageId: string;
  abilityId?: string;
  goalId?: string;
  taskId?: string;
  activityId?: string;
  reminderId?: string;
  inboxItemId?: string;
}

const batchEventKinds = new Set([
  "ability",
  "goal",
  "task",
  "activity",
  "inbox"
]);
const optionalEntityIdKeys = [
  "abilityId",
  "goalId",
  "taskId",
  "activityId",
  "reminderId",
  "inboxItemId"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBatchEventWriteResult(value: unknown): value is BatchEventWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !Number.isInteger(value.eventIndex) ||
    (value.eventIndex as number) < 0 ||
    (value.eventIndex as number) > 19 ||
    typeof value.kind !== "string" ||
    !batchEventKinds.has(value.kind) ||
    !isNonEmptyString(value.messageId)
  ) {
    return false;
  }

  return optionalEntityIdKeys.every(
    (key) => value[key] === undefined || isNonEmptyString(value[key])
  );
}

function hasRequiredEntityIds(result: BatchEventWriteResult): boolean {
  if (result.kind === "ability") {
    return isNonEmptyString(result.abilityId);
  }
  if (result.kind === "goal") {
    return isNonEmptyString(result.goalId);
  }
  if (result.kind === "task") {
    return (
      isNonEmptyString(result.taskId) &&
      isNonEmptyString(result.reminderId)
    );
  }
  if (result.kind === "activity") {
    return (
      isNonEmptyString(result.activityId) &&
      isNonEmptyString(result.goalId)
    );
  }
  return isNonEmptyString(result.inboxItemId);
}

function isBatchWriteResult(
  value: unknown,
  events: PreparedBatch["events"]
): value is BatchWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.batchId) &&
    typeof value.duplicate === "boolean" &&
    Array.isArray(value.results) &&
    value.results.length === events.length &&
    value.results.every(
      (result, index) =>
        isBatchEventWriteResult(result) &&
        result.eventIndex === index &&
        result.kind === events[index].kind &&
        hasRequiredEntityIds(result)
    )
  );
}

export async function writePreparedBatch(
  userId: string,
  batch: PreparedBatch,
  client: Pick<SupabaseClient, "rpc"> | null = createServiceSupabaseClient()
): Promise<BatchWriteResult> {
  if (!client) {
    throw new BatchStorageUnavailableError();
  }

  const { data, error } = await client.rpc("record_life_event_batch", {
    p_user_id: userId,
    p_idempotency_key: batch.idempotencyKey,
    p_request_hash: batch.requestHash,
    p_raw_text: batch.rawText,
    p_events: batch.events
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("batch RPC returned an invalid response");
  }

  if ("error" in data) {
    if (data.error === "idempotency_conflict") {
      throw new BatchIdempotencyConflictError();
    }
    throw new Error("batch RPC returned an invalid response");
  }

  if (!isBatchWriteResult(data, batch.events)) {
    throw new Error("batch RPC returned an invalid response");
  }

  return data;
}
