import type { ChainId } from './chains';

export type TxType =
  | 'BUY'
  | 'SELL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'SWAP'
  | 'FEE'
  | 'STAKE'
  | 'UNSTAKE'
  | 'UNKNOWN';

export const TX_TYPES: readonly TxType[] = [
  'BUY',
  'SELL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'SWAP',
  'FEE',
  'STAKE',
  'UNSTAKE',
  'UNKNOWN',
];

/**
 * One asset movement as the engine sees it. Plain numbers: the engine is
 * pure and synchronous, and every amount is converted from the stored
 * Decimal exactly once at the boundary.
 */
export interface LedgerLeg {
  id: string;
  groupId: string;
  /** Epoch milliseconds. */
  timestamp: number;
  assetKey: string;
  symbol: string;
  name?: string | null;
  /** Null for manual (off-chain) entries. */
  chain: ChainId | null;
  walletId: string | null;
  /** Always positive. */
  amount: number;
  /** +1 into the portfolio, -1 out of it. */
  direction: 1 | -1;
  type: TxType;
  /** USD value of this leg at the time, when known. */
  usdValue: number | null;
  isInternal: boolean;
  status: 'CONFIRMED' | 'FAILED';
}

/** Why a position's figures are incomplete. Surfaced in the UI verbatim. */
export type PositionFlag =
  | 'UNKNOWN_COST_BASIS'
  | 'INSUFFICIENT_HISTORY'
  | 'UNPRICED_DISPOSAL'
  | 'NO_CURRENT_PRICE';

export interface PoolState {
  assetKey: string;
  symbol: string;
  name: string | null;
  /** Units held, whatever their cost status. */
  quantity: number;
  /** Units whose acquisition cost is known. `quantity - knownQuantity` have none. */
  knownQuantity: number;
  /** Remaining cost of the known-cost units. This is "invested capital". */
  costBasis: number;
  realizedPnl: number;
  /** Sum of every known acquisition cost ever booked (denominator for PnL %). */
  grossInvested: number;
  /** Network fees paid in this asset, at their cost basis. */
  feesCost: number;
  /** Sale proceeds that could not be matched to a known cost. */
  unattributedProceeds: number;
  /** Units held per chain (null key = off-chain / manual). */
  quantityByChain: Map<ChainId | 'OFF_CHAIN', number>;
  flags: Set<PositionFlag>;
  /** Legs that contributed to a flag, for the review screen. */
  flaggedLegIds: Set<string>;
}

export interface Position {
  assetKey: string;
  symbol: string;
  name: string | null;
  chains: Array<{ chain: ChainId | 'OFF_CHAIN'; quantity: number; marketValue: number | null }>;
  quantity: number;
  knownQuantity: number;
  unknownCostQuantity: number;
  /** Weighted-average cost per known-cost unit; null when no unit has a known cost. */
  averageCost: number | null;
  investedCapital: number;
  currentPrice: number | null;
  priceAsOf: string | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
  totalPnl: number | null;
  /** totalPnl / grossInvested × 100. Null without a known acquisition cost. */
  pnlPct: number | null;
  allocationPct: number | null;
  feesCost: number;
  flags: PositionFlag[];
}

export interface PortfolioTotals {
  totalValue: number;
  investedCapital: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  pnlPct: number | null;
  grossInvested: number;
  feesCost: number;
  /** Market value of units with no known cost — excluded from unrealized PnL. */
  unknownCostValue: number;
  positionsCount: number;
  unpricedPositions: number;
  flaggedPositions: number;
}

export interface CurrentPrice {
  price: number;
  asOf: string;
  source: string;
}
