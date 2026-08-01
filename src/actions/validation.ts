import { z } from "zod";
import type { LifeEventParseResult } from "@/src/domain/types";

const textField = z.string().trim().min(1).max(500);
const optionalTextField = z.string().trim().min(1).max(500).optional();

export const lifeEventPayloadSchema = z
  .object({
    type: z.enum(["activity", "task", "goal", "reminder", "inbox"]),
    rawText: textField,
    confidence: z.number().min(0).max(1),
    goal: z
      .object({
        title: textField,
        category: textField,
        parentTitle: optionalTextField,
        goalType: z.enum(["long_term", "short_term"]).optional(),
        ability: z
          .object({
            id: z.string().uuid().optional(),
            title: optionalTextField
          })
          .strict()
          .optional(),
        metricType: z.enum(["duration", "count", "milestone"]).optional(),
        aliases: z.array(textField).max(12).optional()
      })
      .strict()
      .optional(),
    summary: optionalTextField,
    metric: z
      .object({
        type: z.enum(["duration", "count", "milestone"]),
        value: z.number().positive().max(100_000),
        unit: z.enum(["minute", "hour", "count"])
      })
      .strict()
      .optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    task: z
      .object({
        title: textField,
        dueAt: z.string().datetime({ offset: true }).nullable().optional(),
        priority: z.enum(["low", "normal", "high"]).optional()
      })
      .strict()
      .nullable()
      .optional(),
    reminder: z
      .object({
        remindAt: z.string().datetime({ offset: true }),
        repeatRule: z.enum(["none", "daily", "weekly"])
      })
      .strict()
      .nullable()
      .optional(),
    suggestedTypes: z.array(z.enum(["task", "activity", "goal", "reminder", "inbox"])).max(5).optional(),
    reason: optionalTextField
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.type === "activity" && (!payload.goal || !payload.summary || !payload.metric)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "activity requires goal, summary, and metric" });
    }
    if (payload.type === "task" && (!payload.goal || !payload.task)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "task requires goal and task" });
    }
    if (payload.type === "goal" && !payload.goal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "goal event requires goal" });
    }
    if (payload.type === "reminder" && !payload.reminder) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reminder event requires reminder" });
    }
    if (payload.type === "inbox" && (!payload.reason || !payload.suggestedTypes?.length)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "inbox requires reason and suggestedTypes" });
    }
  });

export type LifeEventActionPayload = z.infer<typeof lifeEventPayloadSchema>;

export function validateLifeEventPayload(payload: unknown): LifeEventActionPayload {
  return lifeEventPayloadSchema.parse(payload);
}

export function toParseResult(payload: LifeEventActionPayload): LifeEventParseResult {
  const common = {
    confidence: payload.confidence,
    rawText: payload.rawText,
    suggestedTypes: payload.suggestedTypes,
    reason: payload.reason
  };

  if (payload.type === "task" && payload.task) {
    return {
      ...common,
      type: "task",
      path: "goal",
      goal: payload.goal,
      task: payload.task,
      metric: payload.metric,
      date: payload.date
    };
  }

  if (payload.type === "goal" && payload.goal?.goalType) {
    return {
      ...common,
      type: "goal",
      goal: {
        ...payload.goal,
        goalType: payload.goal.goalType
      }
    };
  }

  if (payload.type === "activity") {
    return {
      ...common,
      type: "activity",
      goal: payload.goal,
      summary: payload.summary,
      metric: payload.metric,
      date: payload.date,
      task: payload.task,
      reminder: payload.reminder
    };
  }

  if (payload.type === "reminder" && payload.reminder) {
    return {
      ...common,
      type: "reminder",
      goal: payload.goal,
      task: payload.task,
      reminder: payload.reminder,
      metric: payload.metric
    };
  }

  return {
    ...common,
    type: "inbox",
    suggestedTypes: payload.suggestedTypes ?? [payload.type],
    reason: payload.reason ?? "事件缺少明确的类型字段。"
  };
}
