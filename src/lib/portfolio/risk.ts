import type { ChainId } from './chains';
import type { Position } from './types';
import type { TimelinePoint } from './timeline';

/**
 * Deterministic risk metrics.
 *
 * Every metric states its period, method, required data and limitations,
 * and returns `insufficient` instead of a number when the data does not
 * support one. There is deliberately no composite "risk score": combining
 * unlike quantities with invented weights would produce a number that
 * looks precise and means nothing.
 */

export const MIN_RETURN_OBSERVATIONS = 30;
export const MIN_COVERAGE = 0.95;

/** Crypto trades every day, so annualisation uses 365 periods. */
const PERIODS_PER_YEAR = 365;

export type MetricValue =
  | { status: 'ok'; value: number; unit: 'pct' | 'ratio' | 'index' }
  | { status: 'insufficient'; reason: string };

export interface RiskMetric {
  key: string;
  label: string;
  period: string;
  methodology: string;
  requiredData: string;
  limitations: string;
  result: MetricValue;
}

/** Symbols treated as USD stablecoins. Allocation only; no peg is assumed in pricing. */
export const STABLECOINS = new Set([
  'USDT', 'USDC', 'DAI', 'USDS', 'FDUSD', 'TUSD', 'USDE', 'PYUSD', 'USDC.E', 'USDBC', 'LUSD', 'GUSD', 'FRAX', 'USDP',
]);

const insufficient = (reason: string): MetricValue => ({ status: 'insufficient', reason });

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (n − 1). */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Daily returns usable for statistics: days whose valuation covered at
 * least MIN_COVERAGE of held assets. A day with a missing price is
 * dropped rather than letting an unpriced asset look like a crash.
 */
export function usableReturns(points: readonly TimelinePoint[]): number[] {
  return points
    .filter((p) => p.dailyReturn !== null && p.coverage >= MIN_COVERAGE)
    .map((p) => p.dailyReturn as number);
}

export function annualisedVolatility(returns: number[]): MetricValue {
  if (returns.length < MIN_RETURN_OBSERVATIONS) {
    return insufficient(`Insufficient data — ${returns.length} of ${MIN_RETURN_OBSERVATIONS} daily returns required`);
  }
  return { status: 'ok', value: stdev(returns) * Math.sqrt(PERIODS_PER_YEAR) * 100, unit: 'pct' };
}

/** Largest peak-to-trough fall of the time-weighted index. */
export function maxDrawdown(points: readonly TimelinePoint[]): MetricValue {
  const valued = points.filter((p) => p.dailyReturn !== null);
  if (valued.length < MIN_RETURN_OBSERVATIONS) {
    return insufficient(`Insufficient data — ${valued.length} of ${MIN_RETURN_OBSERVATIONS} valued days required`);
  }
  let peak = -Infinity;
  let worst = 0;
  for (const p of points) {
    peak = Math.max(peak, p.twrIndex);
    if (peak > 0) worst = Math.min(worst, p.twrIndex / peak - 1);
  }
  return { status: 'ok', value: worst * 100, unit: 'pct' };
}

/** Current distance below the running peak of the TWR index, in percent (≤ 0). */
export function currentDrawdown(points: readonly TimelinePoint[]): number | null {
  if (points.length === 0) return null;
  const peak = Math.max(...points.map((p) => p.twrIndex));
  if (!(peak > 0)) return null;
  return (points[points.length - 1].twrIndex / peak - 1) * 100;
}

export function sharpeRatio(returns: number[], riskFreeAnnual = 0): MetricValue {
  if (returns.length < MIN_RETURN_OBSERVATIONS) {
    return insufficient(`Insufficient data — ${returns.length} of ${MIN_RETURN_OBSERVATIONS} daily returns required`);
  }
  const sd = stdev(returns);
  if (sd === 0) return insufficient('Returns have zero variance over the period');
  const excess = mean(returns) - riskFreeAnnual / PERIODS_PER_YEAR;
  return { status: 'ok', value: (excess / sd) * Math.sqrt(PERIODS_PER_YEAR), unit: 'ratio' };
}

export function sortinoRatio(returns: number[], riskFreeAnnual = 0): MetricValue {
  if (returns.length < MIN_RETURN_OBSERVATIONS) {
    return insufficient(`Insufficient data — ${returns.length} of ${MIN_RETURN_OBSERVATIONS} daily returns required`);
  }
  const target = riskFreeAnnual / PERIODS_PER_YEAR;
  const downside = returns.map((r) => Math.min(0, r - target));
  const dd = Math.sqrt(downside.reduce((s, x) => s + x * x, 0) / returns.length);
  if (dd === 0) return insufficient('No negative returns in the period — downside deviation is zero');
  return { status: 'ok', value: ((mean(returns) - target) / dd) * Math.sqrt(PERIODS_PER_YEAR), unit: 'ratio' };
}

/** Pearson correlation of two index-aligned daily return series. */
export function correlation(x: number[], y: number[]): MetricValue {
  if (x.length !== y.length) throw new Error('correlation requires index-aligned series');
  const n = x.length;
  if (n < MIN_RETURN_OBSERVATIONS) {
    return insufficient(`Insufficient data — ${n} of ${MIN_RETURN_OBSERVATIONS} overlapping daily returns required`);
  }
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return insufficient('One series has zero variance');
  return { status: 'ok', value: sxy / Math.sqrt(sxx * syy), unit: 'ratio' };
}

/** Herfindahl–Hirschman index over weights in percent (0–10,000). */
export function herfindahl(weightsPct: number[]): number {
  return weightsPct.reduce((s, w) => s + w * w, 0);
}

export interface ConcentrationInputs {
  positions: Position[];
  allocationByChain: Array<{ chain: ChainId | 'OFF_CHAIN'; pct: number }>;
}

export function concentrationMetrics({ positions, allocationByChain }: ConcentrationInputs): RiskMetric[] {
  const priced = positions.filter((p) => p.allocationPct !== null && (p.marketValue ?? 0) > 0);
  const weights = priced.map((p) => p.allocationPct as number);
  const top = priced[0];
  const none = insufficient('Insufficient data — no priced holdings');

  const stable = priced
    .filter((p) => STABLECOINS.has(p.symbol.toUpperCase()))
    .reduce((s, p) => s + (p.allocationPct as number), 0);

  return [
    {
      key: 'top_asset',
      label: 'Largest position',
      period: 'Current holdings',
      methodology: 'Market value of the largest position ÷ total priced market value.',
      requiredData: 'Current prices for held assets.',
      limitations: 'Unpriced holdings are excluded from the denominator.',
      result: top ? { status: 'ok', value: top.allocationPct as number, unit: 'pct' } : none,
    },
    {
      key: 'asset_hhi',
      label: 'Asset concentration (HHI)',
      period: 'Current holdings',
      methodology:
        'Herfindahl–Hirschman index: Σ(weight %)². 10,000 = a single asset; 10,000 ÷ N = N equal positions.',
      requiredData: 'Current prices for held assets.',
      limitations: 'Treats assets as independent; highly correlated assets understate concentration.',
      result: weights.length ? { status: 'ok', value: herfindahl(weights), unit: 'index' } : none,
    },
    {
      key: 'chain_hhi',
      label: 'Chain concentration (HHI)',
      period: 'Current holdings',
      methodology: 'Herfindahl–Hirschman index over market value by chain. Manual entries count as "off-chain".',
      requiredData: 'Current prices and the chain each holding sits on.',
      limitations: 'Bridged assets count toward the chain they are held on, not their origin chain.',
      result: allocationByChain.length
        ? { status: 'ok', value: herfindahl(allocationByChain.map((c) => c.pct)), unit: 'index' }
        : none,
    },
    {
      key: 'stablecoin_share',
      label: 'Stablecoin allocation',
      period: 'Current holdings',
      methodology: `Share of priced market value in recognised USD stablecoins (${[...STABLECOINS].slice(0, 6).join(', ')}, …).`,
      requiredData: 'Current prices for held assets.',
      limitations: 'Recognised by ticker; a token merely named like a stablecoin would be counted.',
      result: weights.length ? { status: 'ok', value: stable, unit: 'pct' } : none,
    },
  ];
}

export function returnMetrics(
  points: readonly TimelinePoint[],
  periodLabel: string,
  benchmarkReturns?: { label: string; portfolio: number[]; benchmark: number[] }
): RiskMetric[] {
  const returns = usableReturns(points);
  const needs = `At least ${MIN_RETURN_OBSERVATIONS} daily returns with ≥${MIN_COVERAGE * 100}% of holdings priced.`;
  const metrics: RiskMetric[] = [
    {
      key: 'volatility',
      label: 'Volatility (annualised)',
      period: periodLabel,
      methodology: 'Sample standard deviation of daily time-weighted returns × √365.',
      requiredData: needs,
      limitations: 'Backward-looking. Daily closes hide intraday swings.',
      result: annualisedVolatility(returns),
    },
    {
      key: 'max_drawdown',
      label: 'Maximum drawdown',
      period: periodLabel,
      methodology: 'Largest peak-to-trough decline of the time-weighted return index.',
      requiredData: `At least ${MIN_RETURN_OBSERVATIONS} valued days.`,
      limitations: 'Measured on daily closes; deposits and withdrawals are excluded by construction.',
      result: maxDrawdown(points),
    },
    {
      key: 'sharpe',
      label: 'Sharpe ratio',
      period: periodLabel,
      methodology: 'Mean daily return ÷ its standard deviation × √365, risk-free rate 0%.',
      requiredData: needs,
      limitations: 'Assumes a 0% risk-free rate. Unstable over short windows; not a forecast.',
      result: sharpeRatio(returns),
    },
    {
      key: 'sortino',
      label: 'Sortino ratio',
      period: periodLabel,
      methodology: 'Mean daily return ÷ downside deviation (returns below 0%) × √365.',
      requiredData: needs,
      limitations: 'Assumes a 0% target. Undefined when there are no down days.',
      result: sortinoRatio(returns),
    },
  ];

  if (benchmarkReturns) {
    metrics.push({
      key: 'correlation',
      label: `Correlation with ${benchmarkReturns.label}`,
      period: periodLabel,
      methodology: `Pearson correlation of daily portfolio returns with ${benchmarkReturns.label} daily returns.`,
      requiredData: `At least ${MIN_RETURN_OBSERVATIONS} overlapping daily returns.`,
      limitations: 'Linear relationship only; correlations change across market regimes.',
      result: correlation(benchmarkReturns.portfolio, benchmarkReturns.benchmark),
    });
  }

  return metrics;
}
