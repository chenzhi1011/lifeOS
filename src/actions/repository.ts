import { lifeOSStore } from "@/src/domain/store";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchPreparationContext } from "./batch-preparation";
import type {
  ActionAbilityContext,
  ActionGoalAliasContext,
  ActionGoalContext,
  ActionTaskContext
} from "./batch-resolution";
import type { LifeEventActionPayload } from "./validation";
import { toParseResult } from "./validation";
import { normalizeIntentTitle } from "./batch-resolution";
import type { AbilityReference, LifeEventGoalReference } from "@/src/domain/types";

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
  abilities: ActionAbilityContext[];
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

function abilityStatus(value: unknown): ActionAbilityContext["status"] {
  if (value === "active" || value === "archived") {
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
  abilities: ContextRow[],
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
    abilities: abilities.map((ability) => ({
      id: requiredString(ability.id),
      title: requiredString(ability.title),
      status: abilityStatus(ability.status)
    })),
    goals: goals.map((goal) => ({
      id: requiredString(goal.id),
      title: requiredString(goal.title),
      category: requiredString(goal.category),
      parentGoalId:
        nullableString(
          firstDefined(goal, "parent_goal_id", "parentGoalId")
        ),
      goalType: goalType(firstDefined(goal, "goal_type", "goalType")),
      abilityId: nullableString(
        firstDefined(goal, "ability_id", "abilityId")
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
      { data: abilities, error: abilitiesError },
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
        .from("abilities")
        .select("id,title,status")
        .eq("user_id", userId)
        .order("created_at"),
      supabase
        .from("goals")
        .select(
          "id,title,category,parent_goal_id,goal_type,ability_id,metric_type,status,created_at"
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
      abilitiesError ||
      goalsError ||
      aliasesError ||
      tasksError ||
      !profile
    ) {
      throw new Error(
          profileError?.message ??
          abilitiesError?.message ??
          goalsError?.message ??
          aliasesError?.message ??
          tasksError?.message ??
          "failed to read action context"
      );
    }

    return formatActionContext(
      profile,
      abilities ?? [],
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
    state.abilities.filter((ability) => ability.userId === userId),
    state.goals.filter((goal) => goal.userId === userId),
    state.goalAliases.filter((alias) => alias.userId === userId),
    state.tasks.filter(
      (task) => task.userId === userId && task.status === "open"
    ),
    now
  );
}

type SupabaseGoalRow = {
  id: string;
  title: string;
  category: string;
  parent_goal_id: string | null;
  goal_type: "long_term" | "short_term";
  ability_id: string | null;
  metric_type: ActionMetricType;
  status: "active" | "paused" | "completed";
  created_at: string;
};

function requireUnique<T>(candidates: T[], ambiguousMessage: string): T | undefined {
  if (candidates.length > 1) {
    throw new Error(ambiguousMessage);
  }
  return candidates[0];
}

async function resolveSupabaseAbility(
  userId: string,
  reference: AbilityReference,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from("abilities")
    .select("id,title,status,created_at,archived_at")
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }

  const candidates = (data ?? []).filter(
    (ability) =>
      ability.status === "active" &&
      ((reference.id !== undefined && ability.id === reference.id) ||
        (reference.title !== undefined &&
          normalizeIntentTitle(ability.title) === normalizeIntentTitle(reference.title)))
  );
  const ability = requireUnique(
    candidates,
    `multiple active abilities match: ${reference.title ?? reference.id}`
  );
  if (!ability) {
    throw new Error(`ability does not exist: ${reference.title ?? reference.id}`);
  }
  return ability;
}

async function upsertSupabaseAbility(
  userId: string,
  title: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from("abilities")
    .upsert(
      { user_id: userId, title },
      { onConflict: "user_id,title" }
    )
    .select("id,title,status,created_at,archived_at")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function resolveSupabaseGoal(
  userId: string,
  goalInput: LifeEventGoalReference,
  eventType: LifeEventActionPayload["type"],
  supabase: SupabaseClient
): Promise<SupabaseGoalRow> {
  const [{ data: goals, error: goalsError }, { data: aliases, error: aliasesError }] =
    await Promise.all([
      supabase
        .from("goals")
        .select(
          "id,title,category,parent_goal_id,goal_type,ability_id,metric_type,status,created_at"
        )
        .eq("user_id", userId),
      supabase
        .from("goal_aliases")
        .select("goal_id,alias")
        .eq("user_id", userId)
    ]);
  if (goalsError || aliasesError) {
    throw new Error(goalsError?.message ?? aliasesError?.message);
  }

  const rows = (goals ?? []) as SupabaseGoalRow[];
  const requestedTitle = goalInput.title.trim().toLowerCase();
  const activeIds = new Set(
    rows.filter((goal) => goal.status === "active").map((goal) => goal.id)
  );
  const matchingIds = new Set(
    rows
      .filter(
        (goal) =>
          (eventType === "goal" || goal.status === "active") &&
          goal.title.trim().toLowerCase() === requestedTitle
      )
      .map((goal) => goal.id)
  );
  for (const alias of aliases ?? []) {
    if (
      activeIds.has(alias.goal_id) &&
      alias.alias.trim().toLowerCase() === requestedTitle
    ) {
      matchingIds.add(alias.goal_id);
    }
  }

  const existing = requireUnique(
    rows.filter((goal) => matchingIds.has(goal.id)),
    `multiple active goals match: ${goalInput.title}`
  );
  const ability = goalInput.ability
    ? await resolveSupabaseAbility(userId, goalInput.ability, supabase)
    : null;

  let parentGoalId: string | null = null;
  if (goalInput.parentTitle) {
    const parent = requireUnique(
      rows.filter(
        (goal) =>
          goal.status === "active" &&
          goal.title.trim().toLowerCase() === goalInput.parentTitle?.trim().toLowerCase()
      ),
      `multiple active parent goals match: ${goalInput.parentTitle}`
    );
    if (!parent) {
      throw new Error(`parent goal does not exist: ${goalInput.parentTitle}`);
    }
    parentGoalId = parent.id;
  }

  const requestedAliases = goalInput.aliases ?? [];
  for (const alias of requestedAliases) {
    const existingAlias = (aliases ?? []).find(
      (candidate) => candidate.alias.trim().toLowerCase() === alias.trim().toLowerCase()
    );
    if (existingAlias && existingAlias.goal_id !== existing?.id) {
      throw new Error(`goal alias conflicts with existing goal: ${alias}`);
    }
  }

  async function persistAliases(goalId: string): Promise<void> {
    for (const alias of requestedAliases) {
      const existingAlias = (aliases ?? []).find(
        (candidate) => candidate.alias.trim().toLowerCase() === alias.trim().toLowerCase()
      );
      if (!existingAlias) {
        const { error: aliasError } = await supabase
          .from("goal_aliases")
          .insert({ user_id: userId, goal_id: goalId, alias });
        if (aliasError) {
          throw new Error(aliasError.message);
        }
      }
    }
  }

  if (existing) {
    if (goalInput.goalType) {
      const metricType = goalInput.metricType ?? "count";
      if (
        existing.goal_type !== goalInput.goalType ||
        existing.ability_id !== (goalInput.goalType === "long_term" ? ability?.id ?? null : null) ||
        existing.category !== goalInput.category ||
        existing.metric_type !== metricType ||
        existing.parent_goal_id !== parentGoalId
      ) {
        throw new Error(`goal identity conflicts with existing goal: ${goalInput.title}`);
      }
    }
    await persistAliases(existing.id);
    return existing;
  }

  if (!goalInput.goalType) {
    throw new Error(`goal does not exist: ${goalInput.title}`);
  }

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      title: goalInput.title,
      category: goalInput.category,
      parent_goal_id: parentGoalId,
      goal_type: goalInput.goalType,
      ability_id: goalInput.goalType === "long_term" ? ability?.id ?? null : null,
      metric_type: goalInput.metricType ?? "count",
      status: "active",
      due_at: null,
      completed_at: null
    })
    .select(
      "id,title,category,parent_goal_id,goal_type,ability_id,metric_type,status,created_at"
    )
    .single();
  if (error) {
    throw new Error(error.message);
  }

  await persistAliases(goal.id);

  return goal as SupabaseGoalRow;
}

async function writeSupabaseLifeEvent(
  userId: string,
  payload: LifeEventActionPayload,
  supabase: SupabaseClient | null
) {
  if (!supabase) {
    return null;
  }

  const parsed = toParseResult(payload);
  const ability = payload.type === "ability"
    ? await upsertSupabaseAbility(userId, payload.ability.title, supabase)
    : null;
  const goal = payload.type === "task" && payload.path === "one_off"
    ? null
    : "goal" in payload && payload.goal
      ? await resolveSupabaseGoal(userId, payload.goal, payload.type, supabase)
      : null;
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


  if (payload.type === "ability") {
    return { message, ability };
  }

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
        priority: payload.task.priority ?? "normal",
        planned_metric_type: payload.metric?.type ?? null,
        planned_value: payload.metric?.value ?? null,
        planned_unit: payload.metric?.unit ?? null
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message, goal, task };
  }

  if (payload.type === "activity" && goal) {
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

  if (payload.type === "reminder") {
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
          priority: payload.task.priority ?? "normal",
          planned_metric_type: payload.metric?.type ?? null,
          planned_value: payload.metric?.value ?? null,
          planned_unit: payload.metric?.unit ?? null
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
  }
}

export async function writeLifeEventFromAction(
  userId: string,
  payload: LifeEventActionPayload,
  supabase: SupabaseClient | null = createServiceSupabaseClient()
) {
  const supabaseResult = await writeSupabaseLifeEvent(userId, payload, supabase);
  if (supabaseResult) {
    return { mode: "supabase", result: supabaseResult };
  }

  ensureLocalUser(userId);
  const result = lifeOSStore.applyParseResult(userId, "gpt_action", payload.rawText, toParseResult(payload));
  return { mode: "memory", result };
}
