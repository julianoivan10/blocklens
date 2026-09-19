import 'server-only';

import type { AIResearchService } from './interface';
import { MockAIResearchService } from './mock';
import { OpenAIResearchService } from './openai';
import { providerKeys, sampleDataEnabled } from '../providers';

let instance: AIResearchService | null = null;

/**
 * Synthesis genuinely requires a key. Without AI_API_KEY there is no
 * live implementation, and the caller reports the section unavailable
 * rather than presenting an invented analysis as a real one.
 */
export function getAIService(): AIResearchService | null {
  if (instance) return instance;

  if (sampleDataEnabled()) {
    instance = new MockAIResearchService();
    return instance;
  }

  const key = providerKeys.openai;
  if (!key) return null;

  instance = new OpenAIResearchService(key, providerKeys.openaiModel);
  return instance;
}

export type { AIResearchService, ResearchContext } from './interface';
