import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TreeDetailPanel } from "@/src/components/TreeDetailPanel";
import type { GrowthTreeSelection } from "@/src/domain/tree-interaction";
import type {
  GrowthTreeViewModel,
  TreeWood
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
    sourceMessageId: "test",
    summary: `Activity ${index}`,
    metricType: "count",
    value: 1,
    unit: "count",
    occurredOn: `2026-07-${String(index + 1).padStart(2, "0")}`,
    createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
  };
}

const segment: TreeWood = {
  entityType: "long_goal",
  entityId: "career",
  label: "职业",
  category: "职业",
  start: { x: 0, y: 1, z: 0 },
  end: { x: 1, y: 2, z: 0 },
  thickness: 0.2,
  status: "active",
  totalValue: 12,
  activityCount: 6,
  recentActivities: [activity(5)]
};

const emptySelection: GrowthTreeSelection = {
  entityType: null,
  entityId: null,
  leafId: null
};

const viewModel: GrowthTreeViewModel = {
  recipe: {} as GrowthTreeViewModel["recipe"],
  branches: [],
  semanticLeafTwigs: [],
  semanticLeaves: [],
  root: { ...segment, entityType: "root", entityId: "root", label: "人生" },
  lifeAreaBranches: [],
  longGoalTwigs: [segment],
  shortGoalBranches: [],
  activityLeaves: [
    {
      activityId: "activity-0",
      goalId: "career",
      position: { x: 1, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      activities: Array.from({ length: 6 }, (_, index) => activity(index))
    }
  ],
  vitalityElements: [],
  diagnostics: []
};

describe("TreeDetailPanel", () => {
  it("renders nothing before a trunk or branch is selected", () => {
    render(
      <TreeDetailPanel
        onClose={() => undefined}
        selection={emptySelection}
        viewModel={viewModel}
      />
    );

    expect(screen.queryByTestId("growth-tree-details")).toBeNull();
  });

  it("shows goal details after a trunk or branch is selected", () => {
    render(
      <TreeDetailPanel
        onClose={() => undefined}
        selection={{ entityType: "long_goal", entityId: "career", leafId: null }}
        viewModel={viewModel}
      />
    );

    expect(screen.getByText("职业")).toBeTruthy();
    expect(screen.getByText("12 累计值 · 6 次记录")).toBeTruthy();
  });

  it("shows at most five activities from a selected leaf", () => {
    render(
      <TreeDetailPanel
        onClose={() => undefined}
        selection={{ entityType: "long_goal", entityId: "career", leafId: "activity-0" }}
        viewModel={viewModel}
      />
    );

    expect(screen.getAllByTestId("leaf-activity")).toHaveLength(5);
    expect(screen.getByText("Activity 0")).toBeTruthy();
    expect(screen.queryByText("Activity 5")).toBeNull();
  });
});
