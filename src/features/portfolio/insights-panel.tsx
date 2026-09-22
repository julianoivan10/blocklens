'use client';

import { useState } from 'react';
import { Block, BlockHead } from '@/components/ui/block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatTimeAgo } from '@/lib/format';
import { INSIGHT_SECTIONS, SECTION_LABELS, type Fact, type Statement } from '@/lib/ai/insights';
import type { StoredInsight } from '@/server/portfolio/insights';
import type { PeriodId } from '@/lib/portfolio/benchmark';
import type { ApiResponse } from '@/types';

/**
 * AI insights, kept visibly separate from the figures above.
 *
 * Each statement wears its kind: FACT (a restatement of a figure BlockLens
 * computed, with the facts it cites) or AI INTERPRETATION (the model's
 * reading of those figures). Nothing here is generated on page load; the
 * reader asks for it.
 */
function StatementRow({ s, facts }: { s: Statement; facts: Map<string, Fact> }) {
  const cited = s.evidence.map((id) => facts.get(id)).filter((f): f is Fact => Boolean(f));
  return (
    <li className="flex flex-col gap-1.5 border-b border-line-faint py-3">
      <div className="flex items-start gap-3">
        <Badge tone={s.kind === 'FACT' ? 'neutral' : 'signal'} className="mt-0.5 shrink-0">
          {s.kind === 'FACT' ? 'Fact' : 'AI interpretation'}
        </Badge>
        <p className="text-[0.875rem] leading-relaxed text-ink">{s.text}</p>
      </div>
      {cited.length > 0 && (
        <details className="ml-1 text-[0.6875rem] text-ink-ghost">
          <summary className="cursor-pointer select-none hover:text-ink-dim">Based on {cited.map((f) => f.id).join(', ')}</summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {cited.map((f) => (
              <li key={f.id} className="font-mono">
                {f.id} · {f.label}: {f.display}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function InsightsPanel({
  initial,
  period,
  configured,
}: {
  initial: StoredInsight | null;
  period: PeriodId;
  configured: boolean;
}) {
  const { addToast } = useToast();
  const [insight, setInsight] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch('/api/portfolio/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data: ApiResponse<StoredInsight> = await res.json();
      if (data.success && data.data) {
        setInsight(data.data);
        if (data.message) addToast({ type: 'success', title: data.message });
      } else {
        addToast({ type: 'error', title: 'No insight generated', description: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'No insight generated', description: 'The request could not be completed.' });
    } finally {
      setBusy(false);
    }
  }

  const facts = new Map((insight?.facts ?? []).map((f) => [f.id, f]));
  const sections = insight ? INSIGHT_SECTIONS.filter((s) => insight.sections[s]?.length) : [];

  return (
    <Block>
      <BlockHead
        label="AI insights"
        aside={
          insight ? (
            <span className="t-micro-tight text-ink-ghost">
              {insight.model} · {formatTimeAgo(insight.generatedAt)} · {insight.periodLabel}
            </span>
          ) : undefined
        }
      />
      <div className="mt-5 flex flex-col gap-6">
        <p className="max-w-[46rem] text-[0.8125rem] leading-relaxed text-ink-faint">
          Gemini reads the figures BlockLens has already calculated and describes them. It does not calculate anything,
          cannot see anything not listed in its facts, and is not financial advice.
        </p>

        {!configured ? (
          <p className="t-body-sm text-ink-faint">AI insights are not configured on this deployment.</p>
        ) : (
          <Button variant="line" size="sm" loading={busy} onClick={() => void generate()} className="self-start">
            {insight ? 'Refresh insights' : 'Generate insights'}
          </Button>
        )}

        {insight && (
          <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2" data-testid="insights">
            {sections.map((s) => (
              <section key={s}>
                <h3 className="t-micro mb-1">{SECTION_LABELS[s]}</h3>
                <ul>
                  {insight.sections[s].map((st, i) => (
                    <StatementRow key={i} s={st} facts={facts} />
                  ))}
                </ul>
              </section>
            ))}
            {sections.length === 0 && <p className="t-body-sm text-ink-faint">The model returned no statements that passed verification.</p>}
          </div>
        )}

        {insight && (
          <p className="t-micro-tight max-w-[46rem] leading-relaxed text-ink-ghost">
            {insight.rejectedCount > 0 &&
              `${insight.rejectedCount} statement${insight.rejectedCount === 1 ? ' was' : 's were'} withheld because ${insight.rejectedCount === 1 ? 'it' : 'they'} quoted a figure not in the data, cited nothing, or read as advice. `}
            {insight.disclaimer}
          </p>
        )}
      </div>
    </Block>
  );
}
