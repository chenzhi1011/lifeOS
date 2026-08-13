import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { ApiPrincipal } from "@/src/auth/api-principal";

type Row = Record<string, any>;
export function mapReminderRows(rows: Row[]) {
  return rows.map((row) => { const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks; return { id: row.id, taskId: row.task_id, taskTitle: task?.title ?? null, remindAt: row.remind_at, repeatRule: row.repeat_rule, status: row.status }; });
}
export async function queryReminders(principal: ApiPrincipal, filters: { status?: string; limit?: number } = {}, client: SupabaseClient | null = createServiceSupabaseClient()) {
  if (!client) throw new Error("reminder storage is unavailable");
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const { data, error } = await client.from("reminders").select("id,task_id,remind_at,repeat_rule,status,tasks(title)")
    .eq("user_id", principal.userId).eq("status", filters.status ?? "scheduled").order("remind_at").order("id").limit(limit + 1);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { items: mapReminderRows(rows.slice(0, limit)), nextCursor: rows.length > limit ? rows[limit - 1]?.id ?? null : null };
}
