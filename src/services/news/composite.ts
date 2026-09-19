import 'server-only';

import { settleAll } from '../http';
import type { NewsService } from './interface';
import { RssNewsProvider } from './rss';
import { GNewsProvider } from './gnews';
import { completeness, titleKey } from './normalise';
import type { NewsArticle } from '@/types';

/**
 * The news feed, composed from RSS and GNews.
 *
 * RSS needs no key and covers the crypto press plus project blogs; GNews
 * adds wider coverage when a key is configured. Either source failing
 * leaves the other's articles intact — the reader is never told which
 * provider is down, only that some stories are here.
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

  /**
   * Merges the providers' output into one list.
   *
   * When the same story arrives from both, the record carrying more
   * metadata wins — a version with a lead image and a real excerpt beats
   * a bare headline — and the loser's tickers and topics are folded into
   * the winner so nothing learned from either copy is thrown away.
   */
  private static merge(articles: NewsArticle[], limit: number): NewsArticle[] {
    const best = new Map<string, NewsArticle>();

    for (const article of articles) {
      const key = titleKey(article.title);
      const held = best.get(key);

      if (!held) {
        best.set(key, article);
        continue;
      }

      const winner = completeness(article) > completeness(held) ? article : held;
      const loser = winner === article ? held : article;

      best.set(key, {
        ...winner,
        // Fill any gap in the winner from the other copy.
        imageUrl: winner.imageUrl ?? loser.imageUrl,
        summary:
          winner.summary && winner.summary !== winner.title ? winner.summary : loser.summary,
        topics: mergeList(winner.topics, loser.topics),
        tags: mergeList(winner.tags, loser.tags),
        relatedTokens: mergeList(winner.relatedTokens, loser.relatedTokens),
      });
    }

    return [...best.values()]
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, limit);
  }

  async getLatest(limit = 10): Promise<NewsArticle[]> {
    const reads: Array<{ label: string; promise: Promise<NewsArticle[]> }> = [
      { label: 'rss', promise: this.rss.fetchAll(Math.max(limit * 2, 40)) },
    ];
    if (this.gnews) {
      reads.push({
        label: 'gnews',
        promise: this.gnews.search('cryptocurrency OR blockchain', 10),
      });
    }

    const { values, failures } = await settleAll<NewsArticle[]>(reads);
    const articles = CompositeNewsService.merge(values.flat(), limit);

    // Every source down is a genuine outage, not an empty news day — and
    // the caller needs to be able to tell those apart.
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
          .fetchAll(80)
          .then((all) => all.filter((a) => a.relatedTokens?.includes(upper))),
      },
    ];
    if (this.gnews) {
      reads.push({ label: 'gnews', promise: this.gnews.search(name, 10) });
    }

    const { values } = await settleAll<NewsArticle[]>(reads);
    return CompositeNewsService.merge(values.flat(), limit);
  }
}

function mergeList(a?: string[], b?: string[]): string[] | undefined {
  const merged = [...new Set([...(a ?? []), ...(b ?? [])])];
  return merged.length > 0 ? merged : undefined;
}
