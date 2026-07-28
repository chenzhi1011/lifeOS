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
  kind: "goal" | "task" | "activity" | "inbox";
  messageId: string;
  goalId?: string;
  taskId?: string;
  activityId?: string;
  reminderId?: string;
  inboxItemId?: string;
}

const batchEventKinds = new Set(["goal", "task", "activity", "inbox"]);
const optionalEntityIdKeys = [
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

function isBatchWriteResult(value: unknown): value is BatchWriteResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.batchId) &&
    typeof value.duplicate === "boolean" &&
    Array.isArray(value.results) &&
    value.results.length > 0 &&
    value.results.length <= 20 &&
    value.results.every(isBatchEventWriteResult)
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

  if (!isBatchWriteResult(data)) {
    throw new Error("batch RPC returned an invalid response");
  }

  return data;
}
