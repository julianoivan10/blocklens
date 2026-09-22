import 'server-only';

import { after } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { getChainProvider } from '@/services/chains';
import { alchemyPricesAvailable, getCurrentPrices, getDailyHistories } from '@/services/pricing';
import { classifyTransaction, type NormalizedLeg } from '@/lib/portfolio/normalize';
import { CHAINS, nativeAssetKey, type ChainId } from '@/lib/portfolio/chains';
import { DAY_MS, priceAt } from '@/lib/portfolio/timeline';
import { logServerError } from '@/server/log';

/**
 * Wallet import.
 *
 * One call imports a bounded slice of history — a few provider pages on
 * EVM, a few hundred transactions on Solana — then records where it
 * stopped. A wallet with a long history completes over several calls
 * instead of one that outruns a serverless time limit.
 */

// Sized so one slice stays well inside a 60s serverless limit: a full EVM
// page is up to 1,000 transfers per direction, plus receipts and prices.
const BUDGET: Record<'evm' | 'solana', number> = { evm: 1, solana: 100 };

/**
 * Time allowed for pricing a slice, counted from the start of the sync.
 * Historical prices for a years-long slice can take longer than one
 * function may run (one serial Alchemy call per token per 365 days). When
 * the budget runs out the slice is not written — nothing is stored
 * unvalued — but every history fetched so far is kept, so the next call
 * resumes the pricing where this one stopped and the import converges.
 */
const PRICING_DEADLINE_MS = 40_000;

class PricingIncomplete extends Error {}

export interface SyncResult {
  imported: number;
  complete: boolean;
  status: 'COMPLETE' | 'PARTIAL' | 'ERROR';
  error?: string;
}

/** Every address the user tracks, canonicalised, for internal-transfer detection. */
async function ownAddresses(userId: string): Promise<Set<string>> {
  const wallets = await prisma.wallet.findMany({ where: { userId }, select: { address: true, chain: true } });
  return new Set(wallets.map((w) => (CHAINS[w.chain].family === 'evm' ? w.address.toLowerCase() : w.address)));
}

function decimal(n: number | null, dp: number): Prisma.Decimal | null {
  if (n === null || !Number.isFinite(n)) return null;
  return new Prisma.Decimal(n.toFixed(dp));
}

function toRow(userId: string, walletId: string, leg: NormalizedLeg): Prisma.TransactionCreateManyInput {
  return {
    userId,
    walletId,
    source: 'WALLET',
    chain: leg.chain,
    hash: leg.hash,
    // Prefixed with the wallet: a transfer between two tracked wallets is
    // one provider id but two legs, one per wallet.
    externalId: `${walletId}:${leg.externalId}`,
    groupId: `${walletId}:${leg.groupId}`,
    timestamp: new Date(leg.timestamp),
    fromAddress: leg.fromAddress,
    toAddress: leg.toAddress,
    assetKey: leg.assetKey,
    symbol: leg.symbol.slice(0, 40),
    assetName: leg.assetName?.slice(0, 120) ?? null,
    contract: leg.contract,
    amount: new Prisma.Decimal(leg.amount.toFixed(18)),
    direction: leg.direction,
    usdValue: decimal(leg.usdValue, 8),
    priceUsd: decimal(leg.priceUsd, 12),
    priceSource: leg.priceSource,
    type: leg.type,
    status: leg.status,
    isInternal: leg.isInternal,
    needsReview: leg.needsReview,
    reviewReason: leg.reviewReason,
    metadata: leg.metadata as Prisma.InputJsonValue,
  };
}

export async function syncWallet(userId: string, walletId: string): Promise<SyncResult> {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
  if (!wallet) throw new Error('wallet not found');

  await prisma.wallet.update({ where: { id: wallet.id }, data: { syncStatus: 'SYNCING', syncError: null } });

  const started = Date.now();
  const timing: Record<string, number> = {};
  let mark = Date.now();
  const lap = (name: string) => {
    timing[name] = Date.now() - mark;
    mark = Date.now();
  };

  try {
    const provider = getChainProvider(wallet.chain);
    const family = CHAINS[wallet.chain].family;
    const page = await provider.getHistory(wallet.address, wallet.syncCursor, BUDGET[family]);
    lap('history');

    // Historical prices for every asset in this slice, fetched once per
    // asset for the slice's date range and then looked up per leg.
    let legs: NormalizedLeg[] = [];
    if (page.transactions.length) {
      const keys = new Set<string>([nativeAssetKey(wallet.chain)]);
      for (const tx of page.transactions) for (const m of tx.movements) keys.add(m.assetKey);
      const times = page.transactions.map((t) => t.timestamp);
      // Only assets the market prices today get a history lookup. Airdropped
      // spam has no price now and none then; asking for hundreds of empty
      // histories would only burn the provider's rate limit.
      const current = await getCurrentPrices([...keys]);
      const priced = [...keys].filter((k) => current.has(k));
      // Only the slice's own date range: it keeps each slice well inside the
      // function time limit. Stored closes are shared with the portfolio
      // charts, which fill any remaining days themselves.
      const remaining = PRICING_DEADLINE_MS - (Date.now() - started);
      const historyFetch = getDailyHistories(priced, Math.min(...times) - 2 * DAY_MS, Math.max(...times));
      const histories = await Promise.race([
        historyFetch,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, remaining))),
      ]);
      if (!histories) {
        // The fetch keeps running and storing what it gets; this slice is
        // simply priced on the next call.
        const settle = () => historyFetch.then(() => undefined, () => undefined);
        try {
          after(settle);
        } catch {
          void settle();
        }
        throw new PricingIncomplete();
      }
      const lookup = (assetKey: string, ts: number) => {
        const p = priceAt(histories.get(assetKey), ts);
        return p !== null
          ? { price: p, source: assetKey.startsWith('sym:') ? 'daily close (CoinGecko/Alchemy)' : 'daily close (Alchemy Prices)' }
          : null;
      };
      // Legs are written once and never revalued, so a slice priced while
      // the token-price provider is out of quota would store tokens with no
      // USD value for good. Stop before writing instead; the cursor has not
      // moved, so the same slice is imported on the next attempt.
      if (!alchemyPricesAvailable() && [...keys].some((k) => !k.startsWith('sym:'))) {
        throw new Error('The token price provider has reached its hourly request limit. Sync again later — nothing was lost.');
      }
      const own = await ownAddresses(userId);
      legs = page.transactions.flatMap((tx) => classifyTransaction(tx, own, lookup));
    }
    lap('pricing');

    let imported = 0;
    for (let i = 0; i < legs.length; i += 500) {
      const res = await prisma.transaction.createMany({
        data: legs.slice(i, i + 500).map((l) => toRow(userId, wallet.id, l)),
        // Re-reading an overlapping block, or a retried sync, must not
        // duplicate a leg — nor overwrite one the user reclassified.
        skipDuplicates: true,
      });
      imported += res.count;
    }

    lap('write');

    // The chain's own balances, for reconciliation against the ledger —
    // read only once history has caught up. Mid-backfill the ledger is
    // knowingly incomplete, so a comparison would only report noise.
    const balances = page.complete
      ? await provider.getBalances(wallet.address).catch((error) => {
          logServerError('portfolio:balances', error);
          return null;
        })
      : null;
    if (balances) {
      await prisma.$transaction([
        prisma.walletBalance.deleteMany({
          where: { walletId: wallet.id, assetKey: { notIn: balances.map((b) => b.assetKey) } },
        }),
        ...balances.map((b) =>
          prisma.walletBalance.upsert({
            where: { walletId_assetKey: { walletId: wallet.id, assetKey: b.assetKey } },
            create: {
              walletId: wallet.id,
              assetKey: b.assetKey,
              symbol: b.symbol.slice(0, 40),
              quantity: new Prisma.Decimal(b.quantity.toFixed(18)),
            },
            update: { symbol: b.symbol.slice(0, 40), quantity: new Prisma.Decimal(b.quantity.toFixed(18)) },
          })
        ),
      ]);
    }

    lap('balances');
    const status = page.complete ? 'COMPLETE' : 'PARTIAL';
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        syncStatus: status,
        syncCursor: page.cursor as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
        syncError: null,
      },
    });

    await relinkInternalTransfers(userId);
    lap('relink');
    console.log(
      `[portfolio:sync] chain=${wallet.chain} txs=${page.transactions.length} legs=${legs.length} imported=${imported} ` +
        `complete=${page.complete} ms=${JSON.stringify(timing)}`
    );
    return { imported, complete: page.complete, status };
  } catch (error) {
    if (error instanceof PricingIncomplete) {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { syncStatus: 'PARTIAL', syncError: null } });
      console.log(`[portfolio:sync] chain=${wallet.chain} pricing continues next call ms=${JSON.stringify(timing)}`);
      return { imported: 0, complete: false, status: 'PARTIAL' };
    }
    logServerError('portfolio:sync', error);
    const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 300) : 'sync failed';
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { syncStatus: 'ERROR', syncError: message },
    });
    return { imported: 0, complete: false, status: 'ERROR', error: message };
  }
}

/**
 * Re-evaluates which transfers are between the user's own wallets. Runs
 * after every sync and after a wallet is added or removed, because a
 * transfer only becomes internal once both ends are tracked. Legs the
 * user reclassified are never touched.
 */
export async function relinkInternalTransfers(userId: string): Promise<void> {
  const own = [...(await ownAddresses(userId))];
  const base = { userId, source: 'WALLET' as const, userOverride: false };

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { ...base, isInternal: false, type: 'TRANSFER_IN', fromAddress: { in: own } },
      data: { isInternal: true, needsReview: false, reviewReason: null },
    }),
    prisma.transaction.updateMany({
      where: { ...base, isInternal: false, type: 'TRANSFER_OUT', toAddress: { in: own } },
      data: { isInternal: true, needsReview: false, reviewReason: null },
    }),
    prisma.transaction.updateMany({
      where: { ...base, isInternal: true, type: 'TRANSFER_IN', fromAddress: { notIn: own } },
      data: {
        isInternal: false,
        needsReview: true,
        reviewReason:
          'The sending wallet is no longer tracked, so this is now an external receipt with unknown cost basis.',
      },
    }),
    prisma.transaction.updateMany({
      where: { ...base, isInternal: true, type: 'TRANSFER_OUT', toAddress: { notIn: own } },
      data: { isInternal: false },
    }),
  ]);
}

export function syncBudgetLabel(chain: ChainId): string {
  return CHAINS[chain].family === 'evm' ? `${BUDGET.evm} pages per direction` : `${BUDGET.solana} transactions`;
}
