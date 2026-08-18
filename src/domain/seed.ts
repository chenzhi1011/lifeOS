import type { Activity, Achievement, Goal, GoalAlias, LifeOSState, Profile } from "./types";

const now = "2026-07-25T09:00:00+09:00";
const userId = "demo-user";

const profiles: Profile[] = [
  {
    userId,
    displayName: "Zhi",
    timezone: "Asia/Tokyo",
    defaultReminderTime: "09:00",
    createdAt: now
  }
];

const goals: Goal[] = [
  {
    id: "aws",
    userId,
    title: "AWS",
    goalType: "long_term",
    lifeArea: "work",
    metricType: "duration",
    status: "active",
    dueAt: null,
    completedAt: null,
    createdAt: now
  },
  {
    id: "ai",
    userId,
    title: "AI",
    goalType: "long_term",
    lifeArea: "growth",
    metricType: "duration",
    status: "active",
    dueAt: null,
    completedAt: null,
    createdAt: now
  },
  {
    id: "muscle",
    userId,
    title: "增肌",
    goalType: "long_term",
    lifeArea: "health",
    metricType: "count",
    status: "active",
    dueAt: null,
    completedAt: null,
    createdAt: now
  },
  {
    id: "job-change",
    userId,
    title: "转职",
    goalType: "short_term",
    lifeArea: "work",
    metricType: "milestone",
    status: "active",
    dueAt: "2026-12-31T23:59:59+09:00",
    completedAt: null,
    createdAt: now
  },
  {
    id: "portfolio-launch",
    userId,
    title: "作品集上线",
    goalType: "short_term",
    lifeArea: "growth",
    metricType: "milestone",
    status: "completed",
    dueAt: "2026-07-20T23:59:59+09:00",
    completedAt: "2026-07-18T20:00:00+09:00",
    createdAt: "2026-06-01T09:00:00+09:00"
  }
];

const goalAliases: GoalAlias[] = [
  { id: "alias-aws-1", userId, goalId: "aws", alias: "AWS DevOps", createdAt: now },
  { id: "alias-aws-2", userId, goalId: "aws", alias: "Terraform", createdAt: now },
  { id: "alias-ai-1", userId, goalId: "ai", alias: "大模型", createdAt: now },
  { id: "alias-muscle-1", userId, goalId: "muscle", alias: "练肩", createdAt: now }
];

const activities: Activity[] = [
  { id: "act-1", userId, goalId: "aws", taskId: null, sourceMessageId: "seed", summary: "学习 IAM", metricType: "duration", value: 40, unit: "minute", occurredOn: "2026-07-01", createdAt: now },
  { id: "act-2", userId, goalId: "aws", taskId: null, sourceMessageId: "seed", summary: "完成 Terraform 模块", metricType: "duration", value: 60, unit: "minute", occurredOn: "2026-07-03", createdAt: now },
  { id: "act-3", userId, goalId: "aws", taskId: null, sourceMessageId: "seed", summary: "AWS DevOps 模拟题", metricType: "duration", value: 90, unit: "minute", occurredOn: "2026-07-10", createdAt: now },
  { id: "act-4", userId, goalId: "ai", taskId: null, sourceMessageId: "seed", summary: "整理本地 LLM intake 方案", metricType: "duration", value: 50, unit: "minute", occurredOn: "2026-07-15", createdAt: now },
  { id: "act-5", userId, goalId: "muscle", taskId: null, sourceMessageId: "seed", summary: "练肩", metricType: "count", value: 1, unit: "count", occurredOn: "2026-07-18", createdAt: now }
];

const achievements: Achievement[] = [
  {
    id: "ach-1",
    userId,
    shortGoalId: "portfolio-launch",
    title: "作品集上线",
    metricType: "milestone",
    thresholdValue: 1,
    note: "完成第一版作品集并正式发布。",
    evidenceUrl: null,
    achievedAt: "2026-07-18T20:00:00+09:00",
    createdAt: "2026-07-18T20:00:00+09:00"
  }
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
