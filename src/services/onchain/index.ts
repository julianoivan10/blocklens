import 'server-only';

import type { OnchainDataService } from './interface';
import { MockOnchainDataService } from './mock';
import { CompositeOnchainService } from './composite';
import { providerKeys, sampleDataEnabled } from '../providers';

let instance: OnchainDataService | null = null;

/**
 * DeFiLlama needs no key, so on-chain coverage is partially live even
 * without ALCHEMY_API_KEY; the key adds block-level chain metrics.
 */
export function getOnchainService(): OnchainDataService {
  if (instance) return instance;

  instance = sampleDataEnabled()
    ? new MockOnchainDataService()
    : new CompositeOnchainService(providerKeys.alchemy);

  return instance;
}

export type { OnchainDataService } from './interface';
