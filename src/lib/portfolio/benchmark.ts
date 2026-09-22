import { DAY_MS, periodReturn, priceAt, utcDay, type TimelinePoint } from './timeline';

/**
 * Benchmark comparison.
 *
 * The portfolio's time-weighted return over a window is set against the
 * simple price return of a benchmark asset over the same window, from the
 * same daily-close source. The comparison describes the past; it does
 * not predict anything, and the UI says so.
 *
 * A "total crypto market" benchmark needs a market-cap history series.
 * CoinGecko serves that only on paid plans, so it is declared here as
 * unavailable rather than approximated from a basket of assets.
 */

export interface BenchmarkDefinition {
  id: string;
  label: string;
  /** Asset whose closes define the benchmark, when it is a single asset. */
  assetKey: string | null;
  source: string;
  available: boolean;
  unavailableReason?: string;
}

export const BENCHMARKS: BenchmarkDefinition[] = [
  { id: 'BTC', label: 'Bitcoin (BTC)', assetKey: 'sym:BTC', source: 'CoinGecko daily close', available: true },
  { id: 'ETH', label: 'Ether (ETH)', assetKey: 'sym:ETH', source: 'CoinGecko daily close', available: true },
  {
    id: 'TOTAL',
    label: 'Total crypto market cap',
    assetKey: null,
    source: 'CoinGecko global market-cap history',
    available: false,
    unavailableReason: 'Historical total market cap requires a paid CoinGecko plan.',
  },
];

export const PERIODS = [
  { id: '30d', days: 30, label: 'Last 30 days' },
  { id: '90d', days: 90, label: 'Last 90 days' },
  { id: '180d', days: 180, label: 'Last 180 days' },
  { id: '365d', days: 365, label: 'Last 365 days' },
] as const;

export type PeriodId = (typeof PERIODS)[number]['id'];

export interface BenchmarkComparison {
  benchmark: BenchmarkDefinition;
  periodLabel: string;
  /** Actual window compared, which may be shorter than requested. */
  from: number;
  to: number;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  /** Portfolio minus benchmark, in percentage points. */
  relativePct: number | null;
  /** Both series rebased to 100 at the window start, for the chart. */
  series: Array<{ day: number; portfolio: number | null; benchmark: number | null }>;
  note?: string;
}

export function sliceWindow(points: readonly TimelinePoint[], days: number, endMs = Date.now()): TimelinePoint[] {
  const from = utcDay(endMs) - days * DAY_MS;
  // The first valued point at or after the window start anchors the window.
  return points.filter((p) => p.day >= from && p.value > 0);
}

export function compareToBenchmark(
  points: readonly TimelinePoint[],
  benchmark: BenchmarkDefinition,
  history: ReadonlyArray<{ time: number; value: number }> | undefined,
  period: { days: number; label: string },
  endMs = Date.now()
): BenchmarkComparison {
  const window = sliceWindow(points, period.days, endMs);
  const empty: BenchmarkComparison = {
    benchmark,
    periodLabel: period.label,
    from: window[0]?.day ?? 0,
    to: window[window.length - 1]?.day ?? 0,
    portfolioReturnPct: null,
    benchmarkReturnPct: null,
    relativePct: null,
    series: [],
  };

  if (!benchmark.available || !benchmark.assetKey) {
    return { ...empty, note: benchmark.unavailableReason };
  }
  if (window.length < 2) {
    return { ...empty, note: 'Insufficient data — the portfolio has fewer than two valued days in this period.' };
  }

  const startDay = window[0].day;
  const endDay = window[window.length - 1].day;
  const b0 = priceAt(history, startDay + DAY_MS);
  const b1 = priceAt(history, endDay + DAY_MS);

  const portfolioReturn = periodReturn(window);
  const benchmarkReturn = b0 !== null && b1 !== null && b0 > 0 ? b1 / b0 - 1 : null;

  const baseIndex = window[0].twrIndex;
  const series = window.map((p) => {
    const b = priceAt(history, p.day + DAY_MS);
    return {
      day: p.day,
      portfolio: baseIndex > 0 ? (p.twrIndex / baseIndex) * 100 : null,
      benchmark: b !== null && b0 ? (b / b0) * 100 : null,
    };
  });

  const shortened = (endDay - startDay) / DAY_MS < period.days - 1;

  return {
    benchmark,
    periodLabel: period.label,
    from: startDay,
    to: endDay,
    portfolioReturnPct: portfolioReturn !== null ? portfolioReturn * 100 : null,
    benchmarkReturnPct: benchmarkReturn !== null ? benchmarkReturn * 100 : null,
    relativePct:
      portfolioReturn !== null && benchmarkReturn !== null ? (portfolioReturn - benchmarkReturn) * 100 : null,
    series,
    note: shortened
      ? `The portfolio has valued history for ${Math.round((endDay - startDay) / DAY_MS) + 1} of the ${period.days} days, so the comparison covers that shorter window.`
      : benchmarkReturn === null
        ? `No ${benchmark.id} closes are available for this window.`
        : undefined,
  };
}

/**
 * Portfolio and benchmark daily returns paired by day. A day enters only
 * when both sides have a return and the portfolio valuation was fully
 * covered, so the two arrays are the same length and index-aligned.
 */
export function alignedReturns(
  points: readonly TimelinePoint[],
  history: ReadonlyArray<{ time: number; value: number }> | undefined,
  minCoverage: number
): { portfolio: number[]; benchmark: number[] } {
  const portfolio: number[] = [];
  const benchmark: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.dailyReturn === null || p.coverage < minCoverage) continue;
    const a = priceAt(history, points[i - 1].day + DAY_MS);
    const b = priceAt(history, p.day + DAY_MS);
    if (a === null || b === null || a <= 0) continue;
    portfolio.push(p.dailyReturn);
    benchmark.push(b / a - 1);
  }
  return { portfolio, benchmark };
}
