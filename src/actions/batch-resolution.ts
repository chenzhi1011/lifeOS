import type { GoalReferenceInput } from "./batch-validation";

export interface ActionGoalContext {
  id: string;
  title: string;
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

export interface TaskMatchInput {
  summary: string;
  goalId: string | null;
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
    .replace(/[,，.。?？!！、\s]/g, "")
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
    const exactGoal = activeGoals.find((goal) => goal.title.trim().toLowerCase() === requestedTitle);
    if (exactGoal) {
      return { kind: "resolved", goalId: exactGoal.id };
    }

    const matchingAlias = aliases.find(
      (alias) =>
        alias.alias.trim().toLowerCase() === requestedTitle &&
        activeGoals.some((goal) => goal.id === alias.goalId)
    );
    if (matchingAlias) {
      return { kind: "resolved", goalId: matchingAlias.goalId };
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

  const normalizedSummary = normalizeIntentTitle(input.summary);
  const equivalentTasks = tasks.filter(
    (task) =>
      task.status === "open" &&
      task.goalId === input.goalId &&
      normalizeIntentTitle(task.title) === normalizedSummary
  );

  if (equivalentTasks.length > 1) {
    return {
      kind: "inbox",
      reason: "multiple open tasks match the activity"
    };
  }

  const candidateIsEquivalent =
    candidate.goalId === input.goalId &&
    normalizeIntentTitle(candidate.title) === normalizedSummary;
  if (!candidateIsEquivalent) {
    return { kind: "unmatched" };
  }

  return { kind: "matched", taskId: candidate.id };
}

function unresolvedGoal(eventType: "task" | "activity"): GoalResolution {
  if (eventType === "task") {
    return { kind: "unassigned" };
  }

  return { kind: "inbox", reason: "activity requires a goal" };
}
