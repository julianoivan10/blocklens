import { cn } from '@/lib/utils';

interface SparklineProps {
  /** Ordered series values, oldest first. */
  values: number[];
  width?: number;
  height?: number;
  /** Direction colouring. `auto` compares last against first. */
  tone?: 'auto' | 'signal';
  /** Draw the area beneath the line. */
  area?: boolean;
  /** Mark the latest value with a ringed dot. */
  endMarker?: boolean;
  className?: string;
  /** Screen-reader description; the shape alone conveys nothing. */
  label?: string;
}

/**
 * A single-series trend line, rendered as plain SVG on the server —
 * no chart library, no client JavaScript.
 *
 * Follows the mark spec used across the product: a 2px stroke, a
 * recessive area wash, and an end marker carrying a surface-coloured
 * ring so it stays legible where it overlaps the line. One series, so
 * no legend: the caller's label names it.
 */
export function Sparkline({
  values,
  width = 160,
  height = 44,
  tone = 'auto',
  area = true,
  endMarker = false,
  className,
  label,
}: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  // Inset by the stroke half-width so the line never clips.
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const fill = `${line} L${(pad + innerW).toFixed(2)} ${height} L${pad} ${height} Z`;

  const rising = values[values.length - 1] >= values[0];
  const stroke =
    tone === 'signal'
      ? 'var(--color-signal)'
      : rising
        ? 'var(--color-up-mark)'
        : 'var(--color-down-mark)';

  const gradientId = `spark-${Math.round(values[0] * 1000)}-${values.length}-${Math.round(max)}`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      preserveAspectRatio="none"
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gradientId})`} />
        </>
      )}

      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {endMarker && (
        <circle
          cx={lastX}
          cy={lastY}
          r="2.5"
          fill={stroke}
          stroke="var(--color-ground)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
