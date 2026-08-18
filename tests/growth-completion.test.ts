import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  requireActionCredential: vi.fn(),
  createServiceSupabaseClient: vi.fn()
}));

vi.mock("@/src/actions/request", () => ({
  requireActionCredential: mocks.requireActionCredential
}));

vi.mock("@/src/db/supabase", () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient
}));

import {
  completeGrowthGoal,
  completeGrowthTask
} from "@/src/actions/growth-completion";
import { POST as completeTaskRoute } from "@/app/api/tasks/[id]/complete/route";
import { POST as completeGoalRoute } from "@/app/api/goals/[id]/complete/route";

const userId = "00000000-0000-4000-8000-000000000001";
const taskId = "30000000-0000-4000-8000-000000000001";
const goalId = "10000000-0000-4000-8000-000000000001";

function rpcClient(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error })
  } as unknown as Pick<SupabaseClient, "rpc">;
}

function authenticated() {
  mocks.requireActionCredential.mockResolvedValue({
    ok: true,
    credential: { userId, name: "test", status: "active" },
    tokenHash: "hash",
    rateHeaders: { "x-ratelimit-remaining": "19" }
  });
}

function request(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticated();
});

describe("growth completion repository", () => {
  it("keeps completion RPCs in the final clean schema while preserving migration history", () => {
    const migrationPath = path.resolve(
      "supabase/migrations/202608010002_growth_completion.sql"
    );
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }

    const schema = readFileSync(path.resolve("supabase/schema.sql"), "utf8");
    const migration = readFileSync(migrationPath, "utf8");
    const completionPattern =
      /create or replace function complete_growth_task[\s\S]*?grant execute on function complete_growth_goal\(uuid, uuid, text, text, text\) to service_role;/i;
    const schemaSql = schema.match(completionPattern)?.[0];
    expect(schemaSql).toBeTruthy();
    expect(schemaSql).toMatch(/security definer[\s\S]*?set search_path = public, pg_temp/i);
    expect(schemaSql).toMatch(/task completion metric must match goal metric type/i);
    expect(schemaSql).toMatch(/source_message_id/i);
    expect(schemaSql).toMatch(/update reminders[\s\S]*?status = 'cancelled'/i);
    expect(schema).toMatch(/create unique index idx_activities_user_task_unique/i);
    expect(schema).toMatch(/create unique index idx_achievements_user_short_goal/i);
    expect(migration).toMatch(/create unique index if not exists idx_activities_user_task_unique/i);
    expect(migration).toMatch(/create unique index if not exists idx_achievements_user_short_goal/i);
  });

  it("passes actual task metrics to the completion RPC", async () => {
    const data = {
      taskId,
      status: "completed",
      activityId: "40000000-0000-4000-8000-000000000001",
      duplicate: false
    };
    const client = rpcClient(data);

    await expect(
      completeGrowthTask(
        userId,
        taskId,
        {
          occurredOn: "2026-08-02",
          metric: { type: "duration", value: 45, unit: "minute" }
        },
        client
      )
    ).resolves.toEqual(data);

    expect(client.rpc).toHaveBeenCalledWith("complete_growth_task", {
      p_user_id: userId,
      p_task_id: taskId,
      p_occurred_on: "2026-08-02",
      p_metric_type: "duration",
      p_value: 45,
      p_unit: "minute"
    });
  });

  it("accepts an idempotent one-off task result with a null activity", async () => {
    const data = {
      taskId,
      status: "completed",
      activityId: null,
      duplicate: true
    };

    await expect(
      completeGrowthTask(
        userId,
        taskId,
        { occurredOn: "2026-08-02" },
        rpcClient(data)
      )
    ).resolves.toEqual(data);
  });

  it("rejects malformed task completion RPC responses", async () => {
    await expect(
      completeGrowthTask(
        userId,
        taskId,
        { occurredOn: "2026-08-02" },
        rpcClient({ taskId, status: "completed", duplicate: false })
      )
    ).rejects.toThrow(/invalid response/);
  });

  it("rejects a valid task completion response for a different task", async () => {
    await expect(
      completeGrowthTask(
        userId,
        taskId,
        { occurredOn: "2026-08-02" },
        rpcClient({
          taskId: "30000000-0000-4000-8000-000000000002",
          status: "completed",
          activityId: null,
          duplicate: false
        })
      )
    ).rejects.toThrow(/invalid response/);
  });

  it("passes achievement details to the goal completion RPC", async () => {
    const data = {
      goalId,
      status: "completed",
      achievementId: "50000000-0000-4000-8000-000000000001",
      duplicate: false
    };
    const client = rpcClient(data);

    await expect(
      completeGrowthGoal(
        userId,
        goalId,
        {
          title: "拿到 Offer",
          note: "完成最终面试",
          evidenceUrl: "https://example.com/offer"
        },
        client
      )
    ).resolves.toEqual(data);

    expect(client.rpc).toHaveBeenCalledWith("complete_growth_goal", {
      p_user_id: userId,
      p_goal_id: goalId,
      p_title: "拿到 Offer",
      p_note: "完成最终面试",
      p_evidence_url: "https://example.com/offer"
    });
  });

  it("rejects a valid goal completion response for a different goal", async () => {
    await expect(
      completeGrowthGoal(
        userId,
        goalId,
        {},
        rpcClient({
          goalId: "10000000-0000-4000-8000-000000000002",
          status: "completed",
          achievementId: null,
          duplicate: false
        })
      )
    ).rejects.toThrow(/invalid response/);
  });
});

describe("growth completion routes", () => {
  it("requires an action credential before completing a task", async () => {
    mocks.requireActionCredential.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "missing bearer token" }, { status: 401 })
    });
    const client = rpcClient(null);
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const response = await completeTaskRoute(
      request(`https://example.com/api/tasks/${taskId}/complete`, {
        occurredOn: "2026-08-02"
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects body userId and incomplete task metrics", async () => {
    const client = rpcClient(null);
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const userControlled = await completeTaskRoute(
      request(`https://example.com/api/tasks/${taskId}/complete`, {
        userId: "00000000-0000-4000-8000-000000000002",
        occurredOn: "2026-08-02"
      }),
      { params: Promise.resolve({ id: taskId }) }
    );
    const incompleteMetric = await completeTaskRoute(
      request(`https://example.com/api/tasks/${taskId}/complete`, {
        occurredOn: "2026-08-02",
        metric: { type: "duration", value: 45 }
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(userControlled.status).toBe(400);
    expect(incompleteMetric.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("uses the authenticated user and path task id", async () => {
    const client = rpcClient({
      taskId,
      status: "completed",
      activityId: null,
      duplicate: false
    });
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const response = await completeTaskRoute(
      request(`https://example.com/api/tasks/${taskId}/complete`, {
        occurredOn: "2026-08-02"
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith(
      "complete_growth_task",
      expect.objectContaining({ p_user_id: userId, p_task_id: taskId })
    );
  });

  it("does not leak unknown task completion errors", async () => {
    const client = rpcClient(null, { message: "private database detail" });
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const response = await completeTaskRoute(
      request(`https://example.com/api/tasks/${taskId}/complete`, {
        occurredOn: "2026-08-02"
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "failed to complete task" });
  });

  it("strictly validates the goal id and achievement body", async () => {
    const client = rpcClient(null);
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const badId = await completeGoalRoute(
      request("https://example.com/api/goals/not-a-uuid/complete", {}),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    const badBody = await completeGoalRoute(
      request(`https://example.com/api/goals/${goalId}/complete`, {
        userId,
        evidenceUrl: "not-a-url"
      }),
      { params: Promise.resolve({ id: goalId }) }
    );

    expect(badId.status).toBe(400);
    expect(badBody.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("completes a goal for the authenticated user", async () => {
    const client = rpcClient({
      goalId,
      status: "completed",
      achievementId: null,
      duplicate: false
    });
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const response = await completeGoalRoute(
      request(`https://example.com/api/goals/${goalId}/complete`, {
        note: "长期目标完成"
      }),
      { params: Promise.resolve({ id: goalId }) }
    );

    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith(
      "complete_growth_goal",
      expect.objectContaining({ p_user_id: userId, p_goal_id: goalId })
    );
  });

  it("does not leak unknown goal completion errors", async () => {
    const client = rpcClient(null, { message: "secret goal row" });
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const response = await completeGoalRoute(
      request(`https://example.com/api/goals/${goalId}/complete`, {}),
      { params: Promise.resolve({ id: goalId }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "failed to complete goal" });
  });
});
