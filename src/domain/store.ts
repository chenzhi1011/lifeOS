import { createInitialState } from "./seed";
import type {
  Activity,
  Goal,
  GoalAlias,
  InboxItem,
  IntentType,
  LifeEventGoalReference,
  LifeEventParseResult,
  LifeOSState,
  Message,
  Reminder,
  Task
} from "./types";
import { buildDashboardData, buildGoalDetail } from "./aggregation";
import { lifeEventParseResultSchema } from "./life-event-schema";
import {
  DomainResolutionError,
  isRecoverableResolutionError
} from "./resolution";

type ApplyResult = {
  message: Message;
  goal?: Goal;
  activity?: Activity;
  task?: Task;
  reminder?: Reminder;
  inboxItem?: InboxItem;
};

let counter = 0;

function id(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultMetric(type: IntentType): "duration" | "count" | "milestone" {
  return type === "activity" ? "duration" : "count";
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase();
}

type GoalBearingParseResult = Extract<
  LifeEventParseResult,
  { type: "task" | "activity" | "goal" | "reminder" }
>;

type GoalResolutionPlan = {
  goal: Goal;
  insertGoal: boolean;
  aliases: GoalAlias[];
};

export function createLifeOSStore(initialState: LifeOSState) {
  const state = initialState;

  function resolveGoal(userId: string, parsed: GoalBearingParseResult): GoalResolutionPlan | undefined {
    if (!parsed.goal) {
      return undefined;
    }

    const requestedTitle = normalizedTitle(parsed.goal.title);
    const activeGoalIds = new Set(
      state.goals
        .filter((goal) => goal.userId === userId && goal.status === "active")
        .map((goal) => goal.id)
    );
    const matchingIds = new Set(
      state.goals
        .filter(
          (goal) =>
            goal.userId === userId &&
            goal.status !== "completed" &&
            normalizedTitle(goal.title) === requestedTitle
        )
        .map((goal) => goal.id)
    );
    for (const alias of state.goalAliases) {
      if (
        alias.userId === userId &&
        activeGoalIds.has(alias.goalId) &&
        normalizedTitle(alias.alias) === requestedTitle
      ) {
        matchingIds.add(alias.goalId);
      }
    }
    const candidates = state.goals.filter((goal) => matchingIds.has(goal.id));
    if (candidates.length > 1) {
      throw new DomainResolutionError(
        "ambiguous_goal",
        `multiple active goals match: ${parsed.goal.title}`
      );
    }

    function prepareAliases(goalId: string): GoalAlias[] {
      const requestedAliases = parsed.goal?.aliases ?? [];
      for (const alias of requestedAliases) {
        const existingAlias = state.goalAliases.find(
          (candidate) =>
            candidate.userId === userId &&
            normalizedTitle(candidate.alias) === normalizedTitle(alias)
        );
        if (existingAlias && existingAlias.goalId !== goalId) {
          throw new DomainResolutionError(
            "identity_conflict",
            `goal alias conflicts with existing goal: ${alias}`
          );
        }
      }
      return requestedAliases.flatMap((alias) => {
        const existingAlias = state.goalAliases.find(
          (candidate) =>
            candidate.userId === userId &&
            normalizedTitle(candidate.alias) === normalizedTitle(alias)
        );
        if (!existingAlias) {
          return [{
            id: id("alias"),
            userId,
            goalId,
            alias,
            createdAt: nowIso()
          }];
        }
        return [];
      });
    }

    const existing = candidates[0];
    if (existing) {
      if (parsed.goal.goalType) {
        if (
          existing.goalType !== parsed.goal.goalType ||
          (parsed.goal.lifeArea !== undefined && existing.lifeArea !== parsed.goal.lifeArea) ||
          existing.metricType !== (parsed.goal.metricType ?? defaultMetric(parsed.type))
        ) {
          throw new DomainResolutionError(
            "identity_conflict",
            `goal identity conflicts with existing goal: ${parsed.goal.title}`
          );
        }
      }
      return {
        goal: existing,
        insertGoal: false,
        aliases: prepareAliases(existing.id)
      };
    }

    if (!parsed.goal.goalType) {
      throw new DomainResolutionError(
        "missing_goal",
        `goal does not exist: ${parsed.goal.title}`
      );
    }

    const goal: Goal = {
      id: id("goal"),
      userId,
      title: parsed.goal.title,
      goalType: parsed.goal.goalType,
      lifeArea: parsed.goal.lifeArea!,
      metricType: parsed.goal.metricType ?? defaultMetric(parsed.type),
      status: "active",
      dueAt: null,
      completedAt: null,
      createdAt: nowIso()
    };
    return {
      goal,
      insertGoal: true,
      aliases: prepareAliases(goal.id)
    };
  }

  function writeInbox(
    userId: string,
    source: Message["source"],
    rawText: string,
    confidence: number,
    suggestedType: IntentType,
    reason: string
  ): ApplyResult {
    const parsed: LifeEventParseResult = {
      type: "inbox",
      confidence,
      rawText,
      suggestedTypes: [suggestedType],
      reason
    };
    const message: Message = {
      id: id("msg"),
      userId,
      source,
      rawText,
      intentType: "inbox",
      confidence,
      parsedJson: parsed,
      status: "inbox",
      createdAt: nowIso()
    };
    const inboxItem: InboxItem = {
      id: id("inbox"),
      userId,
      messageId: message.id,
      suggestedType,
      suggestedJson: parsed,
      reason,
      status: "pending",
      createdAt: nowIso()
    };
    state.messages.unshift(message);
    state.inboxItems.unshift(inboxItem);
    return { message, inboxItem };
  }

  function applyParseResult(userId: string, source: Message["source"], rawText: string, input: unknown): ApplyResult {
    const parsed = lifeEventParseResultSchema.parse(input) as LifeEventParseResult;

    let goalPlan: GoalResolutionPlan | undefined;
    try {
      goalPlan = parsed.type === "inbox" ||
        (parsed.type === "task" && parsed.path === "one_off")
        ? undefined
        : resolveGoal(userId, parsed);
    } catch (error) {
      if (!isRecoverableResolutionError(error)) {
        throw error;
      }
      return writeInbox(
        userId,
        source,
        rawText,
        parsed.confidence,
        parsed.type,
        error.message
      );
    }

    const goal = goalPlan?.goal;

    if (
      goal &&
      (parsed.type === "task" || parsed.type === "reminder") &&
      parsed.metric &&
      parsed.metric.type !== goal.metricType
    ) {
      return writeInbox(userId, source, rawText, parsed.confidence, parsed.type,
        "task metric_type must match its goal metric_type");
    }
    if (goal && parsed.type === "activity") {
      if (parsed.metric && parsed.metric.type !== goal.metricType) {
        return writeInbox(userId, source, rawText, parsed.confidence, parsed.type,
          "activity metric_type must match its goal metric_type");
      }
      if (!parsed.metric && goal.metricType === "duration") {
        return writeInbox(userId, source, rawText, parsed.confidence, parsed.type,
          "duration activity requires an explicit duration metric");
      }
    }

    const message: Message = {
      id: id("msg"),
      userId,
      source,
      rawText,
      intentType: parsed.type,
      confidence: parsed.confidence,
      parsedJson: parsed,
      status: parsed.type === "inbox" ? "inbox" : "processed",
      createdAt: nowIso()
    };
    state.messages.unshift(message);

    if (goalPlan?.insertGoal) {
      state.goals.push(goalPlan.goal);
    }
    if (goalPlan?.aliases.length) {
      state.goalAliases.push(...goalPlan.aliases);
    }

    if (parsed.type === "inbox") {
      const inboxItem: InboxItem = {
        id: id("inbox"),
        userId,
        messageId: message.id,
        suggestedType: parsed.suggestedTypes?.[0] ?? "inbox",
        suggestedJson: parsed,
        reason: parsed.reason ?? "需要确认。",
        status: "pending",
        createdAt: nowIso()
      };
      state.inboxItems.unshift(inboxItem);
      return { message, inboxItem };
    }

    if (parsed.type === "goal") {
      return { message, goal };
    }

    if (parsed.type === "task") {
      const plannedValue =
        parsed.metric?.type === "duration" && parsed.metric.unit === "hour"
          ? parsed.metric.value * 60
          : parsed.metric?.value ?? null;
      const task: Task = {
        id: id("task"),
        userId,
        goalId: goal?.id ?? null,
        sourceMessageId: message.id,
        title: parsed.task.title,
        status: "open",
        dueAt: parsed.task.dueAt ?? null,
        priority: parsed.task.priority ?? "normal",
        plannedMetricType: parsed.metric?.type ?? null,
        plannedValue,
        plannedUnit: parsed.metric
          ? parsed.metric.type === "duration" ? "minute" : "count"
          : null,
        createdAt: nowIso(),
        completedAt: null
      };
      state.tasks.unshift(task);
      return { message, goal, task };
    }

    if (parsed.type === "activity" && goal) {
      const metric = parsed.metric ?? {
        type: goal.metricType,
        value: 1,
        unit: "count" as const
      };
      const activity: Activity = {
        id: id("act"),
        userId,
        goalId: goal.id,
        taskId: null,
        sourceMessageId: message.id,
        summary: parsed.summary ?? rawText,
        metricType: metric.type,
        value: metric.type === "duration" && metric.unit === "hour" ? metric.value * 60 : metric.value,
        unit: metric.type === "duration" ? "minute" : "count",
        occurredOn: parsed.date ?? nowIso().slice(0, 10),
        createdAt: nowIso()
      };
      state.activities.unshift(activity);
      return { message, goal, activity };
    }

    if (parsed.type === "reminder") {
      const plannedValue =
        parsed.metric?.type === "duration" && parsed.metric.unit === "hour"
          ? parsed.metric.value * 60
          : parsed.metric?.value ?? null;
      const task: Task = {
          id: id("task"),
          userId,
          goalId: goal?.id ?? null,
          sourceMessageId: message.id,
          title: parsed.task.title,
          status: "open",
          dueAt: parsed.task.dueAt ?? null,
          priority: parsed.task.priority ?? "normal",
          plannedMetricType: parsed.metric?.type ?? null,
          plannedValue,
          plannedUnit: parsed.metric
            ? parsed.metric.type === "duration" ? "minute" : "count"
            : null,
          createdAt: nowIso(),
          completedAt: null
      };
      state.tasks.unshift(task);

      const reminder: Reminder = {
        id: id("reminder"),
        userId,
        taskId: task.id,
        sourceMessageId: message.id,
        remindAt: parsed.reminder.remindAt,
        repeatRule: parsed.reminder.repeatRule,
        status: "scheduled",
        createdAt: nowIso()
      };
      state.reminders.unshift(reminder);
      return { message, goal, task, reminder };
    }

    return { message, goal };
  }

  return {
    getState: () => state,
    applyParseResult,
    getDashboardData: (userId: string) => buildDashboardData(state, userId),
    getGoalDetail: (userId: string, goalId: string) => buildGoalDetail(state, userId, goalId)
  };
}

export const lifeOSStore = createLifeOSStore(createInitialState());
