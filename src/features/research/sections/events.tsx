import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/block';
import { ResearchSection } from './research-section';
import { ArticleRow } from '@/features/news/article-row';
import { ROUTES } from '@/lib/constants';
import type { NewsArticle } from '@/types';

/**
 * Developments for one asset.
 *
 * Shares the row component with the News page, so a story behaves the
 * same way wherever a reader meets it: the row opens the BlockLens
 * article page, and the jump to the publisher is an explicit action there.
 */
export function EventsSection({
  symbol,
  news,
}: {
  symbol: string;
  news: NewsArticle[];
}) {
  return (
    <ResearchSection
      id="events"
      ordinal="05"
      label="Events"
      title="Developments worth knowing"
      intro="Reported activity around the asset, with the source and timing of each report."
      aside={
        <Link
          href={`${ROUTES.news}?asset=${symbol.toLowerCase()}`}
          className="group inline-flex items-center gap-1.5 text-ink-faint transition-colors hover:text-ink"
        >
          <span className="t-micro-tight">All {symbol} news</span>
          <ArrowRight className="size-3 transition-transform duration-300 ease-out-quint group-hover:translate-x-0.5" />
        </Link>
      }
    >
      {news.length === 0 ? (
        <EmptyState
          title="Nothing reported"
          description={`No recent article in the current window references ${symbol}. Nothing has been substituted in its place.`}
        />
      ) : (
        <ul className="-ml-4 flex flex-col border-t border-line-faint">
          {news.map((article, i) => (
            <ArticleRow key={article.id} article={article} index={i + 1} />
          ))}
        </ul>
      )}
    </ResearchSection>
  );
}
