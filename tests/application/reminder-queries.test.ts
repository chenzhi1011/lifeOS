import { describe, expect, it } from "vitest";
import { mapReminderRows } from "@/src/application/reminder-queries";

describe("reminder query DTO", () => {
  it("returns stable reminder fields without raw database rows", () => {
    expect(mapReminderRows([{ id: "r1", task_id: "t1", remind_at: "2026-08-14T00:00:00Z", repeat_rule: "weekly", status: "scheduled", created_at: "2026-08-13T00:00:00Z", tasks: { title: "复习" } }]))
      .toEqual([{ id: "r1", taskId: "t1", taskTitle: "复习", remindAt: "2026-08-14T00:00:00Z", repeatRule: "weekly", status: "scheduled", createdAt: "2026-08-13T00:00:00Z" }]);
  });
});
