import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import { isLifeAreaId, type LifeAreaId } from "@/src/domain/life-areas";
import type { ApiPrincipal } from "@/src/auth/api-principal";

type Row = Record<string, any>;
export type TaskListItem = { id: string; title: string; status: string; goal: { id: string; title: string } | null; lifeArea: LifeAreaId | null; dueAt: string | null; priority: string; createdAt: string; reminder: { id: string; remindAt: string; repeatRule: string } | null };

export function mapTaskRows(rows: Row[]): TaskListItem[] {
  return rows.map((row) => {
    const goal = Array.isArray(row.goals) ? row.goals[0] : row.goals;
    const reminders = Array.isArray(row.reminders) ? row.reminders : [];
    const reminder = reminders[0];
    return { id: row.id, title: row.title, status: row.status, goal: row.goal_id && goal ? { id: row.goal_id, title: goal.title } : null,
      lifeArea: goal && isLifeAreaId(goal.life_area) ? goal.life_area : null, dueAt: row.due_at ?? null, priority: row.priority,
      createdAt: row.created_at, reminder: reminder ? { id: reminder.id, remindAt: reminder.remind_at, repeatRule: reminder.repeat_rule } : null };
  });
}

export async function queryTasks(principal: ApiPrincipal, filters: { status?: string; limit?: number } = {}, client: SupabaseClient | null = createServiceSupabaseClient()) {
  if (!client) throw new Error("task storage is unavailable");
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  let query = client.from("tasks").select("id,title,status,goal_id,due_at,priority,created_at,goals(title,life_area),reminders(id,remind_at,repeat_rule,status)")
    .eq("user_id", principal.userId).eq("status", filters.status ?? "open").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { items: mapTaskRows(rows.slice(0, limit)), nextCursor: rows.length > limit ? rows[limit - 1]?.id ?? null : null };
}
