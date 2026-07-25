import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { createInitialState } from "@/src/domain/seed";

describe("dashboard aggregation", () => {
  it("builds user-scoped goal stats", () => {
    const data = buildDashboardData(createInitialState(), "demo-user");
    const aws = data.goalStats.find((stat) => stat.goalId === "aws");
    expect(aws?.activityCount).toBe(3);
    expect(aws?.totalValue).toBe(190);
    expect(aws?.intensity).toBeGreaterThan(0);
  });

  it("builds heatmap points by date", () => {
    const data = buildDashboardData(createInitialState(), "demo-user");
    expect(data.heatmap.some((point) => point.date === "2026-07-01" && point.count === 1)).toBe(true);
  });

  it("does not leak another user's data", () => {
    const data = buildDashboardData(createInitialState(), "other-user");
    expect(data.goalStats).toHaveLength(0);
    expect(data.recentActivities).toHaveLength(0);
  });
});
