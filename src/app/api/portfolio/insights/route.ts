import { z } from 'zod';
import { authed, fail, ok, parseBody } from '@/server/api';
import { generateInsight, getLatestInsight } from '@/server/portfolio/insights';
import { PERIODS, type PeriodId } from '@/lib/portfolio/benchmark';

export const maxDuration = 60;

const bodySchema = z.object({
  period: z.enum(PERIODS.map((p) => p.id) as [PeriodId, ...PeriodId[]]).default('90d'),
});

export const GET = authed('portfolio:insights:get', async (user) => ok(await getLatestInsight(user.id)));

export const POST = authed('portfolio:insights:generate', async (user, request) => {
  const parsed = await parseBody(request, bodySchema);
  if ('error' in parsed) return parsed.error;

  const outcome = await generateInsight(user.id, parsed.data.period);
  switch (outcome.status) {
    case 'ok':
      return ok(outcome.insight, outcome.cached ? 'Nothing changed since the last insight' : 'Insight generated');
    case 'unconfigured':
      return fail(outcome.message, 503);
    case 'rate_limited':
      return fail(outcome.message, 429);
    case 'empty':
      return fail(outcome.message, 400);
    default:
      return fail(outcome.message, 502);
  }
});
