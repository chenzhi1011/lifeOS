import { describe, expect, it } from "vitest";
import {
  clearTreeSelection,
  selectTreeLeaf,
  selectTreeWood
} from "@/src/domain/tree-interaction";

describe("growth tree interaction", () => {
  it("selects wood and clears any previously selected leaf", () => {
    expect(
      selectTreeWood({ goalId: "career", leafId: "career-leaf-0" }, "health")
    ).toEqual({
      goalId: "health",
      leafId: null
    });
  });

  it("only selects a leaf belonging to the selected goal", () => {
    const selected = { goalId: "career", leafId: null };

    expect(
      selectTreeLeaf(selected, { id: "health-leaf-0", goalId: "health" })
    ).toEqual(selected);
    expect(
      selectTreeLeaf(selected, { id: "career-leaf-0", goalId: "career" })
    ).toEqual({
      goalId: "career",
      leafId: "career-leaf-0"
    });
  });

  it("clears all selection", () => {
    expect(clearTreeSelection()).toEqual({ goalId: null, leafId: null });
  });
});
