import { ResearchSection } from './research-section';
import { EmptyState } from '@/components/ui/block';
import { formatTimeAgo } from '@/lib/format';
import type { AIResearchSummary } from '@/types';

/**
 * The AI reading.
 *
 * Fenced off from the rest of the dossier on purpose. The summary is
 * set in the display serif and marked as an argument; the observations
 * beneath it are split into what was read off the data and what is
 * merely inferred, each in its own voice. Provenance is stated at the
 * top and the bottom, not buried in a tinted footnote.
 */
const GROUPS = [
  {
    key: 'keyObservations' as const,
    ordinal: '01',
    heading: 'Read from the data',
    note: 'Observations traceable to a measured value.',
  },
  {
    key: 'notableRisks' as const,
    ordinal: '02',
    heading: 'Inferred risks',
    note: 'Judgements about what could go wrong.',
  },
  {
    key: 'importantDevelopments' as const,
    ordinal: '03',
    heading: 'Context',
    note: 'Developments shaping the current picture.',
  },
  {
    key: 'areasForFurtherResearch' as const,
    ordinal: '04',
    heading: 'Still unknown',
    note: 'What this dossier cannot answer.',
  },
];

export function InterpretationSection({
  summary,
  unavailableReason,
}: {
  summary: AIResearchSummary | null;
  unavailableReason?: string;
}) {
  /**
   * When synthesis is unconfigured or the model call failed, the section
   * says so. Substituting a canned analysis here would be the one place
   * in the product where a reader could not tell generated prose from a
   * real reading of this asset.
   */
  if (!summary) {
    return (
      <ResearchSection
        id="interpretation"
        ordinal="07"
        label="Interpretation"
        title="What it appears to add up to"
      >
        <EmptyState
          title="No synthesis available"
          description={`${
            unavailableReason ?? 'The synthesis could not be generated right now.'
          } Nothing has been substituted in its place — every other section on this page is unaffected.`}
        />
      </ResearchSection>
    );
  }

  return (
    <ResearchSection
      id="interpretation"
      ordinal="07"
      label="Interpretation"
      title="What it appears to add up to"
      aside={
        <div className="flex flex-col gap-1 lg:items-end">
          <span className="t-micro text-caution">
            {summary.isDemo ? 'Sample synthesis' : 'AI generated'}
          </span>
          <span className="t-micro-tight text-ink-ghost">
            {formatTimeAgo(summary.generatedAt)}
          </span>
        </div>
      }
    >
      {/* The argument itself, in the serif — visibly a different kind of
          statement from the figures above it. */}
      <blockquote className="border-l-2 border-caution/40 pl-6">
        <p className="max-w-[44rem] font-display text-[1.25rem] italic leading-[1.6] text-ink-dim sm:text-[1.375rem]">
          {summary.summary}
        </p>
      </blockquote>

      <div className="mt-14 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-2">
        {GROUPS.map((group) => {
          const items = summary[group.key];
          if (!items?.length) return null;

          return (
            <div key={group.key} className="flex flex-col gap-4 border-t border-line pt-5">
              <div className="flex items-baseline gap-3">
                <span className="t-micro-tight text-ink-ghost">{group.ordinal}</span>
                <h3 className="t-micro text-ink">{group.heading}</h3>
              </div>

              <p className="text-[0.75rem] leading-relaxed text-ink-ghost">{group.note}</p>

              <ul className="flex flex-col gap-3 border-t border-line-faint pt-4">
                {items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 bg-line-strong" />
                    <span className="text-[0.875rem] leading-relaxed text-ink-dim">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="t-micro-tight mt-14 max-w-[44rem] border-t border-line pt-5 leading-relaxed text-ink-ghost">
        {summary.disclaimer}
      </p>
    </ResearchSection>
  );
}
