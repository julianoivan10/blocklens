import 'server-only';

import { cache } from 'react';
import { getNewsService } from '@/services/news';
import { attempt, type DataResult } from '@/services/result';
import { sampleDataEnabled } from '@/services/providers';
import type { NewsArticle } from '@/types';

/**
 * Server-side news reads.
 *
 * The feed is fetched once per request and everything else — slug lookup,
 * filtering, facet counts, related stories — is derived from that one
 * list. That is why no persistence is needed for article routes: the
 * provider responses are already cached by the fetch layer, and a slug is
 * a pure function of the article's title and URL, so the same slug
 * resolves to the same article on every request.
 */

/** How deep the feed page reads. Also the pool slug lookup searches. */
export const FEED_DEPTH = 60;

function provenance() {
  return sampleDataEnabled() ? ('sample' as const) : ('live' as const);
}

export const getLatestNews = cache(
  async (limit = 10): Promise<NewsArticle[]> => getNewsService().getLatest(limit)
);

export const getNewsForAsset = cache(
  async (symbol: string, limit = 5): Promise<NewsArticle[]> =>
    getNewsService().getByToken(symbol, limit)
);

/**
 * The feed, as a result rather than a throw, so the page can render an
 * explicit "temporarily unavailable" state instead of an error boundary.
 */
export const getNewsFeedResult = cache(
  async (limit = FEED_DEPTH): Promise<DataResult<NewsArticle[]>> =>
    attempt('News', () => getLatestNews(limit), provenance())
);

/**
 * One article by slug.
 *
 * Resolved out of the cached feed rather than from a database. Returns
 * `null` for a slug that is not in the current window — an article that
 * has aged out is a 404, not an error.
 */
export const getArticleBySlug = cache(
  async (slug: string): Promise<NewsArticle | null> => {
    const articles = await getLatestNews(FEED_DEPTH);
    return articles.find((article) => article.slug === slug) ?? null;
  }
);

/**
 * Stories to read next.
 *
 * Preference order: shares a topic, then shares an asset, then simply
 * recent. Never the article itself.
 */
export const getRelatedArticles = cache(
  async (slug: string, limit = 4): Promise<NewsArticle[]> => {
    const articles = await getLatestNews(FEED_DEPTH);
    const current = articles.find((a) => a.slug === slug);
    if (!current) return [];

    const others = articles.filter((a) => a.slug !== slug);
    const scored = others.map((article) => {
      const sharedTopics = (article.topics ?? []).filter((t) =>
        current.topics?.includes(t)
      ).length;
      const sharedTokens = (article.relatedTokens ?? []).filter((t) =>
        current.relatedTokens?.includes(t)
      ).length;
      return { article, score: sharedTopics * 2 + sharedTokens };
    });

    return scored
      .sort(
        (a, b) =>
          b.score - a.score ||
          Date.parse(b.article.publishedAt) - Date.parse(a.article.publishedAt)
      )
      .slice(0, limit)
      .map((entry) => entry.article);
  }
);

/* ---------------- filtering ---------------- */

export interface Facet {
  /** Query-string value. */
  value: string;
  label: string;
  count: number;
}

export interface FeedFacets {
  topics: Facet[];
  assets: Facet[];
}

const ASSET_LABELS: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XRP: 'XRP',
  ADA: 'Cardano',
  AVAX: 'Avalanche',
  DOGE: 'Dogecoin',
  LINK: 'Chainlink',
  MATIC: 'Polygon',
  UNI: 'Uniswap',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  DOT: 'Polkadot',
  LTC: 'Litecoin',
  USDT: 'Tether',
  BNB: 'BNB',
};

/**
 * Filter options, counted from the articles actually in hand.
 *
 * Deliberately derived rather than declared. A fixed list of categories
 * would mean chips that match nothing, or a taxonomy BlockLens invented
 * and the sources never agreed to — so a topic only appears here when a
 * source really filed an article under it, and an asset only appears when
 * an article really mentions it. A chip with a count of zero cannot
 * exist.
 */
export function buildFacets(articles: NewsArticle[]): FeedFacets {
  const topicCounts = new Map<string, number>();
  const assetCounts = new Map<string, number>();

  for (const article of articles) {
    for (const topic of article.topics ?? []) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    for (const asset of article.relatedTokens ?? []) {
      assetCounts.set(asset, (assetCounts.get(asset) ?? 0) + 1);
    }
  }

  const byCount = (a: Facet, b: Facet) => b.count - a.count || a.label.localeCompare(b.label);

  return {
    topics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ value: topic.toLowerCase(), label: topic, count }))
      .filter((facet) => facet.count >= 2)
      .sort(byCount)
      .slice(0, 6),
    assets: [...assetCounts.entries()]
      .map(([asset, count]) => ({
        value: asset.toLowerCase(),
        label: ASSET_LABELS[asset] ?? asset,
        count,
      }))
      .filter((facet) => facet.count >= 2)
      .sort(byCount)
      .slice(0, 6),
  };
}

export interface FeedFilter {
  topic?: string;
  asset?: string;
}

export function applyFilter(articles: NewsArticle[], filter: FeedFilter): NewsArticle[] {
  return articles.filter((article) => {
    if (filter.topic) {
      const topics = (article.topics ?? []).map((t) => t.toLowerCase());
      if (!topics.includes(filter.topic)) return false;
    }
    if (filter.asset) {
      const assets = (article.relatedTokens ?? []).map((t) => t.toLowerCase());
      if (!assets.includes(filter.asset)) return false;
    }
    return true;
  });
}

/** Human-readable description of the active filter, for the heading. */
export function describeFilter(filter: FeedFilter, facets: FeedFacets): string | null {
  const topic = facets.topics.find((f) => f.value === filter.topic)?.label;
  const asset = facets.assets.find((f) => f.value === filter.asset)?.label;

  if (topic && asset) return `${topic} · ${asset}`;
  return topic ?? asset ?? null;
}

/**
 * Headline search over the current feed window, for the command palette.
 * Matches title, source and excerpt.
 */
export const searchNews = cache(
  async (query: string, limit = 5): Promise<NewsArticle[]> => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    const articles = await getLatestNews(FEED_DEPTH);
    const terms = trimmed.split(/\s+/).filter(Boolean);

    return articles
      .map((article) => {
        const haystack = `${article.title} ${article.source} ${article.summary}`.toLowerCase();
        const title = article.title.toLowerCase();

        // Every term must appear somewhere; a term in the headline counts
        // for more than one buried in the excerpt.
        if (!terms.every((term) => haystack.includes(term))) return null;
        const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 2 : 1), 0);
        return { article, score };
      })
      .filter((hit): hit is { article: NewsArticle; score: number } => hit !== null)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Date.parse(b.article.publishedAt) - Date.parse(a.article.publishedAt)
      )
      .slice(0, limit)
      .map((hit) => hit.article);
  }
);
