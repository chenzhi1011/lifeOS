import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/202607270001_custom_gpt_batch_intake.sql"
);
const growthMigrationPath = path.resolve(
  "supabase/migrations/202608010001_growth_tree_domain.sql"
);

const requiredFragments = [
  "timezone",
  "default_reminder_time",
  "action_batches",
  "request_hash",
  "event_index"
];

describe("Custom GPT batch intake database schema", () => {
  it("keeps the clean schema and migration aligned on the batch primitives", () => {
    const schema = readFileSync(path.resolve("supabase/schema.sql"), "utf8");
    const migration = readFileSync(migrationPath, "utf8");

    for (const fragment of requiredFragments) {
      expect(schema).toContain(fragment);
      expect(migration).toContain(fragment);
    }
  });

  it("defines batch idempotency, event uniqueness, ownership, and composite references", () => {
    const schema = readFileSync(path.resolve("supabase/schema.sql"), "utf8");
    const migration = readFileSync(migrationPath, "utf8");

    expect(schema).toContain("unique (user_id, idempotency_key)");
    expect(schema).toContain("idx_messages_batch_event");
    expect(schema).toContain("action_batches_own_rows");
    expect(migration).toMatch(
      /create unique index if not exists idx_messages_batch_event/i
    );
    expect(migration).toMatch(
      /create index if not exists idx_action_batches_user_created/i
    );

    for (const sql of [schema, migration]) {
      expect(sql).toMatch(
        /timezone\s+text\s+not null\s+default\s+'Asia\/Tokyo'/i
      );
      expect(sql).toMatch(
        /default_reminder_time\s+time\s+not null\s+default\s+'09:00'/i
      );
      expect(sql).toMatch(
        /unique\s*\(\s*user_id\s*,\s*idempotency_key\s*\)/i
      );
      expect(sql).toMatch(/unique\s*\(\s*user_id\s*,\s*id\s*\)/i);
      expect(sql).toMatch(
        /create unique index(?:\s+if not exists)?\s+idx_messages_batch_event\s+on messages\s*\(\s*batch_id\s*,\s*event_index\s*\)\s+where batch_id is not null/i
      );
      expect(sql).toMatch(
        /constraint\s+messages_batch_fk\s+foreign key\s*\(user_id,\s*batch_id\)\s*references action_batches\s*\(user_id,\s*id\)/i
      );
      expect(sql).toMatch(
        /constraint\s+messages_batch_event_pair\s+check\s*\(\s*\(\s*batch_id is null\s+and\s+event_index is null\s*\)\s+or\s+\(\s*batch_id is not null\s+and\s+event_index is not null\s+and\s+event_index between 0 and 19\s*\)\s*\)/i
      );
      expect(sql).toMatch(/alter table action_batches enable row level security/i);
      expect(sql).toMatch(
        /create policy action_batches_own_rows\s+on action_batches\s+for select\s+using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i
      );
      expect(sql).toMatch(
        /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+action_batches\s+from\s+anon\s*,\s*authenticated\s*;/i
      );
    }
  });

  it("defines the service-role-only transactional batch RPC in schema and migration", () => {
    const schema = readFileSync(path.resolve("supabase/schema.sql"), "utf8");
    const migration = readFileSync(migrationPath, "utf8");

    for (const sql of [schema, migration]) {
      expect(sql).toMatch(
        /create or replace function record_life_event_batch\s*\(\s*p_user_id uuid,\s*p_idempotency_key text,\s*p_request_hash text,\s*p_raw_text text,\s*p_events jsonb\s*\)\s*returns jsonb/i
      );
      expect(sql).toMatch(/language plpgsql\s+security definer/i);
      expect(sql).toMatch(/set search_path\s*=\s*public,\s*pg_temp/i);
      expect(sql).toContain("jsonb_array_elements(p_events) with ordinality");
      expect(sql).toContain("'idempotency_conflict'");
      expect(sql).toMatch(
        /when v_kind = 'inbox' and v_event->>'resolution' is null then 'inbox'/i
      );
      expect(sql).toMatch(
        /v_resolves_inbox_item_id is not null\s+and not \(v_kind = 'inbox' and v_event->>'resolution' = 'dismiss'\)/i
      );
      expect(sql).toMatch(
        /revoke execute on function public\.record_life_event_batch\(uuid, text, text, text, jsonb\) from public,\s*anon,\s*authenticated/i
      );
      expect(sql).toMatch(
        /grant execute on function record_life_event_batch\(uuid, text, text, text, jsonb\) to service_role/i
      );
      expect(sql).not.toMatch(
        /grant execute on function record_life_event_batch\(uuid, text, text, text, jsonb\) to (?:anon|authenticated|public)/i
      );
      expect(sql).toMatch(
        /update tasks[\s\S]*?where user_id = p_user_id[\s\S]*?and id = v_task_id[\s\S]*?and goal_id = v_goal_id[\s\S]*?and status = 'open'/i
      );
    }
  });

  it("keeps the final clean schema RPC on fixed life areas", () => {
    const schema = readFileSync(path.resolve("supabase/schema.sql"), "utf8");
    const rpcPattern =
      /create or replace function record_life_event_batch[\s\S]*?grant execute on function record_life_event_batch\(uuid, text, text, text, jsonb\) to service_role;/i;
    const schemaRpc = schema.match(rpcPattern)?.[0];

    expect(schemaRpc).toBeTruthy();
    for (const sql of [schemaRpc ?? ""]) {
      expect(sql).toMatch(/v_kind not in \('goal', 'task', 'activity', 'inbox'\)/i);
      expect(sql).not.toMatch(/ability/i);
      expect(sql).toMatch(/goal_type[\s\S]*?life_area/i);
      expect(sql).toMatch(/v_goal_match_count/i);
      expect(sql).toMatch(/goalTitle is ambiguous at event index/i);
      expect(sql).toMatch(/v_existing_goal\.goal_type\s+is distinct from/i);
      expect(sql).toMatch(/v_existing_goal\.life_area\s+is distinct from/i);
      expect(sql).toMatch(/v_existing_goal\.category\s+is distinct from/i);
      expect(sql).toMatch(/v_existing_goal\.metric_type\s+is distinct from/i);
      expect(sql).toMatch(/v_existing_goal\.parent_goal_id\s+is distinct from/i);
      expect(sql).toMatch(/goal identity conflicts with existing goal at event index/i);
      expect(sql).toMatch(/planned_metric_type[\s\S]*?planned_value[\s\S]*?planned_unit/i);
      expect(sql).toMatch(/v_event->>'lifeArea'/i);
    }
  });
});
