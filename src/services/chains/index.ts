import 'server-only';

import { providerKeys } from '../providers';
import { AlchemyEvmProvider } from './alchemy-evm';
import { AlchemySolanaProvider } from './alchemy-solana';
import type { ChainProvider } from './interface';
import { CHAINS, type ChainId } from '@/lib/portfolio/chains';

/**
 * Chain provider registry. The only place that maps a chain to an
 * adapter; callers ask for a chain and receive the interface.
 */
const instances = new Map<ChainId, ChainProvider>();

export function chainProvidersConfigured(): boolean {
  return Boolean(providerKeys.alchemy);
}

export function getChainProvider(chain: ChainId): ChainProvider {
  const cached = instances.get(chain);
  if (cached) return cached;

  const key = providerKeys.alchemy;
  if (!key) {
    throw new Error('ALCHEMY_API_KEY is not set; wallet import is unavailable in this environment.');
  }

  const provider =
    CHAINS[chain].family === 'solana' ? new AlchemySolanaProvider(key) : new AlchemyEvmProvider(chain, key);
  instances.set(chain, provider);
  return provider;
}

export type { ChainProvider, ChainBalance, ChainCapabilities } from './interface';
