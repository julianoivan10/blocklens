import { Container } from '@/components/ui/section';
import { Block, BlockHead } from '@/components/ui/block';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { AlertManager } from '@/features/alerts/alert-manager';
import { formatTimeAgo } from '@/lib/format';

export const metadata = { title: 'Alerts' };

export default async function AlertsPage() {
  const user = await requireUser('/alerts');
  const [alerts, events, wallets, profile] = await Promise.all([
    prisma.alert.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    prisma.alertEvent.findMany({ where: { userId: user.id }, orderBy: { triggeredAt: 'desc' }, take: 50 }),
    prisma.wallet.findMany({ where: { userId: user.id }, select: { id: true, label: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } }),
  ]);

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-10 max-w-[44rem]">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">Alerts</h1>
        <p className="t-body mt-4">
          Alerts fire when a condition first becomes true, then stay quiet until it clears — and never more often than the
          gap you choose. They are checked once a day automatically, or whenever you press “Check now”.
        </p>
      </header>

      <AlertManager
        emailVerified={Boolean(profile?.emailVerified)}
        wallets={wallets}
        alerts={alerts.map((a) => ({
          id: a.id,
          type: a.type,
          symbol: a.symbol,
          walletId: a.walletId,
          threshold: a.threshold?.toNumber() ?? null,
          cooldownMinutes: a.cooldownMinutes,
          enabled: a.enabled,
          notifyEmail: a.notifyEmail,
          lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
          lastEvaluatedAt: a.lastEvaluatedAt?.toISOString() ?? null,
        }))}
      />

      <Block className="mt-16">
        <BlockHead label="History" aside={<span className="t-micro-tight text-ink-ghost">Latest 50</span>} />
        {events.length === 0 ? (
          <p className="t-body-sm mt-6 text-ink-faint">No alert has fired yet.</p>
        ) : (
          <ul data-testid="alert-history">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-faint py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-ink">{e.title}</span>
                  <span className="text-[0.75rem] text-ink-faint">{e.detail}</span>
                </div>
                <span className="t-micro-tight text-ink-ghost">
                  {formatTimeAgo(e.triggeredAt)}
                  {e.emailed ? ' · emailed' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </Container>
  );
}
