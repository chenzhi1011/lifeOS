import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/202607270001_custom_gpt_batch_intake.sql"
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
});
