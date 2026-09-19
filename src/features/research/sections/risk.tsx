import { Meter } from '@/components/data/register';
import { ResearchSection } from './research-section';
import type { RiskAssessment, RiskDimension } from '@/types';

/**
 * Scores run 0–100 where *higher means safer*, which is the opposite of
 * what "risk score" usually implies — so the reading is always stated in
 * words beside the number, and the scale is explained once above the
 * list rather than left for the reader to infer.
 */
function toneFor(score: number): 'up' | 'caution' | 'down' {
  if (score >= 75) return 'up';
  if (score >= 50) return 'caution';
  return 'down';
}

function verdict(score: number): string {
  if (score >= 75) return 'Lower relative risk across the dimensions measured.';
  if (score >= 50) return 'Moderate risk. Some dimensions warrant attention.';
  return 'Elevated risk across several dimensions.';
}

export function RiskSection({ risk }: { risk: RiskAssessment }) {
  return (
    <ResearchSection
      id="risk"
      ordinal="06"
      label="Risk"
      title="Where this asset is fragile"
      intro="Each dimension is scored 0 to 100, where a higher score means lower risk."
      aside={<span className="t-micro-tight text-ink-ghost">Computed by BlockLens</span>}
    >
      {risk.dimensions.length === 0 ? (
        <p className="t-body-sm">
          Not enough data was available to score this asset. Nothing has been estimated in
          its place.
        </p>
      ) : (
      <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-12">
        {/* The composite, at figure scale. */}
        <div className="lg:col-span-4">
          <div className="flex flex-col gap-4">
            <span className="t-micro">Composite score</span>
            <div className="flex items-baseline gap-3">
              <span className="t-figure-hero">{risk.overallScore}</span>
              <span className="t-micro-tight text-ink-ghost">/ 100</span>
            </div>
            <Meter value={risk.overallScore} tone={toneFor(risk.overallScore)} />
            <p className="mt-1 max-w-[22rem] text-[0.875rem] leading-relaxed text-ink-dim">
              {verdict(risk.overallScore)}
            </p>
            <p className="t-micro-tight mt-2 border-t border-line-faint pt-4 leading-relaxed text-ink-ghost">
              Each dimension is computed from live market and chain data, and states its own
              arithmetic beneath it. This is BlockLens&rsquo;s own scoring, not an agency
              rating, and it is not investment advice.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <ul className="flex flex-col">
            {risk.dimensions.map((dimension) => (
              <RiskRow key={dimension.name} dimension={dimension} />
            ))}
          </ul>
        </div>
      </div>
      )}
    </ResearchSection>
  );
}

function RiskRow({ dimension }: { dimension: RiskDimension }) {
  return (
    <li className="flex flex-col gap-3 border-b border-line-faint py-5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-6">
        <h3 className="text-[0.9375rem] font-medium text-ink">{dimension.name}</h3>
        <div className="flex shrink-0 items-baseline gap-3">
          {/* Word and number together, so severity never depends on the
              bar's colour. */}
          <span className="t-micro-tight text-ink-dim">{dimension.label} risk</span>
          <span className="t-figure text-[0.8125rem]">{dimension.score}</span>
        </div>
      </div>

      <Meter value={dimension.score} tone={toneFor(dimension.score)} />

      <p className="max-w-[44rem] text-[0.8125rem] leading-relaxed text-ink-faint">
        {dimension.description}
      </p>
    </li>
  );
}
