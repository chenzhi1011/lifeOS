import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");
const migration = readFileSync(
  "supabase/migrations/202608010001_growth_tree_domain.sql",
  "utf8"
);
const mappingMigration = readFileSync(
  "supabase/migrations/202608010003_growth_model_mapping.sql",
  "utf8"
);
const validationOperation = readFileSync(
  "supabase/operations/validate_growth_tree_constraints.sql",
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

  it.each([schema, mappingMigration])(
    "guards the manual mapping RPC with complete expected snapshots and service-role-only execution",
    (sql) => {
      expect(sql).toMatch(
        /create or replace function apply_growth_model_mapping\s*\(\s*p_mapping jsonb,\s*p_expected_snapshot jsonb/i
      );
      expect(sql).toContain("expectedGoalIds");
      expect(sql).toContain("expectedTaskIds");
      expect(sql).toContain("expectedActivityIds");
      expect(sql).toContain("expectedAchievementIds");
      expect(sql).toMatch(/for update/i);
      expect(sql).toMatch(/raise exception 'snapshot mismatch/i);
      expect(sql).toMatch(/item->>'goalType' is null/i);
      expect(sql).toMatch(
        /jsonb_typeof\(item->'target'\) is distinct from 'object'/i
      );
      expect(sql).toMatch(
        /jsonb_typeof\(p_expected_snapshot#>'\{counts,profiles\}'\) is distinct from 'number'/i
      );
      expect(sql).toMatch(
        /cardinality\(v_actual_goal_ids\) is distinct from v_expected_goal_count/i
      );
      expect(sql).toMatch(
        /revoke execute on function public\.apply_growth_model_mapping\(jsonb, jsonb\) from public, anon, authenticated/i
      );
      expect(sql).toMatch(
        /grant execute on function apply_growth_model_mapping\(jsonb, jsonb\) to service_role/i
      );
    }
  );

  it("keeps constraint validation as a separate explicit operation", () => {
    const statements = validationOperation
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    expect(statements).toEqual([
      "alter table goals validate constraint goals_goal_type_required",
      "alter table goals validate constraint goals_goal_type_check",
      "alter table goals validate constraint goals_ability_shape_check",
      "alter table goals validate constraint goals_completed_at_check",
      "alter table goals validate constraint goals_ability_fk",
      "alter table tasks validate constraint tasks_planned_metric_shape_check"
    ]);
    expect(mappingMigration).not.toMatch(/validate constraint/i);
  });
});
