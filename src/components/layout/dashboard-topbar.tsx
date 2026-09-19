'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useSearch } from '@/hooks/use-search';
import { ROUTES } from '@/lib/constants';
import { Avatar } from '@/components/ui/avatar';
import { Sheet } from '@/components/ui/sheet';
import { Wordmark } from '@/components/brand/logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLink,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DashboardNavList } from './dashboard-nav';

/** Where you are, in words. Only routes that exist appear here. */
const SECTION_LABELS: Array<[string, string]> = [
  [ROUTES.research, 'Research'],
  [ROUTES.watchlist, 'Watchlist'],
  [ROUTES.news, 'News'],
  [ROUTES.settings, 'Settings'],
  [ROUTES.dashboard, 'Overview'],
];

function useSectionLabel(): string {
  const pathname = usePathname();
  const match = SECTION_LABELS.find(
    ([href]) => pathname === href || pathname.startsWith(`${href}/`)
  );
  return match?.[1] ?? 'Overview';
}

/**
 * The workspace top edge.
 *
 * Kept to one row and one hairline: a breadcrumb that says where you
 * are, the search affordance, and the account control. No stray buttons,
 * no second border, nothing that only exists to fill the bar.
 *
 * It also carries navigation below `lg`, where the rail is hidden.
 */
export function DashboardTopbar() {
  const { user, logout } = useAuth();
  const { openSearch } = useSearch();
  const [navOpen, setNavOpen] = useState(false);
  const section = useSectionLabel();

  const displayName = user?.name || user?.email?.split('@')[0] || 'Account';
  const initial = user?.name?.charAt(0) || user?.email?.charAt(0) || '?';

  return (
    <>
      <header className="flex h-15 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="-ml-1 size-9 shrink-0 text-ink-dim transition-colors hover:text-ink lg:hidden"
        >
          <Menu className="mx-auto size-5" />
        </button>

        {/* Below lg the wordmark stands in for the rail — and, as there,
            it returns to the public site. */}
        <Link
          href={ROUTES.home}
          className="shrink-0 lg:hidden"
          aria-label="BlockLens home"
        >
          <Wordmark />
        </Link>

        {/* Breadcrumb: workspace › section. Desktop only, where the rail
            already establishes the product identity. */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2.5 lg:flex">
          <span className="t-micro-tight text-ink-ghost">Workspace</span>
          <span aria-hidden="true" className="text-ink-ghost">
            /
          </span>
          <span className="t-micro-tight text-ink-dim" aria-current="page">
            {section}
          </span>
        </nav>

        {/* A ruled field, matching the input treatment used everywhere
            else rather than a boxed button. */}
        <button
          type="button"
          onClick={openSearch}
          className="group ml-auto flex h-9 items-center gap-2.5 border-b border-line px-1 transition-colors hover:border-ink-ghost sm:w-64 lg:w-72"
        >
          <Search className="size-3.5 shrink-0 text-ink-ghost transition-colors group-hover:text-signal" />
          <span className="hidden text-[0.8125rem] text-ink-faint transition-colors group-hover:text-ink-dim sm:inline">
            Search assets
          </span>
          <kbd className="ml-auto hidden shrink-0 border border-line px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-ghost sm:inline-block">
            ⌘K
          </kbd>
        </button>

        <div className="ml-2 flex shrink-0 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className={cn(
                'group flex items-center gap-2.5 rounded-xs py-1 pl-1 pr-1.5 transition-colors',
                'hover:bg-panel'
              )}
            >
              <Avatar size="sm" fallback={initial} alt={displayName} />
              {/* Name is shown where there is room; the avatar alone
                  carries it on narrow screens. */}
              <span className="hidden max-w-[9rem] truncate text-[0.8125rem] text-ink-dim transition-colors group-hover:text-ink md:inline">
                {displayName}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-3 shrink-0 text-ink-ghost transition-colors group-hover:text-ink-dim"
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <span className="text-[0.8125rem] font-medium text-ink">{displayName}</span>
                <span className="t-micro-tight break-all text-ink-ghost">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Only destinations that exist. There is no separate
                  profile screen, so account details live in Settings and
                  the item says so. */}
              <DropdownMenuLink href={ROUTES.settings}>Account settings</DropdownMenuLink>
              <DropdownMenuLink href={ROUTES.home}>Back to site</DropdownMenuLink>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void logout()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={navOpen} onClose={() => setNavOpen(false)} title="Navigation">
        <div className="flex h-full flex-col justify-between py-6">
          <DashboardNavList onNavigate={() => setNavOpen(false)} />

          <div className="border-t border-line-faint px-5 pt-5">
            <Link
              href={ROUTES.home}
              onClick={() => setNavOpen(false)}
              className="t-micro-tight text-ink-ghost transition-colors hover:text-ink-dim"
            >
              Back to blocklens.app
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  );
}
