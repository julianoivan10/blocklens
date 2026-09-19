import 'server-only';

import { cache } from 'react';
import { getMarketService } from '@/services/market';
import { attempt, type DataResult } from '@/services/result';
import { sampleDataEnabled } from '@/services/providers';
import type {
  MarketMover,
  MarketSummary,
  SimplePrice,
  TokenOverview,
  TrendingToken,
} from '@/types';

/**
 * Server-side market reads.
 *
 * The provider services are reached only from here. `server-only` makes
 * an accidental client import a build error rather than a silent leak.
 * `cache()` dedupes within a single render pass, so two components
 * asking for the same asset cost one provider call.
 *
 * Two flavours are exported. The plain reads throw, and are used where a
 * failure should reach an error boundary. The `*Result` reads return a
 * `DataResult`, and are used where the view must render an explicit
 * "unavailable" state instead of an invented number.
 */

/** Which provenance any successful read should be labelled with. */
function provenance() {
  return sampleDataEnabled() ? ('sample' as const) : ('live' as const);
}

export const getTokenSnapshot = cache(
  async (symbol: string): Promise<TokenOverview | null> =>
    getMarketService().getTokenOverview(symbol)
);

export const getMarketOverview = cache(
  async (): Promise<MarketSummary> => getMarketService().getMarketSummary()
);

export const getTrendingAssets = cache(
  async (): Promise<TrendingToken[]> => getMarketService().getTrending()
);

export const getPriceSeries = cache(
  async (symbol: string, days: number): Promise<SimplePrice[]> =>
    getMarketService().getPriceSeries(symbol, days)
);

export const getMovers = cache(
  async (): Promise<{ gainers: MarketMover[]; losers: MarketMover[] }> => {
    const service = getMarketService();
    const [gainers, losers] = await Promise.all([
      service.getTopGainers(),
      service.getTopLosers(),
    ]);
    return { gainers, losers };
  }
);

export const getAssetRail = cache(
  async (symbols: readonly string[]): Promise<TokenOverview[]> =>
    getMarketService().getOverviewBatch(symbols)
);

export const searchAssets = cache(async (query: string) =>
  getMarketService().searchTokens(query)
);

/* ---------- result-returning reads, for views that must show
              an explicit unavailable state ---------- */

export const getMarketOverviewResult = cache(
  async (): Promise<DataResult<MarketSummary>> =>
    attempt('Market data', getMarketOverview, provenance())
);

export const getAssetRailResult = cache(
  async (symbols: readonly string[]): Promise<DataResult<TokenOverview[]>> =>
    attempt('Market data', () => getAssetRail(symbols), provenance())
);

export const getTrendingResult = cache(
  async (): Promise<DataResult<TrendingToken[]>> =>
    attempt('Trending', getTrendingAssets, provenance())
);

export const getMoversResult = cache(
  async (): Promise<DataResult<{ gainers: MarketMover[]; losers: MarketMover[] }>> =>
    attempt('Market movers', getMovers, provenance())
);
