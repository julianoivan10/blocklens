import { CHAINS, nativeAssetKey, type ChainId } from './chains';
import type { TxType } from './types';

/**
 * Transaction normalisation and classification.
 *
 * Chain adapters reduce each on-chain transaction to a group of signed
 * asset movements relative to the tracked wallet. This module turns a
 * group into typed ledger legs. It is chain-agnostic and pure.
 *
 * Classification rules, in order:
 *
 *  1. The wallet both sent and received, and the assets differ → SWAP
 *     (every leg of the group). Value in ≈ value out, so a single
 *     unpriced leg may take its value from the priced side.
 *  2. Only received → TRANSFER_IN. Internal when the sender is another
 *     address the user tracks. An external receipt is NOT assumed to be
 *     a purchase or income: its cost basis is unknown, and priced ones
 *     are flagged for review.
 *  3. Only sent → TRANSFER_OUT. Internal when the recipient is tracked.
 *     A transfer is never treated as a sale.
 *  4. Sent and received the same asset only → separate transfers,
 *     flagged, because the purpose (refund? loop?) cannot be inferred.
 *  5. The network fee, when the wallet paid it → a FEE leg in the gas asset.
 *
 * BUY and SELL are never inferred from chain data: an on-chain movement
 * does not say whether fiat was involved. They come from manual entries
 * or from the user reclassifying a leg.
 */

export interface RawMovement {
  /** Provider-unique id of this movement. */
  externalId: string;
  assetKey: string;
  symbol: string;
  name?: string | null;
  contract?: string | null;
  /** Signed, human units: positive = into the wallet. */
  amount: number;
  /** The other side of this movement, when the provider reports it. */
  counterparty: string | null;
  /**
   * Set only when the adapter has unambiguous evidence of intent, such as
   * the Solana Stake program being invoked. Never set by guesswork.
   */
  hint?: 'STAKE' | 'UNSTAKE';
}

export interface RawTransaction {
  chain: ChainId;
  hash: string;
  timestamp: number;
  wallet: string;
  failed: boolean;
  movements: RawMovement[];
  /** Fee in the chain's gas asset, when this wallet paid it. */
  fee: number | null;
  /** Transaction-level sender/recipient, for display. */
  from: string | null;
  to: string | null;
}

export interface PriceQuote {
  price: number;
  source: string;
}

export type HistoricalPriceLookup = (assetKey: string, timestampMs: number) => PriceQuote | null;

export interface NormalizedLeg {
  externalId: string;
  groupId: string;
  chain: ChainId;
  hash: string;
  timestamp: number;
  fromAddress: string | null;
  toAddress: string | null;
  assetKey: string;
  symbol: string;
  assetName: string | null;
  contract: string | null;
  amount: number;
  direction: 1 | -1;
  usdValue: number | null;
  priceUsd: number | null;
  priceSource: string | null;
  type: TxType;
  status: 'CONFIRMED' | 'FAILED';
  isInternal: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  metadata: Record<string, unknown>;
}

const REVIEW = {
  externalIn:
    'Received from an address you do not track. Its cost basis is unknown until you classify it — as a purchase with a price, or as a transfer from an account you own.',
  sameAssetBothWays: 'This transaction sent and received the same asset; its purpose could not be determined.',
  unpricedSwap: 'Swap where no leg could be priced, so no value was booked for either side.',
} as const;

/** Addresses compare case-insensitively on EVM and exactly on Solana. */
function sameAddress(chain: ChainId, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return CHAINS[chain].family === 'evm' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isOwn(chain: ChainId, address: string | null, own: ReadonlySet<string>): boolean {
  if (!address) return false;
  return own.has(CHAINS[chain].family === 'evm' ? address.toLowerCase() : address);
}

export function classifyTransaction(
  tx: RawTransaction,
  ownAddresses: ReadonlySet<string>,
  priceAt: HistoricalPriceLookup
): NormalizedLeg[] {
  const groupId = `${tx.chain}:${tx.hash}`;

  // Merge movements of the same asset into one net movement per
  // direction; drop dust and self-transfers (wallet → wallet).
  const moves = tx.movements.filter(
    (m) => Math.abs(m.amount) > 0 && !sameAddress(tx.chain, m.counterparty, tx.wallet)
  );

  const ins = moves.filter((m) => m.amount > 0);
  const outs = moves.filter((m) => m.amount < 0);
  const inKeys = new Set(ins.map((m) => m.assetKey));
  const outKeys = new Set(outs.map((m) => m.assetKey));
  const differentAssets =
    ins.length > 0 && outs.length > 0 && [...inKeys].some((k) => !outKeys.has(k));
  const sameAssetBothWays = ins.length > 0 && outs.length > 0 && !differentAssets;

  const legs: NormalizedLeg[] = [];

  for (const m of moves) {
    const direction: 1 | -1 = m.amount > 0 ? 1 : -1;
    const amount = Math.abs(m.amount);
    const quote = priceAt(m.assetKey, tx.timestamp);

    let type: TxType;
    let isInternal = false;
    let needsReview = false;
    let reviewReason: string | null = null;

    if (tx.failed) {
      // A reverted transaction moves no assets; only its fee is real.
      continue;
    } else if (m.hint) {
      type = m.hint;
    } else if (differentAssets) {
      type = 'SWAP';
    } else if (direction === 1) {
      type = 'TRANSFER_IN';
      isInternal = isOwn(tx.chain, m.counterparty, ownAddresses);
      if (!isInternal && quote) {
        needsReview = true;
        reviewReason = REVIEW.externalIn;
      }
    } else {
      type = 'TRANSFER_OUT';
      isInternal = isOwn(tx.chain, m.counterparty, ownAddresses);
    }

    if (sameAssetBothWays) {
      needsReview = true;
      reviewReason = REVIEW.sameAssetBothWays;
    }

    legs.push({
      externalId: m.externalId,
      groupId,
      chain: tx.chain,
      hash: tx.hash,
      timestamp: tx.timestamp,
      fromAddress: direction === 1 ? m.counterparty : tx.wallet,
      toAddress: direction === 1 ? tx.wallet : m.counterparty,
      assetKey: m.assetKey,
      symbol: m.symbol,
      assetName: m.name ?? null,
      contract: m.contract ?? null,
      amount,
      direction,
      usdValue: quote ? amount * quote.price : null,
      priceUsd: quote?.price ?? null,
      priceSource: quote?.source ?? null,
      type,
      status: 'CONFIRMED',
      isInternal,
      needsReview,
      reviewReason,
      metadata: { txFrom: tx.from, txTo: tx.to },
    });
  }

  if (differentAssets) impliedSwapValues(legs);

  if (tx.fee !== null && tx.fee > 0) {
    const chainInfo = CHAINS[tx.chain];
    const assetKey = nativeAssetKey(tx.chain);
    const quote = priceAt(assetKey, tx.timestamp);
    legs.push({
      externalId: `${groupId}:fee`,
      groupId,
      chain: tx.chain,
      hash: tx.hash,
      timestamp: tx.timestamp,
      fromAddress: tx.wallet,
      toAddress: null,
      assetKey,
      symbol: chainInfo.nativeSymbol,
      assetName: chainInfo.nativeName,
      contract: null,
      amount: tx.fee,
      direction: -1,
      usdValue: quote ? tx.fee * quote.price : null,
      priceUsd: quote?.price ?? null,
      priceSource: quote?.source ?? null,
      type: 'FEE',
      status: tx.failed ? 'FAILED' : 'CONFIRMED',
      isInternal: false,
      needsReview: false,
      reviewReason: null,
      metadata: { txFrom: tx.from, txTo: tx.to },
    });
  }

  return legs;
}

/**
 * In a swap, value given ≈ value received. When exactly one leg is
 * unpriced and every leg on the other side is priced, that leg takes the
 * other side's total. Anything less certain is left unpriced and flagged.
 */
function impliedSwapValues(legs: NormalizedLeg[]) {
  const sides = [legs.filter((l) => l.direction === 1), legs.filter((l) => l.direction === -1)];
  for (const [side, other] of [sides, [sides[1], sides[0]]]) {
    const unpriced = side.filter((l) => l.usdValue === null);
    if (unpriced.length !== 1) continue;
    if (other.length === 0 || other.some((l) => l.usdValue === null)) continue;
    const total = other.reduce((s, l) => s + (l.usdValue as number), 0);
    const leg = unpriced[0];
    leg.usdValue = total;
    leg.priceUsd = leg.amount > 0 ? total / leg.amount : null;
    leg.priceSource = 'implied by swap counter-leg';
  }
  if (legs.every((l) => l.usdValue === null)) {
    for (const l of legs) {
      l.needsReview = true;
      l.reviewReason = REVIEW.unpricedSwap;
    }
  }
}
