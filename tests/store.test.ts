import { describe, expect, it } from "vitest";
import { createInitialState } from "@/src/domain/seed";
import { createLifeOSStore } from "@/src/domain/store";
import type { LifeEventParseResult } from "@/src/domain/types";

// @ts-expect-error task events require a path discriminator
const taskWithoutPath: LifeEventParseResult = { type: "task", confidence: 0.9, task: { title: "学习" } };
// @ts-expect-error ability events require an ability payload
const abilityWithoutPayload: LifeEventParseResult = { type: "ability", confidence: 0.9 };
// @ts-expect-error ability event payloads require a title
const abilityWithoutTitle: LifeEventParseResult = { type: "ability", confidence: 0.9, ability: {} };
// @ts-expect-error goal events require an explicit goal type
const goalWithoutType: LifeEventParseResult = { type: "goal", confidence: 0.9, goal: { title: "学习", category: "职业" } };

void [taskWithoutPath, abilityWithoutPayload, abilityWithoutTitle, goalWithoutType];

describe("Life OS store", () => {
  it("creates demo data owned by the demo user", () => {
    const state = createInitialState();
    expect(state.currentUserId).toBe("demo-user");
    expect(state.abilities.every((ability) => ability.userId === "demo-user")).toBe(true);
    expect(state.goals.every((goal) => goal.userId === "demo-user")).toBe(true);
    expect(state.activities.every((activity) => activity.userId === "demo-user")).toBe(true);
  });

  it("separates abilities from typed goals", () => {
    const state = createInitialState();
    const abilityByTitle = new Map(state.abilities.map((ability) => [ability.title, ability]));
    expect([...abilityByTitle.keys()]).toEqual(
      expect.arrayContaining(["前端能力", "健康能力", "投资能力"])
    );
    expect(state.goals.every((goal) => goal.goalType !== null)).toBe(true);
    expect(
      state.goals
        .filter((goal) => goal.goalType === "long_term")
        .every((goal) => goal.abilityId !== null)
    ).toBe(true);
    expect(
      state.goals
        .filter((goal) => goal.goalType === "short_term")
        .every((goal) => goal.abilityId === null)
    ).toBe(true);

    const frontendAbility = abilityByTitle.get("前端能力");
    const healthAbility = abilityByTitle.get("健康能力");
    const frontendGoals = state.goals.filter(
      (goal) => goal.title === "AWS" || goal.title === "AI"
    );
    expect(frontendGoals.map((goal) => goal.title).sort()).toEqual(["AI", "AWS"]);
    expect(
      frontendGoals.every(
        (goal) => goal.goalType === "long_term" && goal.abilityId === frontendAbility?.id
      )
    ).toBe(true);
    expect(state.goals.find((goal) => goal.title === "增肌")).toMatchObject({
      goalType: "long_term",
      abilityId: healthAbility?.id
    });
    expect(state.goals.find((goal) => goal.title === "转职")).toMatchObject({
      goalType: "short_term",
      status: "active",
      abilityId: null
    });

    const completedShortGoals = state.goals.filter(
      (goal) => goal.goalType === "short_term" && goal.status === "completed"
    );
    expect(completedShortGoals).toHaveLength(1);
    expect(state.achievements).toHaveLength(1);
    expect(state.achievements[0]?.shortGoalId).toBe(completedShortGoals[0]?.id);
    const pseudoGoalTitles = new Set(["人生", "职业", "健康", "财富", "兴趣"]);
    expect(state.goals.filter((goal) => pseudoGoalTitles.has(goal.title))).toHaveLength(0);
  });

  it("writes activity input into messages and activities", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "今天学习 AWS 40 分钟", {
      type: "activity",
      confidence: 0.92,
      goal: { title: "AWS", category: "职业" },
      summary: "学习 AWS",
      metric: { type: "duration", value: 40, unit: "minute" },
      date: "2026-07-25"
    });

    expect(result.message.status).toBe("processed");
    expect(result.activity?.value).toBe(40);
    expect(store.getState().activities.some((activity) => activity.messageId === result.message.id)).toBe(true);
  });

  it("creates an ability from an ability event", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "培养写作能力", {
      type: "ability",
      confidence: 0.95,
      ability: { title: "写作能力" }
    });

    expect(result.ability?.title).toBe("写作能力");
    expect(store.getState().abilities).toContainEqual(result.ability);
  });

  it("writes a one-off task without resolving a goal", () => {
    const store = createLifeOSStore(createInitialState());
    const goalCount = store.getState().goals.length;
    const result = store.applyParseResult("demo-user", "mock", "买水", {
      type: "task",
      path: "one_off",
      confidence: 0.96,
      task: { title: "买水" }
    });

    expect(result.task?.goalId).toBeNull();
    expect(result.goal).toBeUndefined();
    expect(store.getState().goals).toHaveLength(goalCount);
  });

  it("rejects invalid task path combinations before writing", () => {
    const store = createLifeOSStore(createInitialState());
    const messageCount = store.getState().messages.length;

    expect(() =>
      store.applyParseResult("demo-user", "mock", "买水", {
        type: "task",
        path: "one_off",
        confidence: 0.96,
        goal: { title: "生活", category: "日常" },
        task: { title: "买水" }
      })
    ).toThrow(/one_off forbids goal/);

    expect(() =>
      store.applyParseResult("demo-user", "mock", "准备面试", {
        type: "task",
        path: "goal",
        confidence: 0.96,
        task: { title: "准备面试" }
      })
    ).toThrow(/goal path requires goal/);

    expect(() =>
      store.applyParseResult("demo-user", "mock", "准备不存在的考试", {
        type: "task",
        path: "goal",
        confidence: 0.96,
        goal: { title: "不存在的考试", category: "职业" },
        task: { title: "准备考试" }
      })
    ).toThrow(/goal does not exist/);

    expect(store.getState().messages).toHaveLength(messageCount);
  });

  it("rejects illegal typed goals before writing", () => {
    const store = createLifeOSStore(createInitialState());
    const messageCount = store.getState().messages.length;

    expect(() =>
      store.applyParseResult("demo-user", "mock", "学写作", {
        type: "goal",
        confidence: 0.94,
        goal: {
          title: "写作",
          category: "兴趣",
          goalType: "long_term"
        }
      })
    ).toThrow(/long_term goal requires ability/);

    expect(() =>
      store.applyParseResult("demo-user", "mock", "参加比赛", {
        type: "goal",
        confidence: 0.94,
        goal: {
          title: "参加比赛",
          category: "兴趣",
          goalType: "short_term",
          ability: { title: "写作能力" }
        }
      })
    ).toThrow(/short_term goal forbids ability/);

    expect(() =>
      store.applyParseResult("demo-user", "mock", "学写作", {
        type: "goal",
        confidence: 0.94,
        goal: {
          title: "写作",
          category: "兴趣",
          goalType: "long_term",
          ability: { id: "ability-frontend", title: "前端能力" }
        }
      })
    ).toThrow(/ability reference requires exactly one of id or title/);

    expect(store.getState().messages).toHaveLength(messageCount);
  });

  it("rejects unresolved references and only creates explicitly typed goals", () => {
    const store = createLifeOSStore(createInitialState());

    expect(() =>
      store.applyParseResult("demo-user", "mock", "学习写作", {
        type: "activity",
        confidence: 0.92,
        goal: { title: "写作", category: "兴趣" },
        summary: "学习写作",
        metric: { type: "duration", value: 30, unit: "minute" }
      })
    ).toThrow(/goal does not exist/);
    const explicit = store.applyParseResult("demo-user", "mock", "参加比赛", {
      type: "goal",
      confidence: 0.92,
      goal: {
        title: "参加写作比赛",
        category: "兴趣",
        goalType: "short_term"
      }
    });

    expect(store.getState().goals.some((goal) => goal.title === "写作")).toBe(false);
    expect(explicit.goal).toMatchObject({
      title: "参加写作比赛",
      goalType: "short_term",
      abilityId: null
    });
  });

  it("links a new long-term goal to an existing ability", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "学习 React", {
      type: "goal",
      confidence: 0.94,
      goal: {
        title: "React",
        category: "职业",
        goalType: "long_term",
        ability: { title: "前端能力" },
        metricType: "duration"
      }
    });

    expect(result.goal).toMatchObject({
      title: "React",
      goalType: "long_term",
      abilityId: "ability-frontend"
    });
  });

  it("does not reactivate archived abilities or use them for long-term goals", () => {
    const initial = createInitialState();
    initial.abilities.push({
      id: "ability-writing-archived",
      userId: "demo-user",
      title: "写作能力",
      status: "archived",
      createdAt: "2026-06-01T00:00:00.000Z",
      archivedAt: "2026-07-01T00:00:00.000Z"
    });
    const store = createLifeOSStore(initial);
    const count = store.getState().abilities.length;

    const replay = store.applyParseResult("demo-user", "mock", "培养写作能力", {
      type: "ability",
      confidence: 0.95,
      ability: { title: "写作能力" }
    });

    expect(replay.ability?.status).toBe("archived");
    expect(store.getState().abilities).toHaveLength(count);
    expect(() =>
      store.applyParseResult("demo-user", "mock", "长期练习写作", {
        type: "goal",
        confidence: 0.95,
        goal: {
          title: "写作练习",
          category: "兴趣",
          goalType: "long_term",
          ability: { title: "写作能力" }
        }
      })
    ).toThrow(/ability does not exist/);
  });

  it("does not reuse seed ids when writing new records", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "今天学习 AWS 40 分钟", {
      type: "activity",
      confidence: 0.92,
      goal: { title: "AWS", category: "职业" },
      summary: "学习 AWS",
      metric: { type: "duration", value: 40, unit: "minute" },
      date: "2026-07-25"
    });

    const ids = store.getState().activities.map((activity) => activity.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.activity?.id).not.toBe("act-1");
    expect(result.activity?.id).not.toBe("act-2");
  });

  it("routes low-confidence parses into inbox", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "下周 Sansan", {
      type: "inbox",
      confidence: 0.48,
      rawText: "下周 Sansan",
      suggestedTypes: ["task", "goal"],
      reason: "不确定"
    });

    expect(result.message.status).toBe("inbox");
    expect(result.inboxItem?.status).toBe("pending");
  });

  it("keeps users isolated", () => {
    const store = createLifeOSStore(createInitialState());
    expect(store.getDashboardData("other-user").goals).toHaveLength(0);
  });
});
