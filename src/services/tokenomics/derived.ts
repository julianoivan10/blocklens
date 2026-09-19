import type { TokenomicsService } from './interface';
import type { TokenOverview, TokenomicsData } from '@/types';

/**
 * Supply facts, derived from the market snapshot.
 *
 * Only what is genuinely reported: circulating, total and maximum
 * supply, and the share of the cap already issued. A distribution
 * breakdown (team, treasury, investors) and an unlock schedule would
 * both require a tokenomics data provider that is not part of this
 * stack — so they are omitted, and the research page renders without
 * them rather than showing plausible-looking fictions.
 */
export class DerivedTokenomicsService implements TokenomicsService {
  async getTokenomics(symbol: string, token: TokenOverview): Promise<TokenomicsData | null> {
    if (!token.circulatingSupply) return null;

    const cap = token.maxSupply ?? token.totalSupply;
    const circulatingPercentage = cap && cap > 0 ? (token.circulatingSupply / cap) * 100 : 100;

    // Two slices, both measured: what circulates and what does not.
    const distribution =
      cap && cap > token.circulatingSupply
        ? [
            {
              label: 'Circulating',
              percentage: Number(circulatingPercentage.toFixed(1)),
              amount: token.circulatingSupply,
            },
            {
              label: 'Not yet issued',
              percentage: Number((100 - circulatingPercentage).toFixed(1)),
              amount: cap - token.circulatingSupply,
            },
          ]
        : undefined;

    return {
      circulatingSupply: token.circulatingSupply,
      totalSupply: token.totalSupply,
      maxSupply: token.maxSupply,
      circulatingPercentage: Number(circulatingPercentage.toFixed(1)),
      distribution,
    };
  }
}
