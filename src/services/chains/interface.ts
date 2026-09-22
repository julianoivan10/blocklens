import type { ChainId } from '@/lib/portfolio/chains';
import type { RawTransaction } from '@/lib/portfolio/normalize';

/**
 * A read-only view of one chain for one address.
 *
 * Adapters report what the chain says and nothing more: signed asset
 * movements relative to the wallet, the fee the wallet paid, and the
 * balances the chain reports. Classification happens in
 * `lib/portfolio/normalize.ts`, identically for every chain.
 */

export interface ChainCapabilities {
  balances: boolean;
  tokenTransfers: boolean;
  nativeTransactions: boolean;
  transactionDetails: boolean;
  historicalActivity: boolean;
}

export interface ChainBalance {
  assetKey: string;
  symbol: string;
  name: string | null;
  contract: string | null;
  quantity: number;
}

export interface HistoryPage {
  transactions: RawTransaction[];
  /** Opaque resume state; persisted on the wallet between syncs. */
  cursor: unknown;
  /** True once the provider has nothing older (or newer) left to return. */
  complete: boolean;
}

export interface ChainProvider {
  readonly chain: ChainId;
  readonly capabilities: ChainCapabilities;
  getBalances(address: string): Promise<ChainBalance[]>;
  /**
   * Fetches up to `budget` units of history (pages or transactions,
   * adapter-defined) from `cursor`, so a long history is imported over
   * several bounded requests rather than one that times out.
   */
  getHistory(address: string, cursor: unknown, budget: number): Promise<HistoryPage>;
}
