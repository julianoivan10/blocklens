import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Container, SectionMark } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';

/**
 * A story that is no longer in the feed window.
 *
 * Articles are resolved from the live provider window rather than stored,
 * so a link kept for a few days will eventually stop resolving. That is
 * expected behaviour, not a fault, and the page says so plainly instead
 * of implying something broke.
 */
export default function ArticleNotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-[34rem]">
        <SectionMark index="404" label="No longer in the feed" />

        <h1 className="t-display-sm mt-6 text-ink">This story has aged out.</h1>

        <p className="t-body mt-5">
          BlockLens reads a rolling window of recent reporting rather than keeping an archive,
          so older stories stop resolving once they fall out of it. The article itself is
          still on the publisher&rsquo;s site.
        </p>

        <div className="mt-9">
          <Link href={ROUTES.news}>
            <Button variant="primary" size="md" className="gap-2">
              <ArrowLeft className="size-3.5" />
              Back to News
            </Button>
          </Link>
        </div>
      </div>
    </Container>
  );
}
