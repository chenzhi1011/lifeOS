import type {
  GrowthTreeLeaf,
  GrowthTreeWoodSegment
} from "@/src/domain/tree-visualization";

type GrowthTreeDetailsPanelProps = {
  segment: GrowthTreeWoodSegment | null;
  leaf: GrowthTreeLeaf | null;
  vitality: number;
};

export function GrowthTreeDetailsPanel({
  segment,
  leaf,
  vitality
}: GrowthTreeDetailsPanelProps) {
  if (!segment) {
    return null;
  }

  const activities = (leaf?.activities ?? segment.recentActivities).slice(0, 5);

  return (
    <aside
      className="absolute bottom-4 right-4 z-10 w-[calc(100%-2rem)] rounded-lg border border-white/65 bg-white/72 p-4 text-[#17351d] shadow-2xl backdrop-blur md:bottom-5 md:right-5 md:top-5 md:w-[360px]"
      data-testid="growth-tree-details"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2f7b3c]/80">
        {leaf ? "Selected Activity Leaf" : "Selected Growth"}
      </p>
      <h2 className="mt-2 text-2xl font-semibold">{segment.label}</h2>
      <p className="mt-2 text-sm text-[#17351d]/65">Category: {segment.category}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-[#2f7b3c]/12 bg-white/62 p-3">
          <p className="text-xs text-[#17351d]/55">Metric</p>
          <p className="mt-1 text-sm font-semibold">
            {segment.totalValue} accumulated / {segment.activityCount} activities
          </p>
        </div>
        <div className="rounded-md border border-[#2f7b3c]/12 bg-white/62 p-3">
          <p className="text-xs text-[#17351d]/55">Vitality</p>
          <p className="mt-1 text-sm font-semibold">{Math.round(vitality * 100)}%</p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[#2f7b3c]/12 bg-white/58 p-3">
        <p className="text-sm font-semibold text-[#17351d]/82">
          {leaf ? "Leaf Activities" : "Recent Activities"}
        </p>
        <div className="mt-3 space-y-2">
          {activities.length > 0 ? (
            activities.map((activity) => (
              <div
                className="flex items-center justify-between gap-3 border-b border-[#2f7b3c]/10 pb-2 last:border-0 last:pb-0"
                data-testid="leaf-activity"
                key={activity.id}
              >
                <span className="text-sm text-[#17351d]/78">{activity.summary}</span>
                <span className="shrink-0 text-xs text-[#17351d]/45">
                  {activity.occurredOn}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#17351d]/52">还没有具体 Activity。</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[#f4c24d]/28 bg-[#fff4c4]/52 p-3 text-xs leading-5 text-[#17351d]/62">
        先点击树干或树枝，再点击该目标的叶子查看最多 5 条 Activity。点击空白处关闭。
      </div>
    </aside>
  );
}
