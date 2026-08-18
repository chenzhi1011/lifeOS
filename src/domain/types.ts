import type { LifeAreaId } from "./life-areas";

export type IntentType = "task" | "activity" | "goal" | "reminder" | "inbox";
export type MetricType = "duration" | "count" | "milestone";
export type TaskStatus = "open" | "completed" | "cancelled";
export type RecordStatus = "processed" | "inbox" | "failed";
export type GoalStatus = "active" | "paused" | "completed";
export type GoalType = "long_term" | "short_term";

export type Profile = {
  userId: string;
  displayName: string;
  timezone: string;
  defaultReminderTime: string;
  createdAt: string;
};

export type Message = {
  id: string;
  userId: string;
  source: "mock" | "wechat" | "app" | "telegram" | "gpt_action";
  batchId?: string | null;
  eventIndex?: number | null;
  rawText: string;
  intentType: IntentType;
  confidence: number;
  parsedJson: LifeEventParseResult;
  status: RecordStatus;
  createdAt: string;
};

export type Goal = {
  id: string;
  userId: string;
  title: string;
  goalType: GoalType;
  lifeArea: LifeAreaId;
  metricType: MetricType;
  status: GoalStatus;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type GoalAlias = {
  id: string;
  userId: string;
  goalId: string;
  alias: string;
  createdAt: string;
};

export type Task = {
  id: string;
  userId: string;
  goalId: string | null;
  sourceMessageId: string | null;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  plannedMetricType: MetricType | null;
  plannedValue: number | null;
  plannedUnit: "minute" | "count" | null;
  createdAt: string;
  completedAt: string | null;
};

export type Activity = {
  id: string;
  userId: string;
  goalId: string;
  taskId: string | null;
  sourceMessageId: string | null;
  summary: string;
  metricType: MetricType;
  value: number;
  unit: "minute" | "count";
  occurredOn: string;
  createdAt: string;
};

export type Reminder = {
  id: string;
  userId: string;
  taskId: string;
  sourceMessageId: string | null;
  remindAt: string;
  repeatRule: "none" | "daily" | "weekly";
  status: "scheduled" | "sent" | "cancelled";
  createdAt: string;
};

export type InboxItem = {
  id: string;
  userId: string;
  messageId: string;
  suggestedType: IntentType;
  suggestedJson: LifeEventParseResult;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
};

export type Achievement = {
  id: string;
  userId: string;
  shortGoalId: string | null;
  title: string;
  metricType: MetricType;
  thresholdValue: number | null;
  note: string | null;
  evidenceUrl: string | null;
  achievedAt: string;
  createdAt: string;
};

type LifeEventCommonFields = {
  confidence: number;
  rawText?: string;
  suggestedTypes?: IntentType[];
  reason?: string;
};

export type LifeEventGoalReference = {
  title: string;
  goalType?: GoalType;
  lifeArea?: LifeAreaId;
  metricType?: MetricType;
  aliases?: string[];
};

type LifeEventGoalInput = Omit<LifeEventGoalReference, "goalType" | "lifeArea"> & {
  goalType: GoalType;
  lifeArea: LifeAreaId;
};

type LifeEventMetric = {
  type: MetricType;
  value: number;
  unit: "minute" | "hour" | "count";
};

type LifeEventTask = {
  title: string;
  dueAt?: string | null;
  priority?: "low" | "normal" | "high";
};

type LifeEventReminder = {
  remindAt: string;
  repeatRule: "none" | "daily" | "weekly";
};

export type LifeEventParseResult =
  | (LifeEventCommonFields & {
      type: "task";
      path: "one_off" | "goal";
      goal?: LifeEventGoalReference;
      task: LifeEventTask;
      metric?: LifeEventMetric;
      date?: string;
    })
  | (LifeEventCommonFields & {
      type: "goal";
      goal: LifeEventGoalInput;
    })
  | (LifeEventCommonFields & {
      type: "activity";
      goal?: LifeEventGoalReference;
      summary?: string;
      metric?: LifeEventMetric;
      date?: string;
      task?: LifeEventTask | null;
      reminder?: LifeEventReminder | null;
    })
  | (LifeEventCommonFields & {
      type: "reminder";
      goal?: LifeEventGoalReference;
      task: LifeEventTask;
      reminder: LifeEventReminder;
      metric?: LifeEventMetric;
    })
  | (LifeEventCommonFields & {
      type: "inbox";
    });

export type LifeOSState = {
  currentUserId: string;
  profiles: Profile[];
  messages: Message[];
  goals: Goal[];
  goalAliases: GoalAlias[];
  tasks: Task[];
  activities: Activity[];
  reminders: Reminder[];
  inboxItems: InboxItem[];
  achievements: Achievement[];
};
