import type { GoalGrowthStat } from "./aggregation";
import type { Activity, Goal } from "./types";

export type SceneVector = {
  x: number;
  y: number;
  z: number;
};

export type GrowthTreeDepth = 0 | 1 | 2 | 3;

export type GrowthTreeWoodSegment = {
  goalId: string;
  parentGoalId: string | null;
  depth: GrowthTreeDepth;
  label: string;
  category: string;
  startPosition: SceneVector;
  endPosition: SceneVector;
  thickness: number;
  totalValue: number;
  activityCount: number;
  intensity: number;
  recentActivities: Activity[];
};

export type GrowthTreeLeaf = {
  id: string;
  goalId: string;
  position: SceneVector;
  rotation: SceneVector;
  scale: number;
  activities: Activity[];
};

export type GrowthTreeScene = {
  root: GrowthTreeWoodSegment | null;
  branches: GrowthTreeWoodSegment[];
  leaves: GrowthTreeLeaf[];
  vitality: number;
};

function round(value: number): number {
  return Number(value.toFixed(3));
}

function vector(x: number, y: number, z: number): SceneVector {
  return { x: round(x), y: round(y), z: round(z) };
}

function interpolate(start: SceneVector, end: SceneVector, amount: number): SceneVector {
  return vector(
    start.x + (end.x - start.x) * amount,
    start.y + (end.y - start.y) * amount,
    start.z + (end.z - start.z) * amount
  );
}

function compareActivities(left: Activity, right: Activity): number {
  return (
    right.occurredOn.localeCompare(left.occurredOn) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function statFor(goalId: string, stats: GoalGrowthStat[]): GoalGrowthStat | undefined {
  return stats.find((stat) => stat.goalId === goalId);
}

function activitiesFor(goalId: string, activities: Activity[]): Activity[] {
  return activities.filter((activity) => activity.goalId === goalId).sort(compareActivities);
}

function createWoodSegment(
  goal: Goal,
  depth: GrowthTreeDepth,
  startPosition: SceneVector,
  endPosition: SceneVector,
  stats: GoalGrowthStat[],
  activities: Activity[]
): GrowthTreeWoodSegment {
  const goalActivities = activitiesFor(goal.id, activities);
  const stat = statFor(goal.id, stats);
  const activityCount = stat?.activityCount ?? goalActivities.length;
  const totalValue = stat?.totalValue ?? goalActivities.reduce((sum, activity) => sum + activity.value, 0);
  const intensity = stat?.intensity ?? (activityCount > 0 ? Math.min(1, activityCount / 5) : 0.08);

  return {
    goalId: goal.id,
    parentGoalId: goal.parentGoalId,
    depth,
    label: goal.title,
    category: goal.category,
    startPosition,
    endPosition,
    thickness: round(depth === 0 ? 0.34 : Math.max(0.07, 0.22 - depth * 0.045 + intensity * 0.035)),
    totalValue,
    activityCount,
    intensity: round(intensity),
    recentActivities: goalActivities.slice(0, 5)
  };
}

function createActivityLeaves(
  segments: GrowthTreeWoodSegment[],
  activities: Activity[]
): GrowthTreeLeaf[] {
  return segments.flatMap((segment) => {
    const ordered = activitiesFor(segment.goalId, activities);
    const leaves: GrowthTreeLeaf[] = [];

    for (let offset = 0; offset < ordered.length; offset += 5) {
      const groupIndex = offset / 5;
      const activityGroup = ordered.slice(offset, offset + 5);
      const anchor = interpolate(segment.startPosition, segment.endPosition, 0.68 + (groupIndex % 3) * 0.1);
      const side = groupIndex % 2 === 0 ? 1 : -1;

      leaves.push({
        id: `${segment.goalId}-leaf-${groupIndex}`,
        goalId: segment.goalId,
        position: vector(anchor.x + side * 0.13, anchor.y + 0.1 + Math.floor(groupIndex / 3) * 0.08, anchor.z),
        rotation: vector(0.2 + groupIndex * 0.17, groupIndex * 1.31, side * 0.42),
        scale: round(0.82 + Math.min(0.35, activityGroup.length * 0.05)),
        activities: activityGroup
      });
    }

    return leaves;
  });
}

export function buildGrowthTreeScene(
  goals: Goal[],
  stats: GoalGrowthStat[],
  activities: Activity[]
): GrowthTreeScene {
  const rootGoal = goals.find((goal) => goal.parentGoalId === null) ?? null;
  if (!rootGoal) {
    return { root: null, branches: [], leaves: [], vitality: 0 };
  }

  const childrenByParent = new Map<string, Goal[]>();
  goals.forEach((goal) => {
    if (!goal.parentGoalId) {
      return;
    }
    const siblings = childrenByParent.get(goal.parentGoalId) ?? [];
    siblings.push(goal);
    childrenByParent.set(goal.parentGoalId, siblings);
  });
  childrenByParent.forEach((children) => {
    children.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    );
  });

  const root = createWoodSegment(
    rootGoal,
    0,
    vector(0, 0, 0),
    vector(0, 2.65, 0),
    stats,
    activities
  );
  const branches: GrowthTreeWoodSegment[] = [];

  function createChildren(parent: GrowthTreeWoodSegment, depth: 1 | 2 | 3): void {
    const children = childrenByParent.get(parent.goalId) ?? [];
    children.forEach((goal, index) => {
      const siblingRatio = (index + 1) / (children.length + 1);
      const startPosition = interpolate(
        parent.startPosition,
        parent.endPosition,
        0.56 + siblingRatio * 0.22
      );
      const angle = depth * 1.17 + index * (Math.PI * 2 / Math.max(1, children.length));
      const length = 2.15 - depth * 0.38;
      const endPosition = vector(
        startPosition.x + Math.cos(angle) * length,
        startPosition.y + 0.72 + (3 - depth) * 0.18,
        startPosition.z + Math.sin(angle) * length * 0.72
      );
      const segment = createWoodSegment(
        goal,
        depth,
        startPosition,
        endPosition,
        stats,
        activities
      );
      branches.push(segment);

      if (depth < 3) {
        createChildren(segment, (depth + 1) as 2 | 3);
      }
    });
  }

  createChildren(root, 1);

  const leaves = createActivityLeaves([root, ...branches], activities);
  const totalIntensity = [root, ...branches].reduce(
    (sum, segment) => sum + segment.intensity,
    0
  );
  const vitality = round(
    Math.min(
      1,
      Math.max(
        0.08,
        activities.length / 28 +
          totalIntensity / Math.max(1, branches.length + 1) * 0.42
      )
    )
  );

  return {
    root,
    branches,
    leaves,
    vitality
  };
}
