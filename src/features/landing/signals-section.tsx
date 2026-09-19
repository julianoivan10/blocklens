import { Container, Section, SectionMark } from '@/components/ui/section';
import { getAssetRailResult } from '@/server/data/market';
import { isOk } from '@/services/result';
import { formatCompactCurrency, formatShare } from '@/lib/format';

/**
 * The dimension ledger.
 *
 * A table of contents for what research means here — an ordinal, a
 * name, what it answers, and a real reading from one asset. Rows
 * divided by hairlines, with the ordinal set large in the display
 * serif so the list has a typographic spine.
 *
 * This is the section that would conventionally be six feature cards.
 *
 * The right-hand reading on each row is a live figure where one exists
 * for that dimension. If the provider is unreachable the column is simply
 * blank — the ledger still reads, and no placeholder number stands in.
 */
const DIMENSIONS = [
  { ordinal: '01', name: 'Market', question: 'What is the asset worth, and how has that changed?' },
  { ordinal: '02', name: 'On-chain', question: 'Is the network actually being used, or just traded?' },
  {
    ordinal: '03',
    name: 'Tokenomics',
    question: 'Who holds the supply, and what is still to be released?',
  },
  { ordinal: '04', name: 'Project', question: 'Is anyone building, and on what?' },
  { ordinal: '05', name: 'Risk', question: 'Where is this asset structurally fragile?' },
  {
    ordinal: '06',
    name: 'Interpretation',
    question: 'What does all of it add up to — and what is still unknown?',
  },
] as const;

export async function SignalsSection() {
  const rail = await getAssetRailResult(['BTC', 'ETH', 'SOL']);
  const [btc, eth, sol] = isOk(rail) ? rail.data : [];

  /* One live reading per dimension, where the data supports one. The
     order matches DIMENSIONS; `undefined` leaves the column blank. */
  const readings: Array<string | undefined> = [
    btc ? `BTC · ${formatCompactCurrency(btc.marketCap)} cap` : undefined,
    eth ? `ETH · ${formatCompactCurrency(eth.totalVolume)} traded / 24h` : undefined,
    sol?.maxSupply
      ? `SOL · ${formatShare((sol.circulatingSupply / sol.maxSupply) * 100)} issued`
      : sol
        ? `SOL · ${formatCompactCurrency(sol.marketCap)} cap`
        : undefined,
    'Sources, repos and classification',
    'Scored from live market data',
    'AI synthesis, clearly labelled',
  ];

  return (
    <Section id="signals">
      <Container>
        <div className="flex flex-col gap-14 lg:flex-row lg:gap-20">
          {/* The heading stays with the list as it scrolls, so the
              reader never loses what they are reading a list of. */}
          <div className="lg:sticky lg:top-28 lg:h-fit lg:w-[22rem] lg:shrink-0">
            <SectionMark index="02" label="The dimensions" />

            <h2 className="t-display-sm mt-6 text-ink">
              One asset.
              <br />
              <span className="text-ink-dim">Six readings.</span>
            </h2>

            <p className="t-body mt-6">
              A price tells you what the market last agreed on. It does not tell you who
              holds the supply, whether the chain is busy, or what unlocks next quarter.
              Research means holding all of those at once.
            </p>
          </div>

          <ol className="min-w-0 flex-1">
            {DIMENSIONS.map((d, index) => (
              <li
                key={d.ordinal}
                className="group relative border-t border-line-faint last:border-b"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-signal transition-transform duration-500 ease-out-quint group-hover:scale-y-100"
                />

                <div className="flex flex-col gap-3 py-7 pl-6 pr-2 transition-colors duration-300 group-hover:bg-panel/40 sm:flex-row sm:items-baseline sm:gap-8">
                  <span
                    aria-hidden="true"
                    className="font-display text-[1.75rem] leading-none text-line-strong transition-colors duration-300 group-hover:text-signal-deep"
                  >
                    {d.ordinal}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <h3 className="text-[1.0625rem] font-medium tracking-[-0.01em] text-ink">
                      {d.name}
                    </h3>
                    <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-faint">
                      {d.question}
                    </p>
                  </div>

                  {readings[index] && (
                    <span className="t-micro-tight shrink-0 text-ink-ghost transition-colors duration-300 group-hover:text-ink-dim sm:text-right">
                      {readings[index]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
