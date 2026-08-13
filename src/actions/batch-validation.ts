import { z } from "zod";
import { LIFE_AREA_IDS } from "@/src/domain/life-areas";

const textField = z.string().trim().min(1).max(500);
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const confidenceField = z.number().min(0).max(1);
const uuidField = z.string().uuid();

const goalReferenceSchema = z
  .object({
    title: textField.optional(),
    explicit: z.boolean(),
    candidateGoalId: uuidField.optional(),
    matchConfidence: confidenceField.optional()
  })
  .strict()
  .superRefine((goal, ctx) => {
    if (!goal.title && !goal.candidateGoalId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "goal reference requires title or candidateGoalId"
      });
    }
  });

const metricSchema = z
  .object({
    type: z.enum(["duration", "count", "milestone"]),
    value: z.number().positive().max(100_000),
    unit: z.enum(["minute", "hour", "count"])
  })
  .strict()
  .superRefine((metric, ctx) => {
    const unitIsValid =
      (metric.type === "duration" && ["minute", "hour"].includes(metric.unit)) ||
      (["count", "milestone"].includes(metric.type) && metric.unit === "count");
    if (!unitIsValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `invalid unit ${metric.unit} for ${metric.type}`,
        path: ["unit"]
      });
    }
  });

const reminderSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("default") }).strict(),
  z.object({ mode: z.literal("none") }).strict(),
  z
    .object({
      mode: z.literal("custom"),
      remindAt: z.string().datetime({ offset: true }),
      repeatRule: z.enum(["none", "daily", "weekly"]).default("none")
    })
    .strict()
]);

const taskMatchSchema = z
  .object({
    candidateTaskId: uuidField,
    confidence: confidenceField
  })
  .strict();

const commonEventFields = {
  confidence: confidenceField,
  resolvesInboxItemId: uuidField.optional()
};

const taskBatchInputSchema = z
  .object({
    ...commonEventFields,
    type: z.literal("task"),
    path: z.enum(["one_off", "goal"]),
    title: textField,
    localDate: dateField,
    explicitDueAt: z.string().datetime({ offset: true }).optional(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    reminder: reminderSchema.optional(),
    metric: metricSchema.optional(),
    goal: goalReferenceSchema.optional()
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

const activityBatchInputSchema = z
  .object({
    ...commonEventFields,
    type: z.literal("activity"),
    summary: textField,
    occurredOn: dateField,
    metric: metricSchema.optional(),
    goal: goalReferenceSchema.optional(),
    taskMatch: taskMatchSchema.optional()
  })
  .strict();

const goalBatchInputSchema = z
  .object({
    ...commonEventFields,
    type: z.literal("goal"),
    goalType: z.enum(["long_term", "short_term"]),
    title: textField,
    category: textField,
    lifeArea: z.enum(LIFE_AREA_IDS),
    metricType: z.enum(["duration", "count", "milestone"]).default("count"),
    aliases: z.array(textField).max(12).default([])
  })
  .strict();

const inboxBatchInputSchema = z
  .object({
    ...commonEventFields,
    type: z.literal("inbox"),
    reason: textField,
    suggestedTypes: z
      .array(z.enum(["task", "activity", "goal", "inbox"]))
      .min(1)
      .max(5),
    resolution: z.literal("dismiss").optional()
  })
  .strict();

const lifeEventBatchInputSchema = z.union([
  taskBatchInputSchema,
  activityBatchInputSchema,
  goalBatchInputSchema,
  inboxBatchInputSchema
]);

export const lifeEventBatchPayloadSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    rawText: textField,
    events: z.array(lifeEventBatchInputSchema).min(1).max(20)
  })
  .strict()
  .superRefine((payload, ctx) => {
    payload.events.forEach((event, index) => {
      if (event.type === "inbox" && event.resolution === "dismiss" && !event.resolvesInboxItemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dismiss resolution requires resolvesInboxItemId",
          path: ["events", index, "resolvesInboxItemId"]
        });
      }
    });
  });

export type GoalReferenceInput = z.infer<typeof goalReferenceSchema>;
export type LifeEventBatchPayload = z.infer<typeof lifeEventBatchPayloadSchema>;
export type LifeEventBatchInput = z.infer<typeof lifeEventBatchInputSchema>;
export type TaskBatchInput = z.infer<typeof taskBatchInputSchema>;
export type ActivityBatchInput = z.infer<typeof activityBatchInputSchema>;

export function validateLifeEventBatchPayload(payload: unknown): LifeEventBatchPayload {
  return lifeEventBatchPayloadSchema.parse(payload);
}
