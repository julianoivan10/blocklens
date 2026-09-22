import 'server-only';

import { prisma } from '@/server/db';
import type { LedgerLeg } from '@/lib/portfolio/types';

/**
 * The boundary between stored transactions and the engine. Decimals are
 * converted to numbers exactly once, here.
 */

export async function loadLedger(userId: string): Promise<LedgerLeg[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    select: {
      id: true,
      groupId: true,
      timestamp: true,
      assetKey: true,
      symbol: true,
      assetName: true,
      chain: true,
      walletId: true,
      amount: true,
      direction: true,
      type: true,
      usdValue: true,
      isInternal: true,
      status: true,
    },
    orderBy: { timestamp: 'asc' },
  });

  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    timestamp: r.timestamp.getTime(),
    assetKey: r.assetKey,
    symbol: r.symbol,
    name: r.assetName,
    chain: r.chain,
    walletId: r.walletId,
    amount: r.amount.toNumber(),
    direction: r.direction >= 0 ? 1 : -1,
    type: r.type,
    usdValue: r.usdValue?.toNumber() ?? null,
    isInternal: r.isInternal,
    status: r.status,
  }));
}

/**
 * A cheap fingerprint of the ledger: any insert, delete or edit changes
 * it. Derived results are cached under it, so they are recomputed only
 * when the ledger actually changes — never on a mere page view or a
 * price tick.
 */
export async function ledgerVersion(userId: string): Promise<string> {
  const agg = await prisma.transaction.aggregate({
    where: { userId },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return `${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}`;
}
