import 'server-only';

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { ProviderError } from '../http';
import type { AIGenerationConfig } from './config';

/**
 * Structured generation against Gemini.
 *
 * Output is constrained twice: Gemini is given a JSON schema so it
 * *should* return the right shape, and the result is then parsed with a
 * zod schema so a response that drifts from it fails here, loudly,
 * instead of rendering as a half-empty section.
 */

const RETRYABLE = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|deadline/i;

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  /** JSON schema sent to the model. */
  jsonSchema: Record<string, unknown>;
  /** Validator applied to what comes back. */
  validator: z.ZodType<T>;
  config: AIGenerationConfig;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiClient {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string
  ) {
    if (!apiKey) throw new ProviderError('gemini', 'an API key is required');
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= req.config.retries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.model,
          contents: req.prompt,
          config: {
            systemInstruction: req.system,
            temperature: req.config.temperature,
            maxOutputTokens: req.config.maxOutputTokens,
            responseMimeType: 'application/json',
            responseJsonSchema: req.jsonSchema,
            abortSignal: AbortSignal.timeout(req.config.timeoutMs),
          },
        });

        const candidate = response.candidates?.[0];
        if (candidate?.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
          throw new ProviderError('gemini', `generation stopped: ${candidate.finishReason}`);
        }

        const text = response.text;
        if (!text) throw new ProviderError('gemini', 'empty response');

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new ProviderError('gemini', 'response was not valid JSON');
        }

        const parsed = req.validator.safeParse(json);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new ProviderError(
            'gemini',
            `response failed schema validation at ${issue?.path.join('.') || '(root)'}: ${issue?.message}`
          );
        }

        return {
          data: parsed.data,
          model: this.model,
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount,
            outputTokens: response.usageMetadata?.candidatesTokenCount,
          },
        };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = !(error instanceof ProviderError) && RETRYABLE.test(message);
        if (!retryable || attempt === req.config.retries) break;
        await sleep(800 * 2 ** attempt);
      }
    }

    if (lastError instanceof ProviderError) throw lastError;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    // The SDK embeds the raw response body; keep the first line only.
    throw new ProviderError('gemini', message.split('\n')[0].slice(0, 240));
  }
}
