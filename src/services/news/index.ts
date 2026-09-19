import 'server-only';

import type { NewsService } from './interface';
import { MockNewsService } from './mock';
import { CompositeNewsService } from './composite';
import { providerKeys, sampleDataEnabled } from '../providers';

let instance: NewsService | null = null;

/**
 * RSS needs no key, so news is live by default; NEWS_API_KEY adds GNews
 * on top of it.
 */
export function getNewsService(): NewsService {
  if (instance) return instance;

  instance = sampleDataEnabled()
    ? new MockNewsService()
    : new CompositeNewsService(providerKeys.gnews);

  return instance;
}

export type { NewsService } from './interface';
