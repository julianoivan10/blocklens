import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/server/db';
import { syncWallet } from '@/server/portfolio/sync';
import { evaluateAllAlerts } from '@/server/alerts';
import { chainProvidersConfigured } from '@/services/chains';
import { logServerError } from '@/server/log';

/**
 * Scheduled background work (see vercel.json): evaluate every enabled
 * alert, then refresh the least recently synced wallets.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the
 * secret configured the route refuses to run at all, rather than being
 * callable by anyone.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const WALLET_BATCH = 10;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const deadline = Date.now() + 50_000;
  const synced: Array<{ walletId: string; status: string }> = [];

  // Alerts first: they are cheap and time-sensitive. Wallet syncs then use
  // whatever time is left, and the least recently synced go first, so a
  // backlog drains across runs instead of starving alerts.
  const alerts = await evaluateAllAlerts(deadline - 25_000);

  if (chainProvidersConfigured()) {
    const wallets = await prisma.wallet.findMany({
      where: { syncStatus: { not: 'SYNCING' } },
      orderBy: [{ lastSyncedAt: { sort: 'asc', nulls: 'first' } }],
      take: WALLET_BATCH,
      select: { id: true, userId: true },
    });
    for (const w of wallets) {
      if (Date.now() > deadline - 20_000) break;
      try {
        const r = await syncWallet(w.userId, w.id);
        synced.push({ walletId: w.id, status: r.status });
      } catch (error) {
        logServerError('cron:sync', error);
      }
    }
  }

  return NextResponse.json({ success: true, data: { synced: synced.length, alerts } });
}
