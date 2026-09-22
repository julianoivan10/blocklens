import 'server-only';

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { getGeminiClient } from '@/services/ai';
import { GENERATION, geminiModel } from '@/services/ai/config';
import { AI_DISCLAIMER } from '@/services/ai/disclaimer';
import {
  INSIGHT_JSON_SCHEMA,
  INSIGHT_SYSTEM_PROMPT,
  InsightResponseSchema,
  fact,
  groundStatements,
  renderFacts,
  safeSymbol,
  type Fact,
  type InsightSection,
  type Statement,
} from '@/lib/ai/insights';
import { CHAINS } from '@/lib/portfolio/chains';
import type { PeriodId } from '@/lib/portfolio/benchmark';
import { getPerformance, getPortfolioOverview } from './service';
import { getWatchlist } from '@/server/data/watchlist';

/**
 * Portfolio insights.
 *
 * Every number the model sees was computed by the engine. The facts are
 * hashed; the same facts reuse the stored insight, so a page view never
 * triggers a model call and an unchanged portfolio costs nothing.
 */

export const INSIGHT_KIND = 'portfolio:v1';
const MIN_INTERVAL_MS = 2 * 60_000;
const DAILY_LIMIT = 30;

export interface StoredInsight {
  sections: Record<InsightSection, Statement[]>;
  facts: Fact[];
  rejectedCount: number;
  model: string;
  generatedAt: string;
  periodLabel: string;
  disclaimer: string;
}

const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function buildFacts(userId: string, periodId: PeriodId): Promise<{ facts: Fact[]; periodLabel: string }> {
  const [overview, perf, watchlist, recentTx, recentAlerts] = await Promise.all([
    getPortfolioOverview(userId),
    getPerformance(userId, periodId),
    getWatchlist(userId).catch(() => null),
    prisma.transaction.findMany({
      // Priced legs only: unpriced movements are almost always airdropped
      // spam, whose self-chosen names do not belong in a prompt.
      where: { userId, type: { not: 'FEE' }, usdValue: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 8,
      include: { wallet: { select: { label: true } } },
    }),
    prisma.alertEvent.findMany({ where: { userId }, orderBy: { triggeredAt: 'desc' }, take: 5 }),
  ]);

  const facts: Fact[] = [];
  let n = 0;
  const add = (label: string, display: string, raw: Array<number | null | undefined> = []) =>
    facts.push(fact(`F${++n}`, label, display, raw));

  const t = overview.totals;
  add('Total portfolio value (priced holdings)', money(t.totalValue), [t.totalValue]);
  add('Invested capital (cost basis of current holdings)', money(t.investedCapital), [t.investedCapital]);
  add('Realized PnL', money(t.realizedPnl), [t.realizedPnl]);
  add('Unrealized PnL', money(t.unrealizedPnl), [t.unrealizedPnl]);
  add('Total PnL', money(t.totalPnl), [t.totalPnl]);
  add('Total PnL %', t.pnlPct !== null ? pct(t.pnlPct) : 'not available — no known acquisition cost', [t.pnlPct]);
  add('Network fees paid (at cost)', money(t.feesCost), [t.feesCost]);
  add('Open positions', String(t.positionsCount), [t.positionsCount]);
  if (t.unknownCostValue > 0) {
    add('Value of holdings with unknown cost basis (excluded from PnL)', money(t.unknownCostValue), [t.unknownCostValue]);
  }
  if (t.unpricedPositions) add('Positions without a current price', String(t.unpricedPositions), [t.unpricedPositions]);
  add('Transactions needing review', String(overview.reviewCount), [overview.reviewCount]);

  for (const p of overview.positions.filter((p) => p.quantity > 0 && p.marketValue !== null).slice(0, 10)) {
    const parts = [
      `quantity ${p.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })}`,
      p.marketValue !== null ? `value ${money(p.marketValue)}` : 'no current price',
      p.allocationPct !== null ? `allocation ${pct(p.allocationPct)}` : null,
      p.averageCost !== null ? `average cost ${money(p.averageCost)}` : 'average cost unknown',
      p.unrealizedPnl !== null ? `unrealized PnL ${money(p.unrealizedPnl)}` : null,
      p.pnlPct !== null ? `PnL ${pct(p.pnlPct)}` : null,
      p.flags.length ? `data flags: ${p.flags.join(', ').toLowerCase().replace(/_/g, ' ')}` : null,
    ].filter(Boolean);
    add(`Position ${safeSymbol(p.symbol)}`, parts.join('; '), [p.quantity, p.marketValue, p.allocationPct, p.averageCost, p.unrealizedPnl, p.pnlPct]);
  }

  for (const c of overview.allocationByChain) {
    add(`Allocation on ${c.chain === 'OFF_CHAIN' ? 'manual / off-chain' : CHAINS[c.chain].label}`, pct(c.pct), [c.pct, c.marketValue]);
  }

  const period = perf.period;
  const windowText = perf.points.length
    ? `${period.label} (${date(perf.points[0].day)} to ${date(perf.points[perf.points.length - 1].day)})`
    : `${period.label} — no valued history`;
  add('Analysis period', windowText);

  for (const c of perf.comparisons) {
    if (!c.benchmark.available) {
      add(`Benchmark ${c.benchmark.label}`, `unavailable: ${c.note}`);
      continue;
    }
    add(
      `Return vs ${c.benchmark.label} (${c.benchmark.source})`,
      c.portfolioReturnPct !== null && c.benchmarkReturnPct !== null
        ? `portfolio ${pct(c.portfolioReturnPct)}, benchmark ${pct(c.benchmarkReturnPct)}, relative ${c.relativePct! >= 0 ? '+' : ''}${c.relativePct!.toFixed(2)} percentage points${c.note ? ` (${c.note})` : ''}`
        : `insufficient data${c.note ? ` — ${c.note}` : ''}`,
      [c.portfolioReturnPct, c.benchmarkReturnPct, c.relativePct]
    );
  }

  for (const m of perf.risk) {
    add(
      `${m.label} (${m.period})`,
      m.result.status === 'ok'
        ? m.result.unit === 'pct'
          ? pct(m.result.value)
          : m.result.value.toFixed(2)
        : m.result.reason,
      m.result.status === 'ok' ? [m.result.value] : []
    );
  }
  if (perf.currentDrawdownPct !== null) {
    add('Current drawdown from peak (time-weighted)', pct(perf.currentDrawdownPct), [perf.currentDrawdownPct]);
  }

  for (const r of overview.reconciliation.slice(0, 5)) {
    add(
      `Reconciliation gap ${safeSymbol(r.symbol)} in ${r.walletLabel}`,
      `imported history implies ${r.ledgerQuantity.toFixed(6)}, chain reports ${r.chainQuantity.toFixed(6)}`,
      [r.ledgerQuantity, r.chainQuantity]
    );
  }

  for (const tx of recentTx) {
    add(
      `Recent transaction ${date(tx.timestamp.getTime())}`,
      `${tx.type.replace('_', ' ').toLowerCase()}${tx.isInternal ? ' (between own wallets)' : ''} ${tx.amount.toNumber().toLocaleString('en-US', { maximumFractionDigits: 6 })} ${safeSymbol(tx.symbol)}${tx.usdValue ? ` worth ${money(tx.usdValue.toNumber())}` : ', value unknown'}${tx.wallet ? ` in ${tx.wallet.label}` : ' (manual)'}${tx.needsReview ? '; flagged for review' : ''}`,
      [tx.amount.toNumber(), tx.usdValue?.toNumber()]
    );
  }

  if (watchlist?.items.length) {
    add(
      'Watchlist',
      watchlist.items
        .slice(0, 8)
        .map((i) => `${i.symbol}${i.priceChangePercentage24h !== undefined ? ` ${i.priceChangePercentage24h >= 0 ? '+' : ''}${i.priceChangePercentage24h.toFixed(2)}% 24h` : ''}`)
        .join(', '),
      watchlist.items.map((i) => i.priceChangePercentage24h)
    );
  }

  for (const e of recentAlerts) {
    add(`Alert fired ${date(e.triggeredAt.getTime())}`, `${e.title}. ${e.detail}`, [e.observed?.toNumber()]);
  }

  return { facts, periodLabel: period.label };
}

function hashFacts(facts: Fact[]): string {
  return createHash('sha256').update(renderFacts(facts)).digest('hex');
}

export async function getLatestInsight(userId: string): Promise<StoredInsight | null> {
  const row = await prisma.aiInsight.findFirst({
    where: { userId, kind: INSIGHT_KIND },
    orderBy: { createdAt: 'desc' },
  });
  return row ? (row.output as unknown as StoredInsight) : null;
}

export type InsightOutcome =
  | { status: 'ok'; insight: StoredInsight; cached: boolean }
  | { status: 'unconfigured' | 'rate_limited' | 'empty' | 'failed'; message: string };

export async function generateInsight(userId: string, periodId: PeriodId): Promise<InsightOutcome> {
  const client = getGeminiClient();
  if (!client) return { status: 'unconfigured', message: 'AI insights are not configured on this deployment.' };

  const { facts, periodLabel } = await buildFacts(userId, periodId);
  const overview = await getPortfolioOverview(userId);
  if (overview.legCount === 0) {
    return { status: 'empty', message: 'Add a wallet or a transaction first — there is nothing to analyse yet.' };
  }

  const inputHash = hashFacts(facts);
  const existing = await prisma.aiInsight.findFirst({
    where: { userId, kind: INSIGHT_KIND, inputHash, model: geminiModel() },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return { status: 'ok', insight: existing.output as unknown as StoredInsight, cached: true };

  const [latest, today] = await Promise.all([
    prisma.aiInsight.findFirst({ where: { userId, kind: INSIGHT_KIND }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.aiInsight.count({ where: { userId, kind: INSIGHT_KIND, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
  ]);
  if (latest && Date.now() - latest.createdAt.getTime() < MIN_INTERVAL_MS) {
    return { status: 'rate_limited', message: 'Insights were generated moments ago. Try again in a couple of minutes.' };
  }
  if (today >= DAILY_LIMIT) {
    return { status: 'rate_limited', message: 'The daily limit for insights has been reached.' };
  }

  try {
    const { data, model } = await client.generateStructured({
      system: INSIGHT_SYSTEM_PROMPT,
      prompt: `FACTS (the only information you may use):\n${renderFacts(facts)}\n\nWrite the portfolio insight sections.`,
      jsonSchema: INSIGHT_JSON_SCHEMA,
      validator: InsightResponseSchema,
      config: GENERATION.portfolio,
    });

    const grounded = groundStatements(data, facts);
    if (grounded.rejected.length) {
      console.warn(
        `[ai:insights] dropped ${grounded.rejected.length} ungrounded statement(s): ${grounded.rejected
          .map((r) => `${r.reason} — "${r.text.slice(0, 120)}"`)
          .join(' | ')}`
      );
    }

    const insight: StoredInsight = {
      sections: grounded.sections,
      facts,
      rejectedCount: grounded.rejected.length,
      model,
      generatedAt: new Date().toISOString(),
      periodLabel,
      disclaimer: AI_DISCLAIMER,
    };

    await prisma.aiInsight.create({
      data: { userId, kind: INSIGHT_KIND, model, inputHash, output: insight as unknown as Prisma.InputJsonValue },
    });
    // Keep the table bounded: the latest twenty per user are plenty.
    const stale = await prisma.aiInsight.findMany({
      where: { userId, kind: INSIGHT_KIND },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      select: { id: true },
    });
    if (stale.length) await prisma.aiInsight.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });

    return { status: 'ok', insight, cached: false };
  } catch (error) {
    console.error(`[ai:insights] generation failed: ${(error as Error).message}`);
    return { status: 'failed', message: 'The AI provider did not return a usable answer. Your figures above are unaffected.' };
  }
}
