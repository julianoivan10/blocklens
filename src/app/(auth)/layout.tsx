import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';
import { ROUTES } from '@/lib/constants';
import { siteConfig } from '@/config/site';

/**
 * A split plate rather than a centred card.
 *
 * The left panel carries the product's voice and the measurement
 * field; the form sits on the right in its own narrow measure. On small
 * screens the panel collapses to a single line above the form, so the
 * keyboard never has to fight a decorative half-screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Voice */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-panel-sunken p-12 lg:flex">
        <div aria-hidden="true" className="field-grid field-fade absolute inset-0 opacity-70" />
        <div aria-hidden="true" className="aura absolute inset-0" />

        <Link href={ROUTES.home} className="relative w-fit rounded-xs">
          <Wordmark />
        </Link>

        <div className="relative max-w-[26rem]">
          <p className="font-display text-[clamp(1.75rem,2.6vw,2.25rem)] leading-[1.15] tracking-[-0.02em] text-ink">
            Understand crypto <span className="t-accent">beyond the price.</span>
          </p>
          <p className="t-body mt-6">
            Market structure, on-chain activity, supply schedules, risk and a labelled
            interpretation — one document per asset.
          </p>
        </div>

        <div className="relative flex items-center gap-3">
          <span aria-hidden="true" className="h-px w-8 bg-line-strong" />
          <span className="t-micro-tight text-ink-ghost">
            © {new Date().getFullYear()} {siteConfig.name}
          </span>
        </div>
      </aside>

      {/* Form */}
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <Link href={ROUTES.home} className="mb-12 w-fit rounded-xs lg:hidden">
          <Wordmark />
        </Link>

        <div className="w-full max-w-[24rem] lg:mx-auto">{children}</div>
      </main>
    </div>
  );
}
