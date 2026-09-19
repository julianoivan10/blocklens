import 'server-only';

import type { RiskService } from './interface';
import { ComputedRiskService } from './computed';

let instance: RiskService | null = null;

/**
 * Risk is always computed from live data BlockLens already holds — no
 * provider sells a score, and the sample implementation was removed
 * because a fabricated risk rating is the most misleading thing this
 * product could show.
 */
export function getRiskService(): RiskService {
  if (instance) return instance;
  instance = new ComputedRiskService();
  return instance;
}

export type { RiskService, RiskContext } from './interface';
