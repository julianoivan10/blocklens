import 'server-only';

import { cache } from 'react';
import { getNewsService } from '@/services/news';
import type { NewsArticle } from '@/types';

export const getLatestNews = cache(
  async (limit = 10): Promise<NewsArticle[]> => getNewsService().getLatest(limit)
);

export const getNewsForAsset = cache(
  async (symbol: string, limit = 5): Promise<NewsArticle[]> =>
    getNewsService().getByToken(symbol, limit)
);
