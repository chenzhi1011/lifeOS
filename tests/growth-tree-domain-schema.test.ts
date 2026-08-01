import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");
const migration = readFileSync(
  "supabase/migrations/202608010001_growth_tree_domain.sql",
  "utf8"
);

describe("growth tree domain schema", () => {
  it.each([schema, migration])("defines explicit growth entities", (sql) => {
    expect(sql).toMatch(/create table(?: if not exists)? abilities/i);
    expect(sql).toContain("goal_type");
    expect(sql).toContain("ability_id");
    expect(sql).toContain("planned_metric_type");
    expect(sql).toContain("short_goal_id");
    expect(sql).toContain("idx_activities_user_task_unique");
    expect(sql).toContain("ability");
  });

  it("requires callers to classify every new goal explicitly", () => {
    expect(schema).toMatch(/goal_type\s+text\s+not null/i);
    expect(schema).not.toMatch(
      /goal_type\s+text\s+not null\s+default\s+'short_term'/i
    );
    expect(schema).toMatch(
      /insert into goals\s*\([\s\S]*?goal_type[\s\S]*?ability_id[\s\S]*?v_event->>'goalType'[\s\S]*?nullif\(v_event->>'abilityId', ''\)::uuid/i
    );
  });

  it.each([schema, migration])(
    "guards the achievement invariant from both write directions",
    (sql) => {
      expect(sql).toContain("enforce_achievement_short_goal");
      expect(sql).toMatch(/for share/i);
      expect(sql).toContain("enforce_goal_achievement_shape");
      expect(sql).toMatch(
        /before update of goal_type, ability_id on goals/i
      );
      expect(sql).toMatch(
        /from achievements[\s\S]*?short_goal_id = new\.id/i
      );
    }
  );

  it("fails migration with actionable duplicate-data diagnostics", () => {
    expect(migration).toMatch(
      /from achievements[\s\S]*?group by user_id, short_goal_id[\s\S]*?having count\(\*\) > 1/i
    );
    expect(migration).toMatch(
      /from activities[\s\S]*?group by user_id, task_id[\s\S]*?having count\(\*\) > 1/i
    );
    expect(migration).toContain(
      "manually deduplicate or map achievements before retrying migration"
    );
    expect(migration).toContain(
      "manually deduplicate or map activities before retrying migration"
    );
  });

  it("replaces the migrated batch RPC with explicit goal classification", () => {
    expect(migration).toMatch(
      /create or replace function record_life_event_batch\s*\(/i
    );
    expect(migration).toMatch(
      /create or replace function record_life_event_batch[\s\S]*?insert into goals\s*\([\s\S]*?goal_type[\s\S]*?ability_id[\s\S]*?v_event->>'goalType'[\s\S]*?nullif\(v_event->>'abilityId', ''\)::uuid/i
    );
  });
});
