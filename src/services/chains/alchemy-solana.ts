import 'server-only';

import { fetchJson, ProviderError } from '../http';
import { alchemyRpcUrl } from './networks';
import type { ChainBalance, ChainProvider, HistoryPage } from './interface';
import { CHAINS, nativeAssetKey, tokenAssetKey } from '@/lib/portfolio/chains';
import type { RawMovement, RawTransaction } from '@/lib/portfolio/normalize';

/**
 * Solana through Alchemy's Solana JSON-RPC.
 *
 * Solana has no transfer index, so movements are derived from what the
 * chain itself records for each transaction: the wallet's lamport
 * balance and its SPL token balances before and after. That is exact —
 * it cannot miss an inner instruction or double-count a routed swap —
 * and it is the same arithmetic a block explorer shows.
 *
 *   native delta = post − pre (+ fee, when the wallet paid it)
 *   token delta  = Σ post − Σ pre over token accounts the wallet owns
 *
 * Counterparties: for SPL, the owner whose balance moved the opposite way
 * by the largest amount; for SOL, the other side of a System transfer.
 *
 * Staking: native movements in a transaction that invokes the Stake
 * program are labelled STAKE / UNSTAKE — the program id is unambiguous.
 *
 * Token metadata: this Alchemy plan has no DAS API, so well-known mints
 * are named from a curated table and others show a shortened mint.
 */

// BigInt constructors rather than literals: the project targets ES2017.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const NEG_ONE = BigInt(-1);
const TEN = BigInt(10);

const STAKE_PROGRAM = 'Stake11111111111111111111111111111111111111';
const LAMPORTS = 1e9;

const KNOWN_MINTS: Record<string, { symbol: string; name: string }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD' },
  So11111111111111111111111111111111111111112: { symbol: 'WSOL', name: 'Wrapped SOL' },
  JUPyiwrYJFskUPiHa7hNeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter' },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk' },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: 'WIF', name: 'dogwifhat' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'MSOL', name: 'Marinade staked SOL' },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JITOSOL', name: 'Jito Staked SOL' },
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: { symbol: 'BSOL', name: 'BlazeStake Staked SOL' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium' },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: 'PYTH', name: 'Pyth Network' },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: 'JTO', name: 'Jito' },
};

interface Signature {
  signature: string;
  blockTime: number | null;
  err: unknown;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface ParsedInstruction {
  programId: string;
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
}

interface ParsedTransaction {
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: Array<{ instructions: ParsedInstruction[] }>;
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
      instructions: ParsedInstruction[];
    };
  };
}

/** Persisted between syncs. */
interface SolanaCursor {
  /** Newest signature fully imported; later syncs stop here. */
  until?: string;
  /** Oldest signature reached in a backfill still in progress. */
  before?: string;
  /** The newest signature of the backfill in progress, promoted to `until` when it completes. */
  pendingUntil?: string;
}

function units(amount: string, decimals: number): number {
  const value = BigInt(amount);
  const base = TEN ** BigInt(decimals);
  return Number(value / base) + Number(value % base) / Number(base);
}

function shortMint(mint: string) {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export class AlchemySolanaProvider implements ChainProvider {
  readonly chain = 'SOLANA' as const;
  readonly capabilities = {
    balances: true,
    tokenTransfers: true,
    nativeTransactions: true,
    transactionDetails: true,
    historicalActivity: true,
  };

  constructor(private readonly apiKey: string) {}

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const body = await fetchJson<{ result?: T; error?: { message: string } }>(alchemyRpcUrl('SOLANA', this.apiKey), {
      provider: 'alchemy-solana',
      revalidate: 0,
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method, params },
      timeoutMs: 20_000,
    });
    if (body.error) throw new ProviderError('alchemy-solana', `${method}: ${body.error.message}`);
    return body.result as T;
  }

  private token(mint: string) {
    return KNOWN_MINTS[mint] ?? { symbol: shortMint(mint), name: null };
  }

  async getBalances(address: string): Promise<ChainBalance[]> {
    const [lamports, accounts] = await Promise.all([
      this.rpc<{ value: number }>('getBalance', [address]),
      this.rpc<{
        value: Array<{ account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }>;
      }>('getTokenAccountsByOwner', [
        address,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]),
    ]);

    const byMint = new Map<string, number>();
    for (const a of accounts.value) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      const q = units(tokenAmount.amount, tokenAmount.decimals);
      if (q > 0) byMint.set(mint, (byMint.get(mint) ?? 0) + q);
    }

    return [
      {
        assetKey: nativeAssetKey('SOLANA'),
        symbol: 'SOL',
        name: 'Solana',
        contract: null,
        quantity: lamports.value / LAMPORTS,
      },
      ...[...byMint.entries()].map(([mint, quantity]) => ({
        assetKey: tokenAssetKey('SOLANA', mint),
        symbol: this.token(mint).symbol,
        name: this.token(mint).name,
        contract: mint,
        quantity,
      })),
    ];
  }

  /** `budget` = transactions fetched in this call. */
  async getHistory(address: string, rawCursor: unknown, budget: number): Promise<HistoryPage> {
    const cursor: SolanaCursor = { ...(rawCursor as SolanaCursor | null) };
    const limit = Math.min(1000, Math.max(1, budget));

    const signatures = await this.rpc<Signature[]>('getSignaturesForAddress', [
      address,
      { limit, ...(cursor.before ? { before: cursor.before } : {}), ...(cursor.until ? { until: cursor.until } : {}) },
    ]);

    const newest = cursor.pendingUntil ?? signatures[0]?.signature ?? cursor.until;
    const complete = signatures.length < limit;

    const transactions: RawTransaction[] = [];
    for (let i = 0; i < signatures.length; i += 20) {
      const chunk = signatures.slice(i, i + 20);
      const results = await Promise.all(
        chunk.map((s) =>
          this.rpc<ParsedTransaction | null>('getTransaction', [
            s.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' },
          ]).catch(() => null)
        )
      );
      results.forEach((tx, j) => {
        const raw = tx ? this.toRaw(address, chunk[j].signature, tx) : null;
        if (raw) transactions.push(raw);
      });
    }

    return {
      transactions,
      complete,
      cursor: complete
        ? ({ until: newest } satisfies SolanaCursor)
        : ({
            until: cursor.until,
            before: signatures[signatures.length - 1]?.signature,
            pendingUntil: newest,
          } satisfies SolanaCursor),
    };
  }

  toRaw(wallet: string, signature: string, tx: ParsedTransaction): RawTransaction | null {
    if (!tx.meta || !tx.blockTime) return null;
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
    const index = keys.indexOf(wallet);
    const feePayer = keys[0];
    const paidFee = feePayer === wallet;
    const failed = tx.meta.err !== null && tx.meta.err !== undefined;

    const instructions = [
      ...tx.transaction.message.instructions,
      ...(tx.meta.innerInstructions ?? []).flatMap((i) => i.instructions),
    ];
    const staking = instructions.some((i) => i.programId === STAKE_PROGRAM);
    const movements: RawMovement[] = [];

    if (index >= 0) {
      const delta = tx.meta.postBalances[index] - tx.meta.preBalances[index] + (paidFee ? tx.meta.fee : 0);
      if (delta !== 0) {
        const counterparty =
          instructions
            .filter((i) => i.program === 'system' && i.parsed?.type === 'transfer')
            .map((i) => i.parsed!.info as { source?: string; destination?: string })
            .map((info) => (info.source === wallet ? info.destination : info.destination === wallet ? info.source : undefined))
            .find(Boolean) ?? null;
        movements.push({
          externalId: `SOLANA:${signature}:native`,
          assetKey: nativeAssetKey('SOLANA'),
          symbol: 'SOL',
          name: 'Solana',
          contract: null,
          amount: delta / LAMPORTS,
          counterparty,
          hint: staking ? (delta < 0 ? 'STAKE' : 'UNSTAKE') : undefined,
        });
      }
    }

    // Net token change per mint across all accounts each owner holds.
    const perOwnerMint = new Map<string, { owner: string; mint: string; decimals: number; delta: bigint }>();
    const add = (b: TokenBalance, sign: bigint) => {
      if (!b.owner) return;
      const key = `${b.owner}|${b.mint}`;
      const entry = perOwnerMint.get(key) ?? { owner: b.owner, mint: b.mint, decimals: b.uiTokenAmount.decimals, delta: ZERO };
      entry.delta += sign * BigInt(b.uiTokenAmount.amount);
      perOwnerMint.set(key, entry);
    };
    for (const b of tx.meta.preTokenBalances ?? []) add(b, NEG_ONE);
    for (const b of tx.meta.postTokenBalances ?? []) add(b, ONE);

    for (const mine of [...perOwnerMint.values()].filter((e) => e.owner === wallet && e.delta !== ZERO)) {
      const magnitude = (d: bigint) => (d < ZERO ? -d : d);
      const opposite = [...perOwnerMint.values()]
        .filter((e) => e.mint === mine.mint && e.owner !== wallet && e.delta !== ZERO && e.delta > ZERO !== mine.delta > ZERO)
        .reduce<typeof mine | undefined>(
          (best, e) => (!best || magnitude(e.delta) > magnitude(best.delta) ? e : best),
          undefined
        );
      const abs = magnitude(mine.delta);
      const amount = units(abs.toString(), mine.decimals);
      const meta = this.token(mine.mint);
      movements.push({
        externalId: `SOLANA:${signature}:spl:${mine.mint}`,
        assetKey: tokenAssetKey('SOLANA', mine.mint),
        symbol: meta.symbol,
        name: meta.name,
        contract: mine.mint,
        amount: mine.delta < ZERO ? -amount : amount,
        counterparty: opposite?.owner ?? null,
      });
    }

    const fee = paidFee ? tx.meta.fee / LAMPORTS : null;
    if (movements.length === 0 && !fee) return null;

    return {
      chain: CHAINS.SOLANA.id,
      hash: signature,
      timestamp: tx.blockTime * 1000,
      wallet,
      failed,
      movements,
      fee,
      from: feePayer,
      to: null,
    };
  }
}
