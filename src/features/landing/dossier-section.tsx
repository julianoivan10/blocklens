import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container, Section, SectionMark } from '@/components/ui/section';
import { AssetMark } from '@/components/data/asset-mark';
import { Delta } from '@/components/data/delta';
import { Sparkline } from '@/components/data/sparkline';
import { Meter } from '@/components/data/register';
import { getPriceSeries, getTokenSnapshot } from '@/server/data/market';
import { getOnchainService } from '@/services/onchain';
import { getRiskService } from '@/services/risk';
import { getTokenomicsService } from '@/services/tokenomics';
import { formatCompactCurrency, formatPrice, formatShare } from '@/lib/format';
import { ROUTES } from '@/lib/constants';

const OUTLINE = [
  { label: 'Market', detail: 'Price structure, volume, range' },
  { label: 'On-chain', detail: 'Addresses, transfers, hash rate' },
  { label: 'Tokenomics', detail: 'Supply, distribution, unlocks' },
  { label: 'Project', detail: 'Ecosystem and development' },
  { label: 'Events', detail: 'Developments worth knowing' },
  { label: 'Risk', detail: 'Six scored dimensions' },
  { label: 'Interpretation', detail: 'AI reading, clearly labelled' },
] as const;

/**
 * The dossier preview.
 *
 * The strongest argument the landing page can make is the artefact
 * itself, built from the same components and the same providers as the
 * real research page — so this is not a screenshot or a mockup. It
 * sits on a sunken plane under a slight perspective, which is where
 * the product's spatial depth belongs: one considered moment, not an
 * effect applied everywhere.
 *
 * The risk rows are the same computed assessment the research page runs,
 * over the same live inputs — not a decorative set of bars. If market data
 * is unavailable the whole exhibit is withheld rather than shown with
 * invented figures.
 */
export async function DossierSection() {
  const [btc, series] = await Promise.all([
    getTokenSnapshot('BTC').catch(() => null),
    getPriceSeries('BTC', 30).catch(() => []),
  ]);
  if (!btc) return null;

  const [onchain, tokenomics] = await Promise.all([
    getOnchainService()
      .getMetrics('BTC')
      .catch(() => null),
    getTokenomicsService()
      .getTokenomics('BTC', btc)
      .catch(() => null),
  ]);

  const risk = await getRiskService().getAssessment('BTC', {
    token: btc,
    series,
    onchain,
    tokenomics,
  });

  // The three highest-signal dimensions, in the order the scorer
  // produced them.
  const riskRows = risk.dimensions.slice(0, 3);

  const figures = [
    { label: 'Market cap', value: formatCompactCurrency(btc.marketCap) },
    { label: '24h volume', value: formatCompactCurrency(btc.totalVolume) },
    { label: 'Circulating', value: formatShare((btc.circulatingSupply / (btc.maxSupply ?? btc.circulatingSupply)) * 100) },
    { label: 'From ATH', value: formatShare(((btc.currentPrice - btc.ath) / btc.ath) * 100) },
  ];

  return (
    <Section id="dossier" className="relative overflow-hidden bg-panel-sunken">
      <div aria-hidden="true" className="field-grid field-fade absolute inset-0 opacity-50" />

      <Container className="relative">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[34rem]">
            <SectionMark index="04" label="The dossier" />
            <h2 className="t-display-sm mt-6 text-ink">A research report, not a dashboard.</h2>
            <p className="t-body mt-5">
              Every asset opens as one continuous document you read top to bottom — market,
              chain, supply, project, events, risk, interpretation. Nothing important is
              hidden behind a tab.
            </p>
          </div>

          <Link
            href={`${ROUTES.research}/BTC`}
            className="group inline-flex shrink-0 items-center gap-2 text-[0.875rem] text-ink-dim transition-colors hover:text-ink"
          >
            Open the BTC dossier
            <ArrowRight className="size-3.5 transition-transform duration-300 ease-out-quint group-hover:translate-x-1" />
          </Link>
        </div>

        {/* The artefact. The rotation is kept shallow on purpose: this
            panel holds real figures, and anything steeper trades
            legibility for effect. */}
        <div className="mt-16 lg:[perspective:2000px]">
          <div className="bracket border border-line bg-ground shadow-float lg:[transform:rotateY(-3deg)_rotateX(1deg)] lg:[transform-origin:left_center]">
            {/* Asset header */}
            <div className="flex flex-col gap-6 border-b border-line p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
              <div className="flex items-center gap-4">
                <AssetMark symbol={btc.symbol} size="lg" />
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-[1.625rem] leading-none text-ink">
                    {btc.name}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="t-micro-tight text-ink-dim">{btc.symbol}</span>
                    <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
                    <span className="t-micro-tight">Rank {btc.marketCapRank}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                <span className="t-figure-lg">{formatPrice(btc.currentPrice)}</span>
                <Delta value={btc.priceChangePercentage24h} />
              </div>
            </div>

            {/* Figures */}
            <dl className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
              {figures.map((f, i) => (
                <div
                  key={f.label}
                  className={[
                    'flex flex-col gap-2 border-line-faint px-6 py-5 sm:px-8',
                    i % 2 === 1 ? 'border-l' : '',
                    i < 2 ? 'border-b lg:border-b-0' : '',
                    i > 0 ? 'lg:border-l' : 'lg:border-l-0',
                  ].join(' ')}
                >
                  <dt className="t-micro">{f.label}</dt>
                  <dd className="t-figure">{f.value}</dd>
                </div>
              ))}
            </dl>

            {/* Plot */}
            <div className="border-b border-line px-6 pb-6 pt-5 sm:px-8">
              <div className="flex items-baseline justify-between gap-4">
                <span className="t-micro">Price · 30 days</span>
                <span className="t-micro-tight text-ink-ghost">Close</span>
              </div>
              <Sparkline
                values={series.map((p) => p.value)}
                width={900}
                height={120}
                tone="signal"
                endMarker
                className="mt-4 h-24 w-full"
                label="Bitcoin closing price over the last 30 days"
              />
            </div>

            {/* Outline + interpretation */}
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <ol className="lg:col-span-7">
                {OUTLINE.map((s, i) => (
                  <li
                    key={s.label}
                    className="flex items-baseline gap-5 border-b border-line-faint px-6 py-3.5 last:border-b-0 sm:px-8"
                  >
                    <span className="t-micro-tight w-5 shrink-0 text-ink-ghost">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="w-[7.5rem] shrink-0 text-[0.8125rem] font-medium text-ink">
                      {s.label}
                    </span>
                    <span className="hidden truncate text-[0.75rem] text-ink-faint sm:inline">
                      {s.detail}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="flex flex-col gap-5 border-t border-line px-6 py-6 sm:px-8 lg:col-span-5 lg:border-l lg:border-t-0">
                <span className="t-micro">Risk profile</span>

                <div className="flex flex-col gap-3.5">
                  {riskRows.map((r) => (
                    <div key={r.name} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="t-micro-tight text-ink-dim">{r.name}</span>
                        {/* Score and word, so severity never rests on
                            colour alone. */}
                        <span className="t-micro-tight text-ink-faint">
                          {r.label} · {r.score}
                        </span>
                      </div>
                      <Meter
                        value={r.score}
                        tone={r.score >= 75 ? 'up' : r.score >= 50 ? 'caution' : 'down'}
                      />
                    </div>
                  ))}
                </div>

                <p className="mt-auto border-t border-line-faint pt-4 font-display text-[0.9375rem] italic leading-relaxed text-ink-dim">
                  Every dossier closes with an AI reading of the figures above it, set apart
                  in this voice and labelled as interpretation rather than fact.
                </p>
                <span className="t-micro-tight text-ink-ghost">
                  Generated per asset · not shown here
                </span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
