import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/src/db/supabase";

const entityIdSchema = z.string().uuid();
const textField = z.string().trim().min(1).max(500);

const completionMetricSchema = z
  .object({
    type: z.enum(["duration", "count", "milestone"]),
    value: z.number().positive().max(100_000),
    unit: z.enum(["minute", "hour", "count"])
  })
  .strict();

export const taskCompletionInputSchema = z
  .object({
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    metric: completionMetricSchema.optional()
  })
  .strict();

export const goalCompletionInputSchema = z
  .object({
    title: textField.optional(),
    note: textField.optional(),
    evidenceUrl: z.string().url().max(2_000).optional()
  })
  .strict();

export const completionPathIdSchema = entityIdSchema;

export type TaskCompletionInput = z.infer<typeof taskCompletionInputSchema>;
export type GoalCompletionInput = z.infer<typeof goalCompletionInputSchema>;

const taskCompletionResultSchema = z
  .object({
    taskId: entityIdSchema,
    status: z.literal("completed"),
    activityId: entityIdSchema.nullable(),
    duplicate: z.boolean()
  })
  .strict();

const goalCompletionResultSchema = z
  .object({
    goalId: entityIdSchema,
    status: z.literal("completed"),
    achievementId: entityIdSchema.nullable(),
    duplicate: z.boolean()
  })
  .strict();

export type TaskCompletionResult = z.infer<typeof taskCompletionResultSchema>;
export type GoalCompletionResult = z.infer<typeof goalCompletionResultSchema>;

function completionClient(
  client: Pick<SupabaseClient, "rpc"> | null
): Pick<SupabaseClient, "rpc"> {
  if (!client) {
    throw new Error("growth completion storage is unavailable");
  }
  return client;
}

function parseRpcResult<T>(
  schema: z.ZodType<T>,
  data: unknown,
  label: string
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${label} RPC returned an invalid response`);
  }
  return parsed.data;
}

export async function completeGrowthTask(
  userId: string,
  taskId: string,
  input: unknown,
  client: Pick<SupabaseClient, "rpc"> | null = createServiceSupabaseClient()
): Promise<TaskCompletionResult> {
  const parsedTaskId = entityIdSchema.parse(taskId);
  const parsedInput = taskCompletionInputSchema.parse(input);
  const { data, error } = await completionClient(client).rpc(
    "complete_growth_task",
    {
      p_user_id: userId,
      p_task_id: parsedTaskId,
      p_occurred_on: parsedInput.occurredOn,
      p_metric_type: parsedInput.metric?.type ?? null,
      p_value: parsedInput.metric?.value ?? null,
      p_unit: parsedInput.metric?.unit ?? null
    }
  );
  if (error) {
    throw new Error(error.message);
  }
  const result = parseRpcResult(
    taskCompletionResultSchema,
    data,
    "task completion"
  );
  if (result.taskId !== parsedTaskId) {
    throw new Error("task completion RPC returned an invalid response");
  }
  return result;
}

export async function completeGrowthGoal(
  userId: string,
  goalId: string,
  input: unknown,
  client: Pick<SupabaseClient, "rpc"> | null = createServiceSupabaseClient()
): Promise<GoalCompletionResult> {
  const parsedGoalId = entityIdSchema.parse(goalId);
  const parsedInput = goalCompletionInputSchema.parse(input);
  const { data, error } = await completionClient(client).rpc(
    "complete_growth_goal",
    {
      p_user_id: userId,
      p_goal_id: parsedGoalId,
      p_title: parsedInput.title ?? null,
      p_note: parsedInput.note ?? null,
      p_evidence_url: parsedInput.evidenceUrl ?? null
    }
  );
  if (error) {
    throw new Error(error.message);
  }
  const result = parseRpcResult(
    goalCompletionResultSchema,
    data,
    "goal completion"
  );
  if (result.goalId !== parsedGoalId) {
    throw new Error("goal completion RPC returned an invalid response");
  }
  return result;
}
