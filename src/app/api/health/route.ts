import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { logServerError } from '@/server/log';
import { aiConfigured, geminiModel } from '@/services/ai/config';

export const dynamic = 'force-dynamic';

/**
 * Deployment health, for verifying a production environment after a
 * deploy. Reports whether each dependency is configured and reachable —
 * never a value, a host name or a key prefix.
 */
export async function GET() {
  let database: 'ok' | 'unreachable' | 'schema-missing' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
    // The newest table: if it is missing, the schema was not pushed here.
    await prisma.wallet.findFirst({ select: { id: true } }).catch((error: { code?: string }) => {
      if (error?.code === 'P2021') database = 'schema-missing';
      else throw error;
    });
  } catch (error) {
    logServerError('health:database', error);
    database = 'unreachable';
  }

  const secret = process.env.AUTH_SECRET ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const checks = {
    database,
    authSecret: secret.length >= 32 ? 'ok' : 'missing',
    appUrl: appUrl.startsWith('https://') ? 'ok' : appUrl ? 'not-https' : 'missing',
    email: process.env.RESEND_API_KEY ? 'configured' : 'missing',
    ai: aiConfigured() ? `configured (${geminiModel()})` : 'missing',
    chainData: process.env.ALCHEMY_API_KEY ? 'configured' : 'missing',
    cron: (process.env.CRON_SECRET?.length ?? 0) >= 16 ? 'configured' : 'missing',
  };

  const healthy = database === 'ok' && checks.authSecret === 'ok';
  return NextResponse.json({ healthy, checks }, { status: healthy ? 200 : 503 });
}
