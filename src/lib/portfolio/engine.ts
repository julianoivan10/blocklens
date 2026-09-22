import type { ChainId } from './chains';
import type {
  CurrentPrice,
  LedgerLeg,
  PoolState,
  PortfolioTotals,
  Position,
  PositionFlag,
} from './types';

/**
 * The portfolio engine.
 *
 * Deterministic, synchronous and free of I/O: the same ledger and the
 * same prices always produce the same figures. Nothing here estimates,
 * and nothing here is ever delegated to a language model.
 *
 * ── Cost-basis methodology: weighted-average cost (WAC), pooled ──────────
 *
 * Each asset has one pool (keyed by `assetKey`). Native gas assets share
 * a pool across chains — ETH on Ethereum, Base, Arbitrum and Optimism is
 * one pool — while tokens are pooled per contract, because two tokens
 * sharing a ticker are not the same asset.
 *
 *  Acquisition with a known USD value (BUY, the incoming side of a SWAP):
 *    quantity += q; knownQuantity += q; costBasis += value
 *
 *  Acquisition without one (an external TRANSFER_IN, an UNKNOWN inflow, an
 *  unpriced swap leg): quantity += q only. The units are held but carry
 *  no cost, and they are excluded from unrealized PnL rather than being
 *  assumed to cost zero or market value. The position is flagged
 *  UNKNOWN_COST_BASIS until the user classifies the leg.
 *
 *  Any disposal removes a proportional slice of the pool, so the average
 *  cost of what remains is unchanged:
 *    f = q / quantity; costRemoved = costBasis × f; knownRemoved = knownQuantity × f
 *
 *  SELL, outgoing SWAP leg — realized PnL is booked on the known-cost share:
 *    realized += proceeds × (knownRemoved / q) − costRemoved
 *    The rest of the proceeds is "unattributed", not profit.
 *  FEE — a disposal with zero proceeds: realized −= costRemoved.
 *  External TRANSFER_OUT, UNKNOWN outflow — cost leaves with the units;
 *    no PnL is realized. A transfer is not a sale.
 *  Transfers between the user's own wallets (isInternal), STAKE and
 *    UNSTAKE — the pool is untouched; only the per-chain location moves.
 *  FAILED transactions — only their FEE leg counts.
 *
 *  Unrealized PnL = knownQuantity × price − costBasis
 *  PnL %          = (realized + unrealized) / grossInvested
 *  Allocation %   = marketValue / Σ marketValue of priced positions
 */

const EPSILON = 1e-12;

function newPool(leg: LedgerLeg): PoolState {
  return {
    assetKey: leg.assetKey,
    symbol: leg.symbol,
    name: leg.name ?? null,
    quantity: 0,
    knownQuantity: 0,
    costBasis: 0,
    realizedPnl: 0,
    grossInvested: 0,
    feesCost: 0,
    unattributedProceeds: 0,
    quantityByChain: new Map(),
    flags: new Set(),
    flaggedLegIds: new Set(),
  };
}

function flag(pool: PoolState, leg: LedgerLeg, reason: PositionFlag) {
  pool.flags.add(reason);
  pool.flaggedLegIds.add(leg.id);
}

function moveLocation(pool: PoolState, leg: LedgerLeg) {
  const where = leg.chain ?? 'OFF_CHAIN';
  const next = (pool.quantityByChain.get(where) ?? 0) + leg.direction * leg.amount;
  pool.quantityByChain.set(where, Math.abs(next) < EPSILON ? 0 : next);
}

/** Legs in the order they happened; inflows before outflows at the same instant. */
export function sortLegs(legs: readonly LedgerLeg[]): LedgerLeg[] {
  return [...legs].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      b.direction - a.direction ||
      a.groupId.localeCompare(b.groupId) ||
      a.id.localeCompare(b.id)
  );
}

/** Whether a leg changes the pool, as opposed to only its location. */
export function affectsPool(leg: LedgerLeg): boolean {
  if (leg.status === 'FAILED') return leg.type === 'FEE';
  if (leg.type === 'STAKE' || leg.type === 'UNSTAKE') return false;
  if (leg.isInternal && (leg.type === 'TRANSFER_IN' || leg.type === 'TRANSFER_OUT')) return false;
  return true;
}

function acquire(pool: PoolState, leg: LedgerLeg) {
  pool.quantity += leg.amount;
  const priced = (leg.type === 'BUY' || leg.type === 'SWAP') && leg.usdValue !== null;
  if (priced) {
    pool.knownQuantity += leg.amount;
    pool.costBasis += leg.usdValue!;
    pool.grossInvested += leg.usdValue!;
  } else {
    flag(pool, leg, 'UNKNOWN_COST_BASIS');
  }
}

function dispose(pool: PoolState, leg: LedgerLeg) {
  const available = Math.max(0, pool.quantity);
  const disposed = Math.min(leg.amount, available);
  const excess = leg.amount - disposed;

  if (excess > Math.max(EPSILON, leg.amount * 1e-9)) {
    // More left than the ledger says was ever held: history is missing.
    flag(pool, leg, 'INSUFFICIENT_HISTORY');
  }

  let costRemoved = 0;
  let knownRemoved = 0;
  if (disposed > 0 && available > 0) {
    const f = disposed / available;
    costRemoved = pool.costBasis * f;
    knownRemoved = pool.knownQuantity * f;
    pool.quantity -= disposed;
    pool.knownQuantity -= knownRemoved;
    pool.costBasis -= costRemoved;
  }

  if (pool.quantity < EPSILON) {
    pool.quantity = 0;
    pool.knownQuantity = 0;
    pool.costBasis = 0;
  }

  switch (leg.type) {
    case 'SELL':
    case 'SWAP': {
      if (leg.usdValue === null) {
        flag(pool, leg, 'UNPRICED_DISPOSAL');
        return;
      }
      const knownShare = leg.amount > 0 ? knownRemoved / leg.amount : 0;
      pool.realizedPnl += leg.usdValue * knownShare - costRemoved;
      pool.unattributedProceeds += leg.usdValue * (1 - knownShare);
      return;
    }
    case 'FEE':
      pool.realizedPnl -= costRemoved;
      pool.feesCost += costRemoved;
      return;
    default:
      // External transfer out or unclassified outflow: cost leaves with
      // the units and no PnL is realized.
      return;
  }
}

/** Applies one leg to its pool. Exported for the timeline builder. */
export function applyLeg(pools: Map<string, PoolState>, leg: LedgerLeg): void {
  let pool = pools.get(leg.assetKey);
  if (!pool) {
    pool = newPool(leg);
    pools.set(leg.assetKey, pool);
  }
  if (!pool.name && leg.name) pool.name = leg.name;

  // Location follows every confirmed movement, including internal ones.
  if (leg.status === 'CONFIRMED' || leg.type === 'FEE') moveLocation(pool, leg);

  if (!affectsPool(leg)) return;
  if (leg.direction === 1) acquire(pool, leg);
  else dispose(pool, leg);
}

export function buildPools(legs: readonly LedgerLeg[]): Map<string, PoolState> {
  const pools = new Map<string, PoolState>();
  for (const leg of sortLegs(legs)) applyLeg(pools, leg);
  return pools;
}

const round = (n: number, dp = 8) => Math.round(n * 10 ** dp) / 10 ** dp;

export interface ValuationResult {
  positions: Position[];
  totals: PortfolioTotals;
  allocationByChain: Array<{ chain: ChainId | 'OFF_CHAIN'; marketValue: number; pct: number }>;
}

/**
 * Values the pools at current prices. Prices are the only input that
 * changes between page views, and this step is O(positions) — a price
 * tick never re-reads or re-processes the ledger.
 */
export function valuePortfolio(
  pools: Map<string, PoolState>,
  prices: ReadonlyMap<string, CurrentPrice>
): ValuationResult {
  const positions: Position[] = [];

  for (const pool of pools.values()) {
    // Closed positions still carry realized PnL; keep them only if they do.
    if (pool.quantity <= EPSILON && Math.abs(pool.realizedPnl) < 1e-9 && pool.grossInvested === 0) {
      continue;
    }

    const quote = prices.get(pool.assetKey) ?? null;
    const price = quote?.price ?? null;
    const flags = new Set(pool.flags);
    if (price === null && pool.quantity > EPSILON) flags.add('NO_CURRENT_PRICE');

    const marketValue = price !== null ? pool.quantity * price : null;
    const unrealized = price !== null ? pool.knownQuantity * price - pool.costBasis : null;
    const totalPnl = unrealized !== null ? pool.realizedPnl + unrealized : pool.quantity <= EPSILON ? pool.realizedPnl : null;

    positions.push({
      assetKey: pool.assetKey,
      symbol: pool.symbol,
      name: pool.name,
      chains: [...pool.quantityByChain.entries()]
        .filter(([, q]) => q > EPSILON)
        .map(([chain, quantity]) => ({
          chain,
          quantity,
          marketValue: price !== null ? quantity * price : null,
        })),
      quantity: pool.quantity,
      knownQuantity: pool.knownQuantity,
      unknownCostQuantity: Math.max(0, pool.quantity - pool.knownQuantity),
      averageCost: pool.knownQuantity > EPSILON ? pool.costBasis / pool.knownQuantity : null,
      investedCapital: round(pool.costBasis),
      currentPrice: price,
      priceAsOf: quote?.asOf ?? null,
      marketValue: marketValue !== null ? round(marketValue) : null,
      unrealizedPnl: unrealized !== null ? round(unrealized) : null,
      realizedPnl: round(pool.realizedPnl),
      totalPnl: totalPnl !== null ? round(totalPnl) : null,
      pnlPct:
        totalPnl !== null && pool.grossInvested > EPSILON
          ? round((totalPnl / pool.grossInvested) * 100, 4)
          : null,
      allocationPct: null,
      feesCost: round(pool.feesCost),
      flags: [...flags],
    });
  }

  const totalValue = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  for (const p of positions) {
    p.allocationPct =
      p.marketValue !== null && totalValue > 0 ? round((p.marketValue / totalValue) * 100, 4) : null;
  }
  positions.sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));

  const byChain = new Map<ChainId | 'OFF_CHAIN', number>();
  for (const p of positions) {
    for (const c of p.chains) {
      if (c.marketValue !== null) byChain.set(c.chain, (byChain.get(c.chain) ?? 0) + c.marketValue);
    }
  }
  const chainTotal = [...byChain.values()].reduce((s, v) => s + v, 0);

  const realizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0);
  const unrealizedPnl = positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const grossInvested = [...pools.values()].reduce((s, p) => s + p.grossInvested, 0);
  const totalPnl = realizedPnl + unrealizedPnl;

  const totals: PortfolioTotals = {
    totalValue: round(totalValue),
    investedCapital: round(positions.reduce((s, p) => s + p.investedCapital, 0)),
    realizedPnl: round(realizedPnl),
    unrealizedPnl: round(unrealizedPnl),
    totalPnl: round(totalPnl),
    pnlPct: grossInvested > EPSILON ? round((totalPnl / grossInvested) * 100, 4) : null,
    grossInvested: round(grossInvested),
    feesCost: round(positions.reduce((s, p) => s + p.feesCost, 0)),
    unknownCostValue: round(
      positions.reduce(
        (s, p) => s + (p.currentPrice !== null ? p.unknownCostQuantity * p.currentPrice : 0),
        0
      )
    ),
    positionsCount: positions.filter((p) => p.quantity > EPSILON).length,
    unpricedPositions: positions.filter((p) => p.flags.includes('NO_CURRENT_PRICE')).length,
    flaggedPositions: positions.filter((p) => p.flags.some((f) => f !== 'NO_CURRENT_PRICE')).length,
  };

  return {
    positions,
    totals,
    allocationByChain: [...byChain.entries()]
      .map(([chain, marketValue]) => ({
        chain,
        marketValue: round(marketValue),
        pct: chainTotal > 0 ? round((marketValue / chainTotal) * 100, 4) : 0,
      }))
      .sort((a, b) => b.marketValue - a.marketValue),
  };
}
