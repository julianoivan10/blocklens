import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import type { Facet, FeedFacets, FeedFilter } from '@/server/data/news';

/**
 * Feed filters.
 *
 * Links rather than client state: each chip is a real URL, so a filtered
 * feed is shareable, back-navigable and fully server-rendered. The whole
 * bar ships no JavaScript.
 *
 * Two dimensions, both computed from the articles actually in hand —
 * topics as the sources themselves filed them, and assets named in the
 * text. A chip only exists when at least two articles match it, so the
 * bar never offers a filter that leads somewhere empty and never shows a
 * category BlockLens invented.
 */
function chipHref(filter: FeedFilter, patch: Partial<FeedFilter>): string {
  const next = { ...filter, ...patch };
  const params = new URLSearchParams();
  if (next.topic) params.set('topic', next.topic);
  if (next.asset) params.set('asset', next.asset);
  const query = params.toString();
  return query ? `${ROUTES.news}?${query}` : ROUTES.news;
}

function Chip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group inline-flex shrink-0 items-baseline gap-1.5 border-b py-2 transition-colors duration-200',
        active
          ? 'border-signal text-ink'
          : 'border-transparent text-ink-faint hover:border-line-strong hover:text-ink-dim'
      )}
    >
      <span className="font-mono text-[0.6875rem] font-medium uppercase tracking-widest">
        {label}
      </span>
      {count !== undefined && (
        <span
          className={cn(
            'font-mono text-[0.5625rem] tabular-nums',
            active ? 'text-signal-deep' : 'text-ink-ghost'
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function Group({
  label,
  facets,
  filter,
  field,
  total,
}: {
  label: string;
  facets: Facet[];
  filter: FeedFilter;
  field: 'topic' | 'asset';
  /** Shown against the "all" chip for the primary group. */
  total?: number;
}) {
  if (facets.length === 0) return null;

  return (
    <div className="flex min-w-0 items-baseline gap-5">
      <span className="t-micro hidden shrink-0 text-ink-ghost lg:block">{label}</span>

      <div className="-mb-px flex min-w-0 items-baseline gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {total !== undefined && (
          <Chip
            href={chipHref(filter, { [field]: undefined })}
            label="All"
            count={total}
            active={!filter[field]}
          />
        )}
        {facets.map((facet) => (
          <Chip
            key={facet.value}
            // Selecting the active chip again clears it.
            href={chipHref(filter, {
              [field]: filter[field] === facet.value ? undefined : facet.value,
            })}
            label={facet.label}
            count={facet.count}
            active={filter[field] === facet.value}
          />
        ))}
      </div>
    </div>
  );
}

export function NewsFilterBar({
  facets,
  filter,
  total,
}: {
  facets: FeedFacets;
  filter: FeedFilter;
  total: number;
}) {
  if (facets.topics.length === 0 && facets.assets.length === 0) return null;

  return (
    <nav
      aria-label="Filter news"
      className="flex flex-col gap-3 border-b border-line lg:flex-row lg:items-baseline lg:justify-between lg:gap-10"
    >
      <Group
        label="Subject"
        facets={facets.topics}
        filter={filter}
        field="topic"
        total={total}
      />
      <Group label="Asset" facets={facets.assets} filter={filter} field="asset" />
    </nav>
  );
}
