import type { HeatmapPoint } from "@/src/domain/aggregation";

export function Heatmap({ points }: { points: HeatmapPoint[] }) {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const today = new Date("2026-07-25T00:00:00");
  const days = Array.from({ length: 70 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (69 - index));
    return date.toISOString().slice(0, 10);
  });

  return (
    <section className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Growth Heatmap</h2>
        <span className="text-xs text-black/50">recent 10 weeks</span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
        {days.map((date) => {
          const point = byDate.get(date);
          const level = Math.min(4, point ? Math.ceil(point.count) : 0);
          const color = ["bg-black/5", "bg-leaf/25", "bg-leaf/45", "bg-moss/70", "bg-moss"][level];
          return <div key={date} title={`${date}: ${point?.count ?? 0}`} className={`h-3 w-3 rounded-sm ${color}`} />;
        })}
      </div>
    </section>
  );
}
