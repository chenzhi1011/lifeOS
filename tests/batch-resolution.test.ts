import { describe, expect, it } from "vitest";
import {
  matchOpenTask,
  normalizeIntentTitle,
  resolveAbilityReference,
  resolveGoalReference,
  type ActionAbilityContext,
  type ActionGoalAliasContext,
  type ActionGoalContext,
  type ActionTaskContext
} from "@/src/actions/batch-resolution";

const goals: ActionGoalContext[] = [
  {
    id: "goal-aws",
    title: "AWS",
    goalType: "long_term",
    abilityId: "ability-frontend",
    status: "active"
  },
  {
    id: "goal-muscle",
    title: "增肌",
    goalType: "long_term",
    abilityId: "ability-health",
    status: "active"
  },
  {
    id: "goal-paused",
    title: "暂停目标",
    goalType: "short_term",
    abilityId: null,
    status: "paused"
  }
];

const aliases: ActionGoalAliasContext[] = [{ goalId: "goal-aws", alias: "云计算" }];

const abilities: ActionAbilityContext[] = [
  { id: "ability-frontend", title: "前端能力", status: "active" },
  { id: "ability-health", title: "健康能力", status: "active" },
  { id: "ability-archived", title: "旧能力", status: "archived" }
];

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

  it("resolves an active candidate at the confidence threshold", () => {
    expect(
      resolveGoalReference(
        {
          explicit: false,
          candidateGoalId: "goal-muscle",
          matchConfidence: 0.85
        },
        "task",
        goals,
        aliases
      )
    ).toEqual({ kind: "resolved", goalId: "goal-muscle" });
  });

  it("does not resolve a candidate below the confidence threshold", () => {
    expect(
      resolveGoalReference(
        {
          explicit: false,
          candidateGoalId: "goal-muscle",
          matchConfidence: 0.849
        },
        "task",
        goals,
        aliases
      )
    ).toEqual({ kind: "unassigned" });
  });

  it("does not resolve an inactive candidate", () => {
    expect(
      resolveGoalReference(
        {
          explicit: false,
          candidateGoalId: "goal-paused",
          matchConfidence: 0.99
        },
        "task",
        goals,
        aliases
      )
    ).toEqual({ kind: "unassigned" });
  });

  it.each([
    ["exact title", "AWS"],
    ["alias", "云计算"]
  ])("rejects a conflicting candidate alongside an %s match", (_case, title) => {
    expect(
      resolveGoalReference(
        {
          title,
          explicit: true,
          candidateGoalId: "goal-muscle",
          matchConfidence: 0.99
        },
        "task",
        goals,
        aliases
      )
    ).toEqual({
      kind: "inbox",
      reason: `multiple active goals match: ${title}`
    });
  });

  it("deduplicates an exact, alias, and candidate match for the same goal id", () => {
    expect(
      resolveGoalReference(
        {
          title: "AWS",
          explicit: true,
          candidateGoalId: "goal-aws",
          matchConfidence: 0.99
        },
        "task",
        goals,
        [...aliases, { goalId: "goal-aws", alias: "AWS" }]
      )
    ).toEqual({ kind: "resolved", goalId: "goal-aws" });
  });

  it("treats an exact title on one goal and an alias on another as ambiguous", () => {
    expect(
      resolveGoalReference(
        { title: "家庭", explicit: true },
        "task",
        [
          ...goals,
          {
            id: "goal-family",
            title: "家庭",
            goalType: "short_term",
            abilityId: null,
            status: "active"
          },
          {
            id: "goal-chores",
            title: "家务系统",
            goalType: "long_term",
            abilityId: "ability-health",
            status: "active"
          }
        ],
        [...aliases, { goalId: "goal-chores", alias: "家庭" }]
      )
    ).toEqual({
      kind: "inbox",
      reason: "multiple active goals match: 家庭"
    });
  });

  it("routes duplicate exact goal titles to inbox instead of choosing the first", () => {
    expect(
      resolveGoalReference(
        { title: "AWS", explicit: true },
        "task",
        [
          ...goals,
          {
            id: "goal-aws-2",
            title: "aws",
            goalType: "long_term",
            abilityId: "ability-frontend",
            status: "active"
          }
        ],
        aliases
      )
    ).toEqual({
      kind: "inbox",
      reason: "multiple active goals match: AWS"
    });
  });

  it("routes an alias shared by active goals to inbox", () => {
    expect(
      resolveGoalReference(
        { title: "云计算", explicit: true },
        "task",
        goals,
        [
          ...aliases,
          { goalId: "goal-muscle", alias: "云计算" }
        ]
      )
    ).toEqual({
      kind: "inbox",
      reason: "multiple active goals match: 云计算"
    });
  });
});

describe("resolveAbilityReference", () => {
  it("resolves an active ability by id", () => {
    expect(
      resolveAbilityReference({ id: "ability-health" }, abilities)
    ).toEqual({ kind: "resolved", abilityId: "ability-health" });
  });

  it("resolves an active ability by normalized title", () => {
    expect(
      resolveAbilityReference({ title: " 前端 能力 " }, abilities)
    ).toEqual({ kind: "resolved", abilityId: "ability-frontend" });
  });

  it("deduplicates id and title matches for the same persisted ability", () => {
    expect(
      resolveAbilityReference(
        { id: "ability-frontend", title: "前端能力" },
        abilities
      )
    ).toEqual({ kind: "resolved", abilityId: "ability-frontend" });
  });

  it("routes conflicting id and title matches to inbox", () => {
    expect(
      resolveAbilityReference(
        { id: "ability-health", title: "前端能力" },
        abilities
      )
    ).toEqual({
      kind: "inbox",
      reason: "multiple active abilities match: 前端能力"
    });
  });

  it("does not use aliases or archived abilities", () => {
    expect(resolveAbilityReference({ title: "旧能力" }, abilities)).toEqual({
      kind: "inbox",
      reason: "ability does not exist: 旧能力"
    });
    expect(resolveAbilityReference({ title: "云计算" }, abilities)).toEqual({
      kind: "inbox",
      reason: "ability does not exist: 云计算"
    });
  });

  it("routes ambiguous normalized titles to inbox", () => {
    expect(
      resolveAbilityReference(
        { title: "前端能力" },
        [
          ...abilities,
          { id: "ability-frontend-2", title: "前端 能力", status: "active" }
        ]
      )
    ).toEqual({
      kind: "inbox",
      reason: "multiple active abilities match: 前端能力"
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
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
          candidateTaskId: "task-shoulder",
          matchConfidence: 0.85
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
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
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
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
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
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
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
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
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

  it("uses the local due date to distinguish otherwise equivalent open tasks", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
          candidateTaskId: "task-shoulder-today",
          matchConfidence: 0.95
        },
        [
          {
            ...openTask,
            id: "task-shoulder-today",
            dueAt: "2026-07-26T16:00:00Z"
          },
          {
            ...openTask,
            id: "task-shoulder-next-week",
            dueAt: "2026-08-03T09:00:00+09:00"
          }
        ]
      )
    ).toEqual({ kind: "matched", taskId: "task-shoulder-today" });
  });

  it("does not match a candidate whose local due date differs from the activity date", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
          candidateTaskId: "task-shoulder-next-week",
          matchConfidence: 0.95
        },
        [
          {
            ...openTask,
            id: "task-shoulder-next-week",
            dueAt: "2026-08-03T09:00:00+09:00"
          }
        ]
      )
    ).toEqual({ kind: "unmatched" });
  });

  it("fails closed when a candidate has an invalid database due date", () => {
    expect(
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
          candidateTaskId: "task-invalid-date",
          matchConfidence: 0.95
        },
        [{ ...openTask, id: "task-invalid-date", dueAt: "not-a-date" }]
      )
    ).toEqual({ kind: "unmatched" });
  });

  it("throws a clear error for an invalid timezone", () => {
    expect(() =>
      matchOpenTask(
        {
          summary: "练肩",
          goalId: "goal-muscle",
          occurredOn: "2026-07-27",
          timezone: "Mars/Olympus_Mons",
          candidateTaskId: "task-shoulder",
          matchConfidence: 0.95
        },
        [openTask]
      )
    ).toThrow("invalid timezone: Mars/Olympus_Mons");
  });

  it("does not match when the normalized summary and candidate title are empty", () => {
    expect(
      matchOpenTask(
        {
          summary: "完成了！",
          goalId: "goal-muscle",
          occurredOn: "2026-07-27",
          timezone: "Asia/Tokyo",
          candidateTaskId: "task-empty",
          matchConfidence: 0.95
        },
        [
          {
            id: "task-empty",
            title: "了",
            goalId: "goal-muscle",
            dueAt: null,
            status: "open"
          }
        ]
      )
    ).toEqual({ kind: "unmatched" });
  });
});
