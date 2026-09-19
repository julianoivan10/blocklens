'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearch } from '@/hooks/use-search';
import { AssetMark } from '@/components/data/asset-mark';
import type { ApiResponse, SearchResult } from '@/types';

/** Shown before anything is typed — a starting point, not a blank box. */
const SUGGESTED: SearchResult[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1 },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', marketCapRank: 2 },
  { id: 'solana', symbol: 'SOL', name: 'Solana', marketCapRank: 5 },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', marketCapRank: 9 },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', marketCapRank: 14 },
];

const DEBOUNCE_MS = 180;

/**
 * Asset search.
 *
 * A console rather than a dialog: it drops from the top edge, spans a
 * wide measure, and is built from the same hairlines and mono labels as
 * the rest of the product. The result rows are the asset rows used
 * everywhere else, so searching feels like part of the workspace rather
 * than a component library's modal.
 *
 * Keyboard is the primary path — arrows move, Enter opens, Escape
 * closes — and the active row is announced through aria-activedescendant
 * rather than by moving focus out of the field.
 */
export function CommandPalette() {
  const { isOpen, closeSearch } = useSearch();

  // Mounted only while open, so every opening starts from clean state
  // without an effect resetting it.
  if (!isOpen) return null;
  return <SearchConsole onClose={closeSearch} />;
}

function SearchConsole({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<{ q: string; items: SearchResult[] } | null>(null);
  const [cursor, setCursor] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const trimmed = query.trim();

  // Loading and results are derived from whether the stored answer
  // matches what is currently typed — no second piece of state to keep
  // in sync, and no stale results after the field is cleared.
  const loading = Boolean(trimmed) && answer?.q !== trimmed;
  const results = answer?.q === trimmed ? answer.items : [];
  const items = trimmed ? results : SUGGESTED;

  /* Lock scroll, focus the field, and restore focus on close. */
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus();
    };
  }, []);

  /* Search, debounced, with superseded responses discarded. */
  useEffect(() => {
    if (!trimmed) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data: ApiResponse<SearchResult[]> = await res.json();
        setAnswer({ q: trimmed, items: data.success ? (data.data ?? []) : [] });
      } catch (error) {
        // An aborted request is a superseded keystroke, not a failure.
        if ((error as Error).name !== 'AbortError') setAnswer({ q: trimmed, items: [] });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const open = useCallback(
    (symbol: string) => {
      onClose();
      router.push(`/research/${symbol.toUpperCase()}`);
    },
    [onClose, router]
  );

  /* Keep the active row in view when arrowing past the fold. */
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[cursor];
      if (item) open(item.symbol);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-100">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="anim-fade absolute inset-0 bg-ground-deep/80 backdrop-blur-sm"
      />

      <div className="absolute inset-x-0 top-0 flex justify-center px-4 pt-[8vh] sm:pt-[12vh]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search assets"
          className="anim-rise w-full max-w-[38rem] border border-line-strong bg-panel shadow-float"
        >
          {/* The field */}
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-ink-ghost" aria-hidden="true" />

            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search by name or ticker"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded
              aria-controls="search-results"
              aria-activedescendant={items[cursor] ? `search-item-${cursor}` : undefined}
              className="h-13 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-ghost focus:outline-none"
            />

            {/* A scan bar on the rule, instead of a spinner. */}
            {loading && (
              <span aria-hidden="true" className="skeleton h-px w-8 shrink-0" />
            )}

            <kbd className="hidden shrink-0 border border-line px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-ghost sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            id="search-results"
            role="listbox"
            aria-label="Assets"
            className="max-h-[min(24rem,52vh)] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="t-micro">{trimmed ? 'Results' : 'Suggested'}</span>
              {trimmed && !loading && (
                <span className="t-micro-tight text-ink-ghost">
                  {results.length} {results.length === 1 ? 'match' : 'matches'}
                </span>
              )}
            </div>

            {trimmed && !loading && results.length === 0 ? (
              <div className="px-4 pb-6 pt-2">
                <p className="text-[0.875rem] text-ink-dim">
                  Nothing matches “{trimmed}”.
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-faint">
                  Try a ticker such as BTC, or a full name such as Ethereum.
                </p>
              </div>
            ) : (
              items.map((item, i) => {
                const active = i === cursor;
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`search-item-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={active}
                    onClick={() => open(item.symbol)}
                    onPointerMove={() => setCursor(i)}
                    className={cn(
                      'group relative flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors',
                      active ? 'bg-panel-raised' : 'hover:bg-panel-raised/60'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-y-0 left-0 w-px transition-colors',
                        active ? 'bg-signal' : 'bg-transparent'
                      )}
                    />

                    <AssetMark symbol={item.symbol} size="sm" />

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[0.875rem] font-medium text-ink">
                        {item.name}
                      </span>
                      <span className="t-micro-tight">
                        {item.symbol}
                        {item.marketCapRank ? ` · rank ${item.marketCapRank}` : ''}
                      </span>
                    </span>

                    <CornerDownLeft
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 shrink-0 transition-opacity',
                        active ? 'text-signal opacity-100' : 'opacity-0'
                      )}
                    />
                  </button>
                );
              })
            )}
          </div>

          {/* Keyboard legend — the affordance that makes a console feel
              like one. */}
          <div className="flex items-center gap-5 border-t border-line px-4 py-2.5">
            <Hint keys="↑↓" label="Navigate" />
            <Hint keys="↵" label="Open dossier" />
            <Hint keys="esc" label="Close" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="border border-line px-1 py-0.5 font-mono text-[0.625rem] text-ink-faint">
        {keys}
      </kbd>
      <span className="t-micro-tight text-ink-ghost">{label}</span>
    </span>
  );
}
