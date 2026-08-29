import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Custom GPT action documentation contract", () => {
  const openapi = readFileSync(resolve("docs/custom-gpt-actions/openapi.yaml"), "utf8");
  const instructions = readFileSync(resolve("docs/custom-gpt-actions/instructions.md"), "utf8");

  it("publishes only the transactional batch endpoint", () => {
    expect(openapi).toContain("/api/actions/life-events:");
    expect(openapi).not.toContain("/api/actions/life-event:");
    expect(existsSync(resolve("app/api/actions/life-event/route.ts"))).toBe(false);
  });

  it("exposes fixed life areas and no Ability schema", () => {
    expect(openapi).toMatch(/lifeArea:[\s\S]*enum: \[work, growth, health, life, finance, relationships, entertainment\]/);
    expect(openapi).not.toMatch(/Ability/);
    expect(instructions).toContain("long_term");
    expect(instructions).toContain("short_term");
    expect(instructions).toContain("lifeArea");
  });

  it("machine-encodes one-off and goal task paths plus reminder choices", () => {
    expect(openapi).toMatch(/const: one_off[\s\S]*not: \{ required: \[goal\] \}/);
    expect(openapi).toMatch(/const: goal[\s\S]*required: \[path, goal\]/);
    expect(openapi).toContain("ReminderChoice:");
    expect(openapi).toMatch(/const: default[\s\S]*const: none[\s\S]*const: custom/);
  });

  it("inlines path parameters for the Custom GPT Actions parser", () => {
    expect(openapi).not.toMatch(/parameters:\s*\[\{ \$ref:/);
    expect(openapi.match(/name: id\s+in: path\s+required: true/g)).toHaveLength(2);
  });
});
