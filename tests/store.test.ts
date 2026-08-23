import { describe, expect, it } from "vitest";
import { createInitialState } from "@/src/domain/seed";
import { createLifeOSStore } from "@/src/domain/store";
import type { LifeEventParseResult } from "@/src/domain/types";

// @ts-expect-error task events require a path discriminator
const taskWithoutPath: LifeEventParseResult = { type: "task", confidence: 0.9, task: { title: "学习" } };
// @ts-expect-error new goals require both goalType and lifeArea
const goalWithoutArea: LifeEventParseResult = { type: "goal", confidence: 0.9, goal: { title: "学习", goalType: "long_term" } };
void [taskWithoutPath, goalWithoutArea];

describe("Life OS store", () => {
  it("seeds goals directly into fixed life areas", () => {
    const state = createInitialState();
    expect(state.goals.every((goal) => goal.userId === "demo-user")).toBe(true);
    expect(state.goals.map((goal) => goal.lifeArea)).toEqual(
      expect.arrayContaining(["work", "growth", "health"])
    );
    expect("abilities" in state).toBe(false);
  });

  it("writes an activity against an existing goal", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "今天学习 AWS 40 分钟", {
      type: "activity",
      confidence: 0.92,
      goal: { title: "AWS" },
      summary: "学习 AWS",
      metric: { type: "duration", value: 40, unit: "minute" },
      date: "2026-07-25"
    });
    expect(result.activity?.value).toBe(40);
    expect(result.activity?.goalId).toBe("aws");
  });

  it("creates a typed goal with a required life area", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "持续学习 React", {
      type: "goal",
      confidence: 0.94,
      goal: {
        title: "React",
        goalType: "long_term",
        lifeArea: "growth",
        metricType: "duration"
      }
    });
    expect(result.goal).toMatchObject({ title: "React", goalType: "long_term", lifeArea: "growth" });
  });

  it("writes one-off tasks without attaching them to the tree", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "买水", {
      type: "task",
      path: "one_off",
      confidence: 0.96,
      task: { title: "买水" }
    });
    expect(result.task?.goalId).toBeNull();
    expect(result.goal).toBeUndefined();
  });

  it("routes missing goal references to inbox", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "学习不存在目标", {
      type: "activity",
      confidence: 0.9,
      goal: { title: "不存在" },
      summary: "学习",
      metric: { type: "count", value: 1, unit: "count" }
    });
    expect(result.inboxItem?.reason).toMatch(/goal does not exist/);
  });
});
