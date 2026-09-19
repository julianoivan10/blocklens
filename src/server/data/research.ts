import 'server-only';

import { cache } from 'react';
import { getAIService } from '@/services/ai';
import { getNewsService } from '@/services/news';
import { getOnchainService } from '@/services/onchain';
import { getRiskService } from '@/services/risk';
import { getTokenomicsService } from '@/services/tokenomics';
import { getPriceSeries, getTokenSnapshot } from './market';
import type {
  AIResearchSummary,
  NewsArticle,
  OnchainMetrics,
  RiskAssessment,
  SimplePrice,
  TokenOverview,
  TokenomicsData,
} from '@/types';

/** The default plot window on a research page. */
export const DEFAULT_RESEARCH_DAYS = 90;

export interface ResearchDossier {
  token: TokenOverview;
  series: SimplePrice[];
  onchain: OnchainMetrics | null;
  tokenomics: TokenomicsData | null;
  risk: RiskAssessment;
  news: NewsArticle[];
  /**
   * Null when synthesis is not configured or the model call failed —
   * the section then says so rather than showing a fabricated analysis.
   */
  ai: AIResearchSummary | null;
  aiUnavailableReason?: string;
}

/**
 * Everything a research page needs.
 *
 * Reads run in two phases because the synthesis genuinely depends on the
 * rest: the model is handed the already-normalised market, chain and
 * news data and told to reason only from it, so it cannot introduce a
 * figure no provider reported.
 *
 * Within each phase the reads are concurrent and independently settled,
 * so one provider being down costs its own section rather than the whole
 * dossier.
 */
export const getResearchDossier = cache(
  async (symbol: string, days = DEFAULT_RESEARCH_DAYS): Promise<ResearchDossier | null> => {
    const token = await getTokenSnapshot(symbol);
    if (!token) return null;

    /* Phase one — the evidence. Independently settled, so one provider
       being down costs its own section rather than the dossier. */
    const [series, onchain, tokenomics, news] = await Promise.all([
      getPriceSeries(symbol, days).catch(() => [] as SimplePrice[]),
      getOnchainService()
        .getMetrics(symbol)
        .catch(() => null),
      getTokenomicsService()
        .getTokenomics(symbol, token)
        .catch(() => null),
      getNewsService()
        .getByToken(symbol, 6)
        .catch(() => [] as NewsArticle[]),
    ]);

    /* Phase two — risk, computed from that evidence rather than fetched. */
    const risk = await getRiskService().getAssessment(symbol, {
      token,
      series,
      onchain,
      tokenomics,
    });

    /* Phase three — the synthesis, over all of it. */
    const ai = getAIService();
    let summary: AIResearchSummary | null = null;
    let aiUnavailableReason: string | undefined;

    if (!ai) {
      aiUnavailableReason = 'AI synthesis is not configured on this deployment.';
    } else {
      try {
        summary = await ai.generateSummary(symbol, {
          token,
          onchain,
          tokenomics,
          risk,
          news,
        });
      } catch (error) {
        console.error(`[data] AI synthesis for ${symbol} failed:`, error);
        aiUnavailableReason = 'The synthesis could not be generated right now.';
      }
    }

    return { token, series, onchain, tokenomics, risk, news, ai: summary, aiUnavailableReason };
  }
);
