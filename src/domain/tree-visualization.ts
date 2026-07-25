import type { GoalGrowthStat } from "./aggregation";
import type { Activity, Goal } from "./types";

export type SceneVector = {
  x: number;
  y: number;
  z: number;
};

export type GrowthTreeBranch = {
  goalId: string;
  label: string;
  position: SceneVector;
  endPosition: SceneVector;
  thickness: number;
  glow: number;
  activityCount: number;
};

export type GrowthTreeNode = {
  goalId: string;
  parentGoalId: string | null;
  label: string;
  category: string;
  position: SceneVector;
  radius: number;
  glow: number;
  totalValue: number;
  activityCount: number;
  recentActivities: Activity[];
};

export type GrowthTreeScene = {
  root: {
    goalId: string;
    label: string;
  };
  branches: GrowthTreeBranch[];
  nodes: GrowthTreeNode[];
};

function round(value: number): number {
  return Number(value.toFixed(3));
}

function vector(x: number, y: number, z: number): SceneVector {
  return { x: round(x), y: round(y), z: round(z) };
}

function statFor(goalId: string, stats: GoalGrowthStat[]): GoalGrowthStat | undefined {
  return stats.find((stat) => stat.goalId === goalId);
}

export function buildGrowthTreeScene(goals: Goal[], stats: GoalGrowthStat[], activities: Activity[]): GrowthTreeScene {
  const root = goals.find((goal) => goal.id === "life") ?? goals[0];
  const rootId = root?.id ?? "root";
  const branches = goals.filter((goal) => goal.parentGoalId === rootId);
  const childGoals = goals.filter((goal) => goal.parentGoalId && goal.parentGoalId !== rootId);

  const branchModels = branches.map((goal, index): GrowthTreeBranch => {
    const angle = -Math.PI * 0.72 + index * (Math.PI * 1.44 / Math.max(1, branches.length - 1));
    const stat = statFor(goal.id, stats);
    const glow = Math.max(0.18, stat?.intensity ?? 0.18);
    return {
      goalId: goal.id,
      label: goal.title,
      position: vector(0, 0.2, 0),
      endPosition: vector(Math.cos(angle) * 2.7, 2.8 + glow * 0.8, Math.sin(angle) * 1.7),
      thickness: round(0.08 + glow * 0.16),
      glow,
      activityCount: stat?.activityCount ?? 0
    };
  });

  const nodes = childGoals.map((goal, index): GrowthTreeNode => {
    const parentIndex = Math.max(0, branches.findIndex((branch) => branch.id === goal.parentGoalId));
    const parentBranch = branchModels[parentIndex] ?? branchModels[0];
    const stat = statFor(goal.id, stats);
    const glow = Math.max(0.16, stat?.intensity ?? 0.16);
    const orbit = 0.46 + (index % 3) * 0.24;
    const angle = index * 2.399963229728653;
    const parentEnd = parentBranch?.endPosition ?? vector(0, 2.8, 0);
    const position = vector(
      parentEnd.x + Math.cos(angle) * orbit,
      parentEnd.y + 0.28 + (index % 2) * 0.34,
      parentEnd.z + Math.sin(angle) * orbit
    );
    const recentActivities = activities.filter((activity) => activity.goalId === goal.id).slice(0, 4);

    return {
      goalId: goal.id,
      parentGoalId: goal.parentGoalId,
      label: goal.title,
      category: goal.category,
      position,
      radius: round(0.15 + glow * 0.22),
      glow,
      totalValue: stat?.totalValue ?? 0,
      activityCount: stat?.activityCount ?? 0,
      recentActivities
    };
  });

  return {
    root: {
      goalId: rootId,
      label: root?.title ?? "人生"
    },
    branches: branchModels,
    nodes
  };
}
