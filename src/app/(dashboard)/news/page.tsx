import { Suspense } from 'react';
import { Container } from '@/components/ui/section';
import { RegisterSkeleton } from '@/components/ui/skeleton';
import { NewsList } from '@/features/dashboard/news-list';

export const metadata = { title: 'News' };

export const revalidate = 300;

export default function NewsPage() {
  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">News</h1>
        <p className="t-micro-tight text-ink-ghost">Developments across tracked assets</p>
      </header>

      <Suspense fallback={<RegisterSkeleton rows={6} />}>
        <NewsList limit={12} label="All stories" />
      </Suspense>
    </Container>
  );
}
