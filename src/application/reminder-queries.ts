import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/src/db/supabase";
import type { ApiPrincipal } from "@/src/auth/api-principal";

type Row = Record<string, any>;
export type ReminderQueryFilters = { status?: "scheduled" | "sent" | "cancelled"; taskId?: string; from?: string; to?: string; cursor?: string; limit?: number };
function encodeCursor(row: Row): string { return Buffer.from(JSON.stringify([row.remind_at, row.id]), "utf8").toString("base64url"); }
function decodeCursor(cursor?: string): [string,string] | null { if (!cursor) return null; try { const value=JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")); return Array.isArray(value)&&value.length===2&&value.every((item)=>typeof item==="string") ? value as [string,string] : null; } catch { return null; } }
export function mapReminderRows(rows: Row[]) {
  return rows.map((row) => { const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks; return { id: row.id, taskId: row.task_id, taskTitle: task?.title ?? null, remindAt: row.remind_at, repeatRule: row.repeat_rule, status: row.status, createdAt: row.created_at }; });
}
export async function queryReminders(principal: ApiPrincipal, filters: ReminderQueryFilters = {}, client: SupabaseClient | null = createServiceSupabaseClient()) {
  if (!client) throw new Error("reminder storage is unavailable");
  const requestedLimit = Number.isFinite(filters.limit) ? filters.limit! : 50;
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);
  let query = client.from("reminders").select("id,task_id,remind_at,repeat_rule,status,created_at,tasks(title)")
    .eq("user_id", principal.userId).eq("status", filters.status ?? "scheduled");
  if (filters.taskId) query = query.eq("task_id", filters.taskId);
  if (filters.from) query = query.gte("remind_at", filters.from);
  if (filters.to) query = query.lte("remind_at", filters.to);
  const cursor = decodeCursor(filters.cursor);
  if (filters.cursor && !cursor) throw new Error("invalid reminder cursor");
  if (cursor) query = query.or(`remind_at.gt.${cursor[0]},and(remind_at.eq.${cursor[0]},id.gt.${cursor[1]})`);
  const { data, error } = await query.order("remind_at").order("id").limit(limit + 1);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { items: mapReminderRows(rows.slice(0, limit)), nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]!) : null };
}
