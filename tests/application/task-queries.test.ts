import { describe, expect, it } from "vitest";
import { mapTaskRows } from "@/src/application/task-queries";

describe("task query DTO", () => {
  it("derives life area only from the attached goal", () => {
    expect(mapTaskRows([
      { id: "one", title: "买水", status: "open", goal_id: null, due_at: null, priority: "normal", planned_metric_type: null, planned_value: null, planned_unit: null, created_at: "2026-08-13T00:00:00Z", completed_at: null, goals: null, reminders: [] },
      { id: "goal", title: "练琴", status: "open", goal_id: "g1", due_at: null, priority: "high", planned_metric_type: "duration", planned_value: 30, planned_unit: "minute", created_at: "2026-08-13T00:00:00Z", completed_at: null, goals: { title: "钢琴", life_area: "growth" }, reminders: [{ id: "r1", remind_at: "2026-08-14T00:00:00Z", repeat_rule: "daily", status: "scheduled" }] }
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "one", lifeArea: null, goalId: null, goalTitle: null, plannedMetric: null, reminder: null, completedAt: null }),
      expect.objectContaining({ id: "goal", lifeArea: "growth", goalId: "g1", goalTitle: "钢琴", plannedMetric: { type: "duration", value: 30, unit: "minute" }, reminder: { id: "r1", remindAt: "2026-08-14T00:00:00Z", status: "scheduled" } })
    ]));
  });
});
