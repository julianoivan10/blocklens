import 'server-only';

import { fetchJson } from '../http';
import { chainSlug } from '../market/symbol-map';
import type { OnchainMetrics } from '@/types';

/**
 * DeFiLlama adapter — DeFi metrics for an asset's own chain.
 *
 * DeFiLlama's public API requires no authentication, which is why no
 * `DEFILLAMA_API_KEY` exists in this project: adding one would imply a
 * credential that is never sent.
 *
 * Only two readings are taken, both genuinely reported by the API: chain
 * TVL, and 24-hour fees and revenue. Nothing is inferred beyond that.
 */

const BASE = 'https://api.llama.fi';

const REVALIDATE = {
  chains: 600,
  fees: 900,
} as const;

interface LlamaChain {
  name: string;
  tvl: number | null;
  gecko_id: string | null;
  tokenSymbol: string | null;
}

interface LlamaFeesOverview {
  total24h?: number | null;
  /** Protocol revenue, where the chain reports it separately. */
  totalRevenue24h?: number | null;
  change_1d?: number | null;
}

export class DefiLlamaService {
  /** DeFiLlama's fee endpoints are keyed by a lowercase chain slug. */
  private static feeSlug(chain: string): string {
    return chain.toLowerCase().replace(/\s+/g, '-');
  }

  private async chainTvl(chain: string): Promise<{ tvl: number } | null> {
    const chains = await fetchJson<LlamaChain[]>(`${BASE}/v2/chains`, {
      provider: 'defillama',
      revalidate: REVALIDATE.chains,
      tags: ['defillama', 'chains'],
    });

    const match = chains.find((c) => c.name.toLowerCase() === chain.toLowerCase());
    if (!match || typeof match.tvl !== 'number') return null;
    return { tvl: match.tvl };
  }

  private async chainFees(chain: string): Promise<LlamaFeesOverview | null> {
    const params = 'excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
    // Not every chain has a fees dataset; a 404 here is an absent
    // dataset, not a failure worth surfacing.
    return fetchJson<LlamaFeesOverview>(
      `${BASE}/overview/fees/${DefiLlamaService.feeSlug(chain)}?${params}`,
      {
        provider: 'defillama',
        revalidate: REVALIDATE.fees,
        tags: ['defillama', 'fees'],
      }
    ).catch(() => null);
  }

  /**
   * DeFi readings for the chain an asset is native to. Returns null for
   * assets that are not a chain's gas token, where chain TVL would be
   * meaningless.
   */
  async getChainMetrics(symbol: string): Promise<OnchainMetrics | null> {
    const chain = chainSlug(symbol);
    if (!chain) return null;

    const [tvl, fees] = await Promise.all([this.chainTvl(chain), this.chainFees(chain)]);
    if (!tvl && !fees?.total24h) return null;

    const metrics: OnchainMetrics = {
      chainLabel: chain,
      sources: ['DeFiLlama'],
    };

    if (tvl) metrics.tvl = tvl.tvl;
    if (typeof fees?.total24h === 'number') metrics.fees24h = fees.total24h;
    // change_1d belongs to the fees series. TVL has no change field on
    // this endpoint, so it simply goes unreported rather than borrowing
    // a number that means something else.
    if (typeof fees?.change_1d === 'number') metrics.feesChange24h = fees.change_1d;
    if (typeof fees?.totalRevenue24h === 'number') metrics.revenue24h = fees.totalRevenue24h;

    return metrics;
  }
}
