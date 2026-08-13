import { z } from "zod";
import { LIFE_AREA_IDS } from "./life-areas";

const textField = z.string().trim().min(1).max(500);
const optionalTextField = textField.optional();
const confidenceField = z.number().min(0).max(1);
const intentTypeField = z.enum([
  "task",
  "activity",
  "goal",
  "reminder",
  "inbox"
]);

const goalFields = {
  title: textField,
  category: textField,
  parentTitle: optionalTextField,
  metricType: z.enum(["duration", "count", "milestone"]).optional(),
  aliases: z.array(textField).max(12).optional()
};

function validateGoalShape(
  goal: {
    goalType?: "long_term" | "short_term";
    aliases?: string[];
  },
  ctx: z.RefinementCtx
) {
  const normalizedAliases = (goal.aliases ?? []).map((alias) =>
    alias.trim().toLowerCase()
  );
  if (new Set(normalizedAliases).size !== normalizedAliases.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "goal aliases must be unique",
      path: ["aliases"]
    });
  }
}

export const goalReferenceSchema = z
  .object({
    ...goalFields,
    goalType: z.enum(["long_term", "short_term"]).optional()
  })
  .strict()
  .superRefine(validateGoalShape);

const goalInputSchema = z
  .object({
    ...goalFields,
    goalType: z.enum(["long_term", "short_term"]),
    lifeArea: z.enum(LIFE_AREA_IDS)
  })
  .strict()
  .superRefine(validateGoalShape);

export const lifeEventMetricSchema = z
  .object({
    type: z.enum(["duration", "count", "milestone"]),
    value: z.number().positive().max(100_000),
    unit: z.enum(["minute", "hour", "count"])
  })
  .strict()
  .superRefine((metric, ctx) => {
    const valid = metric.type === "duration"
      ? metric.unit === "minute" || metric.unit === "hour"
      : metric.unit === "count";
    if (!valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid unit for metric type", path: ["unit"] });
    }
  });

const taskSchema = z
  .object({
    title: textField,
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(["low", "normal", "high"]).optional()
  })
  .strict();

const reminderSchema = z
  .object({
    remindAt: z.string().datetime({ offset: true }),
    repeatRule: z.enum(["none", "daily", "weekly"])
  })
  .strict();

const commonFields = {
  rawText: optionalTextField,
  confidence: confidenceField,
  suggestedTypes: z.array(intentTypeField).min(1).max(5).optional(),
  reason: optionalTextField
};

const taskEventSchema = z
  .object({
    ...commonFields,
    type: z.literal("task"),
    path: z.enum(["one_off", "goal"]),
    goal: goalReferenceSchema.optional(),
    task: taskSchema,
    metric: lifeEventMetricSchema.optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .strict()
  .superRefine((task, ctx) => {
    if (task.path === "one_off" && task.goal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "one_off forbids goal",
        path: ["goal"]
      });
    }
    if (task.path === "goal" && !task.goal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "goal path requires goal",
        path: ["goal"]
      });
    }
  });

const activityEventSchema = z
  .object({
    ...commonFields,
    type: z.literal("activity"),
    goal: goalReferenceSchema,
    summary: textField,
    metric: lifeEventMetricSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    task: taskSchema.nullable().optional(),
    reminder: reminderSchema.nullable().optional()
  })
  .strict();

const goalEventSchema = z
  .object({
    ...commonFields,
    type: z.literal("goal"),
    goal: goalInputSchema
  })
  .strict();

const reminderEventSchema = z
  .object({
    ...commonFields,
    type: z.literal("reminder"),
    goal: goalReferenceSchema.optional(),
    task: taskSchema.nullable().optional(),
    reminder: reminderSchema,
    metric: lifeEventMetricSchema.optional()
  })
  .strict();

const inboxEventSchema = z
  .object({
    ...commonFields,
    type: z.literal("inbox")
  })
  .strict();

export const lifeEventParseResultSchema = z.union([
  taskEventSchema,
  activityEventSchema,
  goalEventSchema,
  reminderEventSchema,
  inboxEventSchema
]);

export const lifeEventActionPayloadSchema = lifeEventParseResultSchema.superRefine(
  (payload, ctx) => {
    if (!payload.rawText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rawText is required",
        path: ["rawText"]
      });
    }
    if (
      payload.type === "inbox" &&
      (!payload.reason || !payload.suggestedTypes?.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "inbox requires reason and suggestedTypes"
      });
    }
  }
);
