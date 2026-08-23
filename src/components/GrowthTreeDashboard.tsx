"use client";

import { useCallback, useRef, useState } from "react";
import type { Achievement } from "@/src/domain/types";
import {
  clearTreeSelection,
  selectTreeLeaf,
  selectTreeWood,
  type GrowthTreeSelection
} from "@/src/domain/tree-interaction";
import type {
  ActivityLeaf,
  GrowthTreeViewModel,
  TreeWood
} from "@/src/domain/tree-visualization";
import { AchievementDrawer } from "./AchievementDrawer";
import { GrowthTreeScene } from "./GrowthTreeScene";
import { TreeDetailPanel } from "./TreeDetailPanel";
import { HEALING_CSS_VARS } from "@/src/theme/healing-palette";

type GrowthTreeDashboardProps = {
  viewModel: GrowthTreeViewModel;
  achievements: Achievement[];
};

export function GrowthTreeDashboard({
  viewModel,
  achievements
}: GrowthTreeDashboardProps) {
  const [selection, setSelection] = useState<GrowthTreeSelection>(() =>
    clearTreeSelection()
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);

  const onSelectWood = useCallback(
    (wood: Pick<TreeWood, "entityType" | "entityId">) => {
      setSelection((current) => selectTreeWood(current, wood));
    },
    []
  );
  const onSelectLeaf = useCallback(
    (leaf: Pick<ActivityLeaf, "activityId" | "goalId">) => {
      setSelection((current) => selectTreeLeaf(current, leaf));
    },
    []
  );
  const onClearSelection = useCallback(() => {
    setSelection(clearTreeSelection());
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const hasTreeData =
    viewModel.lifeAreaBranches.length > 0 ||
    viewModel.longGoalTwigs.length > 0 ||
    viewModel.shortGoalBranches.length > 0;
  const trulyEmpty =
    !hasTreeData &&
    achievements.length === 0 &&
    viewModel.vitalityElements.length === 0 &&
    viewModel.diagnostics.length === 0;

  return (
    <main className="relative min-h-screen overflow-hidden text-[var(--healing-ui-text)]" style={HEALING_CSS_VARS as React.CSSProperties}>
      <GrowthTreeScene
        onClearSelection={onClearSelection}
        onSelectLeaf={onSelectLeaf}
        onSelectWood={onSelectWood}
        selection={selection}
        viewModel={viewModel}
      />

      <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
        <button
          className="rounded-full border border-[#315d3a]/25 bg-[var(--healing-ui-background)]/90 px-4 py-2.5 text-sm font-semibold text-[var(--healing-ui-text)] shadow-lg backdrop-blur hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#315d3a]"
          onClick={() => setDrawerOpen(true)}
          ref={drawerTriggerRef}
          type="button"
        >
          果实面板 · {achievements.length}
        </button>
      </div>

      {viewModel.diagnostics.length > 0 ? (
        <aside
          aria-label="数据待确认"
          className="absolute left-3 top-3 z-20 max-w-[calc(100%-10rem)] rounded-xl border border-[#8a632a]/25 bg-[#fff8df]/92 px-4 py-3 text-[#543c1d] shadow-lg backdrop-blur sm:left-5 sm:max-w-sm"
          role="status"
        >
          <p className="text-sm font-semibold">数据待确认</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-[#6c522c]">
            {viewModel.diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}-${diagnostic.entityId}`}>
                {diagnostic.entityId}：{diagnostic.message}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {trulyEmpty ? (
        <section className="absolute bottom-5 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[#315d3a]/20 bg-[var(--healing-ui-background)]/90 p-5 text-center text-[var(--healing-ui-text)] shadow-xl backdrop-blur sm:bottom-8">
          <h1 className="text-lg font-semibold">创建第一个目标</h1>
          <p className="mt-2 text-sm leading-6 text-[#526b57]">
            七个生活领域是固定主枝，目标会在所属领域继续生长。
          </p>
        </section>
      ) : null}

      <TreeDetailPanel
        onClose={onClearSelection}
        selection={selection}
        viewModel={viewModel}
      />

      {drawerOpen ? (
        <AchievementDrawer
          achievements={achievements}
          onClose={closeDrawer}
          returnFocusRef={drawerTriggerRef}
        />
      ) : null}
    </main>
  );
}
