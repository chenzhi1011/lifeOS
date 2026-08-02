import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardError from "@/app/dashboard/error";
import DashboardLoading from "@/app/dashboard/loading";
import { GrowthTreeDashboard } from "@/src/components/GrowthTreeDashboard";
import type { GrowthTreeSelection } from "@/src/domain/tree-interaction";
import type {
  ActivityLeaf,
  GrowthTreeViewModel,
  TreeWood
} from "@/src/domain/tree-visualization";
import type { Achievement, Activity } from "@/src/domain/types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

type SceneAdapterProps = {
  viewModel: GrowthTreeViewModel;
  selection: GrowthTreeSelection;
  onSelectWood: (wood: Pick<TreeWood, "entityType" | "entityId">) => void;
  onSelectLeaf: (leaf: Pick<ActivityLeaf, "activityId" | "goalId">) => void;
  onClearSelection: () => void;
};

vi.mock("@/src/components/GrowthTreeScene", () => ({
  GrowthTreeScene: ({
    viewModel,
    selection,
    onSelectWood,
    onSelectLeaf,
    onClearSelection
  }: SceneAdapterProps) => (
    <div data-selection={selection.entityId ?? "none"} data-testid="realistic-growth-tree-canvas">
      <button onClick={() => onSelectWood(viewModel.abilityBranches[0]!)}>选择能力</button>
      <button onClick={() => onSelectWood(viewModel.longGoalTwigs[0]!)}>选择长期目标</button>
      <button onClick={() => onSelectWood(viewModel.shortGoalBranches[0]!)}>选择短期目标</button>
      <button onClick={() => onSelectLeaf(viewModel.activityLeaves[0]!)}>选择叶片</button>
      <button onClick={onClearSelection}>清除选择</button>
    </div>
  )
}));

afterEach(cleanup);

function activity(): Activity {
  return {
    id: "activity-recent",
    userId: "demo-user",
    goalId: "long-goal",
    taskId: null,
    messageId: "message-activity",
    summary: "完成一次系统设计练习",
    metricType: "count",
    value: 1,
    unit: "count",
    occurredOn: "2026-08-01",
    createdAt: "2026-08-01T09:00:00.000Z"
  };
}

function wood(
  entityType: TreeWood["entityType"],
  entityId: string,
  label: string,
  overrides: Partial<TreeWood> = {}
): TreeWood {
  return {
    entityType,
    entityId,
    label,
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 1, z: 0 },
    thickness: 0.2,
    status: "active",
    category: "成长",
    totalValue: 12,
    activityCount: 3,
    recentActivities: [],
    ...overrides
  };
}

function viewModel(): GrowthTreeViewModel {
  const recentActivity = activity();
  return {
    root: wood("root", "root", "人生"),
    abilityBranches: [wood("ability", "ability-a", "前端能力")],
    longGoalTwigs: [
      wood("long_goal", "long-goal", "坚持学习", {
        totalValue: 24,
        activityCount: 8,
        recentActivities: [recentActivity]
      })
    ],
    shortGoalBranches: [wood("short_goal", "short-goal", "准备面试")],
    activityLeaves: [
      {
        activityId: recentActivity.id,
        goalId: recentActivity.goalId,
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
        activities: [recentActivity]
      }
    ],
    vitalityElements: [],
    diagnostics: []
  };
}

function achievement(
  id: string,
  title: string,
  achievedAt: string,
  overrides: Partial<Achievement> = {}
): Achievement {
  return {
    id,
    userId: "demo-user",
    shortGoalId: `goal-${id}`,
    title,
    metricType: "milestone",
    thresholdValue: null,
    note: null,
    evidenceUrl: null,
    achievedAt,
    createdAt: achievedAt,
    ...overrides
  };
}

describe("GrowthTreeDashboard", () => {
  it("opens one accessible achievement drawer with newest harvests first", () => {
    const achievements = [
      achievement("old", "通过笔试", "2026-07-01T00:00:00.000Z"),
      achievement("new", "通过前端面试", "2026-08-01T00:00:00.000Z", {
        note: "第一次拿到理想岗位 offer",
        evidenceUrl: "https://example.com/offer"
      })
    ];
    render(<GrowthTreeDashboard viewModel={viewModel()} achievements={achievements} />);

    const trigger = screen.getByRole("button", { name: "果实面板 · 2" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const closeButton = screen.getByRole("button", { name: "关闭果实面板" });
    const evidenceLink = screen.getByRole("link", { name: "查看成果证据" });
    expect(document.activeElement).toBe(closeButton);
    expect(screen.getAllByTestId("achievement-title").map((node) => node.textContent)).toEqual([
      "通过前端面试",
      "通过笔试"
    ]);
    expect(screen.getByText("第一次拿到理想岗位 offer")).toBeTruthy();
    expect(evidenceLink.getAttribute("href")).toBe(
      "https://example.com/offer"
    );
    expect(screen.queryByText("未完成 Task")).toBeNull();

    evidenceLink.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(evidenceLink);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("restores trigger focus after button and backdrop closure", () => {
    render(<GrowthTreeDashboard viewModel={viewModel()} achievements={[]} />);
    const trigger = screen.getByRole("button", { name: "果实面板 · 0" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "关闭果实面板" }));
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("achievement-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("lifts scene selections into one HTML detail panel", () => {
    render(<GrowthTreeDashboard viewModel={viewModel()} achievements={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "选择能力" }));
    expect(screen.getByRole("complementary", { name: "成长详情" }).textContent).toContain("前端能力");

    fireEvent.click(screen.getByRole("button", { name: "选择长期目标" }));
    expect(screen.getByRole("complementary", { name: "成长详情" }).textContent).toContain("坚持学习");
    expect(screen.getByText("24 累计值 · 8 次记录")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "选择叶片" }));
    expect(screen.getByText("完成一次系统设计练习")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "选择短期目标" }));
    expect(screen.getByRole("complementary", { name: "成长详情" }).textContent).toContain("准备面试");

    fireEvent.click(screen.getByRole("button", { name: "清除选择" }));
    expect(screen.queryByRole("complementary", { name: "成长详情" })).toBeNull();
  });

  it("shows diagnostics above the still-available canvas instead of an empty prompt", () => {
    const model = viewModel();
    model.abilityBranches = [];
    model.longGoalTwigs = [];
    model.shortGoalBranches = [];
    model.activityLeaves = [];
    model.diagnostics = [
      { code: "untyped_goal", entityId: "legacy-goal", message: "Goal has no goal type." }
    ];

    render(<GrowthTreeDashboard viewModel={model} achievements={[]} />);

    expect(screen.getByTestId("realistic-growth-tree-canvas")).toBeTruthy();
    expect(screen.getByRole("status", { name: "数据待确认" }).textContent).toContain("legacy-goal");
    expect(screen.queryByText("创建第一个能力或目标")).toBeNull();
  });

  it("shows a creation guide only for genuinely empty growth data", () => {
    const model = viewModel();
    model.abilityBranches = [];
    model.longGoalTwigs = [];
    model.shortGoalBranches = [];
    model.activityLeaves = [];

    render(<GrowthTreeDashboard viewModel={model} achievements={[]} />);

    expect(screen.getByText("创建第一个能力或目标")).toBeTruthy();
  });

  it("does not show the empty guide when vitality elements are present", () => {
    const model = viewModel();
    model.abilityBranches = [];
    model.longGoalTwigs = [];
    model.shortGoalBranches = [];
    model.activityLeaves = [];
    model.vitalityElements = [
      {
        id: "vitality-task-a",
        taskId: "task-a",
        type: "water",
        source: "one_off_completion",
        position: { x: 0, y: 1, z: 0 }
      }
    ];

    render(<GrowthTreeDashboard viewModel={model} achievements={[]} />);

    expect(screen.getByTestId("realistic-growth-tree-canvas")).toBeTruthy();
    expect(screen.queryByText("创建第一个能力或目标")).toBeNull();
  });
});

describe("dashboard route states", () => {
  it("renders an announced loading state", () => {
    render(<DashboardLoading />);
    expect(screen.getByRole("status").textContent).toContain("正在生长你的树");
  });

  it("renders the dashboard error and retries with reset", () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error("database unavailable")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(screen.getByText("树数据加载失败")).toBeTruthy();
    expect(reset).toHaveBeenCalledOnce();
  });
});
