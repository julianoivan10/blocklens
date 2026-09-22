import { affectsPool, applyLeg, sortLegs } from './engine';
import type { LedgerLeg, PoolState } from './types';

/**
 * Portfolio value and return over time.
 *
 * ── Valuation ────────────────────────────────────────────────────────────
 * For each UTC day, the pool quantities after every leg up to the end of
 * that day are valued at that day's close. An asset with no close for a
 * day (and none in the previous CARRY_DAYS) contributes nothing that day
 * and the day's `coverage` drops below 1 — it is never priced at zero or
 * at a guess.
 *
 * ── Return: time-weighted (TWR) ──────────────────────────────────────────
 * Deposits are not performance. Each day's external net flow F — money
 * or assets entering or leaving the portfolio — is removed before the
 * day's return is measured:
 *
 *   r_t = (V_t − F_t) / V_{t−1} − 1        (flows assumed at end of day)
 *
 * External flows are BUY (+cost), SELL (−proceeds), and external
 * TRANSFER_IN / TRANSFER_OUT / UNKNOWN legs at that day's market value.
 * Swaps, fees and internal transfers are not flows: a swap reshuffles the
 * portfolio, and a fee is a genuine loss that belongs in the return.
 *
 * Days before the portfolio first holds a priced asset produce no return.
 */

export const DAY_MS = 86_400_000;
const CARRY_DAYS = 3;

export type PriceHistory = ReadonlyMap<string, ReadonlyArray<{ time: number; value: number }>>;

export interface TimelinePoint {
  /** UTC midnight, epoch ms, of the day this point closes. */
  day: number;
  value: number;
  netFlow: number;
  /** Daily time-weighted return; null on the first valued day. */
  dailyReturn: number | null;
  /** Growth of 1 unit invested at the start, from chained daily returns. */
  twrIndex: number;
  /** Share of held assets (by count) that had a price this day. */
  coverage: number;
  /** Cost basis at the end of the day, for the PnL chart. */
  costBasis: number;
  realizedPnl: number;
}

export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Latest price at or before `atMs`, within CARRY_DAYS. Series is sorted by time (seconds). */
export function priceAt(
  series: ReadonlyArray<{ time: number; value: number }> | undefined,
  atMs: number
): number | null {
  if (!series || series.length === 0) return null;
  const at = atMs / 1000;
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].time <= at) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  if (at - series[found].time > CARRY_DAYS * 86_400) return null;
  return series[found].value;
}

function isExternalFlow(leg: LedgerLeg): boolean {
  if (!affectsPool(leg)) return false;
  return leg.type !== 'SWAP' && leg.type !== 'FEE';
}

export function buildTimeline(
  legs: readonly LedgerLeg[],
  history: PriceHistory,
  options: { endMs?: number; startMs?: number } = {}
): TimelinePoint[] {
  const ordered = sortLegs(legs);
  if (ordered.length === 0) return [];

  const end = utcDay(options.endMs ?? Date.now());
  const firstDay = utcDay(ordered[0].timestamp);
  const start = Math.max(firstDay, options.startMs !== undefined ? utcDay(options.startMs) : firstDay);

  const pools = new Map<string, PoolState>();
  const points: TimelinePoint[] = [];
  let cursor = 0;
  let prevValue = 0;
  let index = 1;

  for (let day = firstDay; day <= end; day += DAY_MS) {
    const dayEnd = day + DAY_MS;
    let flow = 0;

    while (cursor < ordered.length && ordered[cursor].timestamp < dayEnd) {
      const leg = ordered[cursor++];
      if (isExternalFlow(leg)) {
        let legValue: number | null = null;
        if (leg.type === 'BUY' || leg.type === 'SELL') legValue = leg.usdValue;
        if (legValue === null) {
          const p = priceAt(history.get(leg.assetKey), dayEnd);
          legValue = p !== null ? p * leg.amount : null;
        }
        // An unpriced flow is also an unpriced holding, so it is outside V
        // on both sides and correctly contributes nothing.
        if (legValue !== null) flow += leg.direction * legValue;
      }
      applyLeg(pools, leg);
    }

    if (day < start) continue;

    let value = 0;
    let held = 0;
    let priced = 0;
    let costBasis = 0;
    let realized = 0;
    for (const pool of pools.values()) {
      costBasis += pool.costBasis;
      realized += pool.realizedPnl;
      if (pool.quantity <= 0) continue;
      held++;
      const p = priceAt(history.get(pool.assetKey), dayEnd);
      if (p !== null) {
        priced++;
        value += pool.quantity * p;
      }
    }

    let dailyReturn: number | null = null;
    if (prevValue > 0) {
      dailyReturn = (value - flow) / prevValue - 1;
      index *= 1 + dailyReturn;
    }

    points.push({
      day,
      value,
      netFlow: flow,
      dailyReturn,
      twrIndex: index,
      coverage: held === 0 ? 1 : priced / held,
      costBasis,
      realizedPnl: realized,
    });
    prevValue = value;
  }

  return points;
}

/** Cumulative TWR over a slice of the timeline, as a fraction. */
export function periodReturn(points: readonly TimelinePoint[]): number | null {
  const returns = points.slice(1).map((p) => p.dailyReturn).filter((r): r is number => r !== null);
  if (returns.length === 0) return null;
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}
