import { createInitialState } from "./seed";
import type {
  Ability,
  Activity,
  Goal,
  InboxItem,
  IntentType,
  LifeEventParseResult,
  LifeOSState,
  Message,
  Reminder,
  Task
} from "./types";
import { buildDashboardData, buildGoalDetail } from "./aggregation";

type ApplyResult = {
  message: Message;
  ability?: Ability;
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
  return type === "goal" ? "duration" : type === "activity" ? "duration" : "count";
}

export function createLifeOSStore(initialState: LifeOSState) {
  const state = initialState;

  function resolveGoal(userId: string, parsed: LifeEventParseResult): Goal | undefined {
    if (!parsed.goal) {
      return undefined;
    }

    const existing = state.goals.find(
      (goal) => goal.userId === userId && goal.title.toLowerCase() === parsed.goal?.title.toLowerCase()
    );
    if (existing) {
      return existing;
    }

    if (!parsed.goal.goalType) {
      return undefined;
    }

    const abilityReference = parsed.goal.ability;
    const ability = abilityReference
      ? state.abilities.find(
          (candidate) =>
            candidate.userId === userId &&
            ((abilityReference.id !== undefined && candidate.id === abilityReference.id) ||
              (abilityReference.title !== undefined &&
                candidate.title.toLowerCase() === abilityReference.title.toLowerCase()))
        )
      : undefined;

    if (parsed.goal.goalType === "long_term" && !ability) {
      return undefined;
    }

    const parent = parsed.goal.parentTitle
      ? state.goals.find((goal) => goal.userId === userId && goal.title === parsed.goal?.parentTitle)
      : state.goals.find((goal) => goal.userId === userId && goal.title === parsed.goal?.category);

    const goal: Goal = {
      id: id("goal"),
      userId,
      title: parsed.goal.title,
      category: parsed.goal.category,
      parentGoalId: parent?.id ?? null,
      goalType: parsed.goal.goalType,
      abilityId: parsed.goal.goalType === "long_term" ? ability?.id ?? null : null,
      metricType: parsed.goal.metricType ?? defaultMetric(parsed.type),
      status: "active",
      dueAt: null,
      completedAt: null,
      createdAt: nowIso()
    };
    state.goals.push(goal);

    for (const alias of parsed.goal.aliases ?? []) {
      state.goalAliases.push({ id: id("alias"), userId, goalId: goal.id, alias, createdAt: nowIso() });
    }

    return goal;
  }

  function applyParseResult(userId: string, source: Message["source"], rawText: string, parsed: LifeEventParseResult): ApplyResult {
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

    if (parsed.type === "ability" && parsed.ability) {
      const existing = state.abilities.find(
        (ability) =>
          ability.userId === userId &&
          ability.title.toLowerCase() === parsed.ability?.title.toLowerCase()
      );
      if (existing) {
        return { message, ability: existing };
      }

      const ability: Ability = {
        id: id("ability"),
        userId,
        title: parsed.ability.title,
        status: "active",
        createdAt: nowIso(),
        archivedAt: null
      };
      state.abilities.unshift(ability);
      return { message, ability };
    }

    const goal = parsed.type === "task" && parsed.path === "one_off"
      ? undefined
      : resolveGoal(userId, parsed);

    if (parsed.type === "goal") {
      return { message, goal };
    }

    if (parsed.type === "task" && parsed.task) {
      const task: Task = {
        id: id("task"),
        userId,
        goalId: goal?.id ?? null,
        messageId: message.id,
        title: parsed.task.title,
        status: "open",
        dueAt: parsed.task.dueAt ?? null,
        priority: parsed.task.priority ?? "normal",
        plannedMetricType: parsed.metric?.type ?? null,
        plannedValue: parsed.metric?.value ?? null,
        plannedUnit: parsed.metric?.unit ?? null,
        createdAt: nowIso(),
        completedAt: null
      };
      state.tasks.unshift(task);
      return { message, goal, task };
    }

    if (parsed.type === "activity" && goal && parsed.metric) {
      const activity: Activity = {
        id: id("act"),
        userId,
        goalId: goal.id,
        taskId: null,
        messageId: message.id,
        summary: parsed.summary ?? rawText,
        metricType: parsed.metric.type,
        value: parsed.metric.value,
        unit: parsed.metric.unit,
        occurredOn: parsed.date ?? nowIso().slice(0, 10),
        createdAt: nowIso()
      };
      state.activities.unshift(activity);
      return { message, goal, activity };
    }

    if (parsed.type === "reminder" && parsed.reminder) {
      let task: Task | undefined;
      if (parsed.task) {
        task = {
          id: id("task"),
          userId,
          goalId: goal?.id ?? null,
          messageId: message.id,
          title: parsed.task.title,
          status: "open",
          dueAt: parsed.task.dueAt ?? null,
          priority: parsed.task.priority ?? "normal",
          plannedMetricType: parsed.metric?.type ?? null,
          plannedValue: parsed.metric?.value ?? null,
          plannedUnit: parsed.metric?.unit ?? null,
          createdAt: nowIso(),
          completedAt: null
        };
        state.tasks.unshift(task);
      }

      const reminder: Reminder = {
        id: id("reminder"),
        userId,
        taskId: task?.id ?? null,
        messageId: message.id,
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
