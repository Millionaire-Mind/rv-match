/**
 * A minimal, dependency-free SVG line chart for a single daily-bucketed
 * metric (Gap 5's "meaningful time-series visualization" requirement).
 * Hand-rolled rather than pulling in a charting library, matching this
 * codebase's existing preference for hand-authored UI primitives - the
 * data volume here (a few dozen points) doesn't need one.
 */
export function SparklineChart({
  values,
  label,
  total,
  color = "var(--accent)",
}: {
  values: number[];
  label: string;
  total: number;
  color?: string;
}) {
  const width = 240;
  const height = 56;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const areaPoints = `0,${height} ${points.join(" ")} ${width},${height}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{total.toLocaleString()}</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-14 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} trend over the selected period, totaling ${total}`}
      >
        <polygon points={areaPoints} fill={color} opacity={0.12} />
        <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
