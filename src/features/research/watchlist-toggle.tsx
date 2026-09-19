'use client';

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWatchlist } from '@/hooks/use-watchlist';

/**
 * Add or remove this asset.
 *
 * Optimistic: the label flips immediately and reverts if the request
 * fails, because a research reader clicking this expects the state to
 * answer them, not to wait on a round trip.
 */
export function WatchlistToggle({
  symbol,
  name,
  initiallyWatched,
}: {
  symbol: string;
  name: string;
  initiallyWatched: boolean;
}) {
  const { add, remove, isPending } = useWatchlist();
  const [watched, setWatched] = useState(initiallyWatched);

  async function onToggle() {
    const next = !watched;
    setWatched(next);
    const ok = next ? await add(symbol, name) : await remove(symbol);
    if (!ok) setWatched(!next);
  }

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={isPending}
      aria-pressed={watched}
      className={cn(
        'inline-flex items-center gap-2 border px-3 py-1.5 transition-colors duration-200',
        'font-mono text-[0.625rem] font-medium uppercase tracking-widest',
        'disabled:opacity-50',
        watched
          ? 'border-signal-deep/60 text-signal hover:border-down/50 hover:text-down'
          : 'border-line text-ink-faint hover:border-ink-ghost hover:text-ink'
      )}
    >
      {watched ? <Check className="size-3" /> : <Plus className="size-3" />}
      {/* The label states the current state, not the pending action, so
          the control reads the same way as its aria-pressed value. */}
      {watched ? 'Watching' : 'Watch'}
    </button>
  );
}
