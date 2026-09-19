import { ResearchHeader } from './research-header';
import { ResearchContents, type ContentsEntry } from './research-contents';
import { MarketSection } from './sections/market';
import { OnchainSection } from './sections/onchain';
import { TokenomicsSection } from './sections/tokenomics';
import { ProjectSection } from './sections/project';
import { EventsSection } from './sections/events';
import { RiskSection } from './sections/risk';
import { InterpretationSection } from './sections/interpretation';
import type { ResearchDossier } from '@/server/data/research';

const CONTENTS: ContentsEntry[] = [
  { id: 'market', label: 'Market' },
  { id: 'onchain', label: 'On-chain' },
  { id: 'tokenomics', label: 'Tokenomics' },
  { id: 'project', label: 'Project' },
  { id: 'events', label: 'Events' },
  { id: 'risk', label: 'Risk' },
  { id: 'interpretation', label: 'Interpretation' },
];

/**
 * A dossier.
 *
 * One continuous document, read top to bottom — no tab strip hiding six
 * of seven dimensions behind the seventh. A server component: every
 * section receives already-fetched data, so the page arrives complete
 * and the only client JavaScript on it is the chart, the contents
 * tracker and the watchlist control.
 */
export function TokenResearch({
  dossier,
  isWatched,
}: {
  dossier: ResearchDossier;
  isWatched: boolean;
}) {
  const { token, series, onchain, tokenomics, risk, news, ai, aiUnavailableReason } = dossier;

  return (
    <article>
      <ResearchHeader token={token} isWatched={isWatched} />

      <ResearchContents entries={CONTENTS} />

      <MarketSection token={token} series={series} />
      <OnchainSection symbol={token.symbol} metrics={onchain} />
      <TokenomicsSection symbol={token.symbol} data={tokenomics} />
      <ProjectSection token={token} />
      <EventsSection symbol={token.symbol} news={news} />
      <RiskSection risk={risk} />
      <InterpretationSection summary={ai} unavailableReason={aiUnavailableReason} />
    </article>
  );
}
