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
  rawText: "创建目标和任务",
  events: [
    {
      kind: "goal",
      title: "每周跑步",
      category: "运动",
      goalType: "long_term",
      lifeArea: "health",
      metricType: "count",
      aliases: ["跑步"],
      confidence: 0.99
    },
    {
      kind: "task",
      title: "跑步",
      goalId: "goal-running",
      dueAt: "2026-08-14T00:00:00.000Z",
      remindAt: null,
      repeatRule: null,
      priority: "normal",
      plannedMetricType: null,
      plannedValue: null,
      plannedUnit: null,
      confidence: 0.98
    }
  ]
};

const validResult = {
  batchId: "batch-1",
  duplicate: false,
  results: [
    {
      eventIndex: 0,
      kind: "goal",
      messageId: "message-goal",
      goalId: "goal-running"
    },
    {
      eventIndex: 1,
      kind: "task",
      messageId: "message-task",
      taskId: "task-running"
    }
  ]
};

describe("writePreparedBatch", () => {
  it("calls the transactional RPC with the authenticated user and prepared command", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: validResult, error: null });

    await expect(writePreparedBatch("user-1", batch, { rpc } as never)).resolves.toEqual(validResult);
    expect(rpc).toHaveBeenCalledWith("record_life_event_batch", {
      p_user_id: "user-1",
      p_idempotency_key: batch.idempotencyKey,
      p_request_hash: batch.requestHash,
      p_raw_text: batch.rawText,
      p_events: batch.events
    });
  });

  it("accepts a task without reminderId when reminder mode is none", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: validResult, error: null });

    await expect(writePreparedBatch("user-1", batch, { rpc } as never)).resolves.toEqual(validResult);
  });

  it("rejects a result whose event kind does not match the prepared command", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...validResult,
        results: [
          validResult.results[0],
          { ...validResult.results[1], kind: "activity", activityId: "activity-1", goalId: "goal-running" }
        ]
      },
      error: null
    });

    await expect(writePreparedBatch("user-1", batch, { rpc } as never)).rejects.toThrow(
      "batch RPC returned an invalid response"
    );
  });

  it("maps an idempotency conflict to a stable error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { error: "idempotency_conflict", duplicate: false },
      error: null
    });

    await expect(writePreparedBatch("user-1", batch, { rpc } as never)).rejects.toBeInstanceOf(
      BatchIdempotencyConflictError
    );
  });

  it("rejects unavailable storage before writing", async () => {
    await expect(writePreparedBatch("user-1", batch, null)).rejects.toBeInstanceOf(
      BatchStorageUnavailableError
    );
  });

  it("surfaces database errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "database failed" } });

    await expect(writePreparedBatch("user-1", batch, { rpc } as never)).rejects.toThrow(
      "database failed"
    );
  });
});
