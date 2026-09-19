import { redirect } from 'next/navigation';
import { Container } from '@/components/ui/section';
import { ROUTES } from '@/lib/constants';
import { verifySession } from '@/server/auth/session';
import { getWatchlist } from '@/server/data/watchlist';
import { WatchlistView } from '@/features/watchlist/watchlist-view';

export const metadata = { title: 'Watchlist' };

export default async function WatchlistPage() {
  const user = await verifySession();
  // Middleware already guards this route; this is the defence in depth
  // that keeps the data read from ever running without a session.
  if (!user) redirect(ROUTES.login);

  const watchlist = await getWatchlist(user.id);

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">Watchlist</h1>
        <p className="t-micro-tight text-ink-ghost">
          {watchlist.items.length === 0
            ? 'No assets held'
            : `${watchlist.items.length} ${watchlist.items.length === 1 ? 'asset' : 'assets'} held`}
        </p>
      </header>

      <WatchlistView items={watchlist.items} />
    </Container>
  );
}
