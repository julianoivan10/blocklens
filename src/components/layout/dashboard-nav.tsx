'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';

/**
 * Dashboard navigation, grouped into a hierarchy.
 *
 * Only routes that exist are listed — a rail advertising screens that
 * are not built is worse than a short rail.
 */
const NAV_GROUPS = [
  {
    label: 'Analysis',
    items: [
      { href: ROUTES.dashboard, label: 'Overview' },
      { href: ROUTES.portfolio, label: 'Portfolio' },
      { href: ROUTES.research, label: 'Research' },
    ],
  },
  {
    label: 'Personal',
    items: [
      { href: ROUTES.wallets, label: 'Wallets' },
      { href: ROUTES.transactions, label: 'Transactions' },
      { href: ROUTES.watchlist, label: 'Watchlist' },
      { href: ROUTES.alerts, label: 'Alerts' },
    ],
  },
  {
    label: 'Discover',
    items: [{ href: ROUTES.news, label: 'News' }],
  },
  {
    label: 'Account',
    items: [{ href: ROUTES.settings, label: 'Settings' }],
  },
] as const;

function isActive(pathname: string, href: string) {
  // Parent routes whose children have their own nav entries match exactly.
  if (href === ROUTES.dashboard || href === ROUTES.portfolio) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The active state is a signal rule at the leading edge plus a shift
 * in ink — no filled pill, no tinted block. Inactive items carry a
 * faint tick in the same slot, so selection reads as that tick
 * lighting up rather than as a shape appearing.
 */
export function DashboardNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-8">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="t-micro mb-2 px-5 text-ink-ghost">{group.label}</span>

          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 py-2 pl-5 pr-4 transition-colors duration-200',
                  active ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-1 left-0 w-px transition-colors duration-200',
                    active ? 'bg-signal' : 'bg-transparent group-hover:bg-line-strong'
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1 shrink-0 transition-colors duration-200',
                    active ? 'bg-signal' : 'bg-line-strong group-hover:bg-ink-ghost'
                  )}
                />
                <span className="text-[0.8125rem] tracking-[-0.005em]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
