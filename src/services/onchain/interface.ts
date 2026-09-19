import type { OnchainMetrics } from '@/types';

export interface OnchainDataService {
  getMetrics(symbol: string): Promise<OnchainMetrics | null>;
}
