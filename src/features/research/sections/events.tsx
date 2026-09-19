import { EmptyState } from '@/components/ui/block';
import { StatusDot } from '@/components/data/delta';
import { ResearchSection } from './research-section';
import { formatTimeAgo } from '@/lib/format';
import type { NewsArticle } from '@/types';

const SENTIMENT = {
  positive: { tone: 'up' as const, label: 'Positive' },
  negative: { tone: 'down' as const, label: 'Negative' },
  neutral: { tone: 'neutral' as const, label: 'Neutral' },
};

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
      intro="Reported activity around the asset, with the sentiment of each report stated."
      aside={<span className="t-micro-tight text-ink-ghost">RSS and GNews</span>}
    >
      {news.length === 0 ? (
        <EmptyState
          title="Nothing reported"
          description={`No recent articles reference ${symbol} in the current feed.`}
        />
      ) : (
        <ol className="flex flex-col">
          {news.map((article, i) => {
            const sentiment = article.sentiment ? SENTIMENT[article.sentiment] : null;
            return (
              <li key={article.id} className="border-b border-line-faint last:border-b-0">
                <article className="flex gap-6 py-6">
                  <span className="t-micro-tight w-5 shrink-0 pt-0.5 text-ink-ghost">
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <h3 className="max-w-[44rem] text-[1rem] font-medium leading-snug text-ink">
                      {article.title}
                    </h3>
                    <p className="max-w-[44rem] text-[0.875rem] leading-relaxed text-ink-faint">
                      {article.summary}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="t-micro-tight text-ink-ghost">
                        {article.source} · {formatTimeAgo(article.publishedAt)}
                      </span>
                      {sentiment && (
                        <>
                          <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
                          <StatusDot tone={sentiment.tone} label={sentiment.label} />
                        </>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </ResearchSection>
  );
}
