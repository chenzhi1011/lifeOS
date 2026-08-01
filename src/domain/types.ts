export type IntentType = "task" | "activity" | "goal" | "ability" | "reminder" | "inbox";
export type MetricType = "duration" | "count" | "milestone";
export type TaskStatus = "open" | "completed" | "cancelled";
export type RecordStatus = "processed" | "inbox" | "failed";
export type GoalStatus = "active" | "paused" | "completed";
export type AbilityStatus = "active" | "archived";
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

export type Ability = {
  id: string;
  userId: string;
  title: string;
  status: AbilityStatus;
  createdAt: string;
  archivedAt: string | null;
};

export type Goal = {
  id: string;
  userId: string;
  title: string;
  category: string;
  parentGoalId: string | null;
  goalType: GoalType | null;
  abilityId: string | null;
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
  messageId: string;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  plannedMetricType: MetricType | null;
  plannedValue: number | null;
  plannedUnit: "minute" | "hour" | "count" | null;
  createdAt: string;
  completedAt: string | null;
};

export type Activity = {
  id: string;
  userId: string;
  goalId: string;
  taskId: string | null;
  messageId: string;
  summary: string;
  metricType: MetricType;
  value: number;
  unit: "minute" | "hour" | "count";
  occurredOn: string;
  createdAt: string;
};

export type Reminder = {
  id: string;
  userId: string;
  taskId: string | null;
  messageId: string;
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

export type AbilityReference = {
  id?: string;
  title?: string;
};

type LifeEventCommonFields = {
  confidence: number;
  rawText?: string;
  suggestedTypes?: IntentType[];
  reason?: string;
};

export type LifeEventGoalReference = {
  title: string;
  category: string;
  parentTitle?: string;
  goalType?: GoalType;
  ability?: AbilityReference;
  metricType?: MetricType;
  aliases?: string[];
};

type LifeEventGoalInput = Omit<LifeEventGoalReference, "goalType"> & {
  goalType: GoalType;
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
      type: "ability";
      ability: { title: string };
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
      task?: LifeEventTask | null;
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
  abilities: Ability[];
  goals: Goal[];
  goalAliases: GoalAlias[];
  tasks: Task[];
  activities: Activity[];
  reminders: Reminder[];
  inboxItems: InboxItem[];
  achievements: Achievement[];
};
