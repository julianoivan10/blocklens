import 'server-only';

import { fetchJson, ProviderError } from '../http';
import type { OnchainMetrics } from '@/types';

/**
 * Alchemy adapter — chain infrastructure over JSON-RPC.
 *
 * A deliberate note on scope: Alchemy's RPC reports *blocks*, not
 * analytics. It can tell us the head block, how long blocks are taking,
 * how many transactions each contains, and what gas costs. It cannot
 * tell us how many distinct addresses were active in 24 hours — that
 * needs an indexer. So this adapter reports only what it can actually
 * measure, and marks the one figure it extrapolates.
 *
 * The key is used in the URL path because that is the only form
 * Alchemy's RPC endpoints accept; the URL is therefore built server-side
 * only and never logged. Errors deliberately omit the URL for the same
 * reason.
 */

/** Alchemy network slugs for the chains BlockLens covers. */
const NETWORKS: Record<string, { slug: string; label: string }> = {
  ETH: { slug: 'eth-mainnet', label: 'Ethereum' },
  MATIC: { slug: 'polygon-mainnet', label: 'Polygon' },
  POL: { slug: 'polygon-mainnet', label: 'Polygon' },
  ARB: { slug: 'arb-mainnet', label: 'Arbitrum' },
  OP: { slug: 'opt-mainnet', label: 'OP Mainnet' },
  AVAX: { slug: 'avax-mainnet', label: 'Avalanche' },
  BNB: { slug: 'bnb-mainnet', label: 'BNB Chain' },
  SOL: { slug: 'solana-mainnet', label: 'Solana' },
};

/** Blocks sampled to measure block time and transaction density. */
const SAMPLE_SPAN = 20;

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

interface EvmBlock {
  number: string;
  timestamp: string;
  transactions: string[];
}

export function alchemySupports(symbol: string): boolean {
  return symbol.toUpperCase() in NETWORKS;
}

export class AlchemyChainService {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new ProviderError('alchemy', 'an API key is required');
  }

  private endpoint(slug: string): string {
    return `https://${slug}.g.alchemy.com/v2/${this.apiKey}`;
  }

  private async rpc<T>(slug: string, method: string, params: unknown[]): Promise<T> {
    const body = await fetchJson<RpcResponse<T>>(this.endpoint(slug), {
      provider: 'alchemy',
      // POSTs bypass the data cache; the caller caches the composed
      // result instead.
      revalidate: 0,
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method, params },
      timeoutMs: 6_000,
    });

    if (body.error) {
      throw new ProviderError('alchemy', `${method}: ${body.error.message}`);
    }
    if (body.result === undefined) {
      throw new ProviderError('alchemy', `${method}: empty result`);
    }
    return body.result;
  }

  /**
   * EVM chains: two blocks `SAMPLE_SPAN` apart give an average block
   * time, and the head block gives transaction density and gas.
   */
  private async evmStats(slug: string, label: string): Promise<OnchainMetrics> {
    const headHex = await this.rpc<string>(slug, 'eth_blockNumber', []);
    const head = Number.parseInt(headHex, 16);
    const earlier = `0x${(head - SAMPLE_SPAN).toString(16)}`;

    const [headBlock, earlierBlock, gasPriceHex] = await Promise.all([
      this.rpc<EvmBlock>(slug, 'eth_getBlockByNumber', [headHex, false]),
      this.rpc<EvmBlock>(slug, 'eth_getBlockByNumber', [earlier, false]),
      this.rpc<string>(slug, 'eth_gasPrice', []).catch(() => null),
    ]);

    const headTime = Number.parseInt(headBlock.timestamp, 16);
    const earlierTime = Number.parseInt(earlierBlock.timestamp, 16);
    const blockTime = (headTime - earlierTime) / SAMPLE_SPAN;
    const transactionsPerBlock = headBlock.transactions.length;

    const metrics: OnchainMetrics = {
      chainLabel: label,
      latestBlock: head,
      transactionsPerBlock,
      sources: ['Alchemy'],
      derived: [],
    };

    if (Number.isFinite(blockTime) && blockTime > 0) {
      metrics.blockTime = Number(blockTime.toFixed(2));

      // Extrapolated, not counted: one block's density projected over a
      // day. Recorded in `derived` so the UI labels it as an estimate.
      metrics.transactionCount24h = Math.round((86_400 / blockTime) * transactionsPerBlock);
      metrics.derived = ['transactionCount24h'];
    }

    if (gasPriceHex) {
      metrics.gasPriceGwei = Number((Number.parseInt(gasPriceHex, 16) / 1e9).toFixed(3));
    }

    return metrics;
  }

  /** Solana speaks a different RPC dialect. */
  private async solanaStats(slug: string, label: string): Promise<OnchainMetrics> {
    const [slot, perfSamples] = await Promise.all([
      this.rpc<number>(slug, 'getSlot', []),
      this.rpc<Array<{ numTransactions: number; numSlots: number; samplePeriodSecs: number }>>(
        slug,
        'getRecentPerformanceSamples',
        [5]
      ).catch(() => []),
    ]);

    const metrics: OnchainMetrics = {
      chainLabel: label,
      latestBlock: slot,
      sources: ['Alchemy'],
      derived: [],
    };

    if (perfSamples.length > 0) {
      const totalTx = perfSamples.reduce((sum, s) => sum + s.numTransactions, 0);
      const totalSlots = perfSamples.reduce((sum, s) => sum + s.numSlots, 0);
      const totalSecs = perfSamples.reduce((sum, s) => sum + s.samplePeriodSecs, 0);

      if (totalSlots > 0) {
        metrics.transactionsPerBlock = Math.round(totalTx / totalSlots);
        metrics.blockTime = Number((totalSecs / totalSlots).toFixed(3));
      }
      if (totalSecs > 0) {
        metrics.transactionCount24h = Math.round((totalTx / totalSecs) * 86_400);
        metrics.derived = ['transactionCount24h'];
      }
    }

    return metrics;
  }

  /** Null for chains this provider is not configured for. */
  async getChainStats(symbol: string): Promise<OnchainMetrics | null> {
    const network = NETWORKS[symbol.toUpperCase()];
    if (!network) return null;

    return network.slug.startsWith('solana')
      ? this.solanaStats(network.slug, network.label)
      : this.evmStats(network.slug, network.label);
  }
}
