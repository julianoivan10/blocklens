import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/server/db';
import { loadLedger, ledgerVersion } from './ledger';
import { buildPools, valuePortfolio, type ValuationResult } from '@/lib/portfolio/engine';
import { buildTimeline, DAY_MS, utcDay, type TimelinePoint } from '@/lib/portfolio/timeline';
import {
  BENCHMARKS,
  PERIODS,
  alignedReturns,
  compareToBenchmark,
  sliceWindow,
  type BenchmarkComparison,
  type PeriodId,
} from '@/lib/portfolio/benchmark';
import {
  MIN_COVERAGE,
  concentrationMetrics,
  currentDrawdown,
  returnMetrics,
  type RiskMetric,
} from '@/lib/portfolio/risk';
import type { ChainId } from '@/lib/portfolio/chains';
import type { PoolState, PositionFlag } from '@/lib/portfolio/types';
import { getCurrentPrices, getDailyHistories, type PriceQuote } from '@/services/pricing';

/**
 * Portfolio reads.
 *
 * The cost of a page view is: one aggregate query for the ledger
 * version, a cache hit for the derived pools, a cached price read, and an
 * O(positions) valuation. The ledger is re-read and re-processed only
 * when the version changes; a price update never triggers it.
 */

/* ---------- pool snapshot (cached per ledger version) ---------- */

interface PoolSnapshot extends Omit<PoolState, 'quantityByChain' | 'flags' | 'flaggedLegIds'> {
  quantityByChain: Array<[ChainId | 'OFF_CHAIN', number]>;
  flags: PositionFlag[];
  flaggedLegIds: string[];
}

interface LedgerSnapshot {
  pools: PoolSnapshot[];
  firstTimestamp: number | null;
  legCount: number;
  /** Net ledger quantity per wallet and asset, for reconciliation. */
  walletQuantities: Array<{ walletId: string; assetKey: string; quantity: number }>;
}

async function computeLedgerSnapshot(userId: string): Promise<LedgerSnapshot> {
  const legs = await loadLedger(userId);
  const pools = buildPools(legs);

  const perWallet = new Map<string, number>();
  for (const l of legs) {
    if (!l.walletId) continue;
    if (l.status === 'FAILED' && l.type !== 'FEE') continue;
    const key = `${l.walletId}|${l.assetKey}`;
    perWallet.set(key, (perWallet.get(key) ?? 0) + l.direction * l.amount);
  }

  return {
    pools: [...pools.values()].map((p) => ({
      ...p,
      quantityByChain: [...p.quantityByChain.entries()],
      flags: [...p.flags],
      flaggedLegIds: [...p.flaggedLegIds],
    })),
    firstTimestamp: legs[0]?.timestamp ?? null,
    legCount: legs.length,
    walletQuantities: [...perWallet.entries()].map(([k, quantity]) => {
      const [walletId, assetKey] = k.split('|');
      return { walletId, assetKey, quantity };
    }),
  };
}

/** `version` is unused in the body: it exists to key the cache entry. */
const cachedLedgerSnapshot = unstable_cache(
  (userId: string, version: string) => {
    void version;
    return computeLedgerSnapshot(userId);
  },
  ['portfolio:ledger-snapshot:v1'],
  { revalidate: 86_400 }
);

function rehydrate(snapshot: LedgerSnapshot): Map<string, PoolState> {
  return new Map(
    snapshot.pools.map((p) => [
      p.assetKey,
      { ...p, quantityByChain: new Map(p.quantityByChain), flags: new Set(p.flags), flaggedLegIds: new Set(p.flaggedLegIds) },
    ])
  );
}

export const getLedgerSnapshot = cache(async (userId: string) => {
  const version = await ledgerVersion(userId);
  return { version, snapshot: await cachedLedgerSnapshot(userId, version) };
});

/* ---------- valuation ---------- */

export interface Reconciliation {
  walletId: string;
  walletLabel: string;
  chain: ChainId;
  symbol: string;
  assetKey: string;
  ledgerQuantity: number;
  chainQuantity: number;
  difference: number;
}

export interface PortfolioOverview extends ValuationResult {
  prices: Record<string, PriceQuote>;
  legCount: number;
  since: string | null;
  reviewCount: number;
  reconciliation: Reconciliation[];
  staleQuotes: number;
  wallets: number;
}

export const getPortfolioOverview = cache(async (userId: string): Promise<PortfolioOverview> => {
  const { snapshot } = await getLedgerSnapshot(userId);
  const pools = rehydrate(snapshot);
  const held = [...pools.values()].filter((p) => p.quantity > 0).map((p) => p.assetKey);

  const [prices, reviewCount, wallets, balances] = await Promise.all([
    getCurrentPrices(held),
    prisma.transaction.count({ where: { userId, needsReview: true } }),
    prisma.wallet.findMany({ where: { userId }, select: { id: true, label: true, chain: true } }),
    prisma.walletBalance.findMany({ where: { wallet: { userId } } }),
  ]);

  const valuation = valuePortfolio(pools, prices);

  // Reconciliation: where the imported history and the chain disagree
  // about what a wallet holds, say so. Only for priced assets; spam
  // tokens would drown the signal.
  const walletById = new Map(wallets.map((w) => [w.id, w]));
  const ledgerQty = new Map(snapshot.walletQuantities.map((w) => [`${w.walletId}|${w.assetKey}`, w.quantity]));
  const keys = new Set([...ledgerQty.keys(), ...balances.map((b) => `${b.walletId}|${b.assetKey}`)]);
  const symbols = new Map(balances.map((b) => [b.assetKey, b.symbol]));
  for (const p of pools.values()) symbols.set(p.assetKey, p.symbol);

  const reconciliation: Reconciliation[] = [];
  for (const key of keys) {
    const [walletId, assetKey] = key.split('|');
    const wallet = walletById.get(walletId);
    if (!wallet || !prices.has(assetKey)) continue;
    const ledgerQuantity = ledgerQty.get(key) ?? 0;
    const chainQuantity = balances.find((b) => b.walletId === walletId && b.assetKey === assetKey)?.quantity.toNumber() ?? 0;
    const difference = chainQuantity - ledgerQuantity;
    const tolerance = Math.max(1e-9, Math.abs(chainQuantity) * 0.001);
    const valueGap = Math.abs(difference) * (prices.get(assetKey)?.price ?? 0);
    if (Math.abs(difference) > tolerance && valueGap >= 1) {
      reconciliation.push({
        walletId,
        walletLabel: wallet.label,
        chain: wallet.chain,
        symbol: symbols.get(assetKey) ?? assetKey,
        assetKey,
        ledgerQuantity,
        chainQuantity,
        difference,
      });
    }
  }

  return {
    ...valuation,
    prices: Object.fromEntries(prices),
    legCount: snapshot.legCount,
    since: snapshot.firstTimestamp ? new Date(snapshot.firstTimestamp).toISOString() : null,
    reviewCount,
    reconciliation,
    staleQuotes: [...prices.values()].filter((q) => q.stale).length,
    wallets: wallets.length,
  };
});

/* ---------- performance, benchmark, risk ---------- */

const HISTORY_DAYS = 366;

async function computeTimeline(userId: string): Promise<{ points: TimelinePoint[]; benchmarkHistory: Record<string, Array<{ time: number; value: number }>> }> {
  const legs = await loadLedger(userId);
  const benchmarkKeys = BENCHMARKS.flatMap((b) => (b.assetKey ? [b.assetKey] : []));
  if (legs.length === 0) return { points: [], benchmarkHistory: {} };

  const windowStart = Math.max(utcDay(legs[0].timestamp), utcDay(Date.now()) - HISTORY_DAYS * DAY_MS);
  const assetKeys = [...new Set(legs.map((l) => l.assetKey))];
  // History is requested only for assets with a market price today; an
  // asset nobody prices now (airdropped spam, mostly) has no history
  // either, and stays out of the valuation as it does everywhere else.
  const current = await getCurrentPrices(assetKeys);
  const priced = assetKeys.filter((k) => current.has(k));
  const histories = await getDailyHistories([...new Set([...priced, ...benchmarkKeys])], windowStart - 3 * DAY_MS);

  const points = buildTimeline(legs, histories, { startMs: windowStart });
  return {
    points,
    benchmarkHistory: Object.fromEntries(benchmarkKeys.map((k) => [k, histories.get(k) ?? []])),
  };
}

/** `version` and `day` key the entry: a new ledger or a new day recomputes. */
const cachedTimeline = unstable_cache(
  (userId: string, version: string, day: number) => {
    void version;
    void day;
    return computeTimeline(userId);
  },
  ['portfolio:timeline:v1'],
  { revalidate: 3_600 }
);

export const getTimeline = cache(async (userId: string) => {
  const { version } = await getLedgerSnapshot(userId);
  return cachedTimeline(userId, version, utcDay(Date.now()));
});

export interface PerformanceView {
  period: { id: PeriodId; label: string; days: number };
  points: TimelinePoint[];
  comparisons: BenchmarkComparison[];
  risk: RiskMetric[];
  currentDrawdownPct: number | null;
  coverageWarning: boolean;
}

export async function getPerformance(userId: string, periodId: PeriodId): Promise<PerformanceView> {
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[1];
  const [{ points, benchmarkHistory }, overview] = await Promise.all([getTimeline(userId), getPortfolioOverview(userId)]);

  const window = sliceWindow(points, period.days);
  const comparisons = BENCHMARKS.map((b) =>
    compareToBenchmark(points, b, b.assetKey ? benchmarkHistory[b.assetKey] : undefined, period)
  );

  const btc = benchmarkHistory['sym:BTC'];
  const risk = [
    ...returnMetrics(window, period.label, { label: 'BTC', ...alignedReturns(window, btc, MIN_COVERAGE) }),
    ...concentrationMetrics({ positions: overview.positions, allocationByChain: overview.allocationByChain }),
  ];

  return {
    period,
    points: window,
    comparisons,
    risk,
    currentDrawdownPct: currentDrawdown(points),
    coverageWarning: window.some((p) => p.coverage < MIN_COVERAGE),
  };
}
