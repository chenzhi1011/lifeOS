import { LIFE_AREAS } from "../domain/life-areas";
import type {
  Achievement,
  Activity,
  Goal,
  LifeOSState,
  Task
} from "../domain/types";

export const MATURE_GROWTH_TREE_MOCK_USER_ID = "mature-growth-tree-mock";

const LONG_GOAL_TITLES = [
  "稳定精进核心能力",
  "持续积累代表作品",
  "建立长期复盘习惯"
] as const;

function isoAtDayOffset(asOf: Date, dayOffset: number, hour = 9): string {
  return new Date(
    Date.UTC(
      asOf.getUTCFullYear(),
      asOf.getUTCMonth(),
      asOf.getUTCDate() - dayOffset,
      hour
    )
  ).toISOString();
}

function dateAtDayOffset(asOf: Date, dayOffset: number): string {
  return isoAtDayOffset(asOf, dayOffset).slice(0, 10);
}

/**
 * A complete database-shaped preview: completed tasks create activities,
 * activities grow goals, and completed short goals become achievements.
 * 完整模拟真实写入链路：完成 Task 产生 Activity，Activity 培养 Goal，
 * 完成的短期 Goal 则进入成果面板。
 */
export function createMatureGrowthTreeMockState(asOf: Date): LifeOSState {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("mature growth tree mock requires a valid asOf date");
  }

  const goals: Goal[] = [];
  const tasks: Task[] = [];
  const activities: Activity[] = [];
  const achievements: Achievement[] = [];

  const addGoalHistory = (goal: Goal, activityCount: number): void => {
    for (let index = 0; index < activityCount; index += 1) {
      const taskId = `mock-task-${goal.id}-${index + 1}`;
      const completedAt = isoAtDayOffset(asOf, index % 28, 8 + index % 8);
      tasks.push({
        id: taskId,
        userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
        goalId: goal.id,
        sourceMessageId: null,
        title: `${goal.title} · 第 ${index + 1} 次行动`,
        status: "completed",
        dueAt: null,
        priority: index % 6 === 0 ? "high" : "normal",
        plannedMetricType: "count",
        plannedValue: 10,
        plannedUnit: "count",
        createdAt: isoAtDayOffset(asOf, index % 28, 7),
        completedAt
      });
      activities.push({
        id: `mock-activity-${goal.id}-${index + 1}`,
        userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
        goalId: goal.id,
        taskId,
        sourceMessageId: null,
        summary: `完成：${goal.title} · 第 ${index + 1} 次行动`,
        metricType: "count",
        value: 10,
        unit: "count",
        occurredOn: dateAtDayOffset(asOf, index % 28),
        createdAt: completedAt
      });
    }
  };

  for (const [areaIndex, area] of LIFE_AREAS.entries()) {
    const longGoalCount = areaIndex < 4 ? 3 : 2;
    for (let goalIndex = 0; goalIndex < longGoalCount; goalIndex += 1) {
      const goal: Goal = {
        id: `mock-${area.id}-long-${goalIndex + 1}`,
        userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
        title: `${area.label} · ${LONG_GOAL_TITLES[goalIndex]!}`,
        goalType: "long_term",
        lifeArea: area.id,
        metricType: "count",
        status: "active",
        dueAt: null,
        completedAt: null,
        createdAt: isoAtDayOffset(asOf, 180 + areaIndex * 4 + goalIndex)
      };
      goals.push(goal);
      addGoalHistory(goal, 14);
    }

    const shortGoalCount = areaIndex < 3 ? 2 : 1;
    for (let goalIndex = 0; goalIndex < shortGoalCount; goalIndex += 1) {
      const completedAt = isoAtDayOffset(asOf, areaIndex + goalIndex, 18);
      const goal: Goal = {
        id: `mock-${area.id}-short-${goalIndex + 1}`,
        userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
        title: `${area.label}阶段成果 ${goalIndex + 1}`,
        goalType: "short_term",
        lifeArea: area.id,
        metricType: "count",
        status: "completed",
        dueAt: completedAt,
        completedAt,
        createdAt: isoAtDayOffset(asOf, 90 + areaIndex * 3 + goalIndex)
      };
      goals.push(goal);
      addGoalHistory(goal, 14);
      achievements.push({
        id: `mock-achievement-${area.id}-${goalIndex + 1}`,
        userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
        shortGoalId: goal.id,
        title: goal.title,
        metricType: "count",
        thresholdValue: 140,
        note: `在${area.label}领域完成了一段持续积累。`,
        evidenceUrl: null,
        achievedAt: completedAt,
        createdAt: completedAt
      });
    }
  }

  for (let index = 0; index < 21; index += 1) {
    const completedAt = isoAtDayOffset(asOf, index % 21, 10);
    tasks.push({
      id: `mock-one-off-${index + 1}`,
      userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
      goalId: null,
      sourceMessageId: null,
      title: `完成日常事项 ${index + 1}`,
      status: "completed",
      dueAt: null,
      priority: "normal",
      plannedMetricType: null,
      plannedValue: null,
      plannedUnit: null,
      createdAt: isoAtDayOffset(asOf, index % 21, 8),
      completedAt
    });
  }

  return {
    currentUserId: MATURE_GROWTH_TREE_MOCK_USER_ID,
    profiles: [{
      userId: MATURE_GROWTH_TREE_MOCK_USER_ID,
      displayName: "繁茂树预览",
      timezone: "Asia/Tokyo",
      defaultReminderTime: "09:00",
      createdAt: isoAtDayOffset(asOf, 365)
    }],
    messages: [],
    goals,
    goalAliases: [],
    tasks,
    activities,
    reminders: [],
    inboxItems: [],
    achievements
  };
}
