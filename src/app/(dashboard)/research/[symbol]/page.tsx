import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { TokenResearch } from '@/features/research/token-research';
import { getResearchDossier } from '@/server/data/research';
import { getTokenSnapshot } from '@/server/data/market';
import { verifySession } from '@/server/auth/session';
import { isWatched, recordResearchView } from '@/server/data/watchlist';

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const token = await getTokenSnapshot(symbol);

  if (!token) return { title: `${symbol.toUpperCase()} not found` };

  return {
    title: `${token.name} (${token.symbol}) research`,
    description: `Market, on-chain, tokenomics, risk and AI research for ${token.name}.`,
  };
}

export default async function ResearchPage({ params }: Props) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();

  const [dossier, session] = await Promise.all([
    getResearchDossier(upper),
    verifySession(),
  ]);

  // An unknown ticker is a 404, not a page rendering an error message —
  // the previous version always returned 200.
  if (!dossier) notFound();

  const watched = session ? await isWatched(session.id, upper) : false;

  if (session) {
    // Recording a view must never fail the page.
    void recordResearchView(session.id, upper, dossier.token.name).catch(() => {});
  }

  return <TokenResearch dossier={dossier} isWatched={watched} />;
}
