import 'server-only';

import { settleAll } from '../http';
import type { NewsService } from './interface';
import { RssNewsProvider } from './rss';
import { GNewsProvider } from './gnews';
import type { NewsArticle } from '@/types';

/**
 * The news feed, composed from RSS and GNews.
 *
 * RSS needs no key and covers the crypto press plus project blogs; GNews
 * adds wider coverage when a key is configured. Either source failing
 * leaves the other's articles intact.
 */

/** Names an asset in the way a news query should read. */
const QUERY_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  ADA: 'Cardano',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  XRP: 'XRP Ripple',
  DOGE: 'Dogecoin',
  MATIC: 'Polygon crypto',
  POL: 'Polygon crypto',
  UNI: 'Uniswap',
  ARB: 'Arbitrum crypto',
  OP: 'Optimism crypto',
  DOT: 'Polkadot',
  ATOM: 'Cosmos crypto',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  SUI: 'Sui blockchain',
  TON: 'Toncoin',
  LTC: 'Litecoin',
};

export class CompositeNewsService implements NewsService {
  private readonly rss = new RssNewsProvider();
  private readonly gnews?: GNewsProvider;

  constructor(gnewsKey?: string) {
    this.gnews = gnewsKey ? new GNewsProvider(gnewsKey) : undefined;
  }

  private static dedupe(articles: NewsArticle[], limit: number): NewsArticle[] {
    const seen = new Set<string>();
    return articles
      .filter((article) => {
        const key = article.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, limit);
  }

  async getLatest(limit = 10): Promise<NewsArticle[]> {
    const reads: Array<{ label: string; promise: Promise<NewsArticle[]> }> = [
      { label: 'rss', promise: this.rss.fetchAll(limit * 2) },
    ];
    if (this.gnews) {
      reads.push({ label: 'gnews', promise: this.gnews.search('cryptocurrency OR blockchain', 10) });
    }

    const { values, failures } = await settleAll<NewsArticle[]>(reads);
    const articles = CompositeNewsService.dedupe(values.flat(), limit);

    // Every source down is a genuine outage, not an empty news day.
    if (articles.length === 0 && failures.length === reads.length) {
      throw new Error(`no news source responded (${failures.join(', ')})`);
    }

    return articles;
  }

  async getByToken(symbol: string, limit = 5): Promise<NewsArticle[]> {
    const upper = symbol.toUpperCase();
    const name = QUERY_NAMES[upper] ?? upper;

    const reads: Array<{ label: string; promise: Promise<NewsArticle[]> }> = [
      {
        label: 'rss',
        promise: this.rss
          .fetchAll(60)
          .then((all) => all.filter((a) => a.relatedTokens?.includes(upper))),
      },
    ];
    if (this.gnews) {
      reads.push({ label: 'gnews', promise: this.gnews.search(name, 10) });
    }

    const { values } = await settleAll<NewsArticle[]>(reads);
    return CompositeNewsService.dedupe(values.flat(), limit);
  }
}
