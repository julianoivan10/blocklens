import { Suspense } from 'react';
import { Container } from '@/components/ui/section';
import { RegisterSkeleton, Skeleton } from '@/components/ui/skeleton';
import { MarketContext } from './market-context';
import { MoversPanel } from './movers-panel';
import { TrendingPanel } from './trending-panel';
import { NewsList } from './news-list';
import { WatchlistPanel } from '@/features/watchlist/watchlist-panel';
import { getMovers } from '@/server/data/market';

/**
 * The workspace overview.
 *
 * Hierarchy by scale rather than by card count: one hero figure, then
 * three unequal columns, then the news register at the bottom. Each
 * region streams in behind its own Suspense boundary, so the market
 * figure paints as soon as it is ready instead of waiting on the
 * slowest provider.
 */
export function DashboardOverview() {
  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">Overview</h1>
        <p className="t-micro-tight text-ink-ghost">Market context and what you follow</p>
      </header>

      <Suspense fallback={<MarketContextSkeleton />}>
        <MarketContext />
      </Suspense>

      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Suspense fallback={<PanelSkeleton />}>
            <WatchlistPanel limit={6} />
          </Suspense>
        </div>

        <div className="lg:col-span-4">
          <Suspense fallback={<PanelSkeleton />}>
            <MoversRegion />
          </Suspense>
        </div>

        <div className="lg:col-span-3">
          <Suspense fallback={<PanelSkeleton />}>
            <TrendingPanel />
          </Suspense>
        </div>
      </div>

      <div className="mt-16">
        <Suspense fallback={<PanelSkeleton rows={4} />}>
          <NewsList limit={5} />
        </Suspense>
      </div>
    </Container>
  );
}

/** Reads both mover lists in one pass, then hands them to the client. */
async function MoversRegion() {
  const { gainers, losers } = await getMovers();
  return <MoversPanel gainers={gainers} losers={losers} />;
}

function MarketContextSkeleton() {
  return (
    <div className="flex flex-col gap-8 border-b border-line pb-10 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-2 w-44" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-2 w-52" />
      </div>
      <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-2 w-20" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-line pb-3">
        <Skeleton className="h-2 w-24" />
      </div>
      <RegisterSkeleton rows={rows} />
    </div>
  );
}
