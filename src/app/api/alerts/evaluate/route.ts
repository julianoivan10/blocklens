import { prisma } from '@/server/db';
import { authed, fail, ok } from '@/server/api';
import { evaluateAlertsForUser } from '@/server/alerts';

export const maxDuration = 60;

/** "Check now" — evaluates the signed-in user's alerts immediately. */
export const POST = authed('alerts:evaluate', async (user) => {
  const recent = await prisma.alert.findFirst({
    where: { userId: user.id, lastEvaluatedAt: { gt: new Date(Date.now() - 30_000) } },
    select: { id: true },
  });
  if (recent) return fail('Alerts were checked moments ago.', 429);

  const result = await evaluateAlertsForUser(user.id);
  return ok(result, result.fired ? `${result.fired} alert${result.fired === 1 ? '' : 's'} fired` : 'No alert conditions were met');
});
