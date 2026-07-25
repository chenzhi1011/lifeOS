import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { createInitialState } from "@/src/domain/seed";
import { buildGrowthTreeScene } from "@/src/domain/tree-visualization";

describe("buildGrowthTreeScene", () => {
  it("maps goals and stats into a holographic scene model", () => {
    const dashboard = buildDashboardData(createInitialState(), "demo-user");
    const scene = buildGrowthTreeScene(dashboard.goals, dashboard.goalStats, dashboard.recentActivities);

    expect(scene.root.label).toBe("人生");
    expect(scene.branches.map((branch) => branch.label)).toEqual(["职业", "健康", "财富", "兴趣"]);
    expect(scene.nodes.some((node) => node.goalId === "aws" && node.activityCount === 3)).toBe(true);
    expect(scene.nodes.find((node) => node.goalId === "aws")?.glow).toBeGreaterThan(0.3);
  });

  it("uses stable positions for repeated renders", () => {
    const dashboard = buildDashboardData(createInitialState(), "demo-user");
    const first = buildGrowthTreeScene(dashboard.goals, dashboard.goalStats, dashboard.recentActivities);
    const second = buildGrowthTreeScene(dashboard.goals, dashboard.goalStats, dashboard.recentActivities);

    expect(first.nodes.map((node) => node.position)).toEqual(second.nodes.map((node) => node.position));
  });
});
