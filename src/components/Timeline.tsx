import type { Activity } from "@/src/domain/types";

export function Timeline({ activities }: { activities: Activity[] }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm">
      <h2 className="text-base font-semibold text-ink">Timeline</h2>
      <div className="mt-4 space-y-3">
        {activities.map((activity) => (
          <div key={activity.id} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 border-b border-black/5 pb-3 last:border-0">
            <span className="text-sm text-black/50">{activity.occurredOn}</span>
            <span className="text-sm font-medium text-ink">{activity.summary}</span>
            <span className="rounded-md bg-soil px-2 py-1 text-xs text-black/60">
              {activity.value} {activity.unit}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
