/**
 * A minimal, dependency-free horizontal bar chart for comparing a handful
 * of named values (Gap 5's "comparative visualization" requirement, used
 * for campaign contribution and lead-vs-sale conversion). Hand-rolled for
 * the same reason as SparklineChart - no charting library needed for a
 * short, fixed list of bars.
 */
export function BarChart({
  data,
  formatValue = (v) => v.toLocaleString(),
}: {
  data: { label: string; value: number; color?: string }[];
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough data yet.</p>;
  }

  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate pr-2 font-medium">{d.label}</span>
            <span className="shrink-0 text-muted-foreground">{formatValue(d.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                backgroundColor: d.color ?? "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
