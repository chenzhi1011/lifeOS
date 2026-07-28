import { describe, expect, it, vi } from "vitest";
import {
  BatchIdempotencyConflictError,
  BatchStorageUnavailableError,
  writePreparedBatch
} from "@/src/actions/batch-repository";
import type { PreparedBatch } from "@/src/actions/batch-preparation";

const batch: PreparedBatch = {
  idempotencyKey: "gpt-message-42",
  requestHash: "a".repeat(64),
  rawText: "明天复习 AWS",
  events: [
    {
      kind: "task",
      title: "复习 AWS",
      goalId: "goal-aws",
      dueAt: "2026-07-28T00:00:00.000Z",
      remindAt: "2026-07-28T00:00:00.000Z",
      priority: "normal",
      confidence: 0.98
    }
  ]
};

describe("writePreparedBatch", () => {
  it("calls the transactional batch RPC with the authenticated user and prepared data", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        batchId: "batch-1",
        duplicate: false,
        results: [{ kind: "task", id: "task-1", eventIndex: 0 }]
      },
      error: null
    });

    const result = await writePreparedBatch(
      "user-123",
      batch,
      { rpc }
    );

    expect(rpc).toHaveBeenCalledWith("record_life_event_batch", {
      p_user_id: "user-123",
      p_idempotency_key: "gpt-message-42",
      p_request_hash: "a".repeat(64),
      p_raw_text: "明天复习 AWS",
      p_events: batch.events
    });
    expect(result).toEqual({
      batchId: "batch-1",
      duplicate: false,
      results: [{ kind: "task", id: "task-1", eventIndex: 0 }]
    });
  });

  it("throws a typed conflict when the RPC reports reused idempotency with new content", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: { error: "idempotency_conflict" },
        error: null
      })
    };

    await expect(writePreparedBatch("user-123", batch, client)).rejects.toBeInstanceOf(
      BatchIdempotencyConflictError
    );
  });

  it("throws a storage error without a configured Supabase client", async () => {
    await expect(writePreparedBatch("user-123", batch, null)).rejects.toBeInstanceOf(
      BatchStorageUnavailableError
    );
  });

  it("surfaces RPC errors", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "rpc failed" }
      })
    };

    await expect(writePreparedBatch("user-123", batch, client)).rejects.toThrow(
      "rpc failed"
    );
  });

  it.each([
    [{ error: "other" }, "an unknown RPC error object"],
    [{ duplicate: false }, "a response without results"]
  ])("rejects %s (%s)", async (data, _description) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data, error: null })
    };

    await expect(writePreparedBatch("user-123", batch, client)).rejects.toThrow(
      "batch RPC returned an invalid response"
    );
  });
});
