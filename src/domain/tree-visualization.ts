import type { DashboardData } from "./aggregation";
import { seedFromId } from "./stable-seed";
import type { Activity, GoalStatus } from "./types";
import { buildVitalityElements, type VitalityElement } from "./vitality";

export type SceneVector = {
  x: number;
  y: number;
  z: number;
};

export type TreeEntityType =
  | "root"
  | "ability"
  | "long_goal"
  | "short_goal";

export type TreeWood = {
  entityType: TreeEntityType;
  entityId: string;
  label: string;
  start: SceneVector;
  end: SceneVector;
  thickness: number;
  status: GoalStatus;
  category: string;
  totalValue: number;
  activityCount: number;
  recentActivities: Activity[];
};

export type ActivityLeaf = {
  activityId: string;
  goalId: string;
  position: SceneVector;
  rotation: SceneVector;
  scale: number;
  activities: Activity[];
};

export type TreeDiagnostic = {
  code:
    | "untyped_goal"
    | "missing_ability"
    | "invalid_ability"
    | "invalid_activity_value";
  entityId: string;
  message: string;
};

export type GrowthTreeViewModel = {
  root: TreeWood;
  abilityBranches: TreeWood[];
  longGoalTwigs: TreeWood[];
  shortGoalBranches: TreeWood[];
  activityLeaves: ActivityLeaf[];
  vitalityElements: VitalityElement[];
  diagnostics: TreeDiagnostic[];
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

function thicknessFromTotal(base: number, total: number): number {
  return round(base + Math.log1p(Math.max(0, total)) * 0.025);
}

function activityTotal(activities: Activity[]): number {
  return activities.reduce(
    (sum, activity) => Math.min(Number.MAX_VALUE, sum + activity.value),
    0
  );
}

function activitiesFor(goalId: string, activities: Activity[]): Activity[] {
  return activities
    .filter((activity) => activity.goalId === goalId)
    .sort(
      (left, right) =>
        right.occurredOn.localeCompare(left.occurredOn) ||
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

function recentActivityWindow(activities: Activity[], asOf: Date): Activity[] {
  const end = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate()
  );
  const startDate = new Date(end - 29 * 86_400_000).toISOString().slice(0, 10);
  const endDate = new Date(end).toISOString().slice(0, 10);
  return activities
    .filter(
      (activity) =>
        activity.occurredOn >= startDate && activity.occurredOn <= endDate
    )
    .sort(
      (left, right) =>
        right.occurredOn.localeCompare(left.occurredOn) ||
        left.id.localeCompare(right.id)
    );
}

function woodForGoal(
  entityType: "long_goal" | "short_goal",
  goal: DashboardData["goals"][number],
  start: SceneVector,
  end: SceneVector,
  allActivities: Activity[],
  recentActivities: Activity[]
): TreeWood {
  const historical = activitiesFor(goal.id, allActivities);
  return {
    entityType,
    entityId: goal.id,
    label: goal.title,
    start,
    end,
    thickness: thicknessFromTotal(
      entityType === "long_goal" ? 0.1 : 0.085,
      activityTotal(historical)
    ),
    status: goal.status,
    category: goal.category,
    totalValue: activityTotal(historical),
    activityCount: historical.length,
    recentActivities: activitiesFor(goal.id, recentActivities)
  };
}

export function buildGrowthTreeViewModel(
  data: DashboardData,
  asOf: Date
): GrowthTreeViewModel {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("growth tree projection requires a valid asOf date");
  }
  const invalidActivities = data.allActivities.filter(
    (activity) => !Number.isFinite(activity.value) || activity.value <= 0
  );
  const diagnostics: TreeDiagnostic[] = invalidActivities.map((activity) => ({
    code: "invalid_activity_value",
    entityId: activity.id,
    message: `Activity ${activity.id} has an invalid value.`
  }));
  const allActivities = data.allActivities.filter(
    (activity) => Number.isFinite(activity.value) && activity.value > 0
  );
  const recentActivities = recentActivityWindow(allActivities, asOf);
  const totalValue = activityTotal(allActivities);
  const root: TreeWood = {
    entityType: "root",
    entityId: "root",
    label: "人生",
    start: vector(0, 0, 0),
    end: vector(0, 2.65, 0),
    thickness: thicknessFromTotal(0.34, totalValue),
    status: "active",
    category: "root",
    totalValue,
    activityCount: allActivities.length,
    recentActivities
  };
  const activeAbilities = data.abilities
    .filter((ability) => ability.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  const activeAbilityIds = new Set(activeAbilities.map((ability) => ability.id));
  const abilityBranches = activeAbilities.map((ability): TreeWood => {
    const abilityGoals = data.goals.filter(
      (goal) => goal.goalType === "long_term" && goal.abilityId === ability.id
    );
    const goalIds = new Set(abilityGoals.map((goal) => goal.id));
    const historical = allActivities.filter((activity) => goalIds.has(activity.goalId));
    const angle = seedFromId(ability.id, "ability-angle") * Math.PI * 2;
    const start = interpolate(
      root.start,
      root.end,
      0.46 + seedFromId(ability.id, "ability-start") * 0.2
    );
    const length = 2.1 + seedFromId(ability.id, "ability-length") * 0.65;
    return {
      entityType: "ability",
      entityId: ability.id,
      label: ability.title,
      start,
      end: vector(
        start.x + Math.cos(angle) * length,
        start.y + 1.35 + seedFromId(ability.id, "ability-height") * 0.55,
        start.z + Math.sin(angle) * length * 0.72
      ),
      thickness: thicknessFromTotal(0.19, activityTotal(historical)),
      status: "active",
      category: "ability",
      totalValue: activityTotal(historical),
      activityCount: historical.length,
      recentActivities: recentActivities.filter((activity) =>
        goalIds.has(activity.goalId)
      )
    };
  });
  const abilityWoodById = new Map(
    abilityBranches.map((branch) => [branch.entityId, branch])
  );
  const longGoals: DashboardData["goals"] = [];
  const shortGoals: DashboardData["goals"] = [];

  for (const goal of [...data.goals].sort((left, right) => left.id.localeCompare(right.id))) {
    if (goal.goalType === null) {
      diagnostics.push({
        code: "untyped_goal",
        entityId: goal.id,
        message: `Goal ${goal.id} has no goal type.`
      });
      continue;
    }
    if (goal.goalType === "long_term") {
      if (goal.abilityId === null) {
        diagnostics.push({
          code: "missing_ability",
          entityId: goal.id,
          message: `Long-term goal ${goal.id} has no ability.`
        });
        continue;
      }
      if (!activeAbilityIds.has(goal.abilityId)) {
        diagnostics.push({
          code: "invalid_ability",
          entityId: goal.id,
          message: `Long-term goal ${goal.id} references an unavailable ability.`
        });
        continue;
      }
      longGoals.push(goal);
      continue;
    }
    if (goal.abilityId !== null) {
      diagnostics.push({
        code: "invalid_ability",
        entityId: goal.id,
        message: `Short-term goal ${goal.id} must not reference an ability.`
      });
      continue;
    }
    if (goal.status !== "completed") {
      shortGoals.push(goal);
    }
  }

  const orderedLongGoals = abilityBranches.flatMap((branch) =>
    longGoals
      .filter((goal) => goal.abilityId === branch.entityId)
      .sort((left, right) => left.id.localeCompare(right.id))
  );
  const longGoalTwigs = orderedLongGoals.map((goal) => {
    const parent = abilityWoodById.get(goal.abilityId!)!;
    const start = interpolate(
      parent.start,
      parent.end,
      0.5 + seedFromId(goal.id, "long-start") * 0.32
    );
    const angle = seedFromId(goal.id, "long-angle") * Math.PI * 2;
    const length = 1.15 + seedFromId(goal.id, "long-length") * 0.55;
    return woodForGoal(
      "long_goal",
      goal,
      start,
      vector(
        start.x + Math.cos(angle) * length,
        start.y + 0.68 + seedFromId(goal.id, "long-height") * 0.42,
        start.z + Math.sin(angle) * length
      ),
      allActivities,
      recentActivities
    );
  });
  const shortGoalBranches = shortGoals.map((goal) => {
    const start = interpolate(
      root.start,
      root.end,
      0.38 + seedFromId(goal.id, "short-start") * 0.34
    );
    const angle = seedFromId(goal.id, "short-angle") * Math.PI * 2;
    const length = 1.35 + seedFromId(goal.id, "short-length") * 0.55;
    return woodForGoal(
      "short_goal",
      goal,
      start,
      vector(
        start.x + Math.cos(angle) * length,
        start.y + 0.82 + seedFromId(goal.id, "short-height") * 0.4,
        start.z + Math.sin(angle) * length
      ),
      allActivities,
      recentActivities
    );
  });
  const goalWood = new Map(
    [...longGoalTwigs, ...shortGoalBranches].map((wood) => [wood.entityId, wood])
  );
  const activityLeaves = recentActivities.flatMap((activity): ActivityLeaf[] => {
    const wood = goalWood.get(activity.goalId);
    if (!wood) {
      return [];
    }
    const side = seedFromId(activity.id, "leaf-side") >= 0.5 ? 1 : -1;
    return [
      {
        activityId: activity.id,
        goalId: activity.goalId,
        position: vector(
          wood.end.x + side * (0.12 + seedFromId(activity.id, "leaf-x") * 0.16),
          wood.end.y + seedFromId(activity.id, "leaf-y") * 0.2,
          wood.end.z + (seedFromId(activity.id, "leaf-z") - 0.5) * 0.28
        ),
        rotation: vector(
          seedFromId(activity.id, "leaf-rotation-x") * 0.5,
          seedFromId(activity.id, "leaf-rotation-y") * Math.PI * 2,
          side * 0.42
        ),
        scale: round(0.82 + seedFromId(activity.id, "leaf-scale") * 0.3),
        activities: [activity]
      }
    ];
  });

  return {
    root,
    abilityBranches,
    longGoalTwigs,
    shortGoalBranches,
    activityLeaves,
    vitalityElements: buildVitalityElements(data.recentCompletedOneOffTasks, asOf),
    diagnostics
  };
}

export type GrowthTreeWoodSegment = TreeWood;
export type GrowthTreeLeaf = ActivityLeaf;
