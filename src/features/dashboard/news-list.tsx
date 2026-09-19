import { Block, BlockHead } from '@/components/ui/block';
import { StatusDot } from '@/components/data/delta';
import { getLatestNews } from '@/server/data/news';
import { formatTimeAgo } from '@/lib/format';
import type { NewsArticle } from '@/types';

const SENTIMENT = {
  positive: { tone: 'up' as const, label: 'Positive' },
  negative: { tone: 'down' as const, label: 'Negative' },
  neutral: { tone: 'neutral' as const, label: 'Neutral' },
};

/**
 * The news register.
 *
 * Editorial rows divided by hairlines: headline in reading type,
 * source and timing in mono metadata, sentiment stated in words beside
 * its dot. Previously each item lived inside a card with a tinted
 * sentiment pill.
 */
export async function NewsList({ limit = 6, label = 'Latest' }: { limit?: number; label?: string }) {
  const news = await getLatestNews(limit);

  return (
    <Block>
      <BlockHead
        label={label}
        aside={<span className="t-micro-tight text-ink-ghost">RSS and GNews</span>}
      />

      {news.length === 0 ? (
        <p className="t-micro-tight py-8 text-ink-ghost">No articles available</p>
      ) : (
        <ul className="flex flex-col">
          {news.map((article) => (
            <NewsRow key={article.id} article={article} />
          ))}
        </ul>
      )}
    </Block>
  );
}

export function NewsRow({ article }: { article: NewsArticle }) {
  const sentiment = article.sentiment ? SENTIMENT[article.sentiment] : null;

  return (
    <li className="group border-b border-line-faint last:border-b-0">
      <article className="flex flex-col gap-3 py-5 lg:flex-row lg:items-baseline lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="max-w-[46rem] text-[0.9375rem] font-medium leading-snug text-ink">
            {article.title}
          </h3>
          <p className="line-clamp-2 max-w-[46rem] text-[0.8125rem] leading-relaxed text-ink-faint">
            {article.summary}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 lg:w-56 lg:justify-end">
          {sentiment && <StatusDot tone={sentiment.tone} label={sentiment.label} />}
          <span aria-hidden="true" className="hidden h-3 w-px bg-line-strong lg:block" />
          <span className="t-micro-tight text-ink-ghost">
            {article.source} · {formatTimeAgo(article.publishedAt)}
          </span>
        </div>
      </article>
    </li>
  );
}
