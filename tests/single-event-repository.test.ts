import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeLifeEventFromAction } from "@/src/actions/repository";
import { validateLifeEventPayload } from "@/src/actions/validation";

type RecordedCall = {
  table: string;
  method: string;
  args: unknown[];
};

type QuerySnapshot = {
  table: string;
  action: "select" | "insert" | "upsert";
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  filters: Array<{ column: string; value: unknown }>;
};

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

function createRecordingClient(
  respond: (query: QuerySnapshot) => QueryResponse
) {
  const calls: RecordedCall[] = [];

  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      const query: QuerySnapshot = {
        table,
        action: "select",
        filters: []
      };
      const builder = {
        select(columns: string) {
          calls.push({ table, method: "select", args: [columns] });
          if (query.action === "select") {
            query.action = "select";
          }
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.push({ table, method: "eq", args: [column, value] });
          query.filters.push({ column, value });
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          calls.push({ table, method: "insert", args: [payload] });
          query.action = "insert";
          query.payload = payload;
          return builder;
        },
        upsert(
          payload: Record<string, unknown>,
          options?: Record<string, unknown>
        ) {
          calls.push({ table, method: "upsert", args: [payload, options] });
          query.action = "upsert";
          query.payload = payload;
          query.options = options;
          return builder;
        },
        single() {
          calls.push({ table, method: "single", args: [] });
          return Promise.resolve(respond({ ...query, filters: [...query.filters] }));
        },
        then<TResult1 = QueryResponse, TResult2 = never>(
          onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          calls.push({ table, method: "execute", args: [] });
          return Promise.resolve(respond({ ...query, filters: [...query.filters] })).then(
            onfulfilled,
            onrejected
          );
        }
      };
      return builder;
    }
  } as unknown as SupabaseClient;

  return { client, calls };
}

function row(id: string) {
  return { data: { id }, error: null };
}

describe("single-event repository", () => {
  it("routes ambiguous user-scoped goal matches to inbox", async () => {
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "goals" && query.action === "select") {
        return {
          data: [
            {
              id: "goal-1",
              title: "AWS",
              category: "职业",
              parent_goal_id: null,
              goal_type: "long_term",
              ability_id: "ability-1",
              metric_type: "duration",
              status: "active",
              created_at: "2026-07-01T00:00:00Z"
            },
            {
              id: "goal-2",
              title: "AWS",
              category: "职业",
              parent_goal_id: null,
              goal_type: "long_term",
              ability_id: "ability-2",
              metric_type: "duration",
              status: "active",
              created_at: "2026-07-02T00:00:00Z"
            }
          ],
          error: null
        };
      }
      if (query.table === "goal_aliases" && query.action === "select") {
        return { data: [], error: null };
      }
      if (query.table === "messages") return row("message-1");
      if (query.table === "inbox_items") return row("inbox-1");
      throw new Error(`unexpected query: ${query.table}/${query.action}`);
    });
    const payload = validateLifeEventPayload({
      type: "task",
      path: "goal",
      rawText: "学习 AWS",
      confidence: 0.95,
      goal: { title: "AWS", category: "职业" },
      task: { title: "学习 AWS" }
    });

    const result = await writeLifeEventFromAction("user-a", payload, client);

    expect(result).toMatchObject({
      mode: "supabase",
      result: { inboxItem: { id: "inbox-1" } }
    });
    expect(
      calls.filter(({ table, method }) =>
        (table === "goals" || table === "goal_aliases") && method === "eq"
      )
    ).toEqual([
      { table: "goals", method: "eq", args: ["user_id", "user-a"] },
      { table: "goal_aliases", method: "eq", args: ["user_id", "user-a"] }
    ]);
    expect(calls.some(({ table }) => table === "tasks")).toBe(false);
  });

  it("routes a missing active ability to inbox without inserting a goal", async () => {
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "goals" || query.table === "goal_aliases" || query.table === "abilities") {
        return { data: [], error: null };
      }
      if (query.table === "messages") return row("message-1");
      if (query.table === "inbox_items") return row("inbox-1");
      throw new Error(`unexpected query: ${query.table}/${query.action}`);
    });
    const payload = validateLifeEventPayload({
      type: "goal",
      rawText: "长期学习写作",
      confidence: 0.95,
      goal: {
        title: "写作",
        category: "兴趣",
        goalType: "long_term",
        ability: { title: "写作能力" }
      }
    });

    const result = await writeLifeEventFromAction("user-a", payload, client);

    expect(result).toMatchObject({ result: { inboxItem: { id: "inbox-1" } } });
    expect(calls).toContainEqual({
      table: "abilities",
      method: "eq",
      args: ["user_id", "user-a"]
    });
    expect(calls.some(({ table, method }) => table === "goals" && method === "insert")).toBe(false);
  });

  it("rejects an existing Supabase goal identity conflict before the first write", async () => {
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "goals") {
        return {
          data: [
            {
              id: "goal-1",
              title: "AWS",
              category: "职业",
              parent_goal_id: null,
              goal_type: "long_term",
              ability_id: "ability-1",
              metric_type: "duration",
              status: "active",
              created_at: "2026-07-01T00:00:00Z"
            }
          ],
          error: null
        };
      }
      if (query.table === "goal_aliases") {
        return { data: [], error: null };
      }
      throw new Error(`unexpected write after identity conflict: ${query.table}`);
    });
    const payload = validateLifeEventPayload({
      type: "goal",
      rawText: "把 AWS 改成短期目标",
      confidence: 0.95,
      goal: {
        title: "AWS",
        category: "职业",
        goalType: "short_term",
        metricType: "duration"
      }
    });

    await expect(
      writeLifeEventFromAction("user-a", payload, client)
    ).rejects.toThrow(/goal identity conflicts/);
    expect(calls.some(({ method }) => method === "insert")).toBe(false);
  });

  it.each([
    {
      field: "ability",
      goal: {
        title: "AWS",
        category: "职业",
        goalType: "long_term",
        ability: { title: "健康能力" },
        metricType: "duration"
      },
      abilityRows: [
        { id: "ability-2", title: "健康能力", status: "active" }
      ],
      extraGoalRows: []
    },
    {
      field: "category",
      goal: {
        title: "AWS",
        category: "兴趣",
        goalType: "long_term",
        ability: { title: "前端能力" },
        metricType: "duration"
      },
      abilityRows: [
        { id: "ability-1", title: "前端能力", status: "active" }
      ],
      extraGoalRows: []
    },
    {
      field: "metric",
      goal: {
        title: "AWS",
        category: "职业",
        goalType: "long_term",
        ability: { title: "前端能力" },
        metricType: "count"
      },
      abilityRows: [
        { id: "ability-1", title: "前端能力", status: "active" }
      ],
      extraGoalRows: []
    },
    {
      field: "parent",
      goal: {
        title: "AWS",
        category: "职业",
        parentTitle: "AI",
        goalType: "long_term",
        ability: { title: "前端能力" },
        metricType: "duration"
      },
      abilityRows: [
        { id: "ability-1", title: "前端能力", status: "active" }
      ],
      extraGoalRows: [
        {
          id: "goal-parent",
          title: "AI",
          category: "职业",
          parent_goal_id: null,
          goal_type: "long_term",
          ability_id: "ability-1",
          metric_type: "duration",
          status: "active",
          created_at: "2026-07-01T00:00:00Z"
        }
      ]
    }
  ])("rejects an existing Supabase goal $field conflict before the first write", async ({
    goal,
    abilityRows,
    extraGoalRows
  }) => {
    const existingGoal = {
      id: "goal-1",
      title: "AWS",
      category: "职业",
      parent_goal_id: null,
      goal_type: "long_term",
      ability_id: "ability-1",
      metric_type: "duration",
      status: "active",
      created_at: "2026-07-01T00:00:00Z"
    };
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "goals") {
        return { data: [existingGoal, ...extraGoalRows], error: null };
      }
      if (query.table === "goal_aliases") {
        return { data: [], error: null };
      }
      if (query.table === "abilities") {
        return { data: abilityRows, error: null };
      }
      throw new Error(`unexpected write after identity conflict: ${query.table}`);
    });
    const payload = validateLifeEventPayload({
      type: "goal",
      rawText: "冲突的 AWS 目标",
      confidence: 0.95,
      goal
    });

    await expect(
      writeLifeEventFromAction("user-a", payload, client)
    ).rejects.toThrow(/goal identity conflicts/);
    expect(calls.some(({ method }) => method === "insert")).toBe(false);
  });

  it("rejects Supabase alias ownership conflicts before the first write", async () => {
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "goals") {
        return {
          data: [
            {
              id: "goal-1",
              title: "AWS",
              category: "职业",
              parent_goal_id: null,
              goal_type: "long_term",
              ability_id: "ability-1",
              metric_type: "duration",
              status: "active",
              created_at: "2026-07-01T00:00:00Z"
            }
          ],
          error: null
        };
      }
      if (query.table === "goal_aliases") {
        return { data: [{ goal_id: "goal-1", alias: "Terraform" }], error: null };
      }
      throw new Error(`unexpected write after alias conflict: ${query.table}`);
    });
    const payload = validateLifeEventPayload({
      type: "goal",
      rawText: "参加写作比赛",
      confidence: 0.95,
      goal: {
        title: "参加写作比赛",
        category: "兴趣",
        goalType: "short_term",
        aliases: ["Terraform"]
      }
    });

    await expect(
      writeLifeEventFromAction("user-a", payload, client)
    ).rejects.toThrow(/goal alias conflicts/);
    expect(calls.some(({ method }) => method === "insert")).toBe(false);
  });

  it("preserves archived ability status during user-scoped upsert", async () => {
    const archivedAbility = {
      id: "ability-1",
      title: "写作能力",
      status: "archived",
      archived_at: "2026-07-01T00:00:00Z"
    };
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "abilities") {
        return { data: archivedAbility, error: null };
      }
      if (query.table === "messages") return row("message-1");
      throw new Error(`unexpected query: ${query.table}/${query.action}`);
    });
    const payload = validateLifeEventPayload({
      type: "ability",
      rawText: "培养写作能力",
      confidence: 0.95,
      ability: { title: "写作能力" }
    });

    const result = await writeLifeEventFromAction("user-a", payload, client);

    expect(result.result).toMatchObject({ ability: archivedAbility });
    const upsert = calls.find(({ table, method }) => table === "abilities" && method === "upsert");
    expect(upsert?.args).toEqual([
      { user_id: "user-a", title: "写作能力" },
      { onConflict: "user_id,title" }
    ]);
    expect(upsert?.args[0]).not.toHaveProperty("status");
    expect(upsert?.args[0]).not.toHaveProperty("archived_at");
  });

  it("stops after the first write error", async () => {
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "messages") {
        return { data: null, error: { message: "message insert failed" } };
      }
      throw new Error(`unexpected query after failed write: ${query.table}`);
    });
    const payload = validateLifeEventPayload({
      type: "task",
      path: "one_off",
      rawText: "买水",
      confidence: 0.95,
      task: { title: "买水" }
    });

    await expect(
      writeLifeEventFromAction("user-a", payload, client)
    ).rejects.toThrow(/message insert failed/);
    expect(calls.filter(({ method }) => method === "insert")).toHaveLength(1);
    expect(calls.some(({ table }) => table === "tasks")).toBe(false);
  });

  it("propagates infrastructure read errors without writing an inbox row", async () => {
    const { client, calls } = createRecordingClient((query) => {
      if (query.table === "goals") {
        return { data: null, error: { message: "database unavailable" } };
      }
      if (query.table === "goal_aliases") {
        return { data: [], error: null };
      }
      throw new Error(`unexpected write after read failure: ${query.table}`);
    });
    const payload = validateLifeEventPayload({
      type: "task",
      path: "goal",
      rawText: "学习 AWS",
      confidence: 0.95,
      goal: { title: "AWS", category: "职业" },
      task: { title: "学习 AWS" }
    });

    await expect(
      writeLifeEventFromAction("user-a", payload, client)
    ).rejects.toThrow(/database unavailable/);
    expect(calls.some(({ method }) => method === "insert")).toBe(false);
  });

  it("rejects malformed runtime input before calling Supabase", async () => {
    const { client, calls } = createRecordingClient(() => {
      throw new Error("Supabase must not be called");
    });

    await expect(
      writeLifeEventFromAction(
        "user-a",
        {
          type: "task",
          path: "one_off",
          rawText: "买水",
          confidence: 0.95
        },
        client
      )
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
