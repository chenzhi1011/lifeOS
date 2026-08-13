import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("frontend boundary", () => {
  it("keeps pages and React components away from database modules", () => {
    const result = spawnSync("rg", ["-l", "src/db/", "app", "src/components"], { encoding: "utf8" });
    expect(result.stdout.trim()).toBe("");
  });

  it("keeps the removed non-transactional endpoint absent", () => {
    expect(() => readFileSync("app/api/actions/life-event/route.ts", "utf8")).toThrow();
  });
});
