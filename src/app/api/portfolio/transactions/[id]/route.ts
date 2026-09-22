import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { authed, fail, ok, parseBody } from '@/server/api';
import { reclassifySchema, TYPES_BY_DIRECTION } from '@/lib/portfolio/validation';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Reclassifies a leg — the resolution path for everything the importer
 * flagged. A user decision is final: `userOverride` stops later syncs and
 * internal-transfer relinking from touching the leg again.
 */
export const PATCH = authed<Ctx>('portfolio:transactions:update', async (user, request, { params }) => {
  const { id } = await params;
  const parsed = await parseBody(request, reclassifySchema);
  if ('error' in parsed) return parsed.error;
  const change = parsed.data;

  const leg = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!leg) return fail('Transaction not found', 404);

  const direction = leg.direction >= 0 ? 1 : -1;
  const type = change.type ?? leg.type;
  if (!TYPES_BY_DIRECTION[direction].includes(type)) {
    return fail(
      `${direction === 1 ? 'An incoming' : 'An outgoing'} movement cannot be classified as ${type.replace('_', ' ').toLowerCase()}.`,
      400
    );
  }
  if (leg.source === 'MANUAL' && change.type && change.type !== leg.type) {
    return fail('Delete and re-enter a manual transaction to change its type.', 400);
  }

  const data: Prisma.TransactionUpdateInput = {
    type: type as Prisma.TransactionUpdateInput['type'],
    userOverride: true,
    needsReview: false,
    reviewReason: null,
  };

  if (change.priceUsd !== undefined) {
    const amount = leg.amount.toNumber();
    data.priceUsd = new Prisma.Decimal(change.priceUsd.toFixed(12));
    data.usdValue = new Prisma.Decimal((amount * change.priceUsd).toFixed(8));
    data.priceSource = 'entered by you';
  }

  if ((type === 'BUY' || type === 'SELL') && change.priceUsd === undefined && leg.usdValue === null) {
    return fail(`A ${type.toLowerCase()} needs a price. Enter the USD price per unit.`, 400);
  }

  if (change.isInternal !== undefined) {
    if (type !== 'TRANSFER_IN' && type !== 'TRANSFER_OUT') {
      return fail('Only transfers can be marked as between your own accounts.', 400);
    }
    data.isInternal = change.isInternal;
  } else if (type !== 'TRANSFER_IN' && type !== 'TRANSFER_OUT') {
    data.isInternal = false;
  }

  const updated = await prisma.transaction.update({ where: { id: leg.id }, data });
  return ok(updated, 'Transaction updated');
});

/** Manual entries can be deleted. Imported legs cannot — they are chain history. */
export const DELETE = authed<Ctx>('portfolio:transactions:delete', async (user, _request, { params }) => {
  const { id } = await params;
  const leg = await prisma.transaction.findFirst({ where: { id, userId: user.id }, select: { id: true, source: true } });
  if (!leg) return fail('Transaction not found', 404);
  if (leg.source !== 'MANUAL') {
    return fail('Imported transactions are chain history and cannot be deleted. Reclassify it instead.', 400);
  }
  await prisma.transaction.delete({ where: { id: leg.id } });
  return ok(null, 'Transaction deleted');
});
