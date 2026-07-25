import Link from "next/link";
import { Heatmap } from "@/src/components/Heatmap";
import { Timeline } from "@/src/components/Timeline";
import { normalizeDashboardUserId } from "@/src/dashboard/user-id";
import { readGoalDetail } from "@/src/db/lifeos-read";

type GoalPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    userId?: string | string[];
  }>;
};

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function GoalUserGate({ goalId, attemptedUserId }: { goalId: string; attemptedUserId?: string }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020807] px-5 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(94,234,197,0.22),transparent_34%),linear-gradient(180deg,rgba(2,8,7,0.08),rgba(2,8,7,0.9))]" />
      <section className="relative z-10 w-full max-w-md rounded-lg border border-white/14 bg-[#061310]/86 p-5 shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8cffdf]">Life OS</p>
        <h1 className="mt-3 text-2xl font-semibold">打开目标详情</h1>
        <form action={`/goals/${goalId}`} className="mt-5 space-y-3" method="get">
          <label className="block text-sm text-white/68" htmlFor="goal-user-id">
            User ID
          </label>
          <input
            autoComplete="off"
            className="w-full rounded-md border border-white/16 bg-black/28 px-3 py-2 text-sm text-white outline-none focus:border-[#8cffdf]"
            defaultValue={attemptedUserId ?? ""}
            id="goal-user-id"
            name="userId"
            placeholder="demo-user 或 Supabase Auth UUID"
          />
          {attemptedUserId ? <p className="text-sm text-[#ffb4a7]">这个 userId 格式不合法。</p> : null}
          <button className="w-full rounded-md bg-[#8cffdf] px-4 py-2 text-sm font-semibold text-[#06211b] hover:bg-[#a8ffe9]" type="submit">
            查看目标
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function GoalPage({ params, searchParams }: GoalPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const rawUserId = getSearchValue(resolvedSearchParams.userId);
  const userId = normalizeDashboardUserId(rawUserId);
  if (!userId) {
    return <GoalUserGate goalId={id} attemptedUserId={rawUserId} />;
  }

  const dashboardHref = `/dashboard?userId=${encodeURIComponent(userId)}`;
  const data = await readGoalDetail(id, userId);

  if (!data.goal) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p>Goal not found.</p>
        <Link className="underline" href={dashboardHref}>Back to dashboard</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
      <Link className="text-sm text-moss underline" href={dashboardHref}>Back to dashboard</Link>
      <header className="rounded-lg border border-black/10 bg-white/75 p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">{data.goal.category}</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">{data.goal.title}</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-sm text-black/50">Total</p>
            <p className="text-xl font-semibold">{data.stat?.totalValue ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-black/50">Activities</p>
            <p className="text-xl font-semibold">{data.stat?.activityCount ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-black/50">Active Days</p>
            <p className="text-xl font-semibold">{data.stat?.activeDays ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-black/50">Streak Weeks</p>
            <p className="text-xl font-semibold">{data.stat?.streakWeeks ?? 0}</p>
          </div>
        </div>
      </header>
      <Heatmap points={data.heatmap} />
      <Timeline activities={data.recentActivities} />
    </main>
  );
}
