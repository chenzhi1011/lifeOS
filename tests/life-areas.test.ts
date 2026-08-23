import { describe, expect, it } from "vitest";

import { LIFE_AREAS, LIFE_AREA_IDS } from "@/src/domain/life-areas";

describe("fixed life areas", () => {
  it("defines exactly seven branches in their stable render order", () => {
    expect(LIFE_AREA_IDS).toEqual([
      "work",
      "growth",
      "health",
      "life",
      "finance",
      "relationships",
      "entertainment"
    ]);

    expect(LIFE_AREAS.map(({ id, label, slot }) => ({ id, label, slot }))).toEqual([
      { id: "work", label: "工作", slot: 0 },
      { id: "growth", label: "成长", slot: 1 },
      { id: "health", label: "健康", slot: 2 },
      { id: "life", label: "生活", slot: 3 },
      { id: "finance", label: "财务", slot: 4 },
      { id: "relationships", label: "人际关系", slot: 5 },
      { id: "entertainment", label: "娱乐", slot: 6 }
    ]);
  });
});
