import 'server-only';

import type { MarketDataService } from './interface';
import { MockMarketDataService } from './mock';
import { CoinGeckoMarketService } from './coingecko';
import { providerKeys, sampleDataEnabled } from '../providers';

let instance: MarketDataService | null = null;

/**
 * CoinGecko serves real data without a key, so market data is live by
 * default; `MARKET_DATA_API_KEY` only raises the rate limit. Sample data
 * is opt-in via `BLOCKLENS_SAMPLE_DATA=true` and is never used to cover
 * for a failed live call.
 */
export function getMarketService(): MarketDataService {
  if (instance) return instance;

  instance = sampleDataEnabled()
    ? new MockMarketDataService()
    : new CoinGeckoMarketService(providerKeys.coingecko);

  return instance;
}

export type { MarketDataService } from './interface';
