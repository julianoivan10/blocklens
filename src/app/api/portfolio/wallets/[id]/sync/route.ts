import { prisma } from '@/server/db';
import { authed, fail, ok } from '@/server/api';
import { syncWallet } from '@/server/portfolio/sync';

type Ctx = { params: Promise<{ id: string }> };

/** Long histories import in slices; one slice must finish inside this. */
export const maxDuration = 60;

const MIN_INTERVAL_MS = 15_000;
const STUCK_AFTER_MS = 2 * 60_000;

/**
 * Imports the next slice of a wallet's history. The client calls this
 * repeatedly while the result reports `complete: false`.
 */
export const POST = authed<Ctx>('portfolio:wallets:sync', async (user, _request, { params }) => {
  const { id } = await params;
  const wallet = await prisma.wallet.findFirst({
    where: { id, userId: user.id },
    select: { id: true, syncStatus: true, lastSyncedAt: true, updatedAt: true },
  });
  if (!wallet) return fail('Wallet not found', 404);

  const now = Date.now();
  if (wallet.syncStatus === 'SYNCING' && now - wallet.updatedAt.getTime() < STUCK_AFTER_MS) {
    return fail('A sync for this wallet is already running.', 409);
  }
  // A backfill in progress continues immediately; a completed wallet is
  // throttled so a refresh button cannot hammer the provider.
  if (wallet.syncStatus === 'COMPLETE' && wallet.lastSyncedAt && now - wallet.lastSyncedAt.getTime() < MIN_INTERVAL_MS) {
    return fail('This wallet was synced moments ago.', 429);
  }

  const result = await syncWallet(user.id, wallet.id);
  if (result.status === 'ERROR') {
    return fail('The chain provider did not respond. Try again shortly.', 502);
  }
  return ok(result, result.complete ? 'Wallet is up to date' : 'Imported part of the history; continuing');
});
