import Link from "next/link";
import type { GoalGrowthStat } from "@/src/domain/aggregation";
import type { Goal } from "@/src/domain/types";

export function GrowthTree({ goals, stats }: { goals: Goal[]; stats: GoalGrowthStat[] }) {
  const statByGoal = new Map(stats.map((stat) => [stat.goalId, stat]));
  const root = goals.find((goal) => goal.id === "life") ?? goals[0];
  const branches = goals.filter((goal) => goal.parentGoalId === root?.id);
  const leaves = goals.filter((goal) => goal.parentGoalId && goal.parentGoalId !== root?.id);

  return (
    <section className="rounded-lg border border-black/10 bg-white/75 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Growth Tree</h2>
          <p className="text-sm text-black/55">枝干粗细和叶子密度来自 Activity 聚合。</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="relative min-h-[360px] overflow-hidden rounded-lg bg-gradient-to-b from-[#edf7f3] to-[#f7efe1]">
          <div className="absolute bottom-8 left-1/2 h-44 w-6 -translate-x-1/2 rounded-full bg-bark" />
          {branches.map((branch, index) => {
            const angle = -55 + index * 35;
            const stat = statByGoal.get(branch.id);
            const thickness = 10 + Math.round((stat?.intensity ?? 0.1) * 18);
            return (
              <Link
                href={`/goals/${branch.id}`}
                key={branch.id}
                className="absolute bottom-44 left-1/2 origin-bottom rounded-full bg-bark/80 transition hover:bg-bark"
                style={{
                  height: 150,
                  width: thickness,
                  transform: `translateX(-50%) rotate(${angle}deg)`
                }}
                title={branch.title}
              >
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-white/85 px-2 py-1 text-xs font-medium text-ink shadow-sm">
                  {branch.title}
                </span>
              </Link>
            );
          })}
          {leaves.map((leaf, index) => {
            const stat = statByGoal.get(leaf.id);
            const size = 42 + Math.round((stat?.intensity ?? 0.1) * 52);
            const left = 18 + (index * 17) % 66;
            const top = 18 + (index * 23) % 48;
            return (
              <Link
                href={`/goals/${leaf.id}`}
                key={leaf.id}
                className="absolute flex items-center justify-center rounded-full bg-leaf text-center text-xs font-semibold text-white shadow-sm transition hover:scale-105"
                style={{ width: size, height: size, left: `${left}%`, top: `${top}%`, opacity: 0.72 + (stat?.intensity ?? 0) * 0.28 }}
              >
                {leaf.title}
              </Link>
            );
          })}
        </div>
        <div className="space-y-3">
          {leaves.map((goal) => {
            const stat = statByGoal.get(goal.id);
            return (
              <Link href={`/goals/${goal.id}`} key={goal.id} className="block rounded-lg border border-black/10 bg-white/80 p-3 hover:border-moss/40">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{goal.title}</span>
                  <span className="text-sm text-black/50">{Math.round((stat?.intensity ?? 0) * 100)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-black/10">
                  <div className="h-2 rounded-full bg-moss" style={{ width: `${Math.max(5, Math.round((stat?.intensity ?? 0) * 100))}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
