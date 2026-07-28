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
  batchId?: string;
  duplicate: boolean;
  results: Array<Record<string, string | number>>;
}

type BatchRpcResponse =
  | BatchWriteResult
  | {
      error: string;
      duplicate?: boolean;
    };

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

  const response = data as BatchRpcResponse;
  if ("error" in response) {
    if (response.error === "idempotency_conflict") {
      throw new BatchIdempotencyConflictError();
    }
    throw new Error("batch RPC returned an invalid response");
  }

  if (
    typeof response.duplicate !== "boolean" ||
    !Array.isArray(response.results)
  ) {
    throw new Error("batch RPC returned an invalid response");
  }

  return response;
}
