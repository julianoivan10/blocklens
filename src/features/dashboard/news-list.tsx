import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Block, BlockHead, EmptyState, ErrorState } from '@/components/ui/block';
import { ROUTES } from '@/lib/constants';
import { isOk } from '@/services/result';
import { getNewsFeedResult } from '@/server/data/news';
import { ArticleRow } from '@/features/news/article-row';

/**
 * The news register on the workspace overview.
 *
 * Uses the same row component as the News page, so a story looks and
 * behaves identically wherever it appears — and clicking it lands on the
 * BlockLens article page rather than jumping straight out to the
 * publisher.
 */
export async function NewsList({ limit = 5, label = 'Latest' }: { limit?: number; label?: string }) {
  const result = await getNewsFeedResult();

  if (!isOk(result)) {
    return (
      <Block>
        <BlockHead label={label} />
        <ErrorState
          className="mt-6"
          title="News is temporarily unavailable."
          description="No news source responded. The rest of this page is unaffected."
        />
      </Block>
    );
  }

  const articles = result.data.slice(0, limit);

  return (
    <Block>
      <BlockHead
        label={label}
        aside={
          <Link
            href={ROUTES.news}
            className="group inline-flex items-center gap-1.5 text-ink-faint transition-colors hover:text-ink"
          >
            <span className="t-micro-tight">All news</span>
            <ArrowRight className="size-3 transition-transform duration-300 ease-out-quint group-hover:translate-x-0.5" />
          </Link>
        }
      />

      {articles.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No recent news available."
          description="The configured sources returned no stories for this window."
        />
      ) : (
        <ul className="-ml-4 flex flex-col">
          {articles.map((article) => (
            <ArticleRow key={article.id} article={article} />
          ))}
        </ul>
      )}
    </Block>
  );
}
