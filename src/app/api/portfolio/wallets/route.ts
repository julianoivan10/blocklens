import { prisma } from '@/server/db';
import { authed, fail, isUniqueViolation, ok, parseBody } from '@/server/api';
import { addWalletSchema } from '@/lib/portfolio/validation';
import { normalizeAddress } from '@/lib/portfolio/chains';
import { relinkInternalTransfers } from '@/server/portfolio/sync';
import { chainProvidersConfigured } from '@/services/chains';

const MAX_WALLETS = 25;

const walletSelect = {
  id: true,
  chain: true,
  address: true,
  label: true,
  syncStatus: true,
  syncError: true,
  lastSyncedAt: true,
  createdAt: true,
  _count: { select: { transactions: true } },
} as const;

export const GET = authed('portfolio:wallets:list', async (user) => {
  const wallets = await prisma.wallet.findMany({
    where: { userId: user.id },
    select: walletSelect,
    orderBy: { createdAt: 'asc' },
  });
  return ok(wallets);
});

/**
 * Adds a read-only wallet. Only a public address is accepted; input that
 * looks like a private key or seed phrase is refused by the schema and is
 * never stored or logged.
 */
export const POST = authed('portfolio:wallets:add', async (user, request) => {
  if (!chainProvidersConfigured()) {
    return fail('Wallet import is not configured on this deployment.', 503);
  }

  const parsed = await parseBody(request, addWalletSchema);
  if ('error' in parsed) return parsed.error;
  const { chain, label } = parsed.data;
  const address = normalizeAddress(chain, parsed.data.address)!;

  const count = await prisma.wallet.count({ where: { userId: user.id } });
  if (count >= MAX_WALLETS) return fail(`You can track up to ${MAX_WALLETS} wallets.`, 400);

  try {
    const wallet = await prisma.wallet.create({
      data: { userId: user.id, chain, address, label },
      select: walletSelect,
    });
    await relinkInternalTransfers(user.id);
    return ok(wallet, 'Wallet added', 201);
  } catch (error) {
    if (isUniqueViolation(error)) return fail('You already track this address on that chain.', 409);
    throw error;
  }
});
