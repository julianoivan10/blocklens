import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Container } from '@/components/ui/section';
import { NewsFeed, NewsFeedSkeleton } from '@/features/news/news-feed';
import type { FeedFilter } from '@/server/data/news';

export const metadata: Metadata = {
  title: 'News',
  description:
    'Developments across digital assets, from the crypto press and project sources, with excerpts and links to the original reporting.',
};

/* No page-level `revalidate`: reading `searchParams` makes this route
   dynamic, so the caching that matters happens a layer down — the feed
   responses themselves are cached by the fetch layer for 15 minutes, and
   every filtered view is derived from that one cached window. */

interface Props {
  searchParams: Promise<{ topic?: string; asset?: string }>;
}

/** Only lowercase, short tokens — the chips never produce anything else. */
function sanitise(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.trim().toLowerCase();
  return /^[a-z0-9]{1,20}$/.test(clean) ? clean : undefined;
}

export default async function NewsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filter: FeedFilter = {
    topic: sanitise(params.topic),
    asset: sanitise(params.asset),
  };

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-8 max-w-[38rem]">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">News</h1>
        <p className="t-body mt-4">
          Reporting from the crypto press and project sources, filed by subject and by the
          assets each story names.
        </p>
      </header>

      {/* Keyed on the filter so switching chips shows the skeleton rather
          than holding the previous list while the new one resolves. */}
      <Suspense
        key={`${filter.topic ?? 'all'}:${filter.asset ?? 'all'}`}
        fallback={<NewsFeedSkeleton />}
      >
        <NewsFeed filter={filter} />
      </Suspense>
    </Container>
  );
}
