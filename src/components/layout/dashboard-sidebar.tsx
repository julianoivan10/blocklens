import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { Wordmark } from '@/components/brand/logo';
import { DashboardNavList } from './dashboard-nav';

/**
 * The desktop rail.
 *
 * A server component — only the nav list needs the pathname, so the rail
 * itself ships no JavaScript. Separated from the ground by a single
 * hairline rather than a filled panel, so the workspace reads as one
 * continuous surface.
 *
 * The wordmark returns to the public site, which is the route out of the
 * workspace that a dashboard usually forgets to provide.
 */
export function DashboardSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line lg:flex">
      <div className="flex h-15 items-center px-5">
        <Link
          href={ROUTES.home}
          className="group rounded-xs transition-opacity hover:opacity-80"
          aria-label="BlockLens home"
        >
          <Wordmark />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <DashboardNavList />
      </div>

      <div className="border-t border-line-faint p-5">
        <Link
          href={ROUTES.home}
          className="group flex items-center gap-2 text-ink-ghost transition-colors hover:text-ink-dim"
        >
          <ArrowUpLeft className="size-3 transition-transform duration-300 ease-out-quint group-hover:-translate-x-0.5 group-hover:-translate-y-0.5" />
          <span className="t-micro-tight">Back to blocklens.app</span>
        </Link>
      </div>
    </aside>
  );
}
