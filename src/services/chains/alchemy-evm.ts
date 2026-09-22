import 'server-only';

import { fetchJson, ProviderError } from '../http';
import { alchemyRpcUrl, ALCHEMY_NETWORKS } from './networks';
import type { ChainBalance, ChainProvider, HistoryPage } from './interface';
import { CHAINS, nativeAssetKey, tokenAssetKey, type ChainId } from '@/lib/portfolio/chains';
import type { RawMovement, RawTransaction } from '@/lib/portfolio/normalize';

/**
 * EVM chains through Alchemy's Transfers API and JSON-RPC.
 *
 * History: `alchemy_getAssetTransfers`, once for transfers out of the
 * wallet and once for transfers into it. Zero-value external calls are
 * kept (not as asset movements) because they are how contract
 * interactions — approvals, token sends — reveal a fee the wallet paid.
 *
 * Fees: every transaction the wallet sent is looked up by receipt:
 *   fee = gasUsed × effectiveGasPrice + l1Fee (OP-stack rollups only).
 *
 * Out of scope, stated rather than hidden: NFTs (ERC-721/1155), and
 * native value received through contract internals on chains where
 * Alchemy does not report internal transfers (see networks.ts).
 */

interface AlchemyTransfer {
  blockNum: string;
  uniqueId: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155' | 'specialnft';
  rawContract: { value: string | null; address: string | null; decimal: string | null };
  metadata?: { blockTimestamp?: string };
}

interface TransfersResult {
  transfers: AlchemyTransfer[];
  pageKey?: string;
}

interface Receipt {
  transactionHash: string;
  from: string;
  to: string | null;
  status: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  l1Fee?: string;
}

interface TokenMetadata {
  decimals: number | null;
  name: string | null;
  symbol: string | null;
}

/** Persisted between syncs. */
interface EvmCursor {
  /** Lowest block not yet fully read on the next incremental pass. */
  fromBlock: string;
}

// BigInt constructors rather than literals: the project targets ES2017.
const ZERO = BigInt(0);
const TEN = BigInt(10);

const PAGE_SIZE = '0x3e8'; // 1000, the provider's maximum

function toUnits(raw: string | null, decimals: number): number | null {
  if (!raw) return null;
  try {
    const value = BigInt(raw);
    const base = TEN ** BigInt(decimals);
    const whole = value / base;
    const frac = value % base;
    return Number(whole) + Number(frac) / Number(base);
  } catch {
    return null;
  }
}

export class AlchemyEvmProvider implements ChainProvider {
  readonly capabilities = {
    balances: true,
    tokenTransfers: true,
    nativeTransactions: true,
    transactionDetails: true,
    historicalActivity: true,
  };
  private readonly metadataCache = new Map<string, TokenMetadata>();

  constructor(
    readonly chain: ChainId,
    private readonly apiKey: string
  ) {
    if (CHAINS[chain].family !== 'evm') throw new ProviderError('alchemy', `${chain} is not an EVM chain`);
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    const body = await fetchJson<{ result?: T; error?: { message: string } }>(alchemyRpcUrl(this.chain, this.apiKey), {
      provider: 'alchemy',
      revalidate: 0,
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method, params },
      timeoutMs: 20_000,
    });
    if (body.error) throw new ProviderError('alchemy', `${method}: ${body.error.message}`);
    if (body.result === undefined) throw new ProviderError('alchemy', `${method}: empty result`);
    return body.result;
  }

  private async rpcBatch<T>(calls: Array<{ method: string; params: unknown }>): Promise<Array<T | null>> {
    if (calls.length === 0) return [];
    const body = await fetchJson<Array<{ id: number; result?: T; error?: unknown }>>(
      alchemyRpcUrl(this.chain, this.apiKey),
      {
        provider: 'alchemy',
        revalidate: 0,
        method: 'POST',
        body: calls.map((c, id) => ({ jsonrpc: '2.0', id, method: c.method, params: c.params })),
        timeoutMs: 25_000,
      }
    );
    const byId = new Map(body.map((r) => [r.id, r.result ?? null]));
    return calls.map((_, i) => byId.get(i) ?? null);
  }

  /** Warms the metadata cache for many contracts in batched RPC calls. */
  private async prefetchMetadata(contracts: Iterable<string>): Promise<void> {
    const missing = [...new Set([...contracts].map((c) => c.toLowerCase()))].filter((c) => !this.metadataCache.has(c));
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const results = await this.rpcBatch<TokenMetadata>(
        chunk.map((c) => ({ method: 'alchemy_getTokenMetadata', params: [c] }))
      ).catch(() => chunk.map(() => null));
      chunk.forEach((c, j) => this.metadataCache.set(c, results[j] ?? { decimals: null, name: null, symbol: null }));
    }
  }

  private async metadata(contract: string): Promise<TokenMetadata> {
    const key = contract.toLowerCase();
    const cached = this.metadataCache.get(key);
    if (cached) return cached;
    const meta = await this.rpc<TokenMetadata>('alchemy_getTokenMetadata', [key]).catch(
      () => ({ decimals: null, name: null, symbol: null }) as TokenMetadata
    );
    this.metadataCache.set(key, meta);
    return meta;
  }

  async getBalances(address: string): Promise<ChainBalance[]> {
    const info = CHAINS[this.chain];
    const [nativeHex, tokens] = await Promise.all([
      this.rpc<string>('eth_getBalance', [address, 'latest']),
      this.rpc<{ tokenBalances: Array<{ contractAddress: string; tokenBalance: string | null }> }>(
        'alchemy_getTokenBalances',
        [address, 'erc20']
      ),
    ]);

    const balances: ChainBalance[] = [
      {
        assetKey: nativeAssetKey(this.chain),
        symbol: info.nativeSymbol,
        name: info.nativeName,
        contract: null,
        quantity: toUnits(nativeHex, info.nativeDecimals) ?? 0,
      },
    ];

    const nonZero = tokens.tokenBalances.filter((t) => t.tokenBalance && BigInt(t.tokenBalance) > ZERO).slice(0, 150);
    await this.prefetchMetadata(nonZero.map((t) => t.contractAddress));
    for (const t of nonZero) {
      const meta = await this.metadata(t.contractAddress);
      if (meta.decimals === null) continue;
      const quantity = toUnits(t.tokenBalance, meta.decimals);
      if (!quantity) continue;
      balances.push({
        assetKey: tokenAssetKey(this.chain, t.contractAddress),
        symbol: meta.symbol?.trim() || t.contractAddress.slice(0, 8),
        name: meta.name,
        contract: t.contractAddress.toLowerCase(),
        quantity,
      });
    }
    return balances;
  }

  private async transfers(
    address: string,
    direction: 'from' | 'to',
    fromBlock: string,
    pageKey: string | undefined
  ): Promise<TransfersResult> {
    const category = ['external', 'erc20'];
    if (ALCHEMY_NETWORKS[this.chain].internalTransfers) category.push('internal');
    return this.rpc<TransfersResult>('alchemy_getAssetTransfers', [
      {
        [direction === 'from' ? 'fromAddress' : 'toAddress']: address,
        fromBlock,
        toBlock: 'latest',
        category,
        order: 'asc',
        withMetadata: true,
        excludeZeroValue: false,
        maxCount: PAGE_SIZE,
        ...(pageKey ? { pageKey } : {}),
      },
    ]);
  }

  /** `budget` = pages per direction for this call. */
  async getHistory(address: string, rawCursor: unknown, budget: number): Promise<HistoryPage> {
    const cursor: EvmCursor = { fromBlock: '0x0', ...(rawCursor as EvmCursor | null) };
    const wallet = address.toLowerCase();

    // The two directions paginate independently, so after a bounded read
    // they reach different heights. Transactions must be classified
    // whole — a swap's outgoing and incoming legs together — so a slice
    // is cut at the lowest height either unfinished direction reached,
    // and the next slice re-reads both directions from there.
    const read = async (direction: 'from' | 'to') => {
      const out: AlchemyTransfer[] = [];
      let pageKey: string | undefined;
      for (let i = 0; i < budget; i++) {
        const page = await this.transfers(wallet, direction, cursor.fromBlock, pageKey);
        out.push(...page.transfers);
        pageKey = page.pageKey;
        if (!pageKey) return { transfers: out, done: true };
      }
      return { transfers: out, done: false };
    };

    const [outgoing, incoming] = [await read('from'), await read('to')];
    const all = [...outgoing.transfers, ...incoming.transfers];
    const height = (list: AlchemyTransfer[]) =>
      list.reduce((max, t) => (BigInt(t.blockNum) > max ? BigInt(t.blockNum) : max), BigInt(cursor.fromBlock));

    const complete = outgoing.done && incoming.done;
    let boundary: bigint | null = null;
    if (!complete) {
      const reached = [outgoing, incoming].filter((d) => !d.done).map((d) => height(d.transfers));
      boundary = reached.reduce((min, b) => (b < min ? b : min));
      // A single block holding more transfers than one slice can read
      // would never advance; take the slice whole in that pathological case.
      if (boundary <= BigInt(cursor.fromBlock)) boundary = null;
    }

    const kept = boundary === null ? all : all.filter((t) => BigInt(t.blockNum) < boundary!);
    const transactions = await this.toTransactions(wallet, kept);

    const next: EvmCursor = complete
      ? // Re-reading the head block next time is harmless: legs dedupe on
        // their provider-unique id.
        { fromBlock: `0x${height(all).toString(16)}` }
      : { fromBlock: `0x${(boundary ?? height(all)).toString(16)}` };

    return { transactions, complete, cursor: next };
  }

  private async toTransactions(wallet: string, transfers: AlchemyTransfer[]): Promise<RawTransaction[]> {
    const info = CHAINS[this.chain];
    const byHash = new Map<string, AlchemyTransfer[]>();
    for (const t of transfers) {
      if (t.category !== 'external' && t.category !== 'internal' && t.category !== 'erc20') continue;
      const list = byHash.get(t.hash) ?? [];
      // The two directional queries overlap on self-transfers.
      if (!list.some((x) => x.uniqueId === t.uniqueId)) list.push(t);
      byHash.set(t.hash, list);
    }

    // Transactions this wallet sent — they are the ones it paid gas for.
    const sent = [...byHash.entries()]
      .filter(([, list]) => list.some((t) => t.category === 'external' && t.from.toLowerCase() === wallet))
      .map(([hash]) => hash);

    const receipts = new Map<string, Receipt>();
    for (let i = 0; i < sent.length; i += 25) {
      const chunk = sent.slice(i, i + 25);
      const results = await this.rpcBatch<Receipt>(
        chunk.map((hash) => ({ method: 'eth_getTransactionReceipt', params: [hash] }))
      );
      results.forEach((r, j) => r && receipts.set(chunk[j], r));
    }

    await this.prefetchMetadata(
      transfers.filter((t) => t.category === 'erc20' && t.rawContract.address).map((t) => t.rawContract.address as string)
    );

    const out: RawTransaction[] = [];
    for (const [hash, list] of byHash) {
      const movements: RawMovement[] = [];
      for (const t of list) {
        const from = t.from.toLowerCase();
        const to = t.to?.toLowerCase() ?? null;
        const incoming = to === wallet;
        const outgoing = from === wallet;
        if (incoming === outgoing) continue; // self-transfer or unrelated

        let amount: number | null;
        let meta: { assetKey: string; symbol: string; name: string | null; contract: string | null };
        if (t.category === 'erc20') {
          const contract = t.rawContract.address?.toLowerCase();
          if (!contract) continue;
          const md = await this.metadata(contract);
          const decimals = t.rawContract.decimal ? Number.parseInt(t.rawContract.decimal, 16) : md.decimals;
          amount = decimals !== null && decimals !== undefined ? toUnits(t.rawContract.value, decimals) : t.value;
          meta = {
            assetKey: tokenAssetKey(this.chain, contract),
            symbol: (t.asset || md.symbol || contract.slice(0, 8)).trim(),
            name: md.name,
            contract,
          };
        } else {
          amount = toUnits(t.rawContract.value, info.nativeDecimals) ?? t.value;
          meta = { assetKey: nativeAssetKey(this.chain), symbol: info.nativeSymbol, name: info.nativeName, contract: null };
        }
        if (!amount) continue;

        movements.push({
          externalId: `${this.chain}:${t.uniqueId}`,
          ...meta,
          amount: incoming ? amount : -amount,
          counterparty: incoming ? from : to,
        });
      }

      const receipt = receipts.get(hash);
      let fee: number | null = null;
      if (receipt && receipt.from.toLowerCase() === wallet) {
        const gas = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice ?? '0x0') + BigInt(receipt.l1Fee ?? '0x0');
        fee = toUnits(`0x${gas.toString(16)}`, info.nativeDecimals);
      }

      if (movements.length === 0 && !fee) continue;

      const top = list.find((t) => t.category === 'external') ?? list[0];
      out.push({
        chain: this.chain,
        hash,
        timestamp: Date.parse(top.metadata?.blockTimestamp ?? '') || 0,
        wallet,
        failed: receipt ? receipt.status === '0x0' : false,
        movements,
        fee,
        from: top.from?.toLowerCase() ?? null,
        to: top.to?.toLowerCase() ?? null,
      });
    }

    return out.filter((t) => t.timestamp > 0);
  }
}
