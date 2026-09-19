import type { NewsArticle } from '@/types';

export interface NewsService {
  getLatest(limit?: number): Promise<NewsArticle[]>;
  getByToken(symbol: string, limit?: number): Promise<NewsArticle[]>;
}
