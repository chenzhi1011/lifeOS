import type {
  AbilityReferenceInput,
  GoalReferenceInput
} from "./batch-validation";

export interface ActionAbilityContext {
  id: string;
  title: string;
  status: "active" | "archived";
}

export interface ActionGoalContext {
  id: string;
  title: string;
  goalType: "long_term" | "short_term" | null;
  abilityId: string | null;
  status: "active" | "paused" | "completed";
}

export interface ActionGoalAliasContext {
  goalId: string;
  alias: string;
}

export interface ActionTaskContext {
  id: string;
  title: string;
  goalId: string | null;
  dueAt: string | null;
  status: "open" | "completed" | "cancelled";
}

export type GoalResolution =
  | { kind: "resolved"; goalId: string }
  | { kind: "unassigned" }
  | { kind: "inbox"; reason: string };

export type AbilityResolution =
  | { kind: "resolved"; abilityId: string }
  | { kind: "inbox"; reason: string };

export interface TaskMatchInput {
  summary: string;
  goalId: string | null;
  occurredOn: string;
  timezone: string;
  candidateTaskId?: string;
  matchConfidence?: number;
}

export type TaskMatchResult =
  | { kind: "matched"; taskId: string }
  | { kind: "unmatched" }
  | { kind: "inbox"; reason: string };

export function normalizeIntentTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\s]/gu, "")
    .replace(/^(今天|昨天|刚刚)/, "")
    .replace(/^(完成了?|做了?)/, "")
    .replace(/了$/, "");
}

export function resolveGoalReference(
  reference: GoalReferenceInput | undefined,
  eventType: "task" | "activity",
  goals: ActionGoalContext[],
  aliases: ActionGoalAliasContext[]
): GoalResolution {
  if (!reference) {
    return unresolvedGoal(eventType);
  }

  const activeGoals = goals.filter((goal) => goal.status === "active");
  const requestedTitle = reference.title?.trim().toLowerCase();

  if (requestedTitle) {
    const exactGoals = activeGoals.filter(
      (goal) => goal.title.trim().toLowerCase() === requestedTitle
    );
    if (exactGoals.length > 1) {
      return {
        kind: "inbox",
        reason: `multiple active goals match: ${reference.title}`
      };
    }
    if (exactGoals[0]) {
      return { kind: "resolved", goalId: exactGoals[0].id };
    }

    const matchingGoalIds = new Set(
      aliases
        .filter(
          (alias) =>
            alias.alias.trim().toLowerCase() === requestedTitle &&
            activeGoals.some((goal) => goal.id === alias.goalId)
        )
        .map((alias) => alias.goalId)
    );
    if (matchingGoalIds.size > 1) {
      return {
        kind: "inbox",
        reason: `multiple active goals match: ${reference.title}`
      };
    }
    const [matchingGoalId] = matchingGoalIds;
    if (matchingGoalId) {
      return { kind: "resolved", goalId: matchingGoalId };
    }
  }

  if (reference.candidateGoalId && (reference.matchConfidence ?? 0) >= 0.85) {
    const candidate = activeGoals.find((goal) => goal.id === reference.candidateGoalId);
    if (candidate) {
      return { kind: "resolved", goalId: candidate.id };
    }
  }

  if (reference.explicit) {
    return {
      kind: "inbox",
      reason: `explicit goal does not exist: ${reference.title ?? reference.candidateGoalId}`
    };
  }

  return unresolvedGoal(eventType);
}

export function resolveAbilityReference(
  reference: AbilityReferenceInput,
  abilities: ActionAbilityContext[]
): AbilityResolution {
  const activeAbilities = abilities.filter(
    (ability) => ability.status === "active"
  );

  if (reference.id) {
    const byId = activeAbilities.find((ability) => ability.id === reference.id);
    if (byId) {
      return { kind: "resolved", abilityId: byId.id };
    }
  }

  if (reference.title) {
    const normalizedTitle = normalizeIntentTitle(reference.title);
    const matches = activeAbilities.filter(
      (ability) => normalizeIntentTitle(ability.title) === normalizedTitle
    );
    if (matches.length > 1) {
      return {
        kind: "inbox",
        reason: `multiple active abilities match: ${reference.title.trim()}`
      };
    }
    if (matches[0]) {
      return { kind: "resolved", abilityId: matches[0].id };
    }
  }

  return {
    kind: "inbox",
    reason: `ability does not exist: ${reference.title ?? reference.id}`
  };
}

export function matchOpenTask(
  input: TaskMatchInput,
  tasks: ActionTaskContext[]
): TaskMatchResult {
  if (!input.candidateTaskId || (input.matchConfidence ?? 0) < 0.85) {
    return { kind: "unmatched" };
  }

  const candidate = tasks.find((task) => task.id === input.candidateTaskId);
  if (!candidate || candidate.status !== "open") {
    return { kind: "unmatched" };
  }

  const localDateFormatter = createLocalDateFormatter(input.timezone);
  const normalizedSummary = normalizeIntentTitle(input.summary);
  const normalizedCandidateTitle = normalizeIntentTitle(candidate.title);
  if (!normalizedSummary || !normalizedCandidateTitle) {
    return { kind: "unmatched" };
  }

  const candidateIsEquivalent =
    candidate.goalId === input.goalId &&
    normalizedCandidateTitle === normalizedSummary &&
    taskMatchesDateEvidence(candidate, input.occurredOn, localDateFormatter);
  if (!candidateIsEquivalent) {
    return { kind: "unmatched" };
  }

  const equivalentTasks = tasks.filter(
    (task) =>
      task.status === "open" &&
      task.goalId === input.goalId &&
      normalizeIntentTitle(task.title) === normalizedSummary &&
      taskMatchesDateEvidence(task, input.occurredOn, localDateFormatter)
  );

  if (equivalentTasks.length > 1) {
    return {
      kind: "inbox",
      reason: "multiple open tasks match the activity"
    };
  }

  return { kind: "matched", taskId: candidate.id };
}

function createLocalDateFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  } catch {
    throw new Error(`invalid timezone: ${timezone}`);
  }
}

function taskMatchesDateEvidence(
  task: ActionTaskContext,
  occurredOn: string,
  formatter: Intl.DateTimeFormat
): boolean {
  if (task.dueAt === null) {
    return true;
  }

  const dueAt = new Date(task.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return false;
  }

  const dateParts = formatter.formatToParts(dueAt);
  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;

  return Boolean(year && month && day && `${year}-${month}-${day}` === occurredOn);
}

function unresolvedGoal(eventType: "task" | "activity"): GoalResolution {
  if (eventType === "task") {
    return { kind: "unassigned" };
  }

  return { kind: "inbox", reason: "activity requires a goal" };
}
