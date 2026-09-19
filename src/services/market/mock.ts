import type { MarketDataService } from './interface';
import type { TokenOverview, MarketSummary, TrendingToken, MarketMover, SimplePrice, SearchResult } from '@/types';
import { MOCK_TOKENS, MOCK_MARKET_SUMMARY, getMockTrending, getMockGainers, getMockLosers, getMockPriceHistory, searchMockTokens } from './mock-data';
import { sleep } from '@/lib/utils';

export class MockMarketDataService implements MarketDataService {
  private delay = 200; // Simulate network latency

  async getTokenOverview(symbol: string): Promise<TokenOverview | null> {
    await sleep(this.delay);
    return MOCK_TOKENS[symbol.toUpperCase()] || null;
  }

  async getMarketSummary(): Promise<MarketSummary> {
    await sleep(this.delay);
    return MOCK_MARKET_SUMMARY;
  }

  async getTrending(): Promise<TrendingToken[]> {
    await sleep(this.delay);
    return getMockTrending();
  }

  async getTopGainers(): Promise<MarketMover[]> {
    await sleep(this.delay);
    return getMockGainers();
  }

  async getTopLosers(): Promise<MarketMover[]> {
    await sleep(this.delay);
    return getMockLosers();
  }

  async getPriceSeries(symbol: string, days: number): Promise<SimplePrice[]> {
    await sleep(this.delay);
    // The sample generator produces candles; only the close is used, to
    // match the shape the live provider returns.
    return getMockPriceHistory(symbol, days).map((point) => ({
      time: point.time,
      value: point.close,
    }));
  }

  async searchTokens(query: string): Promise<SearchResult[]> {
    await sleep(100);
    return searchMockTokens(query);
  }

  async getOverviewBatch(symbols: readonly string[]): Promise<TokenOverview[]> {
    await sleep(this.delay);
    return symbols
      .map((symbol) => MOCK_TOKENS[symbol.toUpperCase()])
      .filter((token): token is TokenOverview => Boolean(token));
  }
}
