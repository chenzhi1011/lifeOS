import { lifeOSStore } from "@/src/domain/store";
import type { GoalAlias } from "@/src/domain/types";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { LifeEventActionPayload } from "./validation";
import { toParseResult } from "./validation";

export async function readActionContext(userId: string) {
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const [{ data: goals, error: goalsError }, { data: aliases, error: aliasesError }] = await Promise.all([
      supabase.from("goals").select("id,title,category,parent_goal_id,metric_type,status,created_at").eq("user_id", userId).order("created_at"),
      supabase.from("goal_aliases").select("goal_id,alias").eq("user_id", userId).order("alias")
    ]);

    if (goalsError || aliasesError) {
      throw new Error(goalsError?.message ?? aliasesError?.message ?? "failed to read action context");
    }

    return {
      goals: goals ?? [],
      aliases: aliases ?? []
    };
  }

  const state = lifeOSStore.getState();
  return {
    goals: state.goals.filter((goal) => goal.userId === userId),
    aliases: state.goalAliases.filter((alias) => alias.userId === userId)
  };
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
    state.profiles.push({ userId, displayName: userId, createdAt: new Date().toISOString() });
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
