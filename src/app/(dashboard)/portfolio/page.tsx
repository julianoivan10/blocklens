import Link from 'next/link';
import { Suspense } from 'react';
import { Container } from '@/components/ui/section';
import { EmptyState, ErrorState } from '@/components/ui/block';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/server/auth/session';
import { getLedgerSnapshot, getPerformance, getPortfolioOverview } from '@/server/portfolio/service';
import { getLatestInsight } from '@/server/portfolio/insights';
import { aiConfigured } from '@/services/ai/config';
import { PERIODS, type PeriodId } from '@/lib/portfolio/benchmark';
import { AllocationBlocks, DataNotices, Kpis, PositionsTable, SinceLine } from '@/features/portfolio/overview-sections';
import { PerformanceSection, PeriodTabs, RiskSection } from '@/features/portfolio/performance-section';
import { InsightsPanel } from '@/features/portfolio/insights-panel';
import { OverviewSkeleton, PerformanceSkeleton, InsightsSkeleton } from '@/features/portfolio/skeletons';
import { logServerError } from '@/server/log';

export const metadata = { title: 'Portfolio' };

/**
 * The portfolio streams in three independent sections, so the holdings
 * appear as soon as the ledger snapshot and current quotes are ready:
 *
 *   1. holdings — KPIs, data notices, positions, allocation
 *   2. performance & risk — needs the value timeline and daily history
 *   3. AI insights — only reads the stored insight; never calls Gemini
 *
 * A slow or failing section degrades alone.
 */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser('/portfolio');
  const { period: requested } = await searchParams;
  const period = (PERIODS.find((p) => p.id === requested)?.id ?? '90d') as PeriodId;

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[1.75rem] leading-none text-ink">Portfolio</h1>
          <Suspense fallback={<span className="t-micro-tight text-ink-ghost">&nbsp;</span>}>
            <Since userId={user.id} />
          </Suspense>
        </div>
        <div className="flex gap-2">
          <Link href="/portfolio/wallets"><Button variant="line" size="sm">Wallets</Button></Link>
          <Link href="/portfolio/transactions"><Button variant="line" size="sm">Transactions</Button></Link>
        </div>
      </header>

      <Suspense fallback={<OverviewSkeleton />}>
        <Holdings userId={user.id} />
      </Suspense>

      <Suspense fallback={<PerformanceSkeleton />}>
        <Performance userId={user.id} period={period} />
      </Suspense>

      <Suspense fallback={<InsightsSkeleton />}>
        <Insights userId={user.id} period={period} />
      </Suspense>
    </Container>
  );
}

async function hasLedger(userId: string) {
  const { snapshot } = await getLedgerSnapshot(userId);
  return snapshot.legCount > 0;
}

async function Since({ userId }: { userId: string }) {
  // The holdings section reports a failure; this line simply stays empty.
  const overview = await getPortfolioOverview(userId).catch(() => null);
  return overview ? <SinceLine overview={overview} /> : null;
}

async function Holdings({ userId }: { userId: string }) {
  let overview;
  try {
    overview = await getPortfolioOverview(userId);
  } catch (error) {
    logServerError('portfolio:holdings', error);
    return (
      <ErrorState
        title="Couldn't load your holdings"
        description="The database or a price provider did not answer. No figures are shown rather than incomplete ones. Try again shortly."
      />
    );
  }

  if (overview.legCount === 0) {
    return (
      <EmptyState
        title="No holdings yet"
        description="Add a wallet address to import its on-chain history, or record a purchase made elsewhere. BlockLens only ever reads public addresses — it never asks for a private key or recovery phrase."
        action={
          <div className="flex gap-2">
            <Link href="/portfolio/wallets"><Button variant="line" size="sm">Add a wallet</Button></Link>
            <Link href="/portfolio/transactions"><Button variant="quiet" size="sm">Record a purchase</Button></Link>
          </div>
        }
      />
    );
  }

  return (
    <>
      <Kpis overview={overview} />
      <DataNotices overview={overview} />
      <div className="mt-12">
        <PositionsTable positions={overview.positions} />
      </div>
      <div className="mt-14">
        <AllocationBlocks overview={overview} />
      </div>
    </>
  );
}

async function Performance({ userId, period }: { userId: string; period: PeriodId }) {
  if (!(await hasLedger(userId))) return null;
  let perf;
  try {
    perf = await getPerformance(userId, period);
  } catch (error) {
    logServerError('portfolio:performance', error);
    return (
      <div className="mt-16">
        <ErrorState
          title="Performance is temporarily unavailable"
          description="Historical prices could not be loaded. Holdings above are unaffected."
        />
      </div>
    );
  }
  return (
    <div id="performance" className="mt-16 flex scroll-mt-20 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-[1.25rem] text-ink">Performance &amp; risk</h2>
        <PeriodTabs current={period} />
      </div>
      <PerformanceSection perf={perf} />
      <RiskSection metrics={perf.risk} />
    </div>
  );
}

async function Insights({ userId, period }: { userId: string; period: PeriodId }) {
  if (!(await hasLedger(userId))) return null;
  const insight = await getLatestInsight(userId).catch((error) => {
    logServerError('portfolio:insights', error);
    return null;
  });
  return (
    <div className="mt-16">
      <InsightsPanel initial={insight} period={period} configured={aiConfigured()} />
    </div>
  );
}
