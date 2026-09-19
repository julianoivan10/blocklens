import type { OnchainDataService } from './interface';
import type { OnchainMetrics } from '@/types';
import { sleep } from '@/lib/utils';

const MOCK_ONCHAIN: Record<string, OnchainMetrics> = {
  BTC: {
    activeAddresses24h: 892450,
    activeAddressesChange: 3.2,
    transactionCount24h: 345000,
    transactionCountChange: 1.8,
    avgTransactionValue: 32450,
    hashRate: '645 EH/s',
    difficulty: '88.4T',
    blockTime: 9.8,
  },
  ETH: {
    activeAddresses24h: 534200,
    activeAddressesChange: -1.5,
    transactionCount24h: 1120000,
    transactionCountChange: 2.3,
    avgTransactionValue: 1250,
    tvl: 48500000000,
    tvlChange: 2.1,
    blockTime: 12.1,
  },
  SOL: {
    activeAddresses24h: 1245000,
    activeAddressesChange: 8.7,
    transactionCount24h: 42000000,
    transactionCountChange: 5.4,
    avgTransactionValue: 85,
    tvl: 7800000000,
    tvlChange: 4.6,
    blockTime: 0.4,
  },
};

export class MockOnchainDataService implements OnchainDataService {
  async getMetrics(symbol: string): Promise<OnchainMetrics | null> {
    await sleep(300);
    return MOCK_ONCHAIN[symbol.toUpperCase()] || null;
  }
}
