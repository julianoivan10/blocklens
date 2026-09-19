import 'server-only';

import { fetchJson, ProviderError } from '../http';
import type { AIResearchService, ResearchContext } from './interface';
import type { AIResearchSummary } from '@/types';
import { AI_DISCLAIMER } from './disclaimer';

/**
 * OpenAI research synthesis.
 *
 * Two deliberate constraints:
 *
 *  1. The model is given a compact digest of already-normalised
 *     BlockLens data and told to reason only from it. It is not given
 *     tools and cannot browse, so it cannot introduce a figure no
 *     provider reported.
 *  2. The response is constrained by a strict JSON schema, so a
 *     malformed answer fails loudly here instead of rendering as an
 *     empty research section.
 *
 * Temperature is not sent: the gpt-5 family rejects values other than
 * the default, and a research summary wants the default anyway.
 */

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'keyObservations',
    'notableRisks',
    'importantDevelopments',
    'areasForFurtherResearch',
  ],
  properties: {
    summary: {
      type: 'string',
      description: 'Two to four sentences of neutral analytical prose.',
    },
    keyObservations: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'string' },
      description: 'Observations traceable to a figure in the supplied data.',
    },
    notableRisks: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'string' },
    },
    importantDevelopments: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: { type: 'string' },
    },
    areasForFurtherResearch: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: { type: 'string' },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'You are a digital-asset research analyst writing for BlockLens, a research platform.',
  '',
  'Rules:',
  '- Reason only from the supplied data. Never state a number that is not in it.',
  '- If the data does not support a claim, put the question under areasForFurtherResearch instead of asserting it.',
  '- Neutral analytical register. No hype, no price targets, no buy/sell framing, no advice.',
  '- Do not predict prices or returns.',
  '- Distinguish what the data shows from what it merely suggests.',
  '- Every observation should reference a concrete figure or a named development.',
].join('\n');

interface ChatCompletion {
  choices: Array<{
    message: { content: string | null; refusal?: string | null };
    finish_reason: string;
  }>;
}

interface SummaryPayload {
  summary: string;
  keyObservations: string[];
  notableRisks: string[];
  importantDevelopments: string[];
  areasForFurtherResearch: string[];
}

/**
 * Compresses the dossier into the few hundred tokens that actually carry
 * signal. Sending whole objects wastes context and invites the model to
 * latch onto irrelevant fields.
 */
function buildDigest(symbol: string, context: ResearchContext): string {
  const { token, onchain, tokenomics, risk, news } = context;
  const lines: string[] = [];

  const pct = (v: number | undefined) => (typeof v === 'number' ? `${v.toFixed(2)}%` : 'n/a');
  const usd = (v: number | null | undefined) =>
    typeof v === 'number' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'n/a';

  lines.push(`ASSET: ${token.name} (${symbol}), market-cap rank ${token.marketCapRank || 'n/a'}`);
  if (token.categories?.length) lines.push(`CATEGORIES: ${token.categories.join(', ')}`);
  lines.push(
    `MARKET: price ${usd(token.currentPrice)}; market cap ${usd(token.marketCap)}; 24h volume ${usd(
      token.totalVolume
    )}; change 24h ${pct(token.priceChangePercentage24h)}, 7d ${pct(
      token.priceChangePercentage7d
    )}, 30d ${pct(token.priceChangePercentage30d)}`
  );
  lines.push(
    `RANGE: all-time high ${usd(token.ath)} on ${token.athDate?.slice(0, 10) || 'n/a'} (now ${pct(
      ((token.currentPrice - token.ath) / token.ath) * 100
    )} from it); all-time low ${usd(token.atl)} on ${token.atlDate?.slice(0, 10) || 'n/a'}`
  );
  lines.push(
    `SUPPLY: circulating ${token.circulatingSupply.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })}; total ${token.totalSupply?.toLocaleString('en-US') ?? 'n/a'}; max ${
      token.maxSupply?.toLocaleString('en-US') ?? 'uncapped'
    }`
  );

  if (onchain) {
    const parts: string[] = [];
    if (onchain.chainLabel) parts.push(`chain ${onchain.chainLabel}`);
    if (onchain.tvl) parts.push(`DeFi TVL ${usd(onchain.tvl)}`);
    if (onchain.fees24h) parts.push(`fees 24h ${usd(onchain.fees24h)}`);
    if (onchain.revenue24h) parts.push(`revenue 24h ${usd(onchain.revenue24h)}`);
    if (onchain.blockTime) parts.push(`block time ${onchain.blockTime}s`);
    if (onchain.transactionsPerBlock) parts.push(`${onchain.transactionsPerBlock} tx/block`);
    if (onchain.transactionCount24h)
      parts.push(
        `~${onchain.transactionCount24h.toLocaleString('en-US')} tx/24h (extrapolated, not counted)`
      );
    if (onchain.gasPriceGwei) parts.push(`gas ${onchain.gasPriceGwei} gwei`);
    if (onchain.activeAddresses24h)
      parts.push(`active addresses 24h ${onchain.activeAddresses24h.toLocaleString('en-US')}`);
    if (onchain.hashRate) parts.push(`hash rate ${onchain.hashRate}`);
    if (parts.length) lines.push(`ON-CHAIN: ${parts.join('; ')}`);
  } else {
    lines.push('ON-CHAIN: no coverage for this asset.');
  }

  if (tokenomics) {
    lines.push(
      `TOKENOMICS: ${tokenomics.circulatingPercentage.toFixed(1)}% of supply circulating${
        tokenomics.distribution?.length
          ? `; distribution ${tokenomics.distribution
              .map((d) => `${d.label} ${d.percentage}%`)
              .join(', ')}`
          : ''
      }`
    );
    const upcoming = tokenomics.vestingSchedule?.filter((v) => !v.completed).slice(0, 3);
    if (upcoming?.length) {
      lines.push(
        `UPCOMING UNLOCKS: ${upcoming
          .map((v) => `${v.date} ${v.percentage}% (${v.description})`)
          .join('; ')}`
      );
    }
  }

  if (risk) {
    lines.push(
      `RISK SCORES (0-100, higher = lower risk): composite ${risk.overallScore}; ${risk.dimensions
        .map((d) => `${d.name} ${d.score}`)
        .join(', ')}`
    );
  }

  if (news.length) {
    lines.push('RECENT HEADLINES:');
    news.slice(0, 8).forEach((article) => {
      lines.push(`- [${article.source}] ${article.title}`);
    });
  } else {
    lines.push('RECENT HEADLINES: none retrieved.');
  }

  return lines.join('\n');
}

export class OpenAIResearchService implements AIResearchService {
  private readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string
  ) {
    if (!apiKey) throw new ProviderError('openai', 'an API key is required');
    this.model = model?.trim() || 'gpt-5-mini';
  }

  async generateSummary(symbol: string, context: ResearchContext): Promise<AIResearchSummary> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Write a research synthesis for ${symbol} from the following BlockLens data.\n\n${buildDigest(
            symbol,
            context
          )}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'research_summary', strict: true, schema: SUMMARY_SCHEMA },
      },
      // The gpt-5 family uses max_completion_tokens; max_tokens is
      // rejected. Headroom is generous because reasoning tokens count
      // against this budget.
      max_completion_tokens: 3000,
    };

    const completion = await fetchJson<ChatCompletion>(ENDPOINT, {
      provider: 'openai',
      revalidate: 0,
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body,
      // Synthesis is slower than a data read.
      timeoutMs: 60_000,
    });

    const choice = completion.choices?.[0];
    if (choice?.message.refusal) {
      throw new ProviderError('openai', `model refused: ${choice.message.refusal}`);
    }
    if (choice?.finish_reason === 'length') {
      throw new ProviderError('openai', 'response truncated before completing the summary');
    }

    const content = choice?.message.content;
    if (!content) throw new ProviderError('openai', 'empty completion');

    let payload: SummaryPayload;
    try {
      payload = JSON.parse(content) as SummaryPayload;
    } catch {
      throw new ProviderError('openai', 'completion was not valid JSON');
    }

    if (!payload.summary?.trim()) {
      throw new ProviderError('openai', 'completion contained no summary');
    }

    return {
      symbol: symbol.toUpperCase(),
      generatedAt: new Date().toISOString(),
      summary: payload.summary.trim(),
      keyObservations: payload.keyObservations ?? [],
      notableRisks: payload.notableRisks ?? [],
      importantDevelopments: payload.importantDevelopments ?? [],
      areasForFurtherResearch: payload.areasForFurtherResearch ?? [],
      disclaimer: AI_DISCLAIMER,
      isDemo: false,
    };
  }
}
