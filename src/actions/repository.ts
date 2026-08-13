import { lifeOSStore } from "@/src/domain/store";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchPreparationContext } from "./batch-preparation";
import type {
  ActionGoalAliasContext,
  ActionGoalContext,
  ActionTaskContext
} from "./batch-resolution";
import { isLifeAreaId } from "@/src/domain/life-areas";

type ContextRow = Record<string, unknown>;

export type ContextProfileRow = {
  timezone?: string;
  default_reminder_time?: string;
  defaultReminderTime?: string;
};

function firstDefined<T>(
  row: ContextRow,
  snakeCaseKey: string,
  camelCaseKey: string
): T | undefined {
  return (
    row[snakeCaseKey] !== undefined
      ? row[snakeCaseKey]
      : row[camelCaseKey]
  ) as T | undefined;
}

type ActionMetricType = "duration" | "count" | "milestone";

export interface FormattedActionGoal extends ActionGoalContext {
  category: string;
  parentGoalId: string | null;
  metricType: ActionMetricType;
  createdAt: string;
}

export interface FormattedActionContext extends BatchPreparationContext {
  currentTime: string;
  goals: FormattedActionGoal[];
  aliases: ActionGoalAliasContext[];
  openTasks: ActionTaskContext[];
}

function invalidActionContext(): never {
  throw new Error("invalid action context");
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return invalidActionContext();
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredString(value);
}

function goalStatus(value: unknown): ActionGoalContext["status"] {
  if (value === "active" || value === "paused" || value === "completed") {
    return value;
  }
  return invalidActionContext();
}

function goalType(value: unknown): ActionGoalContext["goalType"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "long_term" || value === "short_term") {
    return value;
  }
  return invalidActionContext();
}

function metricType(value: unknown): ActionMetricType {
  if (value === "duration" || value === "count" || value === "milestone") {
    return value;
  }
  return invalidActionContext();
}

export function formatActionContext(
  profile: ContextProfileRow,
  goals: ContextRow[],
  aliases: ContextRow[],
  openTasks: ContextRow[],
  now = new Date()
): FormattedActionContext {
  const timezone = requiredString(profile.timezone ?? "Asia/Tokyo");
  const rawDefaultReminderTime =
    profile.default_reminder_time ??
    profile.defaultReminderTime ??
    "09:00";
  const defaultReminderTime = requiredString(rawDefaultReminderTime).slice(0, 5);
  let currentTime: string;
  try {
    currentTime = `${new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      dateStyle: "short",
      timeStyle: "medium",
      hourCycle: "h23"
    }).format(now)} ${timezone}`;
  } catch {
    return invalidActionContext();
  }

  return {
    timezone,
    defaultReminderTime,
    currentTime,
    goals: goals.map((goal) => ({
      id: requiredString(goal.id),
      title: requiredString(goal.title),
      category: requiredString(goal.category),
      parentGoalId:
        nullableString(
          firstDefined(goal, "parent_goal_id", "parentGoalId")
        ),
      goalType: goalType(firstDefined(goal, "goal_type", "goalType")),
      lifeArea: (() => {
        const value = firstDefined(goal, "life_area", "lifeArea");
        return isLifeAreaId(value) ? value : invalidActionContext();
      })(),
      metricType: metricType(
        firstDefined(goal, "metric_type", "metricType")
      ),
      status: goalStatus(goal.status),
      createdAt: requiredString(
        firstDefined(goal, "created_at", "createdAt")
      )
    })),
    aliases: aliases.map((alias) => ({
      goalId: requiredString(firstDefined(alias, "goal_id", "goalId")),
      alias: requiredString(alias.alias)
    })),
    openTasks: openTasks
      .filter((task) => task.status === "open")
      .map((task) => ({
        id: requiredString(task.id),
        title: requiredString(task.title),
        goalId: nullableString(firstDefined(task, "goal_id", "goalId")),
        dueAt: nullableString(firstDefined(task, "due_at", "dueAt")),
        status: "open" as const
      }))
  };
}

export async function readActionContext(
  userId: string,
  supabase: SupabaseClient | null = createServiceSupabaseClient(),
  now = new Date()
) {
  if (supabase) {
    const [
      { data: profile, error: profileError },
      { data: goals, error: goalsError },
      { data: aliases, error: aliasesError },
      { data: openTasks, error: tasksError }
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("timezone,default_reminder_time")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("goals")
        .select(
          "id,title,category,parent_goal_id,goal_type,life_area,metric_type,status,created_at"
        )
        .eq("user_id", userId)
        .order("created_at"),
      supabase
        .from("goal_aliases")
        .select("goal_id,alias")
        .eq("user_id", userId)
        .order("alias"),
      supabase
        .from("tasks")
        .select("id,title,goal_id,due_at,status")
        .eq("user_id", userId)
        .eq("status", "open")
        .order("due_at")
    ]);

    if (
      profileError ||
      goalsError ||
      aliasesError ||
      tasksError ||
      !profile
    ) {
      throw new Error(
          profileError?.message ??
          goalsError?.message ??
          aliasesError?.message ??
          tasksError?.message ??
          "failed to read action context"
      );
    }

    return formatActionContext(
      profile,
      goals ?? [],
      aliases ?? [],
      openTasks ?? [],
      now
    );
  }

  const state = lifeOSStore.getState();
  const profile = state.profiles.find((item) => item.userId === userId) ?? {
    timezone: "Asia/Tokyo",
    defaultReminderTime: "09:00"
  };

  return formatActionContext(
    profile,
    state.goals.filter((goal) => goal.userId === userId),
    state.goalAliases.filter((alias) => alias.userId === userId),
    state.tasks.filter(
      (task) => task.userId === userId && task.status === "open"
    ),
    now
  );
}
