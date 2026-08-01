import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readDoc(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Custom GPT action documentation contract", () => {
  const openapi = readDoc("docs/custom-gpt-actions/openapi.yaml");
  const instructions = readDoc("docs/custom-gpt-actions/instructions.md");
  const setup = readDoc("docs/custom-gpt-actions/setup.md");

  it("documents ability, typed goals, and both explicit task paths", () => {
    expect(openapi).toContain("/api/actions/life-events:");
    expect(openapi).toMatch(/enum:\s*\[[^\]]*ability[^\]]*\]/);
    expect(openapi).toContain("goalType:");
    expect(openapi).toContain("path:");
    expect(openapi).toMatch(/enum:\s*\[one_off, goal\]/);

    expect(instructions).toContain("ability");
    expect(instructions).toContain("long_term");
    expect(instructions).toContain("short_term");
    expect(instructions).toContain("one_off");
    expect(instructions).toContain("goal");
  });

  it("keeps one-off tasks outside goals", () => {
    expect(instructions).toMatch(/一次性[^\n]*不[^\n]*Goal/i);
    expect(instructions).not.toMatch(/一次性[^\n]*(?:创建|归入)[^\n]*[“\"]?生活[”\"]?[^\n]*Goal/i);
  });

  it("points setup at the batch endpoint and explicit classification flow", () => {
    expect(setup).toContain("/api/actions/life-events");
    expect(setup).toContain("one_off");
    expect(setup).toContain("goalType");
  });
});
