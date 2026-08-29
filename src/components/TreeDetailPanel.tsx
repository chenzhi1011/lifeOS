import type { GrowthTreeSelection } from "@/src/domain/tree-interaction";
import type {
  GrowthTreeViewModel,
  TreeWood
} from "@/src/domain/tree-visualization";

type TreeDetailPanelProps = {
  viewModel: GrowthTreeViewModel;
  selection: GrowthTreeSelection;
  onClose: () => void;
};

function selectedWood(
  viewModel: GrowthTreeViewModel,
  selection: GrowthTreeSelection
): TreeWood | null {
  const wood = [
    viewModel.root,
    ...viewModel.lifeAreaBranches,
    ...viewModel.longGoalTwigs,
    ...viewModel.shortGoalBranches
  ];
  return (
    wood.find(
      (item) =>
        item.entityType === selection.entityType &&
        item.entityId === selection.entityId
    ) ?? null
  );
}

const entityLabels: Record<TreeWood["entityType"], string> = {
  root: "成长树",
  life_area: "生活领域",
  long_goal: "长期目标",
  short_goal: "短期目标"
};

export function TreeDetailPanel({
  viewModel,
  selection,
  onClose
}: TreeDetailPanelProps) {
  const wood = selectedWood(viewModel, selection);
  if (!wood) {
    return null;
  }

  const leaf = selection.leafId
    ? viewModel.activityLeaves.find(
        (item) =>
          item.activityId === selection.leafId && item.goalId === wood.entityId
      ) ?? null
    : null;
  const activities = (leaf?.activities ?? wood.recentActivities).slice(0, 5);

  return (
    <aside
      aria-label="成长详情"
      className="absolute bottom-3 left-3 right-3 z-20 max-h-[46vh] overflow-y-auto rounded-2xl border border-[#315d3a]/20 bg-[var(--healing-ui-background)]/90 p-4 text-[var(--healing-ui-text)] shadow-2xl backdrop-blur-md sm:bottom-5 sm:left-auto sm:right-5 sm:top-24 sm:max-h-none sm:w-[360px] sm:p-5"
      data-testid="growth-tree-details"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[#58705c]">
            {leaf ? "成长叶片" : entityLabels[wood.entityType]}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#18321e]">{wood.label}</h2>
        </div>
        <button
          aria-label="关闭成长详情"
          className="rounded-full border border-[#315d3a]/20 bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#18321e] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f7e58]"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </div>

      <p className="mt-3 text-sm font-semibold text-[#2f5036]">
        {wood.totalValue} 累计值 · {wood.activityCount} 次记录
      </p>
      <p className="mt-1 text-xs text-[#637467]">
        分类：{wood.category} · 状态：{wood.status}
      </p>

      <div className="mt-4 rounded-xl border border-[#315d3a]/12 bg-white/62 p-3">
        <p className="text-sm font-semibold text-[#28452e]">
          {leaf ? "这片叶子的记录" : "最近 30 天"}
        </p>
        {activities.length > 0 ? (
          <ol className="mt-2 space-y-2">
            {activities.map((activity) => (
              <li
                className="flex items-start justify-between gap-3 border-b border-[#315d3a]/10 pb-2 text-sm last:border-0 last:pb-0"
                data-testid="leaf-activity"
                key={activity.id}
              >
                <span className="text-[#29432f]">{activity.summary}</span>
                <span className="shrink-0 text-xs text-[#6d7d70]">{activity.occurredOn}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-[#657568]">最近还没有 Activity。</p>
        )}
      </div>
    </aside>
  );
}
