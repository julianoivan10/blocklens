import type {
  TokenOverview,
  MarketSummary,
  TrendingToken,
  MarketMover,
  SimplePrice,
  SearchResult,
} from '@/types';

export interface MarketDataService {
  getTokenOverview(symbol: string): Promise<TokenOverview | null>;
  getMarketSummary(): Promise<MarketSummary>;
  getTrending(): Promise<TrendingToken[]>;
  getTopGainers(): Promise<MarketMover[]>;
  getTopLosers(): Promise<MarketMover[]>;
  /** Daily closing prices, oldest first. */
  getPriceSeries(symbol: string, days: number): Promise<SimplePrice[]>;
  searchTokens(query: string): Promise<SearchResult[]>;
  /** Several assets in one round trip, for rails and coverage lists. */
  getOverviewBatch(symbols: readonly string[]): Promise<TokenOverview[]>;
}
