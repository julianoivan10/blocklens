import { prisma } from '@/server/db';
import { authed, fail, ok, parseBody } from '@/server/api';
import { updateWalletSchema } from '@/lib/portfolio/validation';
import { relinkInternalTransfers } from '@/server/portfolio/sync';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed<Ctx>('portfolio:wallets:update', async (user, request, { params }) => {
  const { id } = await params;
  const parsed = await parseBody(request, updateWalletSchema);
  if ('error' in parsed) return parsed.error;

  const { count } = await prisma.wallet.updateMany({ where: { id, userId: user.id }, data: parsed.data });
  if (count === 0) return fail('Wallet not found', 404);
  return ok(null, 'Wallet renamed');
});

/** Removes the wallet and, by cascade, every transaction imported from it. */
export const DELETE = authed<Ctx>('portfolio:wallets:delete', async (user, _request, { params }) => {
  const { id } = await params;
  const { count } = await prisma.wallet.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return fail('Wallet not found', 404);
  await relinkInternalTransfers(user.id);
  return ok(null, 'Wallet removed');
});
