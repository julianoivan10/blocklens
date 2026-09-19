import 'server-only';

import { unstable_cache } from 'next/cache';
import { settleAll } from '../http';
import type { OnchainDataService } from './interface';
import { AlchemyChainService, alchemySupports } from './alchemy';
import { DefiLlamaService } from './defillama';
import { chainSlug } from '../market/symbol-map';
import type { OnchainMetrics } from '@/types';

/**
 * The on-chain reading, composed from two providers.
 *
 * Alchemy supplies block-level facts; DeFiLlama supplies DeFi
 * aggregates. They are independent, so one being down or unconfigured
 * costs only its own fields — the reader still gets the other half
 * rather than an empty section.
 *
 * Returns null only when neither provider has anything for the asset,
 * which the UI renders as "no coverage" rather than as an error.
 */
export class CompositeOnchainService implements OnchainDataService {
  private readonly alchemy?: AlchemyChainService;
  private readonly llama = new DefiLlamaService();

  constructor(alchemyKey?: string) {
    this.alchemy = alchemyKey ? new AlchemyChainService(alchemyKey) : undefined;
  }

  private async read(symbol: string): Promise<OnchainMetrics | null> {
    const reads: Array<{ label: string; promise: Promise<OnchainMetrics | null> }> = [];

    if (this.alchemy && alchemySupports(symbol)) {
      reads.push({ label: `alchemy:${symbol}`, promise: this.alchemy.getChainStats(symbol) });
    }
    if (chainSlug(symbol)) {
      reads.push({ label: `defillama:${symbol}`, promise: this.llama.getChainMetrics(symbol) });
    }
    if (reads.length === 0) return null;

    const { values } = await settleAll<OnchainMetrics | null>(reads);
    const parts = values.filter((v): v is OnchainMetrics => v !== null);
    if (parts.length === 0) return null;

    // Merge, concatenating provenance rather than letting the last
    // provider overwrite it.
    return parts.reduce<OnchainMetrics>((merged, part) => {
      const sources = [...(merged.sources ?? []), ...(part.sources ?? [])];
      const derived = [...(merged.derived ?? []), ...(part.derived ?? [])];
      return {
        ...merged,
        ...part,
        chainLabel: merged.chainLabel ?? part.chainLabel,
        sources: [...new Set(sources)],
        derived: [...new Set(derived)],
      };
    }, {});
  }

  /**
   * Cached for five minutes. Alchemy is reached over POST, which the
   * fetch cache cannot store, so the composed result is cached here
   * instead — otherwise every render would re-run four RPC calls.
   */
  async getMetrics(symbol: string): Promise<OnchainMetrics | null> {
    const upper = symbol.toUpperCase();
    const cached = unstable_cache(
      () => this.read(upper),
      ['onchain', upper],
      { revalidate: 300, tags: ['onchain', `onchain:${upper}`] }
    );
    return cached();
  }
}
