import { describe, expect, it } from "vitest";
import { mapTaskRows } from "@/src/application/task-queries";

describe("task query DTO", () => {
  it("derives life area only from the attached goal", () => {
    expect(mapTaskRows([
      { id: "one", title: "买水", status: "open", goal_id: null, due_at: null, priority: "normal", created_at: "2026-08-13T00:00:00Z", goals: null, reminders: [] },
      { id: "goal", title: "练琴", status: "open", goal_id: "g1", due_at: null, priority: "high", created_at: "2026-08-13T00:00:00Z", goals: { title: "钢琴", life_area: "growth" }, reminders: [{ id: "r1", remind_at: "2026-08-14T00:00:00Z", repeat_rule: "daily" }] }
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "one", lifeArea: null, goal: null, reminder: null }),
      expect.objectContaining({ id: "goal", lifeArea: "growth", goal: { id: "g1", title: "钢琴" }, reminder: expect.objectContaining({ id: "r1", repeatRule: "daily" }) })
    ]));
  });
});
