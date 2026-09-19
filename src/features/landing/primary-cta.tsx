'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/**
 * The landing page's call to action, aware of whether anyone is signed in.
 *
 * A visitor who already has a session should not be asked to create one —
 * so every signup prompt on the marketing page routes through here and
 * becomes "Open workspace" instead.
 *
 * Resolved on the client deliberately: reading the session cookie in a
 * server component would make the landing page dynamic and cost its
 * static rendering. Nothing is rendered until the session is known, and
 * the slot holds its height while that happens, so the CTA never flashes
 * the wrong label and never shifts the layout around it.
 */
export function PrimaryCta({
  size = 'lg',
  /** Shown beside the button when signed out, e.g. "No card required". */
  note,
  className,
}: {
  size?: 'md' | 'lg';
  note?: string;
  className?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-3',
        // Reserves the button's height so the surrounding copy does not
        // move when the session resolves.
        size === 'lg' ? 'min-h-12' : 'min-h-10',
        className
      )}
    >
      {isLoading ? null : isAuthenticated ? (
        <Link href={ROUTES.dashboard}>
          <Button variant="primary" size={size}>
            Open workspace
          </Button>
        </Link>
      ) : (
        <>
          <Link href={ROUTES.register}>
            <Button variant="primary" size={size}>
              Start researching
            </Button>
          </Link>
          {note && <span className="t-micro-tight text-ink-ghost">{note}</span>}
        </>
      )}
    </div>
  );
}
