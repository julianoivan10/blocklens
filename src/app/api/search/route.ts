import { NextRequest, NextResponse } from 'next/server';
import { getMarketService } from '@/services/market';
import { searchNews } from '@/server/data/news';
import type { ApiResponse, NewsArticle, SearchResult } from '@/types';

/**
 * Global search.
 *
 * One endpoint for both things a researcher looks for — an asset, or a
 * story — so the command palette stays the single way into everything
 * rather than growing a second, unrelated news search.
 *
 * The two lookups are independent: assets still resolve if the news
 * window is unavailable, and vice versa.
 */
export interface SearchPayload {
  assets: SearchResult[];
  articles: Array<Pick<NewsArticle, 'slug' | 'title' | 'source' | 'publishedAt'>>;
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SearchPayload>>> {
  const query = request.nextUrl.searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ success: true, data: { assets: [], articles: [] } });
  }

  const [assets, articles] = await Promise.all([
    getMarketService()
      .searchTokens(query)
      .catch((error) => {
        console.error('Search: asset lookup failed:', error);
        return [] as SearchResult[];
      }),
    searchNews(query, 4).catch((error) => {
      console.error('Search: news lookup failed:', error);
      return [] as NewsArticle[];
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      assets,
      // Only what the palette renders — the whole article would be
      // needless payload on every keystroke.
      articles: articles.map(({ slug, title, source, publishedAt }) => ({
        slug,
        title,
        source,
        publishedAt,
      })),
    },
  });
}
