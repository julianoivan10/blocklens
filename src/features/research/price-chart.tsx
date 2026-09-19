'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AreaData, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/format';
import { Delta } from '@/components/data/delta';
import type { SimplePrice } from '@/types';

const WINDOWS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
] as const;

/** Reads a design token so the chart cannot drift from the palette. */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

interface Hover {
  time: number;
  price: number;
  x: number;
}

/**
 * The price plot.
 *
 * A daily close line, not candlesticks. That is a deliberate product
 * decision as much as a data one: BlockLens is a research tool rather
 * than a trading terminal, and the provider only offers four-day
 * granularity for OHLC beyond a month — so candles here would mean
 * either a misleadingly coarse chart or inventing highs and lows.
 *
 * Integrated rather than boxed: no border, no radius, no card. The plot
 * sits directly on the page between two hairlines at full content width.
 *
 * The window control slices data already on the client, so switching is
 * instant and the browser never talks to a provider.
 */
export function PriceChart({
  series,
  symbol,
  className,
}: {
  series: SimplePrice[];
  symbol: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [days, setDays] = useState<number>(90);
  const [hover, setHover] = useState<Hover | null>(null);
  const [ready, setReady] = useState(false);

  const visible = useMemo(() => series.slice(-days), [series, days]);

  const summary = useMemo(() => {
    if (visible.length < 2) return null;
    const values = visible.map((p) => p.value);
    const first = values[0];
    const last = values[values.length - 1];
    return {
      low: Math.min(...values),
      high: Math.max(...values),
      change: ((last - first) / first) * 100,
    };
  }, [visible]);

  /* Create the chart once. */
  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;
    let chart: IChartApi | null = null;

    void (async () => {
      const { createChart, ColorType, AreaSeries, CrosshairMode, LineStyle } = await import(
        'lightweight-charts'
      );
      if (disposed || !hostRef.current) return;

      const signal = token('--color-signal-soft', '#8fb3dc');

      chart = createChart(hostRef.current, {
        // autoSize keeps the plot in step with its container without a
        // ResizeObserver of our own.
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: token('--color-ink-faint', '#a49b91'),
          fontSize: 10,
          fontFamily: getComputedStyle(document.body).fontFamily,
          attributionLogo: false,
        },
        grid: {
          // Horizontal rules only, faint. A full grid competes with the
          // data.
          vertLines: { visible: false },
          horzLines: { color: token('--color-line-faint', '#1e1b17') },
        },
        rightPriceScale: {
          borderVisible: false,
          entireTextOnly: true,
          scaleMargins: { top: 0.15, bottom: 0.08 },
        },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: token('--color-signal-deep', '#6f9ccb'),
            width: 1,
            style: LineStyle.Dotted,
            labelVisible: false,
          },
          horzLine: {
            color: token('--color-signal-deep', '#6f9ccb'),
            width: 1,
            style: LineStyle.Dotted,
            labelBackgroundColor: token('--color-panel-raised', '#211e1a'),
          },
        },
        handleScale: { axisPressedMouseMove: false },
        handleScroll: { vertTouchDrag: false },
      });

      const area = chart.addSeries(AreaSeries, {
        lineColor: signal,
        lineWidth: 2,
        topColor: `${signal}2e`,
        bottomColor: `${signal}00`,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
        crosshairMarkerBorderColor: token('--color-ground', '#100e0c'),
        crosshairMarkerBackgroundColor: signal,
        crosshairMarkerBorderWidth: 2,
      });

      chartRef.current = chart;
      seriesRef.current = area;
      setReady(true);

      // A custom readout: the library's own tooltip is undesigned, and
      // this one reads in the product's own type.
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || param.point === undefined) {
          setHover(null);
          return;
        }
        const point = param.seriesData.get(area) as AreaData<Time> | undefined;
        if (typeof point?.value !== 'number') {
          setHover(null);
          return;
        }
        setHover({ time: Number(param.time), price: point.value, x: param.point.x });
      });
    })();

    return () => {
      disposed = true;
      chart?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  /* Push data whenever the window changes. */
  useEffect(() => {
    const area = seriesRef.current;
    if (!area || !ready) return;

    area.setData(visible.map((p) => ({ time: p.time as Time, value: p.value })));
    chartRef.current?.timeScale().fitContent();
  }, [visible, ready]);

  const hoverDate = hover
    ? new Date(hover.time * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Controls sit on the rule above the plot: compact, mono, no pill
          backgrounds. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h3 className="t-micro">{symbol} / USD · daily close</h3>
          {summary && (
            <span className="t-micro-tight hidden text-ink-ghost sm:inline">
              {formatPrice(summary.low)} – {formatPrice(summary.high)}
            </span>
          )}
          {summary && <Delta value={summary.change} size="sm" />}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Chart window">
          {WINDOWS.map((w) => {
            const active = days === w.days;
            return (
              <button
                key={w.days}
                type="button"
                onClick={() => setDays(w.days)}
                aria-pressed={active}
                className={cn(
                  'relative px-2 py-1 font-mono text-[0.625rem] font-medium uppercase tracking-widest transition-colors',
                  active ? 'text-ink' : 'text-ink-ghost hover:text-ink-dim'
                )}
              >
                {w.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-1 -bottom-3 h-px transition-colors',
                    active ? 'bg-signal' : 'bg-transparent'
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <div
          ref={hostRef}
          className="h-[clamp(14rem,34vw,24rem)] w-full"
          role="img"
          aria-label={
            summary
              ? `${symbol} daily closing price over the last ${days} days, ranging from ${formatPrice(summary.low)} to ${formatPrice(summary.high)}`
              : `${symbol} price chart`
          }
        />

        {hover && hoverDate && (
          <div
            className="pointer-events-none absolute top-2 z-10 flex flex-col gap-1 border border-line-strong bg-panel-raised/95 px-3 py-2 shadow-lift backdrop-blur-sm"
            style={{
              // Keep the readout inside the plot at both edges.
              left: `clamp(0px, ${hover.x - 60}px, calc(100% - 8.5rem))`,
            }}
          >
            <span className="t-micro-tight text-ink-ghost">{hoverDate}</span>
            <span className="t-figure text-[0.8125rem]">{formatPrice(hover.price)}</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <span className="t-micro-tight text-ink-ghost">{visible.length} daily closes</span>
        {summary && (
          <span className="t-micro-tight text-ink-ghost sm:hidden">
            {formatPrice(summary.low)} – {formatPrice(summary.high)}
          </span>
        )}
      </div>
    </div>
  );
}
