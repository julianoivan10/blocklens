import Link from 'next/link';
import { AssetList, AssetRow } from '@/components/data/asset-row';
import { Block, BlockHead, EmptyState, ErrorState } from '@/components/ui/block';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { verifySession } from '@/server/auth/session';
import { getWatchlist } from '@/server/data/watchlist';
import type { WatchlistWithItems } from '@/types';

/**
 * The user's held assets, read from the database.
 *
 * The watchlist screen was previously a hardcoded empty state with no
 * way to fill it, even though the Prisma models existed — this reads
 * the real rows.
 *
 * It sits on the overview beside regions that need no database, so a
 * database failure degrades this panel alone rather than taking the
 * whole workspace down with it.
 */
export async function WatchlistPanel({ limit }: { limit?: number }) {
  const user = await verifySession();
  if (!user) return null;

  let watchlist: WatchlistWithItems;
  try {
    watchlist = await getWatchlist(user.id);
  } catch (error) {
    console.error('Watchlist panel read failed:', error);
    return (
      <Block>
        <BlockHead label="Watchlist" />
        <ErrorState
          className="mt-6"
          title="Couldn't load your watchlist"
          description="The database didn't answer. Everything else on this page is unaffected."
        />
      </Block>
    );
  }

  const items = limit ? watchlist.items.slice(0, limit) : watchlist.items;

  return (
    <Block>
      <BlockHead
        label="Watchlist"
        aside={
          watchlist.items.length > 0 ? (
            <Link
              href={ROUTES.watchlist}
              className="t-micro-tight text-ink-faint transition-colors hover:text-ink"
            >
              {watchlist.items.length} held
            </Link>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Nothing held yet"
          description="Open any asset and add it from the dossier header. Held assets appear here with a current reading."
          action={
            <Link href={`${ROUTES.research}/BTC`}>
              <Button variant="line" size="sm">
                Start with BTC
              </Button>
            </Link>
          }
        />
      ) : (
        <AssetList className="-ml-4">
          {/* Ordinals here too, so this column's rows share the exact
              structure of Movers and Trending beside it. */}
          {items.map((item, i) => (
            <AssetRow
              key={item.id}
              index={i + 1}
              symbol={item.symbol}
              name={item.name}
              price={item.currentPrice}
              change={item.priceChangePercentage24h}
            />
          ))}
        </AssetList>
      )}
    </Block>
  );
}
