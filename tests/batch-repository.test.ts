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

const allKindBatch: PreparedBatch = {
  idempotencyKey: "gpt-message-all-kinds",
  requestHash: "b".repeat(64),
  rawText: "创建目标、任务、活动和收件箱项目",
  events: [
    {
      kind: "goal",
      title: "AWS",
      category: "职业",
      parentGoalId: null,
      metricType: "duration",
      aliases: [],
      confidence: 0.99
    },
    {
      kind: "task",
      title: "复习 AWS",
      goalId: "goal-aws",
      dueAt: "2026-07-28T00:00:00.000Z",
      remindAt: "2026-07-28T00:00:00.000Z",
      priority: "normal",
      confidence: 0.98
    },
    {
      kind: "activity",
      summary: "复习 AWS",
      goalId: "goal-aws",
      matchedTaskId: null,
      metricType: "duration",
      value: 30,
      unit: "minute",
      occurredOn: "2026-07-27",
      confidence: 0.97
    },
    {
      kind: "inbox",
      suggestedType: "task",
      reason: "需要确认",
      suggestedEvent: {
        type: "inbox",
        reason: "需要确认",
        suggestedTypes: ["task"],
        confidence: 0.5
      },
      confidence: 0.5
    }
  ]
};

const validAllKindResults = [
  {
    eventIndex: 0,
    kind: "goal",
    messageId: "message-goal",
    goalId: "goal-aws"
  },
  {
    eventIndex: 1,
    kind: "task",
    messageId: "message-task",
    taskId: "task-aws",
    reminderId: "reminder-aws"
  },
  {
    eventIndex: 2,
    kind: "activity",
    messageId: "message-activity",
    activityId: "activity-aws",
    goalId: "goal-aws"
  },
  {
    eventIndex: 3,
    kind: "inbox",
    messageId: "message-inbox",
    inboxItemId: "inbox-aws"
  }
];

describe("writePreparedBatch", () => {
  it("calls the transactional batch RPC with the authenticated user and prepared data", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        batchId: "batch-1",
        duplicate: false,
        results: [
          {
            kind: "task",
            messageId: "message-1",
            taskId: "task-1",
            reminderId: "reminder-1",
            eventIndex: 0
          }
        ]
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
      results: [
        {
          kind: "task",
          messageId: "message-1",
          taskId: "task-1",
          reminderId: "reminder-1",
          eventIndex: 0
        }
      ]
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

  it.each([
    [
      {
        duplicate: false,
        results: [{ eventIndex: 0, kind: "task", messageId: "message-1" }]
      },
      "a missing batch id"
    ],
    [
      {
        batchId: 123,
        duplicate: false,
        results: [{ eventIndex: 0, kind: "task", messageId: "message-1" }]
      },
      "a non-string batch id"
    ],
    [
      { batchId: "batch-1", duplicate: false, results: [null] },
      "a null result"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [{ eventIndex: 0.5, kind: "task", messageId: "message-1" }]
      },
      "a non-integer event index"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [{ eventIndex: 20, kind: "task", messageId: "message-1" }]
      },
      "an out-of-range event index"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [{ eventIndex: 0, kind: "reminder", messageId: "message-1" }]
      },
      "an unknown event kind"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [{ eventIndex: 0, kind: "task" }]
      },
      "a missing message id"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [
          {
            eventIndex: 0,
            kind: "task",
            messageId: "message-1",
            taskId: 123
          }
        ]
      },
      "a non-string optional entity id"
    ]
  ])("rejects an invalid success response: %s (%s)", async (data, _description) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data, error: null })
    };

    await expect(writePreparedBatch("user-123", batch, client)).rejects.toThrow(
      "batch RPC returned an invalid response"
    );
  });

  it.each([
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: []
      },
      "fewer results than input events"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [
          {
            eventIndex: 1,
            kind: "task",
            messageId: "message-1",
            taskId: "task-1",
            reminderId: "reminder-1"
          }
        ]
      },
      "an event index that does not match its position"
    ],
    [
      {
        batchId: "batch-1",
        duplicate: false,
        results: [
          {
            eventIndex: 0,
            kind: "goal",
            messageId: "message-1",
            goalId: "goal-1"
          }
        ]
      },
      "a result kind that does not match its input event"
    ]
  ])("rejects a response inconsistent with the input batch: %s (%s)", async (data, _description) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data, error: null })
    };

    await expect(writePreparedBatch("user-123", batch, client)).rejects.toThrow(
      "batch RPC returned an invalid response"
    );
  });

  it.each([
    [0, "goalId", "goal"],
    [1, "taskId", "task"],
    [1, "reminderId", "task reminder"],
    [2, "activityId", "activity"],
    [2, "goalId", "activity goal"],
    [3, "inboxItemId", "inbox"]
  ])(
    "rejects a %s result missing required %s (%s)",
    async (eventIndex, requiredKey) => {
      const results: Array<Record<string, unknown>> = validAllKindResults.map(
        (result) => ({ ...result })
      );
      delete results[eventIndex][requiredKey];
      const client = {
        rpc: vi.fn().mockResolvedValue({
          data: { batchId: "batch-all", duplicate: false, results },
          error: null
        })
      };

      await expect(
        writePreparedBatch("user-123", allKindBatch, client)
      ).rejects.toThrow("batch RPC returned an invalid response");
    }
  );
});
