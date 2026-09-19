import { ArrowUpRight } from 'lucide-react';
import { ResearchSection } from './research-section';
import type { TokenOverview } from '@/types';

const LINK_LABELS: Record<string, string> = {
  homepage: 'Website',
  whitepaper: 'Whitepaper',
  github: 'Source',
  twitter: 'X / Twitter',
  telegram: 'Telegram',
  discord: 'Discord',
  reddit: 'Reddit',
};

/**
 * The project itself.
 *
 * Set as prose in a reading measure — the one place on the page where
 * the reader is reading sentences rather than figures, so the column
 * narrows and the type grows to suit that.
 */
export function ProjectSection({ token }: { token: TokenOverview }) {
  const links = Object.entries(token.links ?? {}).filter(([, href]) => Boolean(href));

  return (
    <ResearchSection
      id="project"
      ordinal="04"
      label="Project"
      title="What this asset is"
    >
      <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {token.description ? (
            <p className="max-w-[38rem] text-[1.0625rem] leading-[1.7] text-ink-dim">
              {token.description}
            </p>
          ) : (
            <p className="t-body-sm">No project description available from the current provider.</p>
          )}
        </div>

        <div className="flex flex-col gap-8 lg:col-span-5">
          {token.categories?.length ? (
            <div className="flex flex-col gap-3">
              <span className="t-micro">Classification</span>
              <ul className="flex flex-wrap gap-x-2 gap-y-2">
                {token.categories.map((category) => (
                  <li
                    key={category}
                    className="border border-line px-2 py-1 font-mono text-[0.625rem] uppercase tracking-widest text-ink-faint"
                  >
                    {category}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {links.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="t-micro mb-2">References</span>
              {links.map(([key, href]) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-baseline justify-between gap-4 border-b border-line-faint py-2.5 transition-colors hover:border-line-strong"
                >
                  <span className="text-[0.8125rem] text-ink-dim transition-colors group-hover:text-ink">
                    {LINK_LABELS[key] ?? key}
                  </span>
                  <ArrowUpRight className="size-3 shrink-0 self-center text-ink-ghost transition-colors group-hover:text-signal" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResearchSection>
  );
}
