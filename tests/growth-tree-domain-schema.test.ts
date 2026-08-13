import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");

describe("final growth tree database schema", () => {
  it("contains no Ability compatibility structure", () => {
    expect(schema).not.toMatch(/create table(?: if not exists)? abilities/i);
    expect(schema).not.toMatch(/ability_id/i);
    expect(schema).not.toMatch(/\bability\b/i);
    expect(schema).not.toMatch(/apply_growth_model_mapping/i);
  });

  it("requires every goal to use one of the seven fixed life areas", () => {
    expect(schema).toMatch(/life_area\s+text\s+not null/i);
    for (const area of [
      "work",
      "growth",
      "health",
      "life",
      "finance",
      "relationships",
      "entertainment"
    ]) {
      expect(schema).toContain(`'${area}'`);
    }
  });

  it("uses immediately active metric constraints", () => {
    expect(schema).not.toMatch(/not valid/i);
    expect(schema).toMatch(
      /activities_value_positive_check\s+check\s*\(\s*value\s*>\s*0\s*\)/i
    );
    expect(schema).toMatch(/activities_metric_unit_check/i);
    expect(schema).toMatch(/tasks_planned_metric_unit_check/i);
  });

  it("keeps transactional write and completion functions service-role-only", () => {
    for (const rpc of [
      "record_life_event_batch",
      "complete_growth_task",
      "complete_growth_goal"
    ]) {
      expect(schema).toMatch(
        new RegExp(`revoke execute on function public\\.${rpc}\\(`, "i")
      );
      expect(schema).toMatch(
        new RegExp(`grant execute on function ${rpc}\\(`, "i")
      );
    }
  });

  it("guards completed short-term achievements in both write directions", () => {
    expect(schema).toMatch(
      /enforce_achievement_short_goal[\s\S]*?goal_type = 'short_term'[\s\S]*?status = 'completed'[\s\S]*?completed_at is not null/i
    );
    expect(schema).toMatch(/enforce_goal_achievement_shape/i);
    expect(schema).toMatch(/before update of goal_type, status, completed_at on goals/i);
  });

  it("keeps normalized aliases and stable task/activity indexes", () => {
    expect(schema).toMatch(
      /uq_goal_aliases_user_normalized_alias[\s\S]*?lower\(btrim\(alias\)\)/i
    );
    expect(schema).toContain("idx_tasks_user_status_due");
    expect(schema).toContain("idx_activities_user_task_unique");
    expect(schema).toContain("idx_reminders_user_status_time");
  });
});
