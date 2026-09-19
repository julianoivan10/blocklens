import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/format';
import { ROUTES } from '@/lib/constants';
import { ArticleThumb } from './article-thumb';
import type { NewsArticle } from '@/types';

/**
 * One story in the register.
 *
 * The whole row is a single link into the BlockLens article page — never
 * straight out to the publisher. The reader gets our detail view, and the
 * external jump is an explicit action there.
 *
 * Compact by design: a small thumbnail, headline in reading type, one
 * line of excerpt, and mono metadata. No card, no radius, no shadow — the
 * hairline between rows does the separating, and the hover affordance is
 * the same leading signal rule used everywhere else in the product.
 */
export function ArticleRow({
  article,
  index,
  className,
}: {
  article: NewsArticle;
  /** Optional ordinal, shown in the left margin. */
  index?: number;
  className?: string;
}) {
  return (
    <li className={cn('group relative border-b border-line-faint last:border-b-0', className)}>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-signal transition-transform duration-300 ease-out-quint group-hover:scale-y-100"
      />

      <Link
        href={`${ROUTES.news}/${article.slug}`}
        className="flex gap-4 py-5 pl-4 pr-1 transition-colors duration-200 hover:bg-panel/50 sm:gap-6"
      >
        {index !== undefined && (
          <span className="t-micro-tight hidden w-5 shrink-0 pt-0.5 text-ink-ghost sm:block">
            {String(index).padStart(2, '0')}
          </span>
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Source and timing lead, the way a wire service files a
              story — provenance before headline. */}
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="t-micro-tight text-ink-dim">{article.source}</span>
            <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
            <time
              dateTime={article.publishedAt}
              className="t-micro-tight text-ink-ghost"
            >
              {formatTimeAgo(article.publishedAt)}
            </time>
            {article.topics?.slice(0, 2).map((topic) => (
              <span key={topic} className="t-micro-tight text-signal-deep">
                {topic}
              </span>
            ))}
          </span>

          <h3 className="max-w-[44rem] text-[0.9375rem] font-medium leading-snug text-ink transition-colors group-hover:text-signal sm:text-[1rem]">
            {article.title}
          </h3>

          {article.summary !== article.title && (
            <p className="line-clamp-2 max-w-[44rem] text-[0.8125rem] leading-relaxed text-ink-faint">
              {article.summary}
            </p>
          )}
        </span>

        {article.imageUrl && (
          <ArticleThumb
            src={article.imageUrl}
            className="aspect-[16/10] w-[5.5rem] self-start sm:w-28"
          />
        )}
      </Link>
    </li>
  );
}

/**
 * The lead story.
 *
 * One article per view gets a larger image and the display serif, which
 * is what gives the feed a front page rather than an undifferentiated
 * list. Everything below it stays compact.
 */
export function ArticleLead({ article }: { article: NewsArticle }) {
  return (
    <article className="group relative border-b border-line">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-signal transition-transform duration-500 ease-out-quint group-hover:scale-y-100"
      />

      <Link
        href={`${ROUTES.news}/${article.slug}`}
        className="flex flex-col gap-6 py-6 pl-4 pr-1 transition-colors duration-200 hover:bg-panel/40 lg:flex-row lg:gap-10"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="t-micro">Lead story</span>
            <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
            <span className="t-micro-tight text-ink-dim">{article.source}</span>
            <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
            <time dateTime={article.publishedAt} className="t-micro-tight text-ink-ghost">
              {formatTimeAgo(article.publishedAt)}
            </time>
          </span>

          <h2 className="max-w-[32rem] font-display text-[clamp(1.375rem,2.6vw,1.875rem)] leading-[1.15] tracking-[-0.015em] text-ink transition-colors group-hover:text-signal">
            {article.title}
          </h2>

          {article.summary !== article.title && (
            <p className="line-clamp-3 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-dim">
              {article.summary}
            </p>
          )}

          {(article.topics?.length || article.relatedTokens?.length) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {article.topics?.map((topic) => (
                <span key={topic} className="t-micro-tight text-signal-deep">
                  {topic}
                </span>
              ))}
              {article.relatedTokens?.slice(0, 3).map((token) => (
                <span key={token} className="t-micro-tight text-ink-ghost">
                  {token}
                </span>
              ))}
            </span>
          )}
        </span>

        {article.imageUrl && (
          <ArticleThumb
            src={article.imageUrl}
            sizes="(min-width: 1024px) 420px, 100vw"
            className="aspect-[16/9] w-full lg:w-[26rem] lg:shrink-0"
          />
        )}
      </Link>
    </article>
  );
}
