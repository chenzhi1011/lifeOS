export type GrowthTreeSelection = {
  goalId: string | null;
  leafId: string | null;
};

export const EMPTY_TREE_SELECTION: GrowthTreeSelection = {
  goalId: null,
  leafId: null
};

export function selectTreeWood(
  _selection: GrowthTreeSelection,
  goalId: string
): GrowthTreeSelection {
  return { goalId, leafId: null };
}

export function selectTreeLeaf(
  selection: GrowthTreeSelection,
  leaf: { id: string; goalId: string }
): GrowthTreeSelection {
  if (selection.goalId !== leaf.goalId) {
    return selection;
  }

  return {
    goalId: selection.goalId,
    leafId: leaf.id
  };
}

export function clearTreeSelection(): GrowthTreeSelection {
  return { ...EMPTY_TREE_SELECTION };
}
