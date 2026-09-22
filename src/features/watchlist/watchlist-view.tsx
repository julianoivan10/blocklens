'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { AssetMark } from '@/components/data/asset-mark';
import { Delta } from '@/components/data/delta';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/block';
import { ROUTES } from '@/lib/constants';
import { formatCompactCurrency, formatDate, formatPrice } from '@/lib/format';
import { useWatchlist } from '@/hooks/use-watchlist';
import type { WatchlistItemWithData } from '@/types';
import { NoteCell } from './note-cell';

/**
 * The watchlist as a ruled ledger.
 *
 * Aligned columns on a shared baseline — symbol, name, price, change,
 * market cap, date added — rather than a stack of rounded rows. The
 * remove control only appears on hover or keyboard focus, so the
 * default reading of the table is data, not controls.
 */
export function WatchlistView({ items }: { items: WatchlistItemWithData[] }) {
  const { remove, isPending } = useWatchlist();

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your watchlist is empty"
        description="Open any asset dossier and add it from the header. Held assets show a current price, 24-hour change and market cap here."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`${ROUTES.research}/BTC`}>
              <Button variant="line" size="sm">
                Bitcoin
              </Button>
            </Link>
            <Link href={`${ROUTES.research}/ETH`}>
              <Button variant="line" size="sm">
                Ethereum
              </Button>
            </Link>
            <Link href={`${ROUTES.research}/SOL`}>
              <Button variant="line" size="sm">
                Solana
              </Button>
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="t-micro py-3 pr-4 text-left font-medium">
              Asset
            </th>
            <th scope="col" className="t-micro py-3 px-4 text-right font-medium">
              Price
            </th>
            <th scope="col" className="t-micro py-3 px-4 text-right font-medium">
              24h
            </th>
            <th scope="col" className="t-micro py-3 px-4 text-right font-medium">
              Market cap
            </th>
            <th scope="col" className="t-micro py-3 px-4 text-left font-medium">
              Notes
            </th>
            <th scope="col" className="t-micro py-3 px-4 text-right font-medium">
              Added
            </th>
            <th scope="col" className="w-10 py-3">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="group border-b border-line-faint transition-colors hover:bg-panel/50">
              <th scope="row" className="py-4 pr-4 text-left font-normal">
                <Link
                  href={`${ROUTES.research}/${item.symbol}`}
                  className="group/link flex items-center gap-3.5"
                >
                  <AssetMark symbol={item.symbol} size="sm" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[0.875rem] font-medium text-ink transition-colors group-hover/link:text-signal">
                      {item.name}
                    </span>
                    <span className="t-micro-tight">{item.symbol}</span>
                  </span>
                </Link>
              </th>

              <td className="t-figure px-4 py-4 text-right text-[0.8125rem]">
                {item.currentPrice !== undefined ? formatPrice(item.currentPrice) : '—'}
              </td>

              <td className="px-4 py-4 text-right">
                {item.priceChangePercentage24h !== undefined ? (
                  <Delta value={item.priceChangePercentage24h} size="sm" />
                ) : (
                  <span className="t-micro-tight text-ink-ghost">—</span>
                )}
              </td>

              <td className="t-figure px-4 py-4 text-right text-[0.8125rem] text-ink-dim">
                {item.marketCap !== undefined ? formatCompactCurrency(item.marketCap) : '—'}
              </td>

              <td className="px-4 py-4">
                <NoteCell symbol={item.symbol} initial={item.notes} />
              </td>

              <td className="t-micro-tight px-4 py-4 text-right text-ink-ghost">
                {formatDate(item.addedAt)}
              </td>

              <td className="py-4 text-right">
                <button
                  type="button"
                  onClick={() => void remove(item.symbol)}
                  disabled={isPending}
                  aria-label={`Remove ${item.name} from watchlist`}
                  className="size-7 text-ink-ghost opacity-0 transition-all hover:text-down focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                >
                  <X className="mx-auto size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
