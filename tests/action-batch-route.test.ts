import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BatchIdempotencyConflictError,
  BatchStorageUnavailableError,
  writePreparedBatch
} from "@/src/actions/batch-repository";
import { resetActionRateLimits } from "@/src/actions/rate-limit";
import { readActionContext } from "@/src/actions/repository";
import { POST } from "@/app/api/actions/life-events/route";

vi.mock("@/src/actions/batch-repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/src/actions/batch-repository")>();

  return {
    ...actual,
    writePreparedBatch: vi.fn()
  };
});

vi.mock("@/src/actions/repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/src/actions/repository")>();

  return {
    ...actual,
    readActionContext: vi.fn()
  };
});

const token = "los_batch_route_test_token_123456";
const userId = "batch-route-user";
const writePreparedBatchMock = vi.mocked(writePreparedBatch);
const readActionContextMock = vi.mocked(readActionContext);
const actionContext = {
  timezone: "Asia/Tokyo",
  defaultReminderTime: "09:00",
  currentTime: "2026-07-28 09:00:00 Asia/Tokyo",
  abilities: [],
  goals: [],
  aliases: [],
  openTasks: []
};

function request(body: unknown, options?: { authorization?: boolean }) {
  return new Request("https://example.com/api/actions/life-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options?.authorization === false
        ? {}
        : { authorization: `Bearer ${token}` })
    },
    body: JSON.stringify(body)
  });
}

function validPayload() {
  return {
    idempotencyKey: "gpt-message-route-1",
    rawText: "明天复习 AWS",
    events: [
      {
        type: "task",
        path: "one_off",
        confidence: 0.98,
        title: "复习 AWS",
        localDate: "2099-07-29",
        explicitDueAt: "2099-07-29T09:00:00+09:00",
        priority: "normal"
      }
    ]
  };
}

function expectRateHeaders(response: Response) {
  expect(response.headers.get("x-ratelimit-remaining")).toMatch(/^\d+$/);
  expect(response.headers.get("x-ratelimit-reset")).toMatch(/^\d+$/);
}

describe("POST /api/actions/life-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActionRateLimits();
    readActionContextMock.mockResolvedValue(actionContext);
    vi.stubEnv(
      "ACTION_CREDENTIALS_JSON",
      JSON.stringify([
        {
          userId,
          name: "batch-route-gpt",
          token,
          status: "active"
        }
      ])
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records a valid task batch and returns the repository result", async () => {
    const result = {
      batchId: "batch-1",
      duplicate: false,
      results: [
        {
          eventIndex: 0,
          kind: "task" as const,
          messageId: "message-1",
          taskId: "task-1",
          reminderId: "reminder-1"
        }
      ]
    };
    writePreparedBatchMock.mockResolvedValue(result);

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...result });
    expect(writePreparedBatchMock).toHaveBeenCalledTimes(1);
    expect(readActionContextMock).toHaveBeenCalledWith(userId);
    expect(writePreparedBatchMock).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        idempotencyKey: "gpt-message-route-1",
        rawText: "明天复习 AWS",
        events: [
          expect.objectContaining({
            kind: "task",
            title: "复习 AWS",
            dueAt: "2099-07-29T00:00:00.000Z",
            remindAt: "2099-07-29T00:00:00.000Z"
          })
        ]
      })
    );
    expectRateHeaders(response);
  });

  it("returns duplicate results unchanged", async () => {
    const result = {
      batchId: "batch-1",
      duplicate: true,
      results: [
        {
          eventIndex: 0,
          kind: "task" as const,
          messageId: "message-1",
          taskId: "task-1",
          reminderId: "reminder-1"
        }
      ]
    };
    writePreparedBatchMock.mockResolvedValue(result);

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...result });
    expectRateHeaders(response);
  });

  it("rejects an empty event list without writing", async () => {
    const response = await POST(
      request({
        idempotencyKey: "gpt-message-route-empty",
        rawText: "没有事件",
        events: []
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid life event batch",
      issues: [{ path: "events" }]
    });
    expect(writePreparedBatchMock).not.toHaveBeenCalled();
    expectRateHeaders(response);
  });

  it("rejects a user-controlled userId without writing", async () => {
    const response = await POST(
      request({
        ...validPayload(),
        userId: "attacker"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid life event batch",
      issues: [{ path: "" }]
    });
    expect(writePreparedBatchMock).not.toHaveBeenCalled();
    expectRateHeaders(response);
  });

  it("requires a bearer credential", async () => {
    const response = await POST(
      request(validPayload(), { authorization: false })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "missing bearer token" });
    expect(writePreparedBatchMock).not.toHaveBeenCalled();
  });

  it("returns a structured 400 response for malformed JSON", async () => {
    const malformedRequest = new Request(
      "https://example.com/api/actions/life-events",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: "{not-json"
      }
    );

    const response = await POST(malformedRequest);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid life event batch",
      issues: []
    });
    expect(writePreparedBatchMock).not.toHaveBeenCalled();
    expectRateHeaders(response);
  });

  it("maps typed idempotency conflicts to 409", async () => {
    writePreparedBatchMock.mockRejectedValue(
      new BatchIdempotencyConflictError()
    );

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "idempotency key was already used with different content"
    });
    expectRateHeaders(response);
  });

  it("maps unavailable batch storage to 503", async () => {
    writePreparedBatchMock.mockRejectedValue(
      new BatchStorageUnavailableError()
    );

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "batch storage is unavailable"
    });
    expectRateHeaders(response);
  });

  it("does not expose unexpected repository error details", async () => {
    writePreparedBatchMock.mockRejectedValue(
      new Error("private database detail")
    );

    const response = await POST(request(validPayload()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "failed to record life event batch" });
    expect(JSON.stringify(body)).not.toContain("private database detail");
    expectRateHeaders(response);
  });
});
