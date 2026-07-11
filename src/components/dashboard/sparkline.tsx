import { cn } from "@/lib/utils";

export interface SparkPoint {
  label: string;
  value: number;
}

/** Pure-SVG bar sparkline — no chart library. */
export function BarSparkline({
  points,
  className,
  height = 64,
}: {
  points: SparkPoint[];
  className?: string;
  height?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const barW = 100 / Math.max(1, points.length);
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label="Bookings per day, last 30 days"
    >
      {points.map((p, i) => {
        const h = Math.max(p.value > 0 ? 2 : 0.5, (p.value / max) * (height - 4));
        return (
          <rect
            key={i}
            x={i * barW + barW * 0.15}
            y={height - h}
            width={barW * 0.7}
            height={h}
            rx={0.6}
            className={p.value > 0 ? "fill-primary" : "fill-muted-foreground/25"}
          >
            <title>{`${p.label}: ${p.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
