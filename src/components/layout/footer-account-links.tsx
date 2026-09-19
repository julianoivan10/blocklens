'use client';

import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';

/**
 * The footer's account column.
 *
 * Split out as a client component for one reason: a signed-in visitor
 * should not be offered "Create account" here any more than in the
 * navigation. The rest of the footer stays a server component.
 *
 * The list holds its height while the session resolves so the footer
 * grid does not reflow underneath it.
 */
export function FooterAccountLinks() {
  const { isAuthenticated, isLoading } = useAuth();

  const links = isAuthenticated
    ? [
        { label: 'Open workspace', href: ROUTES.dashboard },
        { label: 'Settings', href: ROUTES.settings },
      ]
    : [
        { label: 'Sign in', href: ROUTES.login },
        { label: 'Create account', href: ROUTES.register },
      ];

  return (
    <ul className="flex min-h-[3.25rem] flex-col gap-2.5">
      {isLoading
        ? null
        : links.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="text-[0.8125rem] text-ink-faint transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            </li>
          ))}
    </ul>
  );
}
