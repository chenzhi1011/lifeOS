import type {
  LifeEventBatchInput,
  LifeEventBatchPayload
} from "./batch-validation";
import {
  matchOpenTask,
  resolveGoalReference,
  type ActionGoalAliasContext,
  type ActionGoalContext,
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
      kind: "goal";
      title: string;
      category: string;
      parentGoalId: string | null;
      metricType: "duration" | "count" | "milestone";
      aliases: string[];
    })
  | (PreparedBase & {
      kind: "inbox";
      suggestedType: "task" | "activity" | "goal" | "inbox";
      reason: string;
      suggestedEvent: LifeEventBatchInput;
      resolution?: "dismiss";
    });

export interface BatchPreparationContext {
  timezone: string;
  defaultReminderTime: string;
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

type PriorGoalTitles = Map<string, string>;

function normalizedGoalTitle(title: string): string {
  return title.trim().toLowerCase();
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

function priorGoalTitleFor(
  event: Extract<LifeEventBatchInput, { type: "task" | "activity" }>,
  priorGoalTitles: PriorGoalTitles
): string | undefined {
  const title = event.goal?.title;
  if (!title) {
    return undefined;
  }

  return priorGoalTitles.get(normalizedGoalTitle(title));
}

function prepareTask(
  event: Extract<LifeEventBatchInput, { type: "task" }>,
  context: BatchPreparationContext,
  priorGoalTitles: PriorGoalTitles,
  now: Date
): PreparedEvent {
  const goalResolution = resolveGoalReference(
    event.goal,
    "task",
    context.goals,
    context.aliases
  );

  let goalId: string | null = null;
  let goalTitle: string | undefined;
  if (goalResolution.kind === "resolved") {
    goalId = goalResolution.goalId;
  } else if (goalResolution.kind === "inbox") {
    goalTitle = priorGoalTitleFor(event, priorGoalTitles);
    if (!goalTitle) {
      return prepareInbox(event, goalResolution.reason);
    }
  }

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
    ...preparedBase(event)
  };
}

function prepareActivity(
  event: Extract<LifeEventBatchInput, { type: "activity" }>,
  context: BatchPreparationContext,
  priorGoalTitles: PriorGoalTitles
): PreparedEvent {
  const goalResolution = resolveGoalReference(
    event.goal,
    "activity",
    context.goals,
    context.aliases
  );

  let goalId: string | null = null;
  let goalTitle: string | undefined;
  if (goalResolution.kind === "resolved") {
    goalId = goalResolution.goalId;
  } else {
    goalTitle = priorGoalTitleFor(event, priorGoalTitles);
    if (!goalTitle) {
      return prepareInbox(
        event,
        goalResolution.kind === "inbox"
          ? goalResolution.reason
          : "activity requires a goal"
      );
    }
  }

  const taskMatch = matchOpenTask(
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
  event: Extract<LifeEventBatchInput, { type: "goal" }>
): Extract<PreparedEvent, { kind: "goal" }> {
  return {
    kind: "goal",
    title: event.title.trim(),
    category: event.category.trim(),
    parentGoalId: event.parentGoalId ?? null,
    metricType: event.metricType,
    aliases: event.aliases.map((alias) => alias.trim()),
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
  const priorGoalTitles: PriorGoalTitles = new Map();
  const events: PreparedEvent[] = [];

  for (const event of payload.events) {
    switch (event.type) {
      case "task":
        events.push(prepareTask(event, context, priorGoalTitles, now));
        break;
      case "activity":
        events.push(prepareActivity(event, context, priorGoalTitles));
        break;
      case "goal": {
        const preparedGoal = prepareGoal(event);
        events.push(preparedGoal);
        priorGoalTitles.set(
          normalizedGoalTitle(event.title),
          preparedGoal.title
        );
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
