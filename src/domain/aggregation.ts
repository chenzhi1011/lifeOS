import type { Activity, Goal, LifeOSState } from "./types";

export type GoalGrowthStat = {
  userId: string;
  goalId: string;
  totalValue: number;
  activityCount: number;
  activeDays: number;
  lastActivityOn: string | null;
  streakWeeks: number;
  intensity: number;
};

export type HeatmapPoint = {
  date: string;
  count: number;
  value: number;
};

export type DashboardData = {
  goals: Goal[];
  goalStats: GoalGrowthStat[];
  recentActivities: Activity[];
  heatmap: HeatmapPoint[];
  inboxCount: number;
};

export type GoalDetailData = {
  goal: Goal | null;
  children: Goal[];
  stat: GoalGrowthStat | null;
  recentActivities: Activity[];
  heatmap: HeatmapPoint[];
};

function uniqueDates(activities: Activity[]): number {
  return new Set(activities.map((activity) => activity.occurredOn)).size;
}

function streakWeeks(activities: Activity[]): number {
  const weeks = new Set(
    activities.map((activity) => {
      const date = new Date(`${activity.occurredOn}T00:00:00Z`);
      const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const day = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
      return `${date.getUTCFullYear()}-${Math.floor(day / 7)}`;
    })
  );
  return Math.min(weeks.size, 52);
}

function buildStatsForGoals(userId: string, goals: Goal[], activities: Activity[]): GoalGrowthStat[] {
  const totals = goals.map((goal) =>
    activities.filter((activity) => activity.goalId === goal.id).reduce((sum, activity) => sum + activity.value, 0)
  );
  const maxTotal = Math.max(1, ...totals);

  return goals.map((goal) => {
    const goalActivities = activities.filter((activity) => activity.goalId === goal.id);
    const totalValue = goalActivities.reduce((sum, activity) => sum + activity.value, 0);
    const lastActivityOn = goalActivities.map((activity) => activity.occurredOn).sort().at(-1) ?? null;
    const activityCount = goalActivities.length;
    const activeDays = uniqueDates(goalActivities);
    const weeks = streakWeeks(goalActivities);
    const intensity = Math.min(1, Number(((totalValue / maxTotal) * 0.7 + Math.min(activityCount / 20, 1) * 0.3).toFixed(2)));

    return { userId, goalId: goal.id, totalValue, activityCount, activeDays, lastActivityOn, streakWeeks: weeks, intensity };
  });
}

function buildHeatmap(activities: Activity[]): HeatmapPoint[] {
  const byDate = new Map<string, HeatmapPoint>();
  for (const activity of activities) {
    const point = byDate.get(activity.occurredOn) ?? { date: activity.occurredOn, count: 0, value: 0 };
    point.count += 1;
    point.value += activity.value;
    byDate.set(activity.occurredOn, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDashboardData(state: LifeOSState, userId: string): DashboardData {
  const goals = state.goals.filter((goal) => goal.userId === userId);
  const activities = state.activities.filter((activity) => activity.userId === userId);

  return {
    goals,
    goalStats: buildStatsForGoals(userId, goals, activities),
    recentActivities: [...activities].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, 8),
    heatmap: buildHeatmap(activities),
    inboxCount: state.inboxItems.filter((item) => item.userId === userId && item.status === "pending").length
  };
}

export function buildGoalDetail(state: LifeOSState, userId: string, goalId: string): GoalDetailData {
  const dashboard = buildDashboardData(state, userId);
  const goal = dashboard.goals.find((item) => item.id === goalId) ?? null;
  const childIds = dashboard.goals.filter((item) => item.parentGoalId === goalId).map((item) => item.id);
  const relatedIds = new Set([goalId, ...childIds]);
  const recentActivities = state.activities
    .filter((activity) => activity.userId === userId && relatedIds.has(activity.goalId))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  return {
    goal,
    children: dashboard.goals.filter((item) => item.parentGoalId === goalId),
    stat: dashboard.goalStats.find((stat) => stat.goalId === goalId) ?? null,
    recentActivities,
    heatmap: buildHeatmap(recentActivities)
  };
}
