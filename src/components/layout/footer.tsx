import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { ROUTES } from '@/lib/constants';
import { Container } from '@/components/ui/section';
import { LogoMark } from '@/components/brand/logo';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Signals', href: '#signals' },
      { label: 'Intelligence', href: '#intelligence' },
      { label: 'The dossier', href: '#dossier' },
      { label: 'BTC research', href: `${ROUTES.research}/BTC` },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in', href: ROUTES.login },
      { label: 'Create account', href: ROUTES.register },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="py-16 sm:py-20">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-5 sm:col-span-3">
            <LogoMark className="size-5 text-signal" />
            <p className="max-w-[20rem] font-display text-[1.125rem] leading-snug text-ink-dim">
              Understand crypto beyond the price.
            </p>
            <p className="t-micro-tight max-w-[22rem] leading-relaxed text-ink-ghost">
              Research platform. Not investment advice, and not a trading venue.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.heading} className="flex flex-col gap-4" aria-label={col.heading}>
              <h2 className="t-micro">{col.heading}</h2>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
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
            </nav>
          ))}
        </div>

        <div className="mt-16 flex flex-col-reverse items-start justify-between gap-6 border-t border-line-faint pt-6 sm:flex-row sm:items-center">
          <p className="t-micro-tight text-ink-ghost">
            © {new Date().getFullYear()} {siteConfig.name}
          </p>

          <div className="flex items-center gap-5">
            <a
              href={siteConfig.links.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="t-micro-tight text-ink-faint transition-colors hover:text-ink"
            >
              X / Twitter
            </a>
            <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="t-micro-tight text-ink-faint transition-colors hover:text-ink"
            >
              GitHub
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
