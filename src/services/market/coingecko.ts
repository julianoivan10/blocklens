import 'server-only';

import { fetchJson, ProviderError } from '../http';
import type { MarketDataService } from './interface';
import { FEATURED_SYMBOLS, knownId } from './symbol-map';
import type {
  MarketMover,
  MarketSummary,
  SearchResult,
  SimplePrice,
  TokenOverview,
  TrendingToken,
} from '@/types';

/**
 * CoinGecko market data adapter.
 *
 * Raw provider shapes stay inside this file: everything returned is a
 * normalised BlockLens type, so a provider change never reaches a
 * component. Nothing here reads the key directly except `authHeaders` —
 * the key is server-side only and is never part of a URL, which would
 * otherwise leak it into logs.
 *
 * Cache windows are chosen per endpoint: prices move constantly,
 * descriptions and links do not.
 */

const PUBLIC_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

const REVALIDATE = {
  price: 60,
  summary: 300,
  trending: 600,
  series: 900,
  profile: 86_400,
  search: 3_600,
} as const;

/* ---------- provider response shapes (never exported) ---------- */

interface CgMarket {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
}

interface CgGlobal {
  data: {
    active_cryptocurrencies: number;
    total_market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

interface CgCoin {
  id: string;
  symbol: string;
  name: string;
  categories?: (string | null)[];
  description?: { en?: string };
  links?: {
    homepage?: string[];
    whitepaper?: string;
    repos_url?: { github?: string[] };
    twitter_screen_name?: string;
    telegram_channel_identifier?: string;
    subreddit_url?: string;
  };
}

interface CgTrending {
  coins: Array<{
    item: {
      id: string;
      symbol: string;
      name: string;
      large?: string;
      market_cap_rank: number | null;
      data?: { price?: number; price_change_percentage_24h?: { usd?: number } };
    };
  }>;
}

interface CgSearch {
  coins: Array<{
    id: string;
    symbol: string;
    name: string;
    large?: string;
    market_cap_rank: number | null;
  }>;
}

/** `{ prices: [[timeMs, price], ...] }` */
interface CgMarketChart {
  prices: Array<[number, number]>;
}

/* ---------- helpers ---------- */

function firstNonEmpty(values?: (string | null | undefined)[]): string | undefined {
  return values?.find((v): v is string => Boolean(v && v.trim().length > 0));
}

/** Strips the HTML CoinGecko embeds in descriptions, and truncates. */
function plainText(html: string | undefined, maxLength = 700): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  // Cut at a sentence boundary where there is one nearby.
  const clipped = text.slice(0, maxLength);
  const lastStop = clipped.lastIndexOf('. ');
  return (lastStop > maxLength * 0.6 ? clipped.slice(0, lastStop + 1) : `${clipped.trim()}…`);
}

function isoDate(value: string | null): string {
  return value ?? '';
}

/**
 * CoinGecko's category list mixes real classifications with index
 * memberships, venture-fund portfolios and defunct-exchange holdings —
 * "FTX Holdings" and "a16z Portfolio" say nothing about what an asset
 * *is*. Only genuine classifications survive, and a self-referential
 * "<Name> Ecosystem" is dropped too.
 */
const CATEGORY_NOISE = /\b(index|portfolio|holdings|treasury|etf|companies)\b/i;

function usefulCategories(raw: (string | null)[] | undefined, name: string): string[] | undefined {
  if (!raw) return undefined;
  const selfEcosystem = `${name.toLowerCase()} ecosystem`;
  const kept = raw
    .filter((c): c is string => Boolean(c))
    .filter((c) => !CATEGORY_NOISE.test(c))
    .filter((c) => c.toLowerCase() !== selfEcosystem)
    .slice(0, 3);
  return kept.length > 0 ? kept : undefined;
}

export class CoinGeckoMarketService implements MarketDataService {
  private readonly base: string;
  private readonly key?: string;

  constructor(apiKey?: string) {
    this.key = apiKey?.trim() || undefined;
    // A pro key must go to the pro host; demo and keyless both use the
    // public host.
    this.base = this.key?.startsWith('CG-') ? PUBLIC_BASE : this.key ? PRO_BASE : PUBLIC_BASE;
  }

  /** The key travels in a header, never in the query string. */
  private authHeaders(): Record<string, string> {
    if (!this.key) return {};
    return this.key.startsWith('CG-')
      ? { 'x-cg-demo-api-key': this.key }
      : { 'x-cg-pro-api-key': this.key };
  }

  private get<T>(path: string, revalidate: number, tag: string): Promise<T> {
    return fetchJson<T>(`${this.base}${path}`, {
      provider: 'coingecko',
      revalidate,
      headers: this.authHeaders(),
      tags: ['coingecko', tag],
    });
  }

  /**
   * Ticker → id. Curated map first; otherwise CoinGecko's own search,
   * preferring an exact ticker match with the best market-cap rank so a
   * lookup does not land on an obscure namesake.
   */
  private async resolveId(symbol: string): Promise<string | null> {
    const upper = symbol.toUpperCase();
    const mapped = knownId(upper);
    if (mapped) return mapped;

    const results = await this.get<CgSearch>(
      `/search?query=${encodeURIComponent(symbol)}`,
      REVALIDATE.search,
      'search'
    );

    const exact = results.coins
      .filter((c) => c.symbol.toUpperCase() === upper)
      .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));

    return exact[0]?.id ?? results.coins[0]?.id ?? null;
  }

  private async markets(ids: string[]): Promise<CgMarket[]> {
    if (ids.length === 0) return [];
    const params = new URLSearchParams({
      vs_currency: 'usd',
      ids: ids.join(','),
      price_change_percentage: '7d,30d',
      sparkline: 'false',
    });
    return this.get<CgMarket[]>(`/coins/markets?${params}`, REVALIDATE.price, 'markets');
  }

  private toOverview(row: CgMarket, profile?: CgCoin): TokenOverview {
    return {
      id: row.id,
      symbol: row.symbol.toUpperCase(),
      name: row.name,
      image: row.image ?? undefined,
      currentPrice: row.current_price ?? 0,
      marketCap: row.market_cap ?? 0,
      marketCapRank: row.market_cap_rank ?? 0,
      totalVolume: row.total_volume ?? 0,
      priceChange24h: row.price_change_24h ?? 0,
      priceChangePercentage24h: row.price_change_percentage_24h ?? 0,
      priceChangePercentage7d: row.price_change_percentage_7d_in_currency ?? undefined,
      priceChangePercentage30d: row.price_change_percentage_30d_in_currency ?? undefined,
      circulatingSupply: row.circulating_supply ?? 0,
      totalSupply: row.total_supply,
      maxSupply: row.max_supply,
      ath: row.ath ?? 0,
      athDate: isoDate(row.ath_date),
      atl: row.atl ?? 0,
      atlDate: isoDate(row.atl_date),
      description: plainText(profile?.description?.en),
      categories: usefulCategories(profile?.categories, row.name),
      links: profile
        ? {
            homepage: firstNonEmpty(profile.links?.homepage),
            whitepaper: profile.links?.whitepaper || undefined,
            github: firstNonEmpty(profile.links?.repos_url?.github),
            twitter: profile.links?.twitter_screen_name
              ? `https://x.com/${profile.links.twitter_screen_name}`
              : undefined,
            telegram: profile.links?.telegram_channel_identifier
              ? `https://t.me/${profile.links.telegram_channel_identifier}`
              : undefined,
            reddit: profile.links?.subreddit_url || undefined,
          }
        : undefined,
    };
  }

  async getTokenOverview(symbol: string): Promise<TokenOverview | null> {
    const id = await this.resolveId(symbol);
    if (!id) return null;

    const [rows, profile] = await Promise.all([
      this.markets([id]),
      // The profile is supplementary: a failure here costs the
      // description and links, not the whole asset.
      this.get<CgCoin>(
        `/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
        REVALIDATE.profile,
        'profile'
      ).catch(() => undefined),
    ]);

    const row = rows[0];
    if (!row) return null;

    return this.toOverview(row, profile);
  }

  async getMarketSummary(): Promise<MarketSummary> {
    const { data } = await this.get<CgGlobal>('/global', REVALIDATE.summary, 'global');

    const totalMarketCap = data.total_market_cap?.usd;
    if (typeof totalMarketCap !== 'number') {
      throw new ProviderError('coingecko', 'global response missing USD market cap');
    }

    return {
      totalMarketCap,
      totalVolume24h: data.total_volume?.usd ?? 0,
      btcDominance: data.market_cap_percentage?.btc ?? 0,
      ethDominance: data.market_cap_percentage?.eth ?? 0,
      marketCapChange24h: data.market_cap_change_percentage_24h_usd ?? 0,
      activeCryptocurrencies: data.active_cryptocurrencies ?? 0,
    };
  }

  async getTrending(): Promise<TrendingToken[]> {
    const data = await this.get<CgTrending>('/search/trending', REVALIDATE.trending, 'trending');

    return data.coins.slice(0, 7).map((entry, index) => ({
      id: entry.item.id,
      symbol: entry.item.symbol.toUpperCase(),
      name: entry.item.name,
      image: entry.item.large,
      currentPrice: entry.item.data?.price ?? 0,
      priceChangePercentage24h: entry.item.data?.price_change_percentage_24h?.usd ?? 0,
      marketCap: 0,
      rank: entry.item.market_cap_rank ?? index + 1,
    }));
  }

  /**
   * Movers are derived from the top of the market by capitalisation
   * rather than from the whole listing: a global gainers board is
   * dominated by microcaps and tells a researcher nothing.
   */
  private async topMovers(): Promise<CgMarket[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: '100',
      page: '1',
      sparkline: 'false',
    });
    return this.get<CgMarket[]>(`/coins/markets?${params}`, REVALIDATE.price, 'markets');
  }

  private static toMover(row: CgMarket): MarketMover {
    return {
      id: row.id,
      symbol: row.symbol.toUpperCase(),
      name: row.name,
      image: row.image ?? undefined,
      currentPrice: row.current_price ?? 0,
      priceChangePercentage24h: row.price_change_percentage_24h ?? 0,
    };
  }

  async getTopGainers(): Promise<MarketMover[]> {
    const rows = await this.topMovers();
    return rows
      .filter((r) => typeof r.price_change_percentage_24h === 'number')
      .sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0))
      .slice(0, 5)
      .map(CoinGeckoMarketService.toMover);
  }

  async getTopLosers(): Promise<MarketMover[]> {
    const rows = await this.topMovers();
    return rows
      .filter((r) => typeof r.price_change_percentage_24h === 'number')
      .sort((a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0))
      .slice(0, 5)
      .map(CoinGeckoMarketService.toMover);
  }

  /**
   * Daily closing prices.
   *
   * Deliberately a close series rather than candlesticks: CoinGecko's
   * OHLC endpoint only offers 4-day granularity beyond a 30-day window,
   * which would mean either a misleadingly coarse chart or synthesising
   * highs and lows that no provider reported. BlockLens is a research
   * product, not a trading terminal — a clean daily close line is both
   * the honest option and the more readable one.
   */
  async getPriceSeries(symbol: string, days: number): Promise<SimplePrice[]> {
    const id = await this.resolveId(symbol);
    if (!id) return [];

    const window = Math.max(1, Math.min(365, Math.round(days)));
    const params = new URLSearchParams({
      vs_currency: 'usd',
      days: String(window),
      interval: 'daily',
    });

    const chart = await this.get<CgMarketChart>(
      `/coins/${id}/market_chart?${params}`,
      REVALIDATE.series,
      'market_chart'
    );

    return (chart.prices ?? [])
      .filter(([timeMs, price]) => Number.isFinite(timeMs) && Number.isFinite(price))
      .map(([timeMs, price]) => ({
        // BlockLens uses seconds; CoinGecko sends milliseconds.
        time: Math.floor(timeMs / 1000),
        value: price,
      }));
  }

  async searchTokens(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const data = await this.get<CgSearch>(
      `/search?query=${encodeURIComponent(trimmed)}`,
      REVALIDATE.search,
      'search'
    );

    return data.coins
      .slice(0, 12)
      .map((coin) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        image: coin.large,
        marketCapRank: coin.market_cap_rank ?? undefined,
      }))
      // Ranked listings first; unranked long-tail entries after.
      .sort((a, b) => (a.marketCapRank ?? 1e9) - (b.marketCapRank ?? 1e9));
  }

  /** Several assets in one request, for the landing rail. */
  async getOverviewBatch(symbols: readonly string[]): Promise<TokenOverview[]> {
    const ids = symbols
      .map((s) => knownId(s))
      .filter((id): id is string => Boolean(id));

    const rows = await this.markets(ids);
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Preserve the caller's order rather than the provider's.
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is CgMarket => Boolean(row))
      .map((row) => this.toOverview(row));
  }

  async getFeatured(): Promise<TokenOverview[]> {
    return this.getOverviewBatch(FEATURED_SYMBOLS);
  }
}
