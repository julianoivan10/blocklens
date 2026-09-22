import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { authed, fail, ok, parseBody } from '@/server/api';
import { alertUpdateSchema } from '@/lib/portfolio/validation';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed<Ctx>('alerts:update', async (user, request, { params }) => {
  const { id } = await params;
  const parsed = await parseBody(request, alertUpdateSchema);
  if ('error' in parsed) return parsed.error;
  const { threshold, ...rest } = parsed.data;

  const { count } = await prisma.alert.updateMany({
    where: { id, userId: user.id },
    data: {
      ...rest,
      ...(threshold !== undefined ? { threshold: new Prisma.Decimal(threshold), lastState: false } : {}),
    },
  });
  if (count === 0) return fail('Alert not found', 404);
  return ok(null, 'Alert updated');
});

export const DELETE = authed<Ctx>('alerts:delete', async (user, _request, { params }) => {
  const { id } = await params;
  const { count } = await prisma.alert.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return fail('Alert not found', 404);
  return ok(null, 'Alert deleted');
});
