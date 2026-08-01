import type {
  LifeEventBatchInput,
  LifeEventBatchPayload
} from "./batch-validation";
import {
  matchOpenTask,
  normalizeIntentTitle,
  resolveAbilityReference,
  resolveGoalReference,
  type ActionAbilityContext,
  type ActionGoalAliasContext,
  type ActionGoalContext,
  type ActionSameBatchGoalContext,
  type ActionTaskContext
} from "./batch-resolution";
import { hashCanonicalJson } from "./idempotency";
import { normalizeTaskTime } from "./time-normalization";

export interface PreparedBase {
  confidence: number;
  resolvesInboxItemId?: string;
}

export type PreparedEvent =
  | (PreparedBase & {
      kind: "task";
      title: string;
      goalId: string | null;
      goalTitle?: string;
      dueAt: string;
      remindAt: string;
      priority: "low" | "normal" | "high";
      plannedMetricType: "duration" | "count" | "milestone" | null;
      plannedValue: number | null;
      plannedUnit: "minute" | "hour" | "count" | null;
    })
  | (PreparedBase & {
      kind: "activity";
      summary: string;
      goalId: string | null;
      goalTitle?: string;
      matchedTaskId: string | null;
      metricType: "duration" | "count" | "milestone";
      value: number;
      unit: "minute" | "hour" | "count";
      occurredOn: string;
    })
  | (PreparedBase & {
      kind: "ability";
      title: string;
    })
  | (PreparedBase & {
      kind: "goal";
      title: string;
      category: string;
      goalType: "long_term" | "short_term";
      abilityId: string | null;
      abilityTitle?: string;
      metricType: "duration" | "count" | "milestone";
      aliases: string[];
    })
  | (PreparedBase & {
      kind: "inbox";
      suggestedType: "task" | "activity" | "goal" | "ability" | "inbox";
      reason: string;
      suggestedEvent: LifeEventBatchInput;
      resolution?: "dismiss";
    });

export interface BatchPreparationContext {
  timezone: string;
  defaultReminderTime: string;
  abilities: ActionAbilityContext[];
  goals: ActionGoalContext[];
  aliases: ActionGoalAliasContext[];
  openTasks: ActionTaskContext[];
}

export interface PreparedBatch {
  idempotencyKey: string;
  requestHash: string;
  rawText: string;
  events: PreparedEvent[];
}

type PriorAbilityTitles = Map<string, string[]>;

function normalizedAbilityTitle(title: string): string {
  return normalizeIntentTitle(title);
}

function preparedBase(event: LifeEventBatchInput): PreparedBase {
  return {
    confidence: event.confidence,
    ...(event.resolvesInboxItemId !== undefined
      ? { resolvesInboxItemId: event.resolvesInboxItemId }
      : {})
  };
}

function prepareInbox(
  event: LifeEventBatchInput,
  reason: string,
  suggestedType = event.type,
  resolution?: "dismiss"
): PreparedEvent {
  return {
    kind: "inbox",
    suggestedType,
    reason,
    suggestedEvent: event,
    ...preparedBase(event),
    ...(resolution ? { resolution } : {})
  };
}

function recordPriorAbilityTitle(
  titles: PriorAbilityTitles,
  title: string
): void {
  const normalized = normalizedAbilityTitle(title);
  titles.set(normalized, [...(titles.get(normalized) ?? []), title.trim()]);
}

function prepareTask(
  event: Extract<LifeEventBatchInput, { type: "task" }>,
  context: BatchPreparationContext,
  priorGoals: ActionSameBatchGoalContext[],
  now: Date
): PreparedEvent {
  if (event.path === "one_off") {
    return prepareTaskWithGoal(event, null, undefined, context, now);
  }

  const goalResolution = resolveGoalReference(
    event.goal,
    "task",
    context.goals,
    context.aliases,
    priorGoals
  );

  let goalId: string | null = null;
  let goalTitle: string | undefined;
  if (goalResolution.kind === "resolved") {
    goalId = goalResolution.goalId;
  } else if (goalResolution.kind === "same_batch") {
    goalTitle = goalResolution.goalTitle;
  } else {
    return prepareInbox(
      event,
      goalResolution.kind === "inbox"
        ? goalResolution.reason
        : "goal path requires one uniquely resolved goal"
    );
  }

  return prepareTaskWithGoal(event, goalId, goalTitle, context, now);
}

function prepareTaskWithGoal(
  event: Extract<LifeEventBatchInput, { type: "task" }>,
  goalId: string | null,
  goalTitle: string | undefined,
  context: BatchPreparationContext,
  now: Date
): PreparedEvent {
  const taskTime = normalizeTaskTime(
    {
      localDate: event.localDate,
      ...(event.explicitDueAt !== undefined
        ? { explicitDueAt: event.explicitDueAt }
        : {})
    },
    {
      timezone: context.timezone,
      defaultReminderTime: context.defaultReminderTime
    },
    now
  );

  if (!taskTime.ok) {
    return prepareInbox(event, taskTime.reason);
  }

  return {
    kind: "task",
    title: event.title.trim(),
    goalId,
    ...(goalTitle ? { goalTitle } : {}),
    dueAt: taskTime.dueAt,
    remindAt: taskTime.remindAt,
    priority: event.priority,
    plannedMetricType: event.metric?.type ?? null,
    plannedValue: event.metric?.value ?? null,
    plannedUnit: event.metric?.unit ?? null,
    ...preparedBase(event)
  };
}

function prepareActivity(
  event: Extract<LifeEventBatchInput, { type: "activity" }>,
  context: BatchPreparationContext,
  priorGoals: ActionSameBatchGoalContext[]
): PreparedEvent {
  const goalResolution = resolveGoalReference(
    event.goal,
    "activity",
    context.goals,
    context.aliases,
    priorGoals
  );

  let goalId: string | null = null;
  let goalTitle: string | undefined;
  if (goalResolution.kind === "resolved") {
    goalId = goalResolution.goalId;
  } else if (goalResolution.kind === "same_batch") {
    goalTitle = goalResolution.goalTitle;
  } else {
    return prepareInbox(
      event,
      goalResolution.kind === "inbox"
        ? goalResolution.reason
        : "activity requires a goal"
    );
  }

  const taskMatch =
    goalId === null
      ? ({ kind: "unmatched" } as const)
      : matchOpenTask(
          {
            summary: event.summary,
            goalId,
            occurredOn: event.occurredOn,
            timezone: context.timezone,
            ...(event.taskMatch
              ? {
                  candidateTaskId: event.taskMatch.candidateTaskId,
                  matchConfidence: event.taskMatch.confidence
                }
              : {})
          },
          context.openTasks
        );

  if (taskMatch.kind === "inbox") {
    return prepareInbox(event, taskMatch.reason);
  }

  const metric = event.metric ?? {
    type: "count" as const,
    value: 1,
    unit: "count" as const
  };

  return {
    kind: "activity",
    summary: event.summary.trim(),
    goalId,
    ...(goalTitle ? { goalTitle } : {}),
    matchedTaskId: taskMatch.kind === "matched" ? taskMatch.taskId : null,
    metricType: metric.type,
    value: metric.value,
    unit: metric.unit,
    occurredOn: event.occurredOn,
    ...preparedBase(event)
  };
}

function prepareGoal(
  event: Extract<LifeEventBatchInput, { type: "goal" }>,
  context: BatchPreparationContext,
  priorAbilityTitles: PriorAbilityTitles
): PreparedEvent {
  let abilityId: string | null = null;
  let abilityTitle: string | undefined;
  if (event.goalType === "long_term" && event.ability) {
    const abilityResolution = resolveAbilityReference(
      event.ability,
      context.abilities
    );
    if (abilityResolution.kind === "resolved") {
      abilityId = abilityResolution.abilityId;
    } else if (event.ability.title) {
      const sameBatchMatches =
        priorAbilityTitles.get(normalizedAbilityTitle(event.ability.title)) ?? [];
      if (sameBatchMatches.length > 1) {
        return prepareInbox(
          event,
          `multiple active abilities match: ${event.ability.title.trim()}`
        );
      }
      abilityTitle = sameBatchMatches[0];
      if (!abilityTitle) {
        return prepareInbox(event, abilityResolution.reason);
      }
    } else {
      return prepareInbox(event, abilityResolution.reason);
    }
  }

  return {
    kind: "goal",
    title: event.title.trim(),
    category: event.category.trim(),
    goalType: event.goalType,
    abilityId,
    ...(abilityTitle ? { abilityTitle } : {}),
    metricType: event.metricType,
    aliases: event.aliases.map((alias) => alias.trim()),
    ...preparedBase(event)
  };
}

function prepareAbility(
  event: Extract<LifeEventBatchInput, { type: "ability" }>
): Extract<PreparedEvent, { kind: "ability" }> {
  return {
    kind: "ability",
    title: event.title.trim(),
    ...preparedBase(event)
  };
}

function prepareDirectInbox(
  event: Extract<LifeEventBatchInput, { type: "inbox" }>
): PreparedEvent {
  return prepareInbox(
    event,
    event.reason.trim(),
    event.suggestedTypes[0] ?? "inbox",
    event.resolution
  );
}

export async function prepareLifeEventBatch(
  payload: LifeEventBatchPayload,
  context: BatchPreparationContext,
  now = new Date()
): Promise<PreparedBatch> {
  const priorGoals: ActionSameBatchGoalContext[] = [];
  const priorAbilityTitles: PriorAbilityTitles = new Map();
  const events: PreparedEvent[] = [];

  for (const [eventIndex, event] of payload.events.entries()) {
    switch (event.type) {
      case "task":
        events.push(prepareTask(event, context, priorGoals, now));
        break;
      case "activity":
        events.push(prepareActivity(event, context, priorGoals));
        break;
      case "goal": {
        const preparedGoal = prepareGoal(
          event,
          context,
          priorAbilityTitles
        );
        events.push(preparedGoal);
        if (preparedGoal.kind === "goal") {
          priorGoals.push({
            key: `batch-goal-${eventIndex}`,
            title: preparedGoal.title,
            aliases: preparedGoal.aliases
          });
        }
        break;
      }
      case "ability": {
        const preparedAbility = prepareAbility(event);
        events.push(preparedAbility);
        recordPriorAbilityTitle(priorAbilityTitles, preparedAbility.title);
        break;
      }
      case "inbox":
        events.push(prepareDirectInbox(event));
        break;
    }
  }

  return {
    idempotencyKey: payload.idempotencyKey,
    requestHash: await hashCanonicalJson(payload),
    rawText: payload.rawText,
    events
  };
}
