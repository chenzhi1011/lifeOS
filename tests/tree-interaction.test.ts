import { describe, expect, it } from "vitest";
import {
  clearTreeSelection,
  selectTreeLeaf,
  selectTreeWood
} from "@/src/domain/tree-interaction";

describe("growth tree interaction", () => {
  it("selects wood by entity identity and clears a previous leaf", () => {
    expect(
      selectTreeWood(
        { entityType: "long_goal", entityId: "goal-a", leafId: "activity-a" },
        { entityType: "ability", entityId: "ability-a" }
      )
    ).toEqual({
      entityType: "ability",
      entityId: "ability-a",
      leafId: null
    });
  });

  it("only selects a leaf belonging to the selected goal wood", () => {
    const selected = {
      entityType: "long_goal" as const,
      entityId: "goal-a",
      leafId: null
    };

    expect(
      selectTreeLeaf(selected, { activityId: "activity-b", goalId: "goal-b" })
    ).toEqual(selected);
    expect(
      selectTreeLeaf(selected, { activityId: "activity-a", goalId: "goal-a" })
    ).toEqual({
      entityType: "long_goal",
      entityId: "goal-a",
      leafId: "activity-a"
    });
    expect(
      selectTreeLeaf(
        { entityType: "ability", entityId: "ability-a", leafId: null },
        { activityId: "activity-a", goalId: "goal-a" }
      )
    ).toEqual({ entityType: "ability", entityId: "ability-a", leafId: null });
  });

  it("clears entity and leaf identity", () => {
    expect(clearTreeSelection()).toEqual({
      entityType: null,
      entityId: null,
      leafId: null
    });
  });
});
