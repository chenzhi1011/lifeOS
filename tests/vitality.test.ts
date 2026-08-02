import { describe, expect, it } from "vitest";
import {
  buildVitalityElements,
  typeFromId,
  type VitalityElementType
} from "@/src/domain/vitality";
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

function idsFor(
  type: VitalityElementType,
  count: number,
  prefix: string
): string[] {
  const ids: string[] = [];
  for (let index = 0; ids.length < count; index += 1) {
    const id = `${prefix}-${String(index).padStart(3, "0")}`;
    if (typeFromId(id) === type) {
      ids.push(id);
    }
  }
  return ids;
}

describe("buildVitalityElements", () => {
  it("assigns type from task identity without cross-type fallback", () => {
    const waterTasks = idsFor("water", 12, "water-only").map((id) =>
      task(id, "2026-07-20T12:00:00.000Z")
    );

    const elements = buildVitalityElements(
      waterTasks,
      new Date("2026-08-01T18:30:00.000Z")
    );

    expect(elements).toHaveLength(7);
    expect(elements.every((element) => element.type === "water")).toBe(true);
  });

  it("selects the newest tasks independently within each cap and ignores input order", () => {
    const datedTasks = (["water", "creature", "flora"] as const).flatMap(
      (type) =>
        idsFor(type, 10, `dated-${type}`).map((id, index) =>
          task(id, `2026-07-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`)
        )
    );
    const asOf = new Date("2026-08-01T18:30:00.000Z");

    const first = buildVitalityElements(datedTasks, asOf);
    const reversed = buildVitalityElements([...datedTasks].reverse(), asOf);
    const ids = (type: VitalityElementType) =>
      first.filter((element) => element.type === type).map((element) => element.taskId);

    expect(reversed).toEqual(first);
    expect(first).toHaveLength(18);
    expect(first.every((element) => element.source === "one_off_completion")).toBe(true);
    expect(first.every((element) => !("animation" in element))).toBe(true);
    expect(ids("water")).toEqual(
      datedTasks
        .filter((item) => typeFromId(item.id) === "water")
        .slice(-7)
        .reverse()
        .map((item) => item.id)
    );
    expect(ids("creature")).toEqual(
      datedTasks
        .filter((item) => typeFromId(item.id) === "creature")
        .slice(-3)
        .reverse()
        .map((item) => item.id)
    );
    expect(ids("flora")).toEqual(
      datedTasks
        .filter((item) => typeFromId(item.id) === "flora")
        .slice(-8)
        .reverse()
        .map((item) => item.id)
    );
  });

  it("keeps existing selected task type and position stable when unrelated earlier ids are added", () => {
    const existing = idsFor("water", 10, "z-existing").map((id) =>
      task(id, "2026-07-20T12:00:00.000Z")
    );
    const unrelated = task(
      idsFor("water", 1, "a-unrelated")[0]!,
      "2026-07-20T12:00:00.000Z"
    );
    const asOf = new Date("2026-08-01T18:30:00.000Z");
    const baseline = buildVitalityElements(existing, asOf);
    const expanded = buildVitalityElements([unrelated, ...existing], asOf);
    const expandedByTask = new Map(expanded.map((element) => [element.taskId, element]));

    for (const element of baseline) {
      const stillSelected = expandedByTask.get(element.taskId);
      if (stillSelected) {
        expect(stillSelected.type).toBe(element.type);
        expect(stillSelected.position).toEqual(element.position);
      }
    }
  });

  it("filters non-one-offs and out-of-window dates and rejects an invalid asOf", () => {
    const validId = idsFor("flora", 1, "valid")[0]!;
    const tasks = [
      task(validId, "2026-07-03T00:00:00.000Z"),
      task("too-old", "2026-07-02T23:59:59.999Z"),
      task("future", "2026-08-02T00:00:00.000Z"),
      task("invalid-date", "not-a-date"),
      task("goal-task", "2026-07-20T12:00:00.000Z", { goalId: "goal-a" }),
      task("open-task", "2026-07-20T12:00:00.000Z", { status: "open" })
    ];
    const elements = buildVitalityElements(
      tasks,
      new Date("2026-08-01T18:30:00.000Z")
    );

    expect(elements.map((element) => element.taskId)).toEqual([validId]);
    expect(() => buildVitalityElements(tasks, new Date(Number.NaN))).toThrow(
      /valid asOf date/
    );
  });
});
