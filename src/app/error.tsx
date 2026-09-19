'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/section';

/**
 * The root error boundary.
 *
 * Calm and specific: says what happened, offers the one useful action,
 * and shows the digest so a report can be tied to a server log. The
 * error message itself is deliberately not rendered — in production it
 * is redacted anyway, and in development it belongs in the console.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <Container className="flex min-h-dvh items-center">
      <div className="max-w-[34rem] border-l-2 border-down/50 pl-6">
        <span className="t-micro text-down">Something broke</span>

        <h1 className="t-display-sm mt-5 text-ink">This page didn&rsquo;t load.</h1>

        <p className="t-body mt-5">
          An unexpected error stopped this view from rendering. Trying again often works —
          if it doesn&rsquo;t, the reference below identifies what failed.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="md" onClick={reset}>
            Try again
          </Button>
          {error.digest && (
            <span className="t-micro-tight text-ink-ghost">Reference {error.digest}</span>
          )}
        </div>
      </div>
    </Container>
  );
}
