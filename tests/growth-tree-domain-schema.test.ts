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
});
