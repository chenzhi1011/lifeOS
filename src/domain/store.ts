import { createInitialState } from "./seed";
import type {
  Ability,
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
import { DomainResolutionError, isDomainResolutionError } from "./resolution";

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
      throw new DomainResolutionError(
        "ambiguous_ability",
        `multiple active abilities match: ${reference.title ?? reference.id}`
      );
    }
    if (!candidates[0]) {
      throw new DomainResolutionError(
        "missing_ability",
        `ability does not exist: ${reference.title ?? reference.id}`
      );
    }
    return candidates[0];
  }

  function resolveGoal(userId: string, parsed: GoalBearingParseResult): GoalResolutionPlan | undefined {
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
      throw new DomainResolutionError(
        "ambiguous_goal",
        `multiple active goals match: ${parsed.goal.title}`
      );
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
      throw new DomainResolutionError(
        "ambiguous_goal",
        `multiple active parent goals match: ${parsed.goal.parentTitle}`
      );
    }
    if (parsed.goal.goalType && parsed.goal.parentTitle && !parentCandidates[0]) {
      throw new DomainResolutionError(
        "missing_goal",
        `parent goal does not exist: ${parsed.goal.parentTitle}`
      );
    }
    const parent = parentCandidates[0];

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

    const existingAbility = parsed.type === "ability"
      ? state.abilities.filter(
          (ability) =>
            ability.userId === userId &&
            normalizedTitle(ability.title) === normalizedTitle(parsed.ability.title)
        )
      : [];
    let goalPlan: GoalResolutionPlan | undefined;
    try {
      if (existingAbility.length > 1) {
        throw new DomainResolutionError(
          "ambiguous_ability",
          `multiple abilities match: ${parsed.type === "ability" ? parsed.ability.title : ""}`
        );
      }
      goalPlan = parsed.type === "inbox" || parsed.type === "ability" ||
        (parsed.type === "task" && parsed.path === "one_off")
        ? undefined
        : resolveGoal(userId, parsed);
    } catch (error) {
      if (!isDomainResolutionError(error)) {
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
