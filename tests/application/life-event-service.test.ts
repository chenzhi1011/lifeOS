import { describe, expect, it, vi } from "vitest";
import { recordLifeEventBatch } from "@/src/application/life-event-service";

const command = {
  idempotencyKey: "service-1",
  rawText: "创建目标",
  events: [{ type: "goal" as const, goalType: "long_term" as const, title: "写作", category: "成长", lifeArea: "growth" as const, confidence: 0.9 }]
};

describe("recordLifeEventBatch", () => {
  it("uses the principal user and shared preparation pipeline", async () => {
    const readContext = vi.fn().mockResolvedValue({ timezone: "Asia/Tokyo", defaultReminderTime: "09:00", goals: [], aliases: [], openTasks: [] });
    const writeBatch = vi.fn().mockResolvedValue({ batchId: "batch-1", duplicate: false, results: [] });
    await recordLifeEventBatch({ userId: "user-1", actorType: "session" }, command, { readContext, writeBatch, now: () => new Date("2026-08-13T00:00:00Z") });
    expect(readContext).toHaveBeenCalledWith("user-1");
    expect(writeBatch).toHaveBeenCalledWith("user-1", expect.objectContaining({ idempotencyKey: "service-1" }));
  });
});
