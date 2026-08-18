import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceSupabaseClient: vi.fn(),
  resolveSessionPrincipal: vi.fn()
}));

vi.mock("@/src/db/supabase", () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient
}));
vi.mock("@/src/auth/api-principal", () => ({
  resolveSessionPrincipal: mocks.resolveSessionPrincipal
}));

import { GET as dashboardGet } from "@/app/api/dashboard/route";
import { readDashboardData } from "@/src/db/lifeos-read";

type TableResponse = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

type RecordedCall = {
  table: string;
  method: string;
  args: unknown[];
};

const userId = "00000000-0000-4000-8000-000000000001";
const asOf = new Date("2026-08-01T18:30:00Z");

function createQueryClient(responses: Record<string, TableResponse>) {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      const builder = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return builder;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          return builder;
        },
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
          return builder;
        },
        gte(...args: unknown[]) {
          calls.push({ table, method: "gte", args });
          return builder;
        },
        order(...args: unknown[]) {
          calls.push({ table, method: "order", args });
          return builder;
        },
        then<TResult1 = TableResponse, TResult2 = never>(
          onfulfilled?: ((value: TableResponse) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve(
            responses[table] ?? { data: [], error: null }
          ).then(onfulfilled, onrejected);
        }
      };
      return builder;
    }
  };
  return { client, calls };
}

function successResponses(): Record<string, TableResponse> {
  return {
    goals: {
      data: [
        {
          id: "goal-1",
          user_id: userId,
          title: "AWS",
          goal_type: "long_term",
          life_area: "work",
          metric_type: "duration",
          status: "active",
          due_at: null,
          completed_at: null,
          created_at: "2026-07-01T00:00:00.000Z"
        },
      ],
      error: null
    },
    activities: {
      data: [{
        id: "activity-1",
        user_id: userId,
        goal_id: "goal-1",
        task_id: null,
        source_message_id: "message-1",
        summary: "学习 AWS",
        metric_type: "duration",
        value: "40",
        unit: "minute",
        occurred_on: "2026-07-15",
        created_at: "2026-07-15T00:00:00.000Z"
      }],
      error: null
    },
    tasks: {
      data: [{
        id: "task-1",
        user_id: userId,
        goal_id: null,
        source_message_id: "message-2",
        title: "买水",
        status: "completed",
        due_at: null,
        priority: "normal",
        planned_metric_type: "count",
        planned_value: "1",
        planned_unit: "count",
        created_at: "2026-07-20T00:00:00.000Z",
        completed_at: "2026-07-20T08:00:00.000Z"
      }],
      error: null
    },
    achievements: {
      data: [{
        id: "achievement-1",
        user_id: userId,
        short_goal_id: "goal-1",
        title: "拿到结果",
        metric_type: "milestone",
        threshold_value: null,
        note: null,
        evidence_url: null,
        achieved_at: "2026-07-25T00:00:00.000Z",
        created_at: "2026-07-25T00:00:00.000Z"
      }],
      error: null
    },
    inbox_items: {
      data: [
        {
          id: "inbox-1",
          user_id: userId,
          message_id: "message-3",
          suggested_type: "task",
          suggested_json: { type: "inbox", confidence: 0.5 },
          reason: "待确认",
          status: "pending",
          created_at: "2026-07-25T00:00:00.000Z"
        }
      ],
      error: null
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveSessionPrincipal.mockResolvedValue({ userId, actorType: "session" });
});

describe("readDashboardData", () => {
  it("reads all dashboard tables in user scope and maps complete rows", async () => {
    const { client, calls } = createQueryClient(successResponses());
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const data = await readDashboardData(userId, asOf);

    for (const table of [
      "goals",
      "activities",
      "tasks",
      "achievements",
      "inbox_items"
    ]) {
      expect(calls).toContainEqual({
        table,
        method: "eq",
        args: ["user_id", userId]
      });
    }
    expect(calls).toContainEqual({
      table: "tasks",
      method: "eq",
      args: ["status", "completed"]
    });
    expect(calls).toContainEqual({
      table: "tasks",
      method: "is",
      args: ["goal_id", null]
    });
    expect(calls).toContainEqual({
      table: "tasks",
      method: "gte",
      args: ["completed_at", "2026-07-03T00:00:00.000Z"]
    });
    expect(data.goals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "goal-1",
        goalType: "long_term",
        lifeArea: "work",
        dueAt: null,
        completedAt: null
      }),
    ]));
    expect(data.allActivities[0]).toMatchObject({
      id: "activity-1",
      value: 40,
      occurredOn: "2026-07-15"
    });
    expect(data.recentCompletedOneOffTasks[0]).toMatchObject({
      id: "task-1",
      goalId: null,
      plannedMetricType: "count",
      plannedValue: 1,
      completedAt: "2026-07-20T08:00:00.000Z"
    });
    expect(data.achievements[0]).toMatchObject({
      id: "achievement-1",
      shortGoalId: "goal-1",
      thresholdValue: null,
      note: null,
      evidenceUrl: null
    });
    expect(data.inboxCount).toBe(1);
  });

  it("throws query failures instead of falling back to demo data", async () => {
    const responses = successResponses();
    responses.achievements = {
      data: null,
      error: { message: "achievements unavailable" }
    };
    const { client } = createQueryClient(responses);
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    await expect(readDashboardData(userId, asOf)).rejects.toThrow(
      /achievements unavailable/
    );
  });

  it("returns a generic API error without leaking query details", async () => {
    const responses = successResponses();
    responses.activities = {
      data: null,
      error: { message: "private activities failure" }
    };
    const { client } = createQueryClient(responses);
    mocks.createServiceSupabaseClient.mockReturnValue(client);

    const response = await dashboardGet(
      new Request(`https://example.com/api/dashboard?userId=${userId}`)
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "failed to read dashboard data"
    });
  });
});
