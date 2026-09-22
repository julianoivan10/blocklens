import { z } from 'zod';

/**
 * The contract between BlockLens and the model for portfolio insights.
 *
 * The model never sees raw data and never computes anything. It receives
 * a numbered table of facts — every figure already calculated by the
 * deterministic engine — and must cite fact ids for each statement. The
 * response is then checked mechanically (`groundStatements`), and any
 * statement that fails is dropped before it can reach the page:
 *
 *  - it cites a fact id that does not exist;
 *  - it is labelled FACT but cites nothing;
 *  - it contains a number that does not appear among the facts;
 *  - it phrases a trading instruction ("buy…", "you should sell…").
 */

export interface Fact {
  id: string;
  label: string;
  /** What the model sees. */
  display: string;
  /** The numbers a statement may legitimately quote from this fact. */
  numbers: number[];
}

export const INSIGHT_SECTIONS = [
  'summary',
  'performance',
  'concentration',
  'transactions',
  'risk',
  'notableChanges',
  'attention',
] as const;

export type InsightSection = (typeof INSIGHT_SECTIONS)[number];

export const SECTION_LABELS: Record<InsightSection, string> = {
  summary: 'Portfolio summary',
  performance: 'Performance',
  concentration: 'Concentration',
  transactions: 'Transactions',
  risk: 'Risk',
  notableChanges: 'Notable changes',
  attention: 'Areas requiring attention',
};

const StatementSchema = z.object({
  text: z.string().trim().min(8).max(400),
  kind: z.enum(['FACT', 'INTERPRETATION']),
  evidence: z.array(z.string().trim()).max(8),
});

export type Statement = z.infer<typeof StatementSchema>;

export const InsightResponseSchema = z.object(
  Object.fromEntries(INSIGHT_SECTIONS.map((s) => [s, z.array(StatementSchema).max(6)])) as Record<
    InsightSection,
    z.ZodArray<typeof StatementSchema>
  >
);

export type InsightResponse = z.infer<typeof InsightResponseSchema>;

const statementJson = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'One neutral sentence.' },
    kind: {
      type: 'string',
      enum: ['FACT', 'INTERPRETATION'],
      description: 'FACT restates a supplied figure. INTERPRETATION explains what supplied figures suggest.',
    },
    evidence: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ids of the supplied facts this statement relies on, e.g. ["F3","F7"].',
    },
  },
  required: ['text', 'kind', 'evidence'],
};

export const INSIGHT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: Object.fromEntries(
    INSIGHT_SECTIONS.map((s) => [s, { type: 'array', maxItems: 5, items: statementJson }])
  ),
  required: [...INSIGHT_SECTIONS],
};

export const INSIGHT_SYSTEM_PROMPT = [
  'You are an analytical assistant inside BlockLens, a crypto portfolio research tool.',
  'You describe a portfolio using ONLY the numbered facts provided. All figures were calculated by BlockLens; you never calculate, estimate or convert anything.',
  '',
  'Rules:',
  '- Every statement cites the fact ids it relies on in "evidence".',
  '- Quote numbers exactly as they appear in the facts. Never compute a new number (no sums, differences, ratios or conversions).',
  '- Never mention a transaction, holding, price, return or metric that is not in the facts.',
  '- Label a statement FACT when it restates facts, INTERPRETATION when it explains what they suggest. Interpretations must be hedged ("suggests", "indicates").',
  '- Neutral, descriptive register. Never tell the reader to buy, sell, hold, rebalance or take any action. No predictions, price targets or advice.',
  '- If a fact says data is insufficient, say so rather than filling the gap.',
  '- Leave a section as an empty array when the facts say nothing about it.',
  '- "attention" lists data-quality issues and concentrations worth reviewing, phrased as observations, not instructions.',
].join('\n');

/** Imperative or advisory trading language. */
const DIRECTIVE =
  /\b(you should|you must|we recommend|i recommend|recommend(ed)? (that )?you|consider (buying|selling|reducing|increasing|adding|trimming)|(buy|sell|short|dump|ape into|accumulate)\s+(more\s+|some\s+|your\s+)?[A-Z$]{2,}\b|buy now|sell now|take profits?|exit (your|the) position|increase your (position|exposure)|reduce your (position|exposure)|rebalance (now|your)|guarantee[sd]?|will (rise|fall|increase|decrease|go up|go down))/i;

/** Numbers as written: 1,234.56 / -12.3 / 62 / 0.0004. Ignores fact ids like F12. */
const NUMBER = /(?<![A-Za-z\d.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![A-Za-z\d.])-?\d+(?:\.\d+)?/g;

export function extractNumbers(text: string): Array<{ value: number; decimals: number }> {
  return (text.match(NUMBER) ?? []).map((raw) => {
    const clean = raw.replace(/,/g, '');
    const decimals = clean.includes('.') ? clean.split('.')[1].length : 0;
    return { value: Number(clean), decimals };
  });
}

/**
 * A quoted number is grounded when some fact value, rounded to the same
 * number of decimals as written, equals it — so "62%" is grounded by a
 * fact of 62.04, but "63%" is not. Signs may be dropped in prose
 * ("fell 12%" for -12), so magnitudes are compared.
 */
function isGrounded(n: { value: number; decimals: number }, allowed: number[]): boolean {
  const factor = 10 ** n.decimals;
  const target = Math.abs(n.value);
  return allowed.some((v) => {
    const candidates = [v, Math.abs(v), v / 1e3, v / 1e6, v / 1e9, v / 1e12];
    return candidates.some((c) => Math.abs(Math.round(Math.abs(c) * factor) / factor - target) < 1e-9);
  });
}

export interface GroundingResult {
  sections: Record<InsightSection, Statement[]>;
  rejected: Array<{ section: InsightSection; text: string; reason: string }>;
}

export function groundStatements(response: InsightResponse, facts: Fact[]): GroundingResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const allNumbers = facts.flatMap((f) => f.numbers);
  const sections = {} as Record<InsightSection, Statement[]>;
  const rejected: GroundingResult['rejected'] = [];

  for (const section of INSIGHT_SECTIONS) {
    sections[section] = [];
    for (const s of response[section] ?? []) {
      const unknown = s.evidence.filter((id) => !byId.has(id));
      let reason: string | null = null;

      if (unknown.length) reason = `cites unknown fact ${unknown.join(', ')}`;
      else if (s.kind === 'FACT' && s.evidence.length === 0) reason = 'FACT without evidence';
      else if (DIRECTIVE.test(s.text)) reason = 'trading directive or prediction';
      else {
        const ungrounded = extractNumbers(s.text).filter((n) => !isGrounded(n, allNumbers));
        if (ungrounded.length) reason = `number not in facts: ${ungrounded.map((n) => n.value).join(', ')}`;
      }

      if (reason) rejected.push({ section, text: s.text, reason });
      else sections[section].push(s);
    }
  }

  return { sections, rejected };
}

/** Builds a fact whose quotable numbers are its raw values plus everything in its label and display text. */
export function fact(id: string, label: string, display: string, raw: Array<number | null | undefined> = []): Fact {
  const numbers = [
    ...raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)),
    ...extractNumbers(`${label} ${display}`).map((n) => n.value),
  ];
  return { id, label, display, numbers };
}

/**
 * Token symbols come from token contracts, which anyone can deploy —
 * airdropped spam routinely names itself "Visit site.com to claim". A
 * symbol is reduced to a plain ticker before it reaches the model, so a
 * contract cannot put a URL or an instruction into the prompt.
 */
export function safeSymbol(symbol: string): string {
  // Alphanumerics only: without dots or slashes a domain cannot survive.
  const clean = symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return clean || 'UNNAMED';
}

export function renderFacts(facts: Fact[]): string {
  return facts.map((f) => `${f.id} | ${f.label}: ${f.display}`).join('\n');
}
