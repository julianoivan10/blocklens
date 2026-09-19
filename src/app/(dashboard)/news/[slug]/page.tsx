import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/ui/section';
import { Register, RegisterRow } from '@/components/data/register';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { formatDate, formatTimeAgo } from '@/lib/format';
import { getArticleBySlug, getRelatedArticles } from '@/server/data/news';
import { ArticleThumb } from '@/features/news/article-thumb';
import { ArticleRow } from '@/features/news/article-row';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) return { title: 'Article not found' };

  return {
    title: article.title,
    description: article.summary,
    openGraph: {
      title: article.title,
      description: article.summary,
      type: 'article',
      publishedTime: article.publishedAt,
      images: article.imageUrl ? [article.imageUrl] : undefined,
    },
  };
}

/**
 * An article page.
 *
 * On copyright: BlockLens holds no article bodies and this page renders
 * none. What is shown is the metadata and the excerpt the publisher
 * distributes in its own feed, plus the lead image it supplies — the same
 * material any reader agent receives — and a prominent link out. The
 * reporting stays with the publisher, and the page says so in plain
 * language rather than burying it.
 *
 * Typographically this is the most deliberate screen in the product: a
 * single reading column, the headline in the display serif at size, and
 * the excerpt set as a lede rather than as body copy.
 */
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;

  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const related = await getRelatedArticles(slug, 4);
  const hasExcerpt = article.summary !== article.title;

  return (
    <article>
      <Container className="py-8 sm:py-10">
        {/* An explicit way back, never only the browser's. */}
        <Link
          href={ROUTES.news}
          className="group inline-flex items-center gap-2 text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5 transition-transform duration-300 ease-out-quint group-hover:-translate-x-1" />
          <span className="t-micro-tight">Back to News</span>
        </Link>

        <div className="mt-10 max-w-[44rem]">
          {/* Provenance first: who filed this, and when. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="t-micro text-ink-dim">{article.source}</span>
            <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
            <time dateTime={article.publishedAt} className="t-micro-tight text-ink-ghost">
              {formatDate(article.publishedAt)} · {formatTimeAgo(article.publishedAt)}
            </time>
            {article.topics?.map((topic) => (
              <span key={topic} className="t-micro-tight text-signal-deep">
                {topic}
              </span>
            ))}
          </div>

          <h1 className="mt-6 font-display text-[clamp(1.75rem,4.2vw,2.625rem)] leading-[1.12] tracking-[-0.02em] text-ink">
            {article.title}
          </h1>

          {hasExcerpt && (
            <p className="mt-7 text-[clamp(1.0625rem,1.6vw,1.1875rem)] leading-[1.7] text-ink-dim">
              {article.summary}
            </p>
          )}
        </div>

        {article.imageUrl && (
          <figure className="mt-10 max-w-[52rem]">
            <ArticleThumb
              src={article.imageUrl}
              sizes="(min-width: 1024px) 832px, 100vw"
              className="aspect-[16/9] w-full"
            />
            <figcaption className="t-micro-tight mt-3 text-ink-ghost">
              Image supplied by {article.source}
            </figcaption>
          </figure>
        )}

        {/* The call out. Stated as what it is: the rest of the piece is
            somewhere else. */}
        <div className="mt-12 max-w-[44rem] border-l-2 border-signal pl-6">
          <p className="t-body-sm">
            This is the excerpt {article.source} publishes with the story. BlockLens does not
            reproduce the article — the full piece is on their site.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href={article.url} target="_blank" rel="noopener noreferrer nofollow">
              <Button variant="primary" size="md" className="gap-2">
                Read original article
                <ArrowUpRight className="size-3.5" />
              </Button>
            </a>
            <span className="t-micro-tight text-ink-ghost">Opens {article.source} in a new tab</span>
          </div>
        </div>

        {/* Metadata register, in the same vocabulary as every other
            readout in the product. */}
        <div className="mt-14 max-w-[44rem]">
          <h2 className="t-micro border-b border-line pb-3">Record</h2>
          <Register className="mt-1">
            <RegisterRow label="Source" value={article.source} />
            <RegisterRow
              label="Published"
              value={formatDate(article.publishedAt)}
              note={formatTimeAgo(article.publishedAt)}
            />
            {article.topics?.length ? (
              <RegisterRow
                label="Subject"
                value={article.topics.join(', ')}
                note="As filed by the source"
              />
            ) : null}
            {article.tags?.length ? (
              <RegisterRow label="Source tags" value={article.tags.join(', ')} />
            ) : null}
            {article.relatedTokens?.length ? (
              <RegisterRow
                label="Assets named"
                value={
                  <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {article.relatedTokens.map((token) => (
                      <Link
                        key={token}
                        href={`${ROUTES.research}/${token}`}
                        className="t-figure text-[0.8125rem] underline decoration-line-strong underline-offset-4 transition-colors hover:text-signal hover:decoration-signal"
                      >
                        {token}
                      </Link>
                    ))}
                  </span>
                }
                note="Open the dossier"
              />
            ) : null}
          </Register>
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="t-micro border-b border-line pb-3">Read next</h2>
            <ul className="flex flex-col">
              {related.map((item) => (
                <ArticleRow key={item.id} article={item} />
              ))}
            </ul>
          </section>
        )}

        <div className="mt-14 border-t border-line-faint pt-6">
          <Link
            href={ROUTES.news}
            className="group inline-flex items-center gap-2 text-ink-faint transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5 transition-transform duration-300 ease-out-quint group-hover:-translate-x-1" />
            <span className="t-micro-tight">Back to News</span>
          </Link>
        </div>
      </Container>
    </article>
  );
}
