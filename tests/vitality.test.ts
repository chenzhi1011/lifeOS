import { describe, expect, it } from "vitest";
import { buildVitalityElements } from "@/src/domain/vitality";
import type { Task } from "@/src/domain/types";

function task(
  id: string,
  completedAt: string,
  overrides: Partial<Task> = {}
): Task {
  return {
    id,
    userId: "demo-user",
    goalId: null,
    messageId: `message-${id}`,
    title: id,
    status: "completed",
    dueAt: null,
    priority: "normal",
    plannedMetricType: null,
    plannedValue: null,
    plannedUnit: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    completedAt,
    ...overrides
  };
}

describe("buildVitalityElements", () => {
  it("uses only recent completed one-offs and remains deterministic within caps", () => {
    const valid = Array.from({ length: 24 }, (_, index) =>
      task(`valid-${String(index).padStart(2, "0")}`, "2026-07-20T12:00:00.000Z")
    );
    valid.push(
      task("00-window-start", "2026-07-03T00:00:00.000Z"),
      task("01-window-end", "2026-08-01T23:59:59.999Z")
    );
    const tasks = [
      ...valid,
      task("too-old", "2026-07-02T23:59:59.999Z"),
      task("future", "2026-08-02T00:00:00.000Z"),
      task("goal-task", "2026-07-20T12:00:00.000Z", { goalId: "goal-a" }),
      task("open-task", "2026-07-20T12:00:00.000Z", { status: "open" })
    ];
    const asOf = new Date("2026-08-01T18:30:00.000Z");

    const first = buildVitalityElements(tasks, asOf);
    const second = buildVitalityElements([...tasks].reverse(), asOf);
    const count = (type: "water" | "creature" | "flora") =>
      first.filter((element) => element.type === type).length;

    expect(second).toEqual(first);
    expect(first).toHaveLength(18);
    expect(count("water")).toBeLessThanOrEqual(7);
    expect(count("creature")).toBeLessThanOrEqual(3);
    expect(count("flora")).toBeLessThanOrEqual(8);
    expect(first.every((element) => element.source === "one_off_completion")).toBe(true);
    expect(first.every((element) => valid.some((item) => item.id === element.taskId))).toBe(true);
    expect(first.map((element) => element.taskId)).toEqual(
      expect.arrayContaining(["00-window-start", "01-window-end"])
    );
    expect(first.every((element) => !("animation" in element))).toBe(true);
  });
});
