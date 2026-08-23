"use client";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ reset }: DashboardErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#b9def0] px-5 text-[#18321e]">
      <section
        aria-labelledby="dashboard-error-title"
        className="w-full max-w-md rounded-2xl border border-[#7b4e32]/20 bg-[#fff8ed]/92 p-6 text-center shadow-xl backdrop-blur"
        role="alert"
      >
        <p className="text-xs font-semibold tracking-[0.2em] text-[#7b5b43]">DASHBOARD</p>
        <h1 className="mt-3 text-2xl font-semibold" id="dashboard-error-title">
          树数据加载失败
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#665544]">
          数据暂时没有加载成功。请稍后重试，你已有的记录不会受到影响。
        </p>
        <button
          className="mt-5 rounded-full bg-[#315d3a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244b2c] focus:outline-none focus:ring-2 focus:ring-[#315d3a] focus:ring-offset-2"
          onClick={reset}
          type="button"
        >
          重试
        </button>
      </section>
    </main>
  );
}
