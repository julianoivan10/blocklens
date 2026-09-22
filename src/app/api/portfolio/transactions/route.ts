import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { authed, fail, ok, parseBody } from '@/server/api';
import { manualTransactionSchema, transactionQuerySchema } from '@/lib/portfolio/validation';
import { getCurrentPrices, getDailyHistory } from '@/services/pricing';
import { DAY_MS, priceAt } from '@/lib/portfolio/timeline';

export const GET = authed('portfolio:transactions:list', async (user, request) => {
  const url = new URL(request.url);
  const parsed = transactionQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid query', 400);
  const q = parsed.data;

  const where: Prisma.TransactionWhereInput = {
    userId: user.id,
    ...(q.type ? { type: q.type as Prisma.EnumTxTypeFilter['equals'] } : {}),
    ...(q.review === '1' ? { needsReview: true } : {}),
    ...(q.walletId ? { walletId: q.walletId } : {}),
    ...(q.asset ? { assetKey: q.asset } : {}),
  };

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { wallet: { select: { label: true } } },
  });

  const hasMore = rows.length > q.take;
  return ok({ items: rows.slice(0, q.take), nextCursor: hasMore ? rows[q.take - 1].id : null });
});

/**
 * Records a manual BUY or SELL — the only way to bring off-chain history
 * (an exchange purchase, say) into the ledger. The asset must have
 * market data, so the position can be valued; the price is what the user
 * paid, or the day's close when they leave it blank.
 *
 * Fees paid in cash are folded into the leg's value: a buy costs
 * quantity × price + fee, a sale yields quantity × price − fee.
 */
export const POST = authed('portfolio:transactions:create', async (user, request) => {
  const parsed = await parseBody(request, manualTransactionSchema);
  if ('error' in parsed) return parsed.error;
  const input = parsed.data;
  const assetKey = `sym:${input.symbol}`;

  const quotes = await getCurrentPrices([assetKey]);
  const quote = quotes.get(assetKey);
  if (!quote) {
    return fail(`No market data was found for ${input.symbol}, so it could not be valued. Check the ticker.`, 400);
  }

  let price = input.priceUsd ?? null;
  let priceSource = 'entered by you';
  if (price === null) {
    const history = await getDailyHistory(assetKey, input.date.getTime() - 3 * DAY_MS, input.date.getTime() + DAY_MS);
    price = priceAt(history, input.date.getTime());
    priceSource = 'daily close on that date';
    if (price === null) {
      return fail(`No ${input.symbol} price is available for that date. Enter the price you paid.`, 400);
    }
  }

  const fee = input.feeUsd ?? 0;
  const gross = input.quantity * price;
  const usdValue = input.type === 'BUY' ? gross + fee : gross - fee;
  if (usdValue < 0) return fail('The fee exceeds the value of the sale.', 400);

  const id = crypto.randomUUID();
  const created = await prisma.transaction.create({
    data: {
      userId: user.id,
      source: 'MANUAL',
      externalId: `manual:${id}`,
      groupId: `manual:${id}`,
      timestamp: input.date,
      assetKey,
      symbol: input.symbol,
      assetName: quote.name ?? null,
      amount: new Prisma.Decimal(input.quantity.toFixed(18)),
      direction: input.type === 'BUY' ? 1 : -1,
      usdValue: new Prisma.Decimal(usdValue.toFixed(8)),
      priceUsd: new Prisma.Decimal(price.toFixed(12)),
      priceSource,
      type: input.type,
      userOverride: true,
      metadata: { feeUsd: fee, ...(input.note ? { note: input.note } : {}) },
    },
  });

  return ok(created, `${input.type === 'BUY' ? 'Purchase' : 'Sale'} recorded`, 201);
});
