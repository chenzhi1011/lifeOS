import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { GrowthTreeDetailsPanel } from "@/src/components/GrowthTreeDetailsPanel";
import type {
  GrowthTreeLeaf,
  GrowthTreeWoodSegment
} from "@/src/domain/tree-visualization";
import type { Activity } from "@/src/domain/types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

afterEach(cleanup);

function activity(index: number): Activity {
  return {
    id: `activity-${index}`,
    userId: "demo-user",
    goalId: "career",
    taskId: null,
    messageId: "test",
    summary: `Activity ${index}`,
    metricType: "count",
    value: 1,
    unit: "count",
    occurredOn: `2026-07-${String(index + 1).padStart(2, "0")}`,
    createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
  };
}

const segment: GrowthTreeWoodSegment = {
  goalId: "career",
  parentGoalId: "root",
  depth: 1,
  label: "职业",
  category: "职业",
  startPosition: { x: 0, y: 1, z: 0 },
  endPosition: { x: 1, y: 2, z: 0 },
  thickness: 0.2,
  totalValue: 12,
  activityCount: 6,
  intensity: 0.5,
  recentActivities: [activity(5)]
};

describe("GrowthTreeDetailsPanel", () => {
  it("renders nothing before a trunk or branch is selected", () => {
    render(<GrowthTreeDetailsPanel segment={null} leaf={null} vitality={0.5} />);

    expect(screen.queryByTestId("growth-tree-details")).toBeNull();
  });

  it("shows goal details after a trunk or branch is selected", () => {
    render(<GrowthTreeDetailsPanel segment={segment} leaf={null} vitality={0.5} />);

    expect(screen.getByText("职业")).toBeTruthy();
    expect(screen.getByText("12 accumulated / 6 activities")).toBeTruthy();
  });

  it("shows at most five activities from a selected leaf", () => {
    const leaf: GrowthTreeLeaf = {
      id: "career-leaf-0",
      goalId: "career",
      position: { x: 1, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      activities: Array.from({ length: 6 }, (_, index) => activity(index))
    };

    render(<GrowthTreeDetailsPanel segment={segment} leaf={leaf} vitality={0.5} />);

    expect(screen.getAllByTestId("leaf-activity")).toHaveLength(5);
    expect(screen.getByText("Activity 0")).toBeTruthy();
    expect(screen.queryByText("Activity 5")).toBeNull();
  });
});
