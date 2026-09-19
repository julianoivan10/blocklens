import 'server-only';

import { fetchJson, ProviderError } from '../http';
import { inferTokens } from './rss';
import type { NewsArticle } from '@/types';

/**
 * GNews adapter.
 *
 * GNews only accepts its key as a query parameter, so the URL is built
 * server-side and the key is stripped from anything that could be
 * logged — see `describe`. Free-tier plans cap `max` at 10, so requests
 * are clamped rather than rejected by the provider.
 */

const BASE = 'https://gnews.io/api/v4';
const REVALIDATE = 900;
const MAX_PAGE_SIZE = 10;

interface GNewsArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

export class GNewsProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new ProviderError('gnews', 'an API key is required');
  }

  /** A loggable description of a request, with the key removed. */
  private static describe(query: string): string {
    return `search(${query})`;
  }

  async search(query: string, limit = MAX_PAGE_SIZE): Promise<NewsArticle[]> {
    const params = new URLSearchParams({
      q: query,
      lang: 'en',
      sortby: 'publishedAt',
      max: String(Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)),
      apikey: this.apiKey,
    });

    let body: GNewsResponse;
    try {
      body = await fetchJson<GNewsResponse>(`${BASE}/search?${params}`, {
        provider: 'gnews',
        revalidate: REVALIDATE,
        tags: ['news', 'gnews'],
      });
    } catch (error) {
      // Re-thrown without the URL so the key cannot reach a log.
      throw new ProviderError(
        'gnews',
        `${GNewsProvider.describe(query)} failed: ${
          error instanceof ProviderError ? error.message.replace(this.apiKey, '***') : 'request failed'
        }`
      );
    }

    return body.articles
      .filter((a) => a.title && a.url && !Number.isNaN(Date.parse(a.publishedAt)))
      .map((a) => ({
        id: `gnews:${a.url}`,
        title: a.title,
        summary: a.description?.trim() || a.title,
        source: a.source?.name || 'GNews',
        url: a.url,
        publishedAt: new Date(a.publishedAt).toISOString(),
        image: a.image ?? undefined,
        relatedTokens: inferTokens(`${a.title} ${a.description ?? ''}`),
      }));
  }
}
