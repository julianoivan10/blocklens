'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Newspaper, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearch } from '@/hooks/use-search';
import { AssetMark } from '@/components/data/asset-mark';
import { formatTimeAgo } from '@/lib/format';
import { ROUTES } from '@/lib/constants';
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

interface ArticleHit {
  slug: string;
  title: string;
  source: string;
  publishedAt: string;
}

interface SearchPayload {
  assets: SearchResult[];
  articles: ArticleHit[];
}

/**
 * A row in the result list.
 *
 * Assets and articles share one flat, navigable list so the arrow keys
 * move through everything in order — grouping is a visual heading, not a
 * separate focus context. Adding news to the existing palette is what
 * keeps search singular: there is no second search box anywhere.
 */
type Row =
  | { kind: 'asset'; key: string; symbol: string; name: string; rank?: number }
  | { kind: 'article'; key: string; slug: string; title: string; source: string; publishedAt: string };

function toRows(payload: SearchPayload | null, suggested: SearchResult[]): Row[] {
  const assets = (payload?.assets ?? suggested).map<Row>((asset) => ({
    kind: 'asset',
    key: `asset:${asset.id}`,
    symbol: asset.symbol,
    name: asset.name,
    rank: asset.marketCapRank,
  }));

  const articles = (payload?.articles ?? []).map<Row>((article) => ({
    kind: 'article',
    key: `article:${article.slug}`,
    slug: article.slug,
    title: article.title,
    source: article.source,
    publishedAt: article.publishedAt,
  }));

  return [...assets, ...articles];
}

/**
 * Global search.
 *
 * A console rather than a dialog: it drops from the top edge, spans a wide
 * measure, and is built from the same hairlines and mono labels as the
 * rest of the product.
 *
 * Keyboard is the primary path — arrows move, Enter opens, Escape closes —
 * and the active row is announced through aria-activedescendant rather
 * than by moving focus out of the field.
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
  const [answer, setAnswer] = useState<{ q: string; payload: SearchPayload } | null>(null);
  const [cursor, setCursor] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const trimmed = query.trim();

  // Loading and results are derived from whether the stored answer
  // matches what is currently typed — no second piece of state to keep in
  // sync, and no stale results after the field is cleared.
  const loading = Boolean(trimmed) && answer?.q !== trimmed;
  const payload = answer?.q === trimmed ? answer.payload : null;
  const rows = useMemo(
    () => (trimmed ? toRows(payload, []) : toRows(null, SUGGESTED)),
    [trimmed, payload]
  );

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
        const data: ApiResponse<SearchPayload> = await res.json();
        setAnswer({
          q: trimmed,
          payload: data.success && data.data ? data.data : { assets: [], articles: [] },
        });
      } catch (error) {
        // An aborted request is a superseded keystroke, not a failure.
        if ((error as Error).name !== 'AbortError') {
          setAnswer({ q: trimmed, payload: { assets: [], articles: [] } });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const open = useCallback(
    (row: Row) => {
      onClose();
      router.push(
        row.kind === 'asset'
          ? `${ROUTES.research}/${row.symbol.toUpperCase()}`
          : `${ROUTES.news}/${row.slug}`
      );
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
      setCursor((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[cursor];
      if (row) open(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  const nothingFound = Boolean(trimmed) && !loading && rows.length === 0;

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
          aria-label="Search assets and news"
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
              placeholder="Search assets and news"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded
              aria-controls="search-results"
              aria-activedescendant={rows[cursor] ? `search-item-${cursor}` : undefined}
              className="h-13 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-ghost focus:outline-none"
            />

            {/* A scan bar on the rule, instead of a spinner. */}
            {loading && <span aria-hidden="true" className="skeleton h-px w-8 shrink-0" />}

            <kbd className="hidden shrink-0 border border-line px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-ghost sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            id="search-results"
            role="listbox"
            aria-label="Results"
            className="max-h-[min(26rem,56vh)] overflow-y-auto"
          >
            {nothingFound ? (
              <div className="px-4 pb-6 pt-4">
                <p className="text-[0.875rem] text-ink-dim">Nothing matches “{trimmed}”.</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-faint">
                  Try a ticker such as BTC, a name such as Ethereum, or a word from a
                  headline.
                </p>
              </div>
            ) : (
              rows.map((row, i) => {
                const active = i === cursor;
                // A heading whenever the kind changes.
                const heading =
                  i === 0
                    ? trimmed
                      ? row.kind === 'asset'
                        ? 'Assets'
                        : 'News'
                      : 'Suggested'
                    : rows[i - 1].kind !== row.kind
                      ? row.kind === 'asset'
                        ? 'Assets'
                        : 'News'
                      : null;

                return (
                  <div key={row.key}>
                    {heading && (
                      <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-3">
                        <span className="t-micro">{heading}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      id={`search-item-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={active}
                      onClick={() => open(row)}
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

                      {row.kind === 'asset' ? (
                        <>
                          <AssetMark symbol={row.symbol} size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[0.875rem] font-medium text-ink">
                              {row.name}
                            </span>
                            <span className="t-micro-tight">
                              {row.symbol}
                              {row.rank ? ` · rank ${row.rank}` : ''}
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            aria-hidden="true"
                            className="flex size-7 shrink-0 items-center justify-center border border-line bg-panel-sunken text-ink-faint"
                          >
                            <Newspaper className="size-3.5" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="line-clamp-1 text-[0.875rem] font-medium text-ink">
                              {row.title}
                            </span>
                            <span className="t-micro-tight">
                              {row.source} · {formatTimeAgo(row.publishedAt)}
                            </span>
                          </span>
                        </>
                      )}

                      <CornerDownLeft
                        aria-hidden="true"
                        className={cn(
                          'size-3.5 shrink-0 transition-opacity',
                          active ? 'text-signal opacity-100' : 'opacity-0'
                        )}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Keyboard legend — the affordance that makes a console feel
              like one. */}
          <div className="flex items-center gap-5 border-t border-line px-4 py-2.5">
            <Hint keys="↑↓" label="Navigate" />
            <Hint keys="↵" label="Open" />
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
