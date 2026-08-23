export default function DashboardLoading() {
  return (
    <main
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-[#b9def0] px-5 text-[#18321e]"
      role="status"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#315d3a]/15 bg-[#f8f7ed]/80 p-6 text-center shadow-xl backdrop-blur">
        <div className="mx-auto h-20 w-16 animate-pulse rounded-t-full bg-[#6f9b66]/35" />
        <h1 className="mt-5 text-lg font-semibold">正在生长你的树…</h1>
        <p className="mt-2 text-sm text-[#526b57]">正在整理能力、目标和近期记录。</p>
      </section>
    </main>
  );
}
