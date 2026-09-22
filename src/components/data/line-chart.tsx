'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A multi-series line plot on one y-axis.
 *
 * Dependency-free SVG so every series can share a crosshair tooltip, a
 * legend and a table view. Rules it follows: one axis only (series of
 * different units belong in separate charts), 2px lines, recessive grid,
 * categorical colours from the validated plot ramp in fixed order,
 * identity never colour-alone (legend + end labels), and a table for
 * readers who cannot use the plot.
 */

export interface LineSeries {
  id: string;
  label: string;
  /** A plot-ramp slot, 1–6. Fixed per entity, never by rank. */
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  points: Array<{ x: number; y: number | null }>;
  dashed?: boolean;
}

type Format = 'usd' | 'index' | 'pct';

const HEIGHT = 240;
const PAD_BASE = { top: 16, right: 16, bottom: 26, left: 64 };

function formatValue(v: number, format: Format): string {
  if (format === 'pct') return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
  if (format === 'index') return v.toFixed(1);
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `${v < 0 ? '-' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })}`;
}

function axisValue(v: number, format: Format): string {
  if (format !== 'usd') return formatValue(v, format);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(abs < 10 ? 2 : 0)}`;
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const DATE_Y = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Round tick steps: 1, 2, 2.5, 5 × 10^n. */
function ticks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

export function LineChart({
  series,
  format,
  ariaLabel,
  baseline,
  className,
}: {
  series: LineSeries[];
  format: Format;
  ariaLabel: string;
  /** Draws a reference rule, e.g. 100 for an indexed chart or 0 for PnL. */
  baseline?: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xs = useMemo(() => {
    const set = new Set<number>();
    for (const s of series) for (const p of s.points) set.add(p.x);
    return [...set].sort((a, b) => a - b);
  }, [series]);

  const lookup = useMemo(
    () => series.map((s) => new Map(s.points.map((p) => [p.x, p.y]))),
    [series]
  );

  const { yMin, yMax } = useMemo(() => {
    const values = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
    if (baseline !== undefined) values.push(baseline);
    if (!values.length) return { yMin: 0, yMax: 1 };
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) {
      lo -= Math.abs(lo) * 0.05 || 1;
      hi += Math.abs(hi) * 0.05 || 1;
    }
    const pad = (hi - lo) * 0.08;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [series, baseline]);

  if (xs.length < 2) {
    return (
      <p className={cn('t-body-sm py-10 text-ink-faint', className)}>
        Insufficient data — at least two dated points are needed to draw this chart.
      </p>
    );
  }

  // Room on the right for direct end labels when there is more than one series.
  const PAD = { ...PAD_BASE, right: series.length >= 2 ? 56 : PAD_BASE.right };
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    for (const p of s.points) {
      if (p.y === null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
      pen = true;
    }
    return d;
  });

  const yTicks = ticks(yMin, yMax);
  const xTickCount = Math.min(5, Math.max(2, Math.floor(plotW / 110)));
  const xTicks = Array.from({ length: xTickCount }, (_, i) => xs[Math.round((i / (xTickCount - 1)) * (xs.length - 1))]);
  const multiYear = new Date(x0).getUTCFullYear() !== new Date(x1).getUTCFullYear();

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * plotW + PAD.left;
    const target = x0 + ((px - PAD.left) / plotW) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - target) < Math.abs(xs[best] - target)) best = i;
    setHoverIndex(best);
  };

  const hx = hoverIndex !== null ? xs[hoverIndex] : null;
  const tooltipLeft = hx !== null ? Math.min(Math.max(sx(hx) + 12, PAD.left), width - 200) : 0;

  // Direct end labels: the last defined value of each series.
  const ends = series.map((s, i) => {
    const last = [...s.points].reverse().find((p) => p.y !== null);
    return last ? { i, y: sy(last.y as number), value: last.y as number } : null;
  });

  return (
    <figure className={cn('flex flex-col gap-3', className)} aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        {ariaLabel}
      </figcaption>

      {series.length >= 2 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-[0.75rem] text-ink-dim">
              <svg width="18" height="6" aria-hidden="true">
                <line
                  x1="0" y1="3" x2="18" y2="3"
                  stroke={`var(--color-plot-${s.slot})`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '4 3' : undefined}
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div ref={hostRef} className="relative w-full">
        <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--color-line-faint)" />
              <text x={PAD.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-ink-ghost font-mono text-[10px]">
                {axisValue(t, format)}
              </text>
            </g>
          ))}
          {baseline !== undefined && baseline >= yMin && baseline <= yMax && (
            <line
              x1={PAD.left} x2={width - PAD.right} y1={sy(baseline)} y2={sy(baseline)}
              stroke="var(--color-line-strong)" strokeDasharray="2 3"
            />
          )}
          {xTicks.map((t, i) => (
            <text
              key={`${t}-${i}`}
              x={sx(t)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              className="fill-ink-ghost font-mono text-[10px]"
            >
              {(multiYear ? DATE_Y : DATE).format(t)}
            </text>
          ))}

          {paths.map((d, i) => (
            <path
              key={series[i].id}
              d={d}
              fill="none"
              stroke={`var(--color-plot-${series[i].slot})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={series[i].dashed ? '5 4' : undefined}
            />
          ))}

          {series.length >= 2 &&
            ends.map(
              (e) =>
                e && (
                  <text
                    key={series[e.i].id}
                    x={width - PAD.right + 4}
                    y={e.y}
                    dy="0.32em"
                    className="fill-ink-faint text-[10px]"
                    aria-hidden="true"
                  >
                    {series[e.i].label.split(' ')[0]}
                  </text>
                )
            )}

          {hx !== null && (
            <g aria-hidden="true">
              <line x1={sx(hx)} x2={sx(hx)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-signal-deep)" strokeDasharray="2 3" />
              {series.map((s, i) => {
                const y = lookup[i].get(hx);
                return y !== null && y !== undefined ? (
                  <circle
                    key={s.id}
                    cx={sx(hx)}
                    cy={sy(y)}
                    r={4}
                    fill={`var(--color-plot-${s.slot})`}
                    stroke="var(--color-ground)"
                    strokeWidth={2}
                  />
                ) : null;
              })}
            </g>
          )}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>

        {hx !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[11rem] border border-line-strong bg-panel-raised px-3 py-2 shadow-lg"
            style={{ left: tooltipLeft }}
            role="status"
          >
            <div className="t-micro-tight mb-1.5 text-ink-ghost">{DATE_Y.format(hx)}</div>
            {series.map((s, i) => {
              const y = lookup[i].get(hx);
              return (
                <div key={s.id} className="flex items-center justify-between gap-4 text-[0.75rem]">
                  <span className="flex items-center gap-2 text-ink-dim">
                    <span className="size-2 rounded-full" style={{ background: `var(--color-plot-${s.slot})` }} aria-hidden="true" />
                    {s.label}
                  </span>
                  <span className="font-mono tabular-nums text-ink">
                    {y !== null && y !== undefined ? formatValue(y, format) : 'no data'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="t-micro-tight self-start text-ink-ghost transition-colors hover:text-ink"
        aria-expanded={showTable}
      >
        {showTable ? 'Hide data table' : 'Show data table'}
      </button>

      {showTable && (
        <div className="max-h-72 overflow-auto border-t border-line">
          <table className="w-full text-left text-[0.75rem]">
            <thead className="sticky top-0 bg-ground">
              <tr>
                <th className="t-micro-tight py-2 pr-4 font-normal">Date</th>
                {series.map((s) => (
                  <th key={s.id} className="t-micro-tight py-2 pr-4 text-right font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...xs].reverse().map((x) => (
                <tr key={x} className="border-t border-line-faint">
                  <td className="py-1.5 pr-4 font-mono text-ink-faint">{DATE_Y.format(x)}</td>
                  {series.map((s, i) => {
                    const y = lookup[i].get(x);
                    return (
                      <td key={s.id} className="py-1.5 pr-4 text-right font-mono tabular-nums text-ink-dim">
                        {y !== null && y !== undefined ? formatValue(y, format) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
