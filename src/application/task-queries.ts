import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import { isLifeAreaId, type LifeAreaId } from "@/src/domain/life-areas";
import type { ApiPrincipal } from "@/src/auth/api-principal";

type Row = Record<string, any>;
export type TaskListItem = {
  id: string;
  title: string;
  status: string;
  goalId: string | null;
  goalTitle: string | null;
  lifeArea: LifeAreaId | null;
  dueAt: string | null;
  priority: string;
  plannedMetric: { type: string; value: number; unit: string } | null;
  reminder: { id: string; remindAt: string; status: string } | null;
  createdAt: string;
  completedAt: string | null;
};
export type TaskQueryFilters = { status?: "open" | "completed" | "cancelled"; goalId?: string; priority?: "low" | "normal" | "high"; dueBefore?: string; dueAfter?: string; cursor?: string; limit?: number };

function encodeCursor(row: Row): string { return Buffer.from(JSON.stringify([row.created_at, row.id]), "utf8").toString("base64url"); }
function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "string") ? value as [string,string] : null; } catch { return null; }
}

export function mapTaskRows(rows: Row[]): TaskListItem[] {
  return rows.map((row) => {
    const goal = Array.isArray(row.goals) ? row.goals[0] : row.goals;
    const reminders = Array.isArray(row.reminders) ? row.reminders : [];
    const reminder = reminders[0];
    const plannedMetric = row.planned_metric_type == null ? null : {
      type: row.planned_metric_type,
      value: Number(row.planned_value),
      unit: row.planned_unit
    };
    return { id: row.id, title: row.title, status: row.status, goalId: row.goal_id ?? null, goalTitle: goal?.title ?? null,
      lifeArea: goal && isLifeAreaId(goal.life_area) ? goal.life_area : null, dueAt: row.due_at ?? null, priority: row.priority,
      plannedMetric, reminder: reminder ? { id: reminder.id, remindAt: reminder.remind_at, status: reminder.status } : null,
      createdAt: row.created_at, completedAt: row.completed_at ?? null };
  });
}

export async function queryTasks(principal: ApiPrincipal, filters: TaskQueryFilters = {}, client: SupabaseClient | null = createServiceSupabaseClient()) {
  if (!client) throw new Error("task storage is unavailable");
  const requestedLimit = Number.isFinite(filters.limit) ? filters.limit! : 50;
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);
  let query = client.from("tasks").select("id,title,status,goal_id,due_at,priority,planned_metric_type,planned_value,planned_unit,created_at,completed_at,goals(title,life_area),reminders(id,remind_at,status)")
    .eq("user_id", principal.userId).eq("status", filters.status ?? "open")
    .eq("reminders.status", "scheduled")
    .order("remind_at", { referencedTable: "reminders", ascending: true });
  if (filters.goalId) query = query.eq("goal_id", filters.goalId);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.dueBefore) query = query.lte("due_at", filters.dueBefore);
  if (filters.dueAfter) query = query.gte("due_at", filters.dueAfter);
  const cursor = decodeCursor(filters.cursor);
  if (filters.cursor && !cursor) throw new Error("invalid task cursor");
  if (cursor) query = query.or(`created_at.lt.${cursor[0]},and(created_at.eq.${cursor[0]},id.lt.${cursor[1]})`);
  query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { items: mapTaskRows(rows.slice(0, limit)), nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]!) : null };
}
