import Link from 'next/link';
import { Block, BlockHead } from '@/components/ui/block';
import { LineChart } from '@/components/data/line-chart';
import { formatDate } from '@/lib/format';
import { PERIODS, type PeriodId } from '@/lib/portfolio/benchmark';
import type { PerformanceView } from '@/server/portfolio/service';
import type { RiskMetric } from '@/lib/portfolio/risk';
import { cn } from '@/lib/utils';

function pct(v: number | null) {
  return v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function PeriodTabs({ current }: { current: PeriodId }) {
  return (
    <nav aria-label="Period" className="flex gap-1">
      {PERIODS.map((p) => (
        <Link
          key={p.id}
          href={`/portfolio?period=${p.id}`}
          scroll={false}
          aria-current={p.id === current ? 'page' : undefined}
          className={cn(
            'px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-widest transition-colors',
            p.id === current ? 'bg-panel-raised text-ink' : 'text-ink-ghost hover:text-ink-dim'
          )}
        >
          {p.id}
        </Link>
      ))}
    </nav>
  );
}

export function PerformanceSection({ perf }: { perf: PerformanceView }) {
  const valueSeries = [
    { id: 'value', label: 'Portfolio value', slot: 1 as const, points: perf.points.map((p) => ({ x: p.day, y: p.value })) },
    { id: 'cost', label: 'Invested capital', slot: 3 as const, dashed: true, points: perf.points.map((p) => ({ x: p.day, y: p.costBasis })) },
  ];

  const available = perf.comparisons.filter((c) => c.benchmark.available && c.series.length);
  const first = available[0];
  const indexSeries = first
    ? [
        { id: 'portfolio', label: 'Portfolio (time-weighted)', slot: 1 as const, points: first.series.map((s) => ({ x: s.day, y: s.portfolio })) },
        ...available.map((c, i) => ({
          id: c.benchmark.id,
          label: c.benchmark.label,
          slot: (i + 2) as 2 | 3,
          points: c.series.map((s) => ({ x: s.day, y: s.benchmark })),
        })),
      ]
    : [];

  return (
    <div className="flex flex-col gap-12">
      <Block>
        <BlockHead
          label="Portfolio value over time"
          aside={<span className="t-micro-tight text-ink-ghost">{perf.period.label} · daily close</span>}
        />
        <LineChart
          className="mt-5"
          format="usd"
          series={valueSeries}
          ariaLabel={`Portfolio value and invested capital, ${perf.period.label}`}
        />
        {perf.coverageWarning && (
          <p className="t-micro-tight mt-2 text-caution">
            Some days lack a price for part of the holdings; those assets are left out of that day’s value rather than
            counted at zero.
          </p>
        )}
      </Block>

      <Block>
        <BlockHead label="Performance vs benchmark" aside={<span className="t-micro-tight text-ink-ghost">Indexed to 100 at period start</span>} />
        {indexSeries.length ? (
          <LineChart className="mt-5" format="index" baseline={100} series={indexSeries} ariaLabel="Portfolio time-weighted return against benchmarks, indexed to 100" />
        ) : (
          <p className="t-body-sm mt-5 text-ink-faint">Insufficient data — the portfolio needs at least two valued days in this period.</p>
        )}

        <table className="mt-6 w-full text-left text-[0.8125rem]" data-testid="benchmark-table">
          <thead>
            <tr className="border-b border-line">
              {['Benchmark', 'Period', 'Portfolio return', 'Benchmark return', 'Relative', 'Source'].map((h, i) => (
                <th key={h} className={cn('t-micro-tight py-2 pr-4 font-normal', i >= 2 && i <= 4 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perf.comparisons.map((c) => (
              <tr key={c.benchmark.id} className="border-b border-line-faint align-top">
                <td className="py-2.5 pr-4 text-ink">{c.benchmark.label}</td>
                <td className="py-2.5 pr-4 text-ink-dim">
                  {c.from ? `${formatDate(new Date(c.from))} – ${formatDate(new Date(c.to))}` : c.periodLabel}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{pct(c.portfolioReturnPct)}</td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{pct(c.benchmarkReturnPct)}</td>
                <td className={cn('py-2.5 pr-4 text-right font-mono tabular-nums', c.relativePct !== null && (c.relativePct >= 0 ? 'text-up' : 'text-down'))}>
                  {c.relativePct === null ? '—' : `${c.relativePct > 0 ? '+' : ''}${c.relativePct.toFixed(2)} pp`}
                </td>
                <td className="py-2.5 text-[0.75rem] text-ink-ghost">
                  {c.benchmark.source}
                  {c.note && <div className="mt-1 text-ink-faint">{c.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-micro-tight mt-3 max-w-[48rem] leading-relaxed text-ink-ghost">
          Portfolio return is time-weighted, so deposits and withdrawals do not count as gains or losses. Benchmark return is
          the change in the benchmark’s daily close over the same dates. This compares past periods only and says nothing
          about future performance.
        </p>
      </Block>
    </div>
  );
}

function MetricValue({ m }: { m: RiskMetric }) {
  if (m.result.status === 'insufficient') {
    return <span className="text-[0.8125rem] text-ink-faint">{m.result.reason}</span>;
  }
  const v = m.result.value;
  const text = m.result.unit === 'pct' ? `${v.toFixed(2)}%` : m.result.unit === 'index' ? v.toFixed(0) : v.toFixed(2);
  return <span className="t-figure">{text}</span>;
}

export function RiskSection({ metrics }: { metrics: RiskMetric[] }) {
  return (
    <Block>
      <BlockHead label="Risk metrics" aside={<span className="t-micro-tight text-ink-ghost">No composite score — each metric stands alone</span>} />
      <ul className="mt-2 grid grid-cols-1 gap-x-10 md:grid-cols-2" data-testid="risk-metrics">
        {metrics.map((m) => (
          <li key={m.key} className="border-b border-line-faint py-4">
            <div className="flex items-baseline justify-between gap-6">
              <span className="t-micro-tight text-ink-faint">{m.label}</span>
              <MetricValue m={m} />
            </div>
            <details className="mt-2 text-[0.75rem] leading-relaxed text-ink-ghost">
              <summary className="cursor-pointer select-none hover:text-ink-dim">Method · {m.period}</summary>
              <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1">
                <dt>Methodology</dt>
                <dd className="text-ink-faint">{m.methodology}</dd>
                <dt>Required data</dt>
                <dd className="text-ink-faint">{m.requiredData}</dd>
                <dt>Limitations</dt>
                <dd className="text-ink-faint">{m.limitations}</dd>
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </Block>
  );
}
