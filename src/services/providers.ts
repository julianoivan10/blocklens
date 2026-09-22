import 'server-only';

/**
 * How BlockLens decides which implementation serves each domain.
 *
 * The rule is live-first. CoinGecko, DeFiLlama and RSS all serve real
 * data without a key, so those domains are live out of the box and a key
 * only raises their rate limits. Alchemy, GNews and Gemini genuinely
 * require a key; without one, the feature reports itself unavailable
 * rather than falling back to invented figures.
 *
 * Gemini configuration lives in `services/ai/config.ts`, not here.
 *
 * Sample data still exists and is still useful — for offline work and
 * for tests — but it is opt-in, never a silent substitute for a failed
 * provider.
 */

/** Named as a plain predicate, not `use*`, which reads as a React hook. */
export function sampleDataEnabled(): boolean {
  return process.env.BLOCKLENS_SAMPLE_DATA === 'true';
}

/** Server-side only. Never re-export these into client code. */
export const providerKeys = {
  get coingecko() {
    return process.env.MARKET_DATA_API_KEY?.trim() || undefined;
  },
  get alchemy() {
    return process.env.ALCHEMY_API_KEY?.trim() || undefined;
  },
  get gnews() {
    return process.env.NEWS_API_KEY?.trim() || undefined;
  },
} as const;
