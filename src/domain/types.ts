export type IntentType = "task" | "activity" | "goal" | "reminder" | "inbox";
export type MetricType = "duration" | "count" | "milestone";
export type TaskStatus = "open" | "completed" | "cancelled";
export type RecordStatus = "processed" | "inbox" | "failed";
export type GoalStatus = "active" | "paused" | "completed";

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
  category: string;
  parentGoalId: string | null;
  metricType: MetricType;
  status: GoalStatus;
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
  goalId: string | null;
  title: string;
  metricType: MetricType;
  thresholdValue: number | null;
  achievedAt: string;
  createdAt: string;
};

export type LifeEventParseResult = {
  type: IntentType;
  confidence: number;
  goal?: {
    title: string;
    category: string;
    parentTitle?: string;
    metricType?: MetricType;
    aliases?: string[];
  };
  summary?: string;
  metric?: {
    type: MetricType;
    value: number;
    unit: "minute" | "hour" | "count";
  };
  date?: string;
  task?: {
    title: string;
    dueAt?: string | null;
    priority?: "low" | "normal" | "high";
  } | null;
  reminder?: {
    remindAt: string;
    repeatRule: "none" | "daily" | "weekly";
  } | null;
  rawText?: string;
  suggestedTypes?: IntentType[];
  reason?: string;
};

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
