import type { Activity, Achievement, Goal, GoalAlias, LifeOSState, Profile } from "./types";

const now = "2026-07-25T09:00:00+09:00";
const userId = "demo-user";

const profiles: Profile[] = [{ userId, displayName: "Zhi", createdAt: now }];

const goals: Goal[] = [
  { id: "life", userId, title: "人生", category: "root", parentGoalId: null, metricType: "milestone", status: "active", createdAt: now },
  { id: "career", userId, title: "职业", category: "职业", parentGoalId: "life", metricType: "duration", status: "active", createdAt: now },
  { id: "health", userId, title: "健康", category: "健康", parentGoalId: "life", metricType: "count", status: "active", createdAt: now },
  { id: "wealth", userId, title: "财富", category: "财富", parentGoalId: "life", metricType: "milestone", status: "active", createdAt: now },
  { id: "interest", userId, title: "兴趣", category: "兴趣", parentGoalId: "life", metricType: "count", status: "active", createdAt: now },
  { id: "aws", userId, title: "AWS", category: "职业", parentGoalId: "career", metricType: "duration", status: "active", createdAt: now },
  { id: "ai", userId, title: "AI", category: "职业", parentGoalId: "career", metricType: "duration", status: "active", createdAt: now },
  { id: "job-change", userId, title: "转职", category: "职业", parentGoalId: "career", metricType: "milestone", status: "active", createdAt: now },
  { id: "muscle", userId, title: "增肌", category: "健康", parentGoalId: "health", metricType: "count", status: "active", createdAt: now },
  { id: "photo", userId, title: "摄影", category: "兴趣", parentGoalId: "interest", metricType: "count", status: "active", createdAt: now }
];

const goalAliases: GoalAlias[] = [
  { id: "alias-aws-1", userId, goalId: "aws", alias: "AWS DevOps", createdAt: now },
  { id: "alias-aws-2", userId, goalId: "aws", alias: "Terraform", createdAt: now },
  { id: "alias-ai-1", userId, goalId: "ai", alias: "大模型", createdAt: now },
  { id: "alias-muscle-1", userId, goalId: "muscle", alias: "练肩", createdAt: now }
];

const activities: Activity[] = [
  { id: "act-1", userId, goalId: "aws", taskId: null, messageId: "seed", summary: "学习 IAM", metricType: "duration", value: 40, unit: "minute", occurredOn: "2026-07-01", createdAt: now },
  { id: "act-2", userId, goalId: "aws", taskId: null, messageId: "seed", summary: "完成 Terraform 模块", metricType: "duration", value: 60, unit: "minute", occurredOn: "2026-07-03", createdAt: now },
  { id: "act-3", userId, goalId: "aws", taskId: null, messageId: "seed", summary: "AWS DevOps 模拟题", metricType: "duration", value: 90, unit: "minute", occurredOn: "2026-07-10", createdAt: now },
  { id: "act-4", userId, goalId: "ai", taskId: null, messageId: "seed", summary: "整理本地 LLM intake 方案", metricType: "duration", value: 50, unit: "minute", occurredOn: "2026-07-15", createdAt: now },
  { id: "act-5", userId, goalId: "muscle", taskId: null, messageId: "seed", summary: "练肩", metricType: "count", value: 1, unit: "count", occurredOn: "2026-07-18", createdAt: now },
  { id: "act-6", userId, goalId: "photo", taskId: null, messageId: "seed", summary: "街拍练习", metricType: "count", value: 1, unit: "count", occurredOn: "2026-07-20", createdAt: now }
];

const achievements: Achievement[] = [
  { id: "ach-1", userId, goalId: "aws", title: "AWS 累计学习超过 3 小时", metricType: "duration", thresholdValue: 180, achievedAt: "2026-07-10T20:00:00+09:00", createdAt: now },
  { id: "ach-2", userId, goalId: "muscle", title: "完成一次肩部训练", metricType: "count", thresholdValue: 1, achievedAt: "2026-07-18T20:00:00+09:00", createdAt: now }
];

export function createInitialState(): LifeOSState {
  return {
    currentUserId: userId,
    profiles: [...profiles],
    messages: [],
    goals: [...goals],
    goalAliases: [...goalAliases],
    tasks: [],
    activities: [...activities],
    reminders: [],
    inboxItems: [],
    achievements: [...achievements]
  };
}
