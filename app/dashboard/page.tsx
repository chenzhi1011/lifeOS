import { GrowthTreeDashboard } from "@/src/components/GrowthTreeDashboard";
import { normalizeDashboardUserId } from "@/src/dashboard/user-id";
import { queryDashboard } from "@/src/application/dashboard-queries";
import { resolveSessionPrincipal, type ApiPrincipal } from "@/src/auth/api-principal";
import { buildGrowthTreeViewModel } from "@/src/domain/tree-visualization";
import { headers } from "next/headers";

type DashboardPageProps = {
  searchParams: Promise<{
    userId?: string | string[];
  }>;
};

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function DashboardUserGate({ attemptedUserId }: { attemptedUserId?: string }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020807] px-5 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(94,234,197,0.22),transparent_34%),linear-gradient(180deg,rgba(2,8,7,0.08),rgba(2,8,7,0.9))]" />
      <section className="relative z-10 w-full max-w-md rounded-lg border border-white/14 bg-[#061310]/86 p-5 shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8cffdf]">Life OS</p>
        <h1 className="mt-3 text-2xl font-semibold">打开成长树</h1>
        <form action="/dashboard" className="mt-5 space-y-3" method="get">
          <label className="block text-sm text-white/68" htmlFor="dashboard-user-id">
            User ID
          </label>
          <input
            autoComplete="off"
            className="w-full rounded-md border border-white/16 bg-black/28 px-3 py-2 text-sm text-black outline-none focus:border-[#8cffdf]"
            defaultValue={attemptedUserId ?? ""}
            id="dashboard-user-id"
            name="userId"
            placeholder="demo-user 或 Supabase Auth UUID"
          />
          {attemptedUserId ? <p className="text-sm text-[#ffb4a7]">这个 userId 格式不合法。</p> : null}
          <button className="w-full rounded-md bg-[#8cffdf] px-4 py-2 text-sm font-semibold text-[#06211b] hover:bg-[#a8ffe9]" type="submit">
            查看 Dashboard
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawUserId = getSearchValue(resolvedSearchParams.userId);
  const session = await resolveSessionPrincipal(new Request("http://life-os.local", { headers: await headers() }));
  const demoUserId = process.env.NODE_ENV !== "production" ? normalizeDashboardUserId(rawUserId) : null;
  const principal: ApiPrincipal | null = session ?? (demoUserId ? { userId: demoUserId, actorType: "session" } : null);
  if (!principal) {
    return <DashboardUserGate attemptedUserId={rawUserId} />;
  }

  const asOf = new Date();
  const data = await queryDashboard(principal, asOf);
  const viewModel = buildGrowthTreeViewModel(data, asOf);
  return (
    <GrowthTreeDashboard
      achievements={data.achievements}
      viewModel={viewModel}
    />
  );
}
