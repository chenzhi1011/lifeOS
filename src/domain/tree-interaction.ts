import type {
  ActivityLeaf,
  TreeEntityType,
  TreeWood
} from "./tree-visualization";

export type GrowthTreeSelection = {
  entityType: TreeEntityType | null;
  entityId: string | null;
  leafId: string | null;
};

export const EMPTY_TREE_SELECTION: GrowthTreeSelection = {
  entityType: null,
  entityId: null,
  leafId: null
};

export function selectTreeWood(
  _selection: GrowthTreeSelection,
  wood: Pick<TreeWood, "entityType" | "entityId">
): GrowthTreeSelection {
  return {
    entityType: wood.entityType,
    entityId: wood.entityId,
    leafId: null
  };
}

export function selectTreeLeaf(
  selection: GrowthTreeSelection,
  leaf: Pick<ActivityLeaf, "activityId" | "goalId">
): GrowthTreeSelection {
  if (
    (selection.entityType !== "long_goal" &&
      selection.entityType !== "short_goal") ||
    selection.entityId !== leaf.goalId
  ) {
    return selection;
  }

  return { ...selection, leafId: leaf.activityId };
}

export function clearTreeSelection(): GrowthTreeSelection {
  return { ...EMPTY_TREE_SELECTION };
}
