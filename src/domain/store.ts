import { createInitialState } from "./seed";
import type {
  Ability,
  Activity,
  Goal,
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
  return type === "activity" ? "duration" : "count";
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase();
}

function validateAbilityReference(goal: LifeEventGoalReference): void {
  const reference = goal.ability;
  if (!reference) {
    return;
  }
  if ((!reference.id && !reference.title) || (reference.id && reference.title)) {
    throw new Error("ability reference requires exactly one of id or title");
  }
}

function validateGoalShape(goal: LifeEventGoalReference): void {
  validateAbilityReference(goal);
  if (goal.goalType === "long_term" && !goal.ability) {
    throw new Error("long_term goal requires ability");
  }
  if (goal.goalType === "short_term" && goal.ability) {
    throw new Error("short_term goal forbids ability");
  }
  if (!goal.goalType && goal.ability) {
    throw new Error("ability reference requires a typed goal");
  }
}

function validateMetric(metric: { type: string; value: number; unit: string } | undefined): void {
  if (!metric) {
    return;
  }
  if (
    !["duration", "count", "milestone"].includes(metric.type) ||
    !Number.isFinite(metric.value) ||
    metric.value <= 0 ||
    !["minute", "hour", "count"].includes(metric.unit)
  ) {
    throw new Error("invalid metric");
  }
}

function validateParseResult(parsed: LifeEventParseResult): void {
  if (parsed.type === "task") {
    if (parsed.path === "one_off" && parsed.goal) {
      throw new Error("one_off forbids goal");
    }
    if (parsed.path === "goal" && !parsed.goal) {
      throw new Error("goal path requires goal");
    }
  }
  if (parsed.type === "activity" && (!parsed.goal || !parsed.metric)) {
    throw new Error("activity requires goal and metric");
  }
  if ("goal" in parsed && parsed.goal) {
    validateGoalShape(parsed.goal);
  }
  if ("metric" in parsed) {
    validateMetric(parsed.metric);
  }
}

type GoalBearingParseResult = Extract<
  LifeEventParseResult,
  { type: "task" | "activity" | "goal" | "reminder" }
>;

export function createLifeOSStore(initialState: LifeOSState) {
  const state = initialState;

  function resolveAbility(userId: string, reference: NonNullable<LifeEventGoalReference["ability"]>): Ability {
    const candidates = state.abilities.filter(
      (ability) =>
        ability.userId === userId &&
        ability.status === "active" &&
        ((reference.id !== undefined && ability.id === reference.id) ||
          (reference.title !== undefined &&
            normalizedTitle(ability.title) === normalizedTitle(reference.title)))
    );

    if (candidates.length > 1) {
      throw new Error(`multiple active abilities match: ${reference.title ?? reference.id}`);
    }
    if (!candidates[0]) {
      throw new Error(`ability does not exist: ${reference.title ?? reference.id}`);
    }
    return candidates[0];
  }

  function resolveGoal(userId: string, parsed: GoalBearingParseResult): Goal | undefined {
    if (!parsed.goal) {
      return undefined;
    }

    const abilityReference = parsed.goal.ability;
    const ability = abilityReference
      ? resolveAbility(userId, abilityReference)
      : undefined;
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
            (parsed.type === "goal" || goal.status === "active") &&
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
      throw new Error(`multiple active goals match: ${parsed.goal.title}`);
    }

    const parentCandidates = parsed.goal.goalType && parsed.goal.parentTitle
      ? state.goals.filter(
          (goal) =>
            goal.userId === userId &&
            goal.status === "active" &&
            normalizedTitle(goal.title) === normalizedTitle(parsed.goal?.parentTitle ?? "")
        )
      : [];
    if (parentCandidates.length > 1) {
      throw new Error(`multiple active parent goals match: ${parsed.goal.parentTitle}`);
    }
    if (parsed.goal.goalType && parsed.goal.parentTitle && !parentCandidates[0]) {
      throw new Error(`parent goal does not exist: ${parsed.goal.parentTitle}`);
    }
    const parent = parentCandidates[0];

    function persistAliases(goalId: string): void {
      const requestedAliases = parsed.goal?.aliases ?? [];
      for (const alias of requestedAliases) {
        const existingAlias = state.goalAliases.find(
          (candidate) =>
            candidate.userId === userId &&
            normalizedTitle(candidate.alias) === normalizedTitle(alias)
        );
        if (existingAlias && existingAlias.goalId !== goalId) {
          throw new Error(`goal alias conflicts with existing goal: ${alias}`);
        }
      }
      for (const alias of requestedAliases) {
        const existingAlias = state.goalAliases.find(
          (candidate) =>
            candidate.userId === userId &&
            normalizedTitle(candidate.alias) === normalizedTitle(alias)
        );
        if (!existingAlias) {
          state.goalAliases.push({
            id: id("alias"),
            userId,
            goalId,
            alias,
            createdAt: nowIso()
          });
        }
      }
    }

    const existing = candidates[0];
    if (existing) {
      if (parsed.goal.goalType) {
        const expectedAbilityId = parsed.goal.goalType === "long_term"
          ? ability?.id ?? null
          : null;
        if (
          existing.goalType !== parsed.goal.goalType ||
          existing.abilityId !== expectedAbilityId ||
          existing.category !== parsed.goal.category ||
          existing.metricType !== (parsed.goal.metricType ?? defaultMetric(parsed.type)) ||
          existing.parentGoalId !== (parent?.id ?? null)
        ) {
          throw new Error(`goal identity conflicts with existing goal: ${parsed.goal.title}`);
        }
      }
      persistAliases(existing.id);
      return existing;
    }

    if (!parsed.goal.goalType) {
      throw new Error(`goal does not exist: ${parsed.goal.title}`);
    }

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
    persistAliases(goal.id);
    state.goals.push(goal);

    return goal;
  }

  function applyParseResult(userId: string, source: Message["source"], rawText: string, parsed: LifeEventParseResult): ApplyResult {
    validateParseResult(parsed);

    const existingAbility = parsed.type === "ability"
      ? state.abilities.filter(
          (ability) =>
            ability.userId === userId &&
            normalizedTitle(ability.title) === normalizedTitle(parsed.ability.title)
        )
      : [];
    if (existingAbility.length > 1) {
      throw new Error(`multiple abilities match: ${parsed.type === "ability" ? parsed.ability.title : ""}`);
    }

    const goal = parsed.type === "inbox" || parsed.type === "ability" ||
      (parsed.type === "task" && parsed.path === "one_off")
      ? undefined
      : resolveGoal(userId, parsed);

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

    if (parsed.type === "ability") {
      const existing = existingAbility[0];
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

    if (parsed.type === "goal") {
      return { message, goal };
    }

    if (parsed.type === "task") {
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

    if (parsed.type === "reminder") {
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
