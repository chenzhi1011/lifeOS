import { lifeOSStore } from "@/src/domain/store";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchPreparationContext } from "./batch-preparation";
import type {
  ActionGoalAliasContext,
  ActionGoalContext,
  ActionTaskContext
} from "./batch-resolution";
import type { LifeEventActionPayload } from "./validation";
import { toParseResult } from "./validation";

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
          "id,title,category,parent_goal_id,metric_type,status,created_at"
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

async function resolveSupabaseGoal(userId: string, payload: LifeEventActionPayload) {
  const supabase = createServiceSupabaseClient();
  if (!supabase || !payload.goal) {
    return null;
  }

  const { data: existing, error: existingError } = await supabase
    .from("goals")
    .select("id,title,category,parent_goal_id,metric_type,status,created_at")
    .eq("user_id", userId)
    .eq("title", payload.goal.title)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing) {
    return existing;
  }

  const { data: parent } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("title", payload.goal.parentTitle ?? payload.goal.category)
    .maybeSingle();

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      title: payload.goal.title,
      category: payload.goal.category,
      parent_goal_id: parent?.id ?? null,
      metric_type: payload.goal.metricType ?? (payload.type === "goal" || payload.type === "activity" ? "duration" : "count"),
      status: "active"
    })
    .select("id,title,category,parent_goal_id,metric_type,status,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  for (const alias of payload.goal.aliases ?? []) {
    await supabase.from("goal_aliases").upsert({ user_id: userId, goal_id: goal.id, alias }, { onConflict: "user_id,alias" });
  }

  return goal;
}

async function writeSupabaseLifeEvent(userId: string, payload: LifeEventActionPayload) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const parsed = toParseResult(payload);
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      user_id: userId,
      source: "gpt_action",
      raw_text: payload.rawText,
      intent_type: payload.type,
      confidence: payload.confidence,
      parsed_json: parsed,
      status: payload.type === "inbox" ? "inbox" : "processed"
    })
    .select("id")
    .single();

  if (messageError) {
    throw new Error(messageError.message);
  }

  if (payload.type === "inbox") {
    const { data: inboxItem, error } = await supabase
      .from("inbox_items")
      .insert({
        user_id: userId,
        message_id: message.id,
        suggested_type: payload.suggestedTypes?.[0] ?? "inbox",
        suggested_json: parsed,
        reason: payload.reason ?? "需要确认。",
        status: "pending"
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message, inboxItem };
  }

  const goal = await resolveSupabaseGoal(userId, payload);

  if (payload.type === "goal") {
    return { message, goal };
  }

  if (payload.type === "task" && payload.task) {
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        goal_id: goal?.id ?? null,
        message_id: message.id,
        title: payload.task.title,
        status: "open",
        due_at: payload.task.dueAt ?? null,
        priority: payload.task.priority ?? "normal"
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message, goal, task };
  }

  if (payload.type === "activity" && goal && payload.metric) {
    const { data: activity, error } = await supabase
      .from("activities")
      .insert({
        user_id: userId,
        goal_id: goal.id,
        message_id: message.id,
        summary: payload.summary,
        metric_type: payload.metric.type,
        value: payload.metric.value,
        unit: payload.metric.unit,
        occurred_on: payload.date ?? new Date().toISOString().slice(0, 10)
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message, goal, activity };
  }

  if (payload.type === "reminder" && payload.reminder) {
    let taskId: string | null = null;
    if (payload.task) {
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          goal_id: goal?.id ?? null,
          message_id: message.id,
          title: payload.task.title,
          status: "open",
          due_at: payload.task.dueAt ?? null,
          priority: payload.task.priority ?? "normal"
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      taskId = task.id;
    }

    const { data: reminder, error } = await supabase
      .from("reminders")
      .insert({
        user_id: userId,
        task_id: taskId,
        message_id: message.id,
        remind_at: payload.reminder.remindAt,
        repeat_rule: payload.reminder.repeatRule,
        status: "scheduled"
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message, goal, reminder };
  }

  return { message, goal };
}

function ensureLocalUser(userId: string) {
  const state = lifeOSStore.getState();
  if (!state.profiles.some((profile) => profile.userId === userId)) {
    state.profiles.push({
      userId,
      displayName: userId,
      timezone: "Asia/Tokyo",
      defaultReminderTime: "09:00",
      createdAt: new Date().toISOString()
    });
    state.goals.push(
      { id: `${userId}-life`, userId, title: "人生", category: "root", parentGoalId: null, metricType: "milestone", status: "active", createdAt: new Date().toISOString() },
      { id: `${userId}-career`, userId, title: "职业", category: "职业", parentGoalId: `${userId}-life`, metricType: "duration", status: "active", createdAt: new Date().toISOString() },
      { id: `${userId}-health`, userId, title: "健康", category: "健康", parentGoalId: `${userId}-life`, metricType: "count", status: "active", createdAt: new Date().toISOString() },
      { id: `${userId}-interest`, userId, title: "兴趣", category: "兴趣", parentGoalId: `${userId}-life`, metricType: "count", status: "active", createdAt: new Date().toISOString() }
    );
  }
}

export async function writeLifeEventFromAction(userId: string, payload: LifeEventActionPayload) {
  const supabaseResult = await writeSupabaseLifeEvent(userId, payload);
  if (supabaseResult) {
    return { mode: "supabase", result: supabaseResult };
  }

  ensureLocalUser(userId);
  const result = lifeOSStore.applyParseResult(userId, "gpt_action", payload.rawText, toParseResult(payload));
  return { mode: "memory", result };
}
