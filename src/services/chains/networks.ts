import 'server-only';

import type { ChainId } from '@/lib/portfolio/chains';

/**
 * Alchemy transport details per chain. Kept out of the shared chain
 * registry because they are a property of the provider, not the chain.
 *
 * `internalTransfers`: Alchemy reports internal (contract-to-wallet)
 * native transfers only on Ethereum and Polygon mainnet. On other chains
 * a native amount received from a contract call is not seen, which the
 * balance reconciliation surfaces.
 */
export const ALCHEMY_NETWORKS: Record<ChainId, { rpc: string; prices: string; internalTransfers: boolean }> = {
  ETHEREUM: { rpc: 'eth-mainnet', prices: 'eth-mainnet', internalTransfers: true },
  BASE: { rpc: 'base-mainnet', prices: 'base-mainnet', internalTransfers: false },
  ARBITRUM: { rpc: 'arb-mainnet', prices: 'arb-mainnet', internalTransfers: false },
  OPTIMISM: { rpc: 'opt-mainnet', prices: 'opt-mainnet', internalTransfers: false },
  POLYGON: { rpc: 'polygon-mainnet', prices: 'polygon-mainnet', internalTransfers: true },
  SOLANA: { rpc: 'solana-mainnet', prices: 'solana-mainnet', internalTransfers: false },
};

export function alchemyRpcUrl(chain: ChainId, apiKey: string): string {
  return `https://${ALCHEMY_NETWORKS[chain].rpc}.g.alchemy.com/v2/${apiKey}`;
}
