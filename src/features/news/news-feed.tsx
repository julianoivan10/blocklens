import Link from 'next/link';
import { EmptyState, ErrorState } from '@/components/ui/block';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/constants';
import { isOk } from '@/services/result';
import {
  applyFilter,
  buildFacets,
  describeFilter,
  getNewsFeedResult,
  type FeedFilter,
} from '@/server/data/news';
import { ArticleLead, ArticleRow } from './article-row';
import { NewsFilterBar } from './filter-bar';

/**
 * The news feed.
 *
 * Reads the window once, derives the filter chips from it, then renders a
 * lead story and a compact register beneath. One provider failing costs
 * its own articles and nothing else — that is handled in the composite
 * service, so by the time the feed gets here a partial result is simply a
 * shorter list. Only a total outage produces the error state, and nothing
 * is ever substituted for missing stories.
 */
export async function NewsFeed({ filter }: { filter: FeedFilter }) {
  const result = await getNewsFeedResult();

  if (!isOk(result)) {
    return (
      <ErrorState
        title="News is temporarily unavailable."
        description="No news source responded. This affects only this page — market and research data are unaffected."
      />
    );
  }

  const all = result.data;

  if (all.length === 0) {
    return (
      <EmptyState
        title="No recent news available."
        description="The configured sources returned no stories for this window. Nothing has been substituted in their place."
      />
    );
  }

  const facets = buildFacets(all);
  const articles = applyFilter(all, filter);
  const active = describeFilter(filter, facets);

  return (
    <div className="flex flex-col">
      <NewsFilterBar facets={facets} filter={filter} total={all.length} />

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h2 className="t-micro">{active ? active : 'Latest'}</h2>
        <span className="t-micro-tight text-ink-ghost">
          {articles.length} {articles.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      {articles.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing matches this filter."
            description="No story in the current window carries that combination. Clear the filter to see everything."
            action={
              <Link href={ROUTES.news}>
                <Button variant="line" size="sm">
                  Show all news
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-2">
          {/* The lead only makes sense unfiltered or on a broad filter —
              and only when it actually has an image to carry it. */}
          {articles[0].imageUrl ? (
            <>
              <ArticleLead article={articles[0]} />
              <ul className="flex flex-col">
                {articles.slice(1).map((article, i) => (
                  <ArticleRow key={article.id} article={article} index={i + 2} />
                ))}
              </ul>
            </>
          ) : (
            <ul className="flex flex-col border-t border-line-faint">
              {articles.map((article, i) => (
                <ArticleRow key={article.id} article={article} index={i + 1} />
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="t-micro-tight mt-10 max-w-[44rem] border-t border-line-faint pt-5 leading-relaxed text-ink-ghost">
        BlockLens shows headlines, excerpts and metadata as published by each source.
        Full articles remain on the publisher&rsquo;s own site.
      </p>
    </div>
  );
}

/**
 * The loading state, shaped like the feed it replaces: a filter rule, a
 * lead block, then rows with thumbnails.
 */
export function NewsFeedSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-5 border-b border-line pb-2">
        {[3.5, 5, 4.5, 4].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: `${w}rem` }} />
        ))}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <Skeleton className="h-2 w-16" />
        <Skeleton className="h-2 w-14" />
      </div>

      {/* Lead */}
      <div className="mt-4 flex flex-col gap-6 border-b border-line py-6 lg:flex-row lg:gap-10">
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-2 w-40" />
          <Skeleton className="h-6 w-full max-w-[28rem]" />
          <Skeleton className="h-6 w-3/5 max-w-[20rem]" />
          <Skeleton className="mt-1 h-2.5 w-full max-w-[32rem]" />
          <Skeleton className="h-2.5 w-4/5 max-w-[26rem]" />
        </div>
        <Skeleton className="aspect-[16/9] w-full lg:w-[26rem] lg:shrink-0" />
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-b border-line-faint py-5 last:border-b-0 sm:gap-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-2 w-36" />
              <Skeleton className="h-3.5 w-full max-w-[30rem]" />
              <Skeleton className="h-2.5 w-4/5 max-w-[24rem]" />
            </div>
            <Skeleton className="aspect-[16/10] w-[5.5rem] shrink-0 sm:w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
