import 'server-only';

import type { AIResearchService } from './interface';
import { MockAIResearchService } from './mock';
import { GeminiResearchService } from './research';
import { GeminiClient } from './gemini';
import { geminiApiKey, geminiModel } from './config';
import { sampleDataEnabled } from '../providers';

let client: GeminiClient | null = null;
let instance: AIResearchService | null = null;

/**
 * The shared Gemini client, or null when GEMINI_API_KEY is absent.
 * Server-side only: the key never leaves this module graph.
 */
export function getGeminiClient(): GeminiClient | null {
  if (client) return client;
  const key = geminiApiKey();
  if (!key) return null;
  client = new GeminiClient(key, geminiModel());
  return client;
}

/**
 * Synthesis genuinely requires a key. Without GEMINI_API_KEY there is no
 * live implementation, and the caller reports the section unavailable
 * rather than presenting an invented analysis as a real one.
 */
export function getAIService(): AIResearchService | null {
  if (instance) return instance;

  if (sampleDataEnabled()) {
    instance = new MockAIResearchService();
    return instance;
  }

  const gemini = getGeminiClient();
  if (!gemini) return null;

  instance = new GeminiResearchService(gemini);
  return instance;
}

export type { AIResearchService, ResearchContext } from './interface';
