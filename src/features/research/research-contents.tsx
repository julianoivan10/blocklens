'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Container } from '@/components/ui/section';

export interface ContentsEntry {
  id: string;
  label: string;
}

/**
 * The dossier contents.
 *
 * A sticky chapter index that tracks what is being read. This is what
 * replaced the tab strip: it looks similar at a glance and behaves
 * completely differently — nothing is hidden, every chapter is on the
 * page, and this only says where you are and lets you jump.
 *
 * Horizontal so it works identically at every width, and scrollable on
 * narrow screens rather than wrapping into two rows.
 */
export function ResearchContents({ entries }: { entries: ContentsEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? '');

  useEffect(() => {
    const sections = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // One observer for all chapters; no scroll handler.
    const observer = new IntersectionObserver(
      (records) => {
        const inView = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inView[0]?.target.id) setActive(inView[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-ground/85 backdrop-blur-xl">
      <Container>
        <nav aria-label="Dossier contents">
          <ol className="-mx-1 flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {entries.map((entry, i) => {
              const isActive = active === entry.id;
              return (
                <li key={entry.id} className="shrink-0">
                  <a
                    href={`#${entry.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'group relative flex items-baseline gap-2 px-3 py-3.5 transition-colors duration-200',
                      isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
                    )}
                  >
                    <span
                      className={cn(
                        'font-mono text-[0.625rem] tabular-nums transition-colors duration-200',
                        isActive ? 'text-signal-deep' : 'text-ink-ghost'
                      )}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-[0.6875rem] font-medium uppercase tracking-widest">
                      {entry.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-x-2 bottom-0 h-px transition-colors duration-200',
                        isActive ? 'bg-signal' : 'bg-transparent group-hover:bg-line-strong'
                      )}
                    />
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      </Container>
    </div>
  );
}
