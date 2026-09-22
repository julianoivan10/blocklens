import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { authed, fail, ok, parseBody } from '@/server/api';
import { alertSchema } from '@/lib/portfolio/validation';

const MAX_ALERTS = 50;

export const GET = authed('alerts:list', async (user) => {
  const [alerts, events] = await Promise.all([
    prisma.alert.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    prisma.alertEvent.findMany({ where: { userId: user.id }, orderBy: { triggeredAt: 'desc' }, take: 50 }),
  ]);
  return ok({ alerts, events });
});

export const POST = authed('alerts:create', async (user, request) => {
  const parsed = await parseBody(request, alertSchema);
  if ('error' in parsed) return parsed.error;
  const input = parsed.data;

  if ((await prisma.alert.count({ where: { userId: user.id } })) >= MAX_ALERTS) {
    return fail(`You can keep up to ${MAX_ALERTS} alerts.`, 400);
  }
  if (input.walletId) {
    const owned = await prisma.wallet.count({ where: { id: input.walletId, userId: user.id } });
    if (!owned) return fail('Wallet not found', 404);
  }

  const alert = await prisma.alert.create({
    data: {
      userId: user.id,
      type: input.type,
      symbol: input.symbol ?? null,
      walletId: input.walletId ?? null,
      threshold: input.threshold !== undefined ? new Prisma.Decimal(input.threshold) : null,
      cooldownMinutes: input.cooldownMinutes,
      notifyEmail: input.notifyEmail,
      // Transaction alerts start watching from now, never from history.
      lastSeenAt: ['LARGE_TRANSACTION', 'WALLET_ACTIVITY'].includes(input.type) ? new Date() : null,
    },
  });
  return ok(alert, 'Alert created', 201);
});
