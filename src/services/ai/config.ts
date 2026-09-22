import 'server-only';

/**
 * The one place BlockLens decides which AI provider, which model and
 * which generation settings are used. Nothing else reads GEMINI_* or
 * names a model.
 *
 * Model choice (verified against the live model list on 2026-09-22):
 * `gemini-3.5-flash-lite` is the current stable Flash-Lite model — the
 * lowest-cost tier that supports JSON-schema-constrained output. The
 * work here is summarising already-computed figures, not reasoning over
 * them, so a larger model buys nothing but latency and cost. Older
 * Flash-Lite ids (2.5) now return 404 for new keys, which is why the id
 * is configuration rather than code.
 */

export const AI_PROVIDER = 'gemini' as const;

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export interface AIGenerationConfig {
  /** Low temperature: summaries should be repeatable from the same data. */
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Retries for 429/5xx only — never for a validation failure. */
  retries: number;
}

export const GENERATION: Record<'research' | 'portfolio', AIGenerationConfig> = {
  research: { temperature: 0.3, maxOutputTokens: 2048, timeoutMs: 45_000, retries: 2 },
  portfolio: { temperature: 0.2, maxOutputTokens: 3072, timeoutMs: 45_000, retries: 2 },
};

export function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(geminiApiKey());
}
