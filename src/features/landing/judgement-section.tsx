import { Container, Section, SectionMark } from '@/components/ui/section';
import { getTokenSnapshot } from '@/server/data/market';
import { getOnchainService } from '@/services/onchain';
import { getRiskService } from '@/services/risk';
import { formatCompactCurrency, formatDate } from '@/lib/format';

/**
 * Facts, signals, interpretation.
 *
 * The most important idea in the product, given the most unusual
 * layout: three columns of deliberately unequal width, divided by
 * vertical rules, each set in a different voice — mono figures for
 * what is measured, mixed type for what is inferred, and the display
 * serif for what is merely argued. The typography carries the
 * epistemics, so the distinction is visible before a word is read.
 */
/**
 * The three registers, in the order they appear. Content is assembled at
 * request time: the facts column is measured provider data and the
 * signals column is BlockLens's own computed scoring, both for Bitcoin.
 * The interpretation column describes what a synthesis does rather than
 * quoting one, because quoting a model output here — outside the asset
 * page that generated it — would present an example as a finding.
 */
const REGISTERS = [
  {
    ordinal: '01',
    kind: 'Facts',
    definition: 'Measured values. Reproducible from a source.',
    span: 'lg:col-span-3',
    voice: 'font-mono text-[0.75rem] leading-relaxed text-ink-dim tabular-nums',
  },
  {
    ordinal: '02',
    kind: 'Signals',
    definition: 'Derived readings. A method applied to the facts.',
    span: 'lg:col-span-4',
    voice: 'text-[0.8125rem] leading-relaxed text-ink-dim',
  },
  {
    ordinal: '03',
    kind: 'Interpretation',
    definition: 'An argument. Generated, attributed, and contestable.',
    span: 'lg:col-span-5',
    voice: 'font-display text-[1.0625rem] italic leading-relaxed text-ink-dim',
  },
] as const;

const INTERPRETATION_NOTES = [
  'Each dossier ends with a language model reading the figures above it — what they appear to add up to, and what they cannot settle.',
  'It is set in this voice, labelled as generated, and never blended into the measured columns. If the synthesis is unavailable, the section says so instead of substituting prose.',
];

export async function JudgementSection() {
  const btc = await getTokenSnapshot('BTC').catch(() => null);

  const [onchain, risk] = btc
    ? await Promise.all([
        getOnchainService()
          .getMetrics('BTC')
          .catch(() => null),
        getRiskService()
          .getAssessment('BTC', { token: btc, series: [], onchain: null, tokenomics: null })
          .catch(() => null),
      ])
    : [null, null];

  /* Facts: measured, each traceable to a provider field. */
  const facts = btc
    ? [
        `Circulating supply ${(btc.circulatingSupply / 1e6).toFixed(2)}M BTC`,
        `Market capitalisation ${formatCompactCurrency(btc.marketCap)}`,
        `24h volume ${formatCompactCurrency(btc.totalVolume)}`,
        `All-time high $${btc.ath.toLocaleString('en-US')} · ${formatDate(btc.athDate)}`,
        ...(onchain?.tvl ? [`Value locked ${formatCompactCurrency(onchain.tvl)}`] : []),
      ]
    : [];

  /* Signals: derived, and each one states the method it came from. */
  const signals = risk?.dimensions.length
    ? risk.dimensions.slice(0, 4).map((d) => `${d.name}: ${d.label.toLowerCase()} risk — ${d.description}`)
    : [];

  const columnItems = [facts, signals, INTERPRETATION_NOTES];

  return (
    <Section>
      <Container>
        <SectionMark index="05" label="Provenance" />

        <div className="mt-10 max-w-[44rem]">
          <h2 className="t-display-sm text-ink">
            Facts, signals and interpretation are never blended.
          </h2>
          <p className="t-body mt-6">
            Most tools hand you a confident paragraph and leave you to guess which part was
            measured and which part was generated. BlockLens keeps the three apart — on the
            page, and in the type they are set in.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-y-12 lg:grid-cols-12 lg:gap-y-0">
          {REGISTERS.map((col, i) => (
            <div
              key={col.kind}
              className={[
                col.span,
                'flex flex-col gap-5 border-t border-line pt-6',
                i > 0 ? 'lg:border-l lg:border-l-line-faint lg:pl-8' : '',
                i < REGISTERS.length - 1 ? 'lg:pr-8' : '',
              ].join(' ')}
            >
              <div className="flex items-baseline gap-3">
                <span className="t-micro-tight text-ink-ghost">{col.ordinal}</span>
                <h3 className="t-micro text-ink">{col.kind}</h3>
              </div>

              <p className="text-[0.75rem] leading-relaxed text-ink-faint">{col.definition}</p>

              {columnItems[i].length > 0 ? (
                <ul className="flex flex-col gap-3 border-t border-line-faint pt-5">
                  {columnItems[i].map((item) => (
                    <li key={item} className={`flex gap-3 ${col.voice}`}>
                      <span aria-hidden="true" className="mt-2 size-1 shrink-0 bg-line-strong" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-micro-tight border-t border-line-faint pt-5 text-ink-ghost">
                  Unavailable right now.
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="t-micro-tight mt-12 max-w-[44rem] border-t border-line-faint pt-5 leading-relaxed text-ink-ghost">
          The facts and signals above are live readings for Bitcoin, shown here to make the
          distinction concrete. AI-generated interpretation is labelled wherever it appears
          and is not investment advice.
        </p>
      </Container>
    </Section>
  );
}
