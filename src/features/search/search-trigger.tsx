'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearch } from '@/hooks/use-search';

/**
 * A large, inviting way into search for screens where searching is the
 * primary action. Shares the ruled-field treatment with real inputs so
 * it reads as a field rather than as a button.
 */
export function SearchTrigger({ className }: { className?: string }) {
  const { openSearch } = useSearch();

  return (
    <button
      type="button"
      onClick={openSearch}
      className={cn(
        'group flex w-full max-w-[28rem] items-center gap-3 border-b border-line-strong py-3',
        'transition-colors hover:border-signal',
        className
      )}
    >
      <Search className="size-4 shrink-0 text-ink-ghost transition-colors group-hover:text-signal" />
      <span className="text-[0.9375rem] text-ink-faint transition-colors group-hover:text-ink-dim">
        Search any asset
      </span>
      <kbd className="ml-auto shrink-0 border border-line px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-ghost">
        ⌘K
      </kbd>
    </button>
  );
}
