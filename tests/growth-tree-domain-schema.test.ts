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

  it("stores duration in minutes and binds activity metrics to their goals", () => {
    expect(schema).toMatch(/activities_metric_unit_check[\s\S]*?metric_type = 'duration' and unit = 'minute'/i);
    expect(schema).not.toMatch(/metric_type = 'duration' and unit in \('minute', 'hour'\)/i);
    expect(schema).toMatch(/unique\s*\(\s*user_id\s*,\s*id\s*,\s*metric_type\s*\)/i);
    expect(schema).toMatch(/foreign key\s*\(\s*user_id\s*,\s*goal_id\s*,\s*metric_type\s*\)\s*references goals\s*\(\s*user_id\s*,\s*id\s*,\s*metric_type\s*\)/i);
  });

  it("keeps task completion state and reminder ownership structurally valid", () => {
    expect(schema).toMatch(/tasks_completion_shape_check[\s\S]*?status = 'completed'[\s\S]*?completed_at is not null/i);
    expect(schema).toMatch(/task_id\s+uuid\s+not null/i);
    expect(schema).toMatch(/update reminders[\s\S]*?status = 'cancelled'[\s\S]*?task_id = p_task_id[\s\S]*?status = 'scheduled'/i);
  });

  it("allows completed goal titles to be reused and removes unused goal hierarchy fields", () => {
    expect(schema).not.toMatch(/unique\s*\(\s*user_id\s*,\s*title\s*\)/i);
    expect(schema).toMatch(/unique index uq_goals_user_current_title[\s\S]*?lower\(btrim\(title\)\)[\s\S]*?where status in \('active', 'paused'\)/i);
    expect(schema).not.toMatch(/\bcategory\s+text/i);
    expect(schema).not.toMatch(/\bparent_goal_id\b/i);
  });

  it("uses optional source-message provenance for domain rows", () => {
    for (const table of ["tasks", "activities", "reminders"]) {
      const definition = schema.match(new RegExp(`create table ${table} \\([\\s\\S]*?\\n\\);`, "i"))?.[0] ?? "";
      expect(definition).toMatch(/source_message_id\s+uuid/i);
      expect(definition).not.toMatch(/source_message_id\s+uuid\s+not null/i);
      expect(definition).not.toMatch(/\bmessage_id\b/i);
    }
  });
});
