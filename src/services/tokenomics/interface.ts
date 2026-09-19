import type { TokenOverview, TokenomicsData } from '@/types';

/**
 * Supply facts are derived from the market snapshot BlockLens already
 * holds. Distribution breakdowns and vesting schedules are not available
 * from any configured provider, so they are simply absent rather than
 * invented.
 */
export interface TokenomicsService {
  getTokenomics(symbol: string, token: TokenOverview): Promise<TokenomicsData | null>;
}
