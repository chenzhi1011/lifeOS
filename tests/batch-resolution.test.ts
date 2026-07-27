import { describe, expect, it } from "vitest";
import {
  matchOpenTask,
  normalizeIntentTitle,
  resolveGoalReference,
  type ActionGoalAliasContext,
  type ActionGoalContext,
  type ActionTaskContext
} from "@/src/actions/batch-resolution";

const goals: ActionGoalContext[] = [
  { id: "goal-aws", title: "AWS", status: "active" },
  { id: "goal-muscle", title: "增肌", status: "active" },
  { id: "goal-paused", title: "暂停目标", status: "paused" }
];

const aliases: ActionGoalAliasContext[] = [{ goalId: "goal-aws", alias: "云计算" }];

describe("normalizeIntentTitle", () => {
  it("removes conversational prefixes, punctuation, whitespace, and a trailing 了", () => {
    expect(normalizeIntentTitle(" 今天，做了 AWS 学习了！ ")).toBe("aws学习");
  });

  it("removes Unicode Chinese and English punctuation before conversational affixes", () => {
    expect(normalizeIntentTitle("今天：做了（AWS）— 学习；了")).toBe("aws学习");
  });
});

describe("resolveGoalReference", () => {
  it("resolves an active goal by exact case-insensitive title", () => {
    expect(
      resolveGoalReference({ title: "aws", explicit: true }, "task", goals, aliases)
    ).toEqual({ kind: "resolved", goalId: "goal-aws" });
  });

  it("resolves an alias whose goal is active", () => {
    expect(
      resolveGoalReference({ title: "云计算", explicit: true }, "activity", goals, aliases)
    ).toEqual({ kind: "resolved", goalId: "goal-aws" });
  });

  it("routes an unresolved explicit goal to inbox with the requested goal in the reason", () => {
    expect(
      resolveGoalReference({ title: "不存在", explicit: true }, "task", goals, aliases)
    ).toEqual({
      kind: "inbox",
      reason: "explicit goal does not exist: 不存在"
    });
  });

  it("leaves a task unassigned when it has no goal reference", () => {
    expect(resolveGoalReference(undefined, "task", goals, aliases)).toEqual({
      kind: "unassigned"
    });
  });

  it("routes an activity without a goal reference to inbox", () => {
    expect(resolveGoalReference(undefined, "activity", goals, aliases)).toEqual({
      kind: "inbox",
      reason: "activity requires a goal"
    });
  });
});

describe("matchOpenTask", () => {
  const openTask: ActionTaskContext = {
    id: "task-shoulder",
    title: "练肩",
    goalId: "goal-muscle",
    dueAt: null,
    status: "open"
  };

  it("matches one high-confidence open candidate with the same normalized title and goal", () => {
    expect(
      matchOpenTask(
        {
          summary: "今天完成了，练 肩！",
          goalId: "goal-muscle",
          candidateTaskId: "task-shoulder",
          matchConfidence: 0.9
        },
        [openTask]
      )
    ).toEqual({ kind: "matched", taskId: "task-shoulder" });
  });

  it("does not match a low-confidence candidate", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          candidateTaskId: "task-shoulder",
          matchConfidence: 0.84
        },
        [openTask]
      )
    ).toEqual({ kind: "unmatched" });
  });

  it("does not match a completed candidate", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          candidateTaskId: "task-shoulder",
          matchConfidence: 0.9
        },
        [{ ...openTask, status: "completed" }]
      )
    ).toEqual({ kind: "unmatched" });
  });

  it("routes multiple equivalent open tasks to inbox", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          candidateTaskId: "task-shoulder",
          matchConfidence: 0.95
        },
        [openTask, { ...openTask, id: "task-shoulder-duplicate" }]
      )
    ).toEqual({
      kind: "inbox",
      reason: "multiple open tasks match the activity"
    });
  });

  it("does not report ambiguity when the candidate itself is not equivalent", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          candidateTaskId: "task-running",
          matchConfidence: 0.95
        },
        [
          {
            id: "task-running",
            title: "跑步",
            goalId: "goal-muscle",
            dueAt: null,
            status: "open"
          },
          openTask,
          { ...openTask, id: "task-shoulder-duplicate" }
        ]
      )
    ).toEqual({ kind: "unmatched" });
  });
});
