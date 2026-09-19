'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/section';
import { ErrorState } from '@/components/ui/block';

/**
 * Workspace error boundary.
 *
 * Scoped to the dashboard group so a failing screen keeps the rail and
 * the top bar — the reader can navigate somewhere else instead of
 * losing the whole application shell.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <Container className="py-16">
      <ErrorState
        title="This view didn't load"
        description="Something went wrong fetching the data for this screen. Other screens should still work."
        action={
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="secondary" size="sm" onClick={reset}>
              Try again
            </Button>
            {error.digest && (
              <span className="t-micro-tight text-ink-ghost">Reference {error.digest}</span>
            )}
          </div>
        }
      />
    </Container>
  );
}
