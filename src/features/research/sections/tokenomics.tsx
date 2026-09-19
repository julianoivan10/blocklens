import { Register, RegisterRow } from '@/components/data/register';
import { EmptyState } from '@/components/ui/block';
import { ResearchSection } from './research-section';
import { formatCompactCount, formatDate, formatShare } from '@/lib/format';
import type { TokenomicsData } from '@/types';

/* Fixed categorical order, never cycled — the validated plot ramp. */
const SLOT_COLORS = [
  'var(--color-plot-1)',
  'var(--color-plot-2)',
  'var(--color-plot-3)',
  'var(--color-plot-4)',
  'var(--color-plot-5)',
  'var(--color-plot-6)',
] as const;

export function TokenomicsSection({
  symbol,
  data,
}: {
  symbol: string;
  data: TokenomicsData | null;
}) {
  return (
    <ResearchSection
      id="tokenomics"
      ordinal="03"
      label="Tokenomics"
      title="Who holds the supply"
      intro="How much exists, how much is liquid, and what is still scheduled to be released."
      aside={<span className="t-micro-tight text-ink-ghost">Derived from supply data</span>}
    >
      {!data ? (
        <EmptyState
          title="No supply data"
          description={`The configured provider does not return a supply breakdown for ${symbol}.`}
        />
      ) : (
        <div className="flex flex-col gap-14">
          <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Register>
                <RegisterRow
                  label="Circulating supply"
                  value={formatCompactCount(data.circulatingSupply)}
                />
                <RegisterRow
                  label="Total supply"
                  value={data.totalSupply ? formatCompactCount(data.totalSupply) : 'Uncapped'}
                />
                <RegisterRow
                  label="Max supply"
                  value={data.maxSupply ? formatCompactCount(data.maxSupply) : 'No hard cap'}
                />
                <RegisterRow
                  label="Share circulating"
                  value={formatShare(data.circulatingPercentage)}
                />
              </Register>
            </div>

            {/* The distribution bar, shown only when a breakdown is
                actually reported. A 2px ground gap separates touching
                segments so adjacent fills never blend together. */}
            {data.distribution && data.distribution.length > 0 ? (
              <div className="lg:col-span-7">
                <span className="t-micro">Distribution of supply</span>

                <div className="mt-4 flex h-2 w-full gap-0.5" role="presentation">
                  {data.distribution.map((slice, i) => (
                    <div
                      key={slice.label}
                      style={{
                        width: `${slice.percentage}%`,
                        backgroundColor: SLOT_COLORS[i % SLOT_COLORS.length],
                      }}
                    />
                  ))}
                </div>

                {/* A legend is always present, and every entry is
                    directly labelled — identity never rests on colour. */}
                <dl className="mt-6 flex flex-col">
                  {data.distribution.map((slice, i) => (
                    <div
                      key={slice.label}
                      className="flex items-baseline justify-between gap-6 border-b border-line-faint py-3 last:border-b-0"
                    >
                      <dt className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0"
                          style={{ backgroundColor: SLOT_COLORS[i % SLOT_COLORS.length] }}
                        />
                        <span className="truncate text-[0.8125rem] text-ink-dim">
                          {slice.label}
                        </span>
                      </dt>
                      <dd className="flex shrink-0 items-baseline gap-4">
                        <span className="t-figure text-[0.8125rem]">
                          {formatShare(slice.percentage)}
                        </span>
                        <span className="t-micro-tight w-20 text-right text-ink-ghost">
                          {formatCompactCount(slice.amount)}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="lg:col-span-7">
                <span className="t-micro">Distribution of supply</span>
                <p className="t-body-sm mt-4 max-w-[34rem]">
                  No provider in this deployment reports how {symbol}&rsquo;s supply is
                  held across team, treasury, investor and public allocations, so no
                  breakdown is shown. The supply totals beside this are measured.
                </p>
              </div>
            )}
          </div>

          {data.vestingSchedule && data.vestingSchedule.length > 0 && (
            <div>
              <span className="t-micro">Release schedule</span>

              {/* A spine with nodes: a schedule is a sequence, and a
                  sequence should look like one. */}
              <ol className="relative mt-6 border-l border-line pl-6">
                {data.vestingSchedule.map((event, i) => (
                  <li key={`${event.date}-${i}`} className="relative pb-7 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={
                        event.completed
                          ? 'absolute -left-[1.8125rem] top-1 size-2 rounded-full bg-line-strong ring-3 ring-ground'
                          : 'absolute -left-[1.8125rem] top-1 size-2 rounded-full bg-caution ring-3 ring-ground'
                      }
                    />

                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="t-micro-tight text-ink-dim">
                          {formatDate(event.date)}
                        </span>
                        {/* Status in words, not colour alone. */}
                        <span className="t-micro-tight text-ink-ghost">
                          {event.completed ? 'Completed' : 'Scheduled'}
                        </span>
                        {event.percentage > 0 && (
                          <span className="t-micro-tight text-ink-ghost">
                            {formatShare(event.percentage)} of supply
                          </span>
                        )}
                      </div>
                      <p className="max-w-[36rem] text-[0.875rem] leading-relaxed text-ink-dim">
                        {event.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </ResearchSection>
  );
}
