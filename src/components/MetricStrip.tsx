type Metric = {
  label: string;
  value: string;
  detail: string;
};

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-black/60">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{metric.value}</p>
          <p className="mt-1 text-sm text-black/55">{metric.detail}</p>
        </div>
      ))}
    </section>
  );
}
