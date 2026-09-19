import 'server-only';

import type { TokenomicsService } from './interface';
import { DerivedTokenomicsService } from './derived';

let instance: TokenomicsService | null = null;

export function getTokenomicsService(): TokenomicsService {
  if (instance) return instance;
  instance = new DerivedTokenomicsService();
  return instance;
}

export type { TokenomicsService } from './interface';
