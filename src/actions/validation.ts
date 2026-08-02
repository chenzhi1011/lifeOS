import { z } from "zod";
import type { LifeEventParseResult } from "@/src/domain/types";

const textField = z.string().trim().min(1).max(500);
const optionalTextField = textField.optional();
const confidenceField = z.number().min(0).max(1);
const intentTypeField = z.enum([
  "task",
  "activity",
  "goal",
  "ability",
  "reminder",
  "inbox"
]);

const abilityReferenceSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: optionalTextField
  })
  .strict()
  .superRefine((ability, ctx) => {
    if ((!ability.id && !ability.title) || (ability.id && ability.title)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ability reference requires exactly one of id or title"
      });
    }
  });

const goalFields = {
  title: textField,
  category: textField,
  parentTitle: optionalTextField,
  ability: abilityReferenceSchema.optional(),
  metricType: z.enum(["duration", "count", "milestone"]).optional(),
  aliases: z.array(textField).max(12).optional()
};

const goalReferenceSchema = z
  .object({
    ...goalFields,
    goalType: z.enum(["long_term", "short_term"]).optional()
  })
  .strict()
  .superRefine(validateGoalShape);

const goalInputSchema = z
  .object({
    ...goalFields,
    goalType: z.enum(["long_term", "short_term"])
  })
  .strict()
  .superRefine(validateGoalShape);

function validateGoalShape(
  goal: { goalType?: "long_term" | "short_term"; ability?: unknown },
  ctx: z.RefinementCtx
) {
  if (goal.goalType === "long_term" && !goal.ability) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "long_term goal requires ability",
      path: ["ability"]
    });
  }
  if (goal.goalType === "short_term" && goal.ability) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "short_term goal forbids ability",
      path: ["ability"]
    });
  }
  if (!goal.goalType && goal.ability) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ability reference requires a typed goal",
      path: ["ability"]
    });
  }
}

const metricSchema = z
  .object({
    type: z.enum(["duration", "count", "milestone"]),
    value: z.number().positive().max(100_000),
    unit: z.enum(["minute", "hour", "count"])
  })
  .strict();

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
  rawText: textField,
  confidence: confidenceField
};

const taskPayloadSchema = z
  .object({
    ...commonFields,
    type: z.literal("task"),
    path: z.enum(["one_off", "goal"]),
    goal: goalReferenceSchema.optional(),
    task: taskSchema,
    metric: metricSchema.optional(),
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

const activityPayloadSchema = z
  .object({
    ...commonFields,
    type: z.literal("activity"),
    goal: goalReferenceSchema,
    summary: textField,
    metric: metricSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    task: taskSchema.nullable().optional(),
    reminder: reminderSchema.nullable().optional()
  })
  .strict();

const goalPayloadSchema = z
  .object({
    ...commonFields,
    type: z.literal("goal"),
    goal: goalInputSchema
  })
  .strict();

const abilityPayloadSchema = z
  .object({
    ...commonFields,
    type: z.literal("ability"),
    ability: z.object({ title: textField }).strict()
  })
  .strict();

const reminderPayloadSchema = z
  .object({
    ...commonFields,
    type: z.literal("reminder"),
    goal: goalReferenceSchema.optional(),
    task: taskSchema.nullable().optional(),
    reminder: reminderSchema,
    metric: metricSchema.optional()
  })
  .strict();

const inboxPayloadSchema = z
  .object({
    ...commonFields,
    type: z.literal("inbox"),
    suggestedTypes: z.array(intentTypeField).min(1).max(5),
    reason: textField
  })
  .strict();

export const lifeEventPayloadSchema = z.union([
  taskPayloadSchema,
  activityPayloadSchema,
  goalPayloadSchema,
  abilityPayloadSchema,
  reminderPayloadSchema,
  inboxPayloadSchema
]);

export type LifeEventActionPayload = z.infer<typeof lifeEventPayloadSchema>;

export function validateLifeEventPayload(payload: unknown): LifeEventActionPayload {
  return lifeEventPayloadSchema.parse(payload);
}

export function toParseResult(payload: LifeEventActionPayload): LifeEventParseResult {
  switch (payload.type) {
    case "task":
      return { ...payload };
    case "activity":
      return { ...payload };
    case "goal":
      return { ...payload };
    case "ability":
      return { ...payload };
    case "reminder":
      return { ...payload };
    case "inbox":
      return { ...payload };
  }
}
