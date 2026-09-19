'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Wordmark } from '@/components/brand/logo';

const LINKS = [
  { href: '#signals', label: 'Signals' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#dossier', label: 'The dossier' },
] as const;

/**
 * A navigation plate that floats above the page.
 *
 * At rest it is naked — items sitting directly on the hero, with no
 * bar. Past the fold it materialises into an inset plate with a
 * hairline and backdrop blur, and contracts slightly. That transition
 * is the point: the navigation reads as a physical layer that settles
 * onto the page rather than a fixed SaaS header that is always there.
 */
export function MarketingNav() {
  const [settled, setSettled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Passive scroll read, no layout work in the handler.
    const onScroll = () => setSettled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-80 px-3 pt-3 sm:px-6 sm:pt-4">
        <nav
          aria-label="Main"
          className={cn(
            'mx-auto flex max-w-[84rem] items-center gap-6 rounded-xs px-4 sm:px-5',
            'transition-[background-color,border-color,height,box-shadow] duration-500 ease-out-quint',
            settled
              ? 'h-13 border border-line bg-panel/75 shadow-lift backdrop-blur-xl'
              : 'h-15 border border-transparent bg-transparent'
          )}
        >
          <Link
            href={ROUTES.home}
            className="shrink-0 rounded-xs transition-opacity hover:opacity-80"
            aria-label="BlockLens home"
          >
            <Wordmark />
          </Link>

          {/* A measurement rule instead of a gap — the nav is itself an
              instrument surface. */}
          <span aria-hidden="true" className="hidden h-px flex-1 bg-line-faint lg:block" />

          <div className="ml-auto hidden items-center gap-8 lg:ml-0 lg:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="t-micro-tight text-ink-faint transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <Link href={ROUTES.login}>
              <Button variant="quiet" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href={ROUTES.register}>
              <Button variant="primary" size="sm">
                Start researching
              </Button>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="ml-auto size-9 text-ink-dim transition-colors hover:text-ink lg:hidden"
          >
            <Menu className="mx-auto size-5" />
          </button>
        </nav>
      </header>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="right">
        <div className="flex h-full flex-col justify-between p-5">
          <div className="flex flex-col">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-line-faint py-4 text-[1.0625rem] text-ink-dim transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-6">
            <Link href={ROUTES.register} onClick={() => setMenuOpen(false)}>
              <Button variant="primary" size="lg" className="w-full">
                Start researching
              </Button>
            </Link>
            <Link href={ROUTES.login} onClick={() => setMenuOpen(false)}>
              <Button variant="line" size="lg" className="w-full">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  );
}
