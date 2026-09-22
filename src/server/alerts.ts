import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { evaluateAlert, type AlertConfig, type AlertContext } from '@/lib/alerts/evaluate';
import { getCurrentPrices } from '@/services/pricing';
import { deliver } from '@/services/email';
import { alertEmail } from '@/services/email/templates';
import { siteConfig } from '@/config/site';
import { getPerformance, getPortfolioOverview } from '@/server/portfolio/service';
import { isUniqueViolation } from '@/server/api';
import { logServerError } from '@/server/log';

/**
 * Runs a user's enabled alerts once. The firing rules (edge trigger,
 * cooldown, dedupe) live in the pure evaluator; this module gathers the
 * readings and persists the outcome. Only the data an alert type needs is
 * fetched — a user with nothing but price alerts never has their
 * portfolio recomputed here.
 */
export async function evaluateAlertsForUser(userId: string): Promise<{ evaluated: number; fired: number }> {
  const alerts = await prisma.alert.findMany({ where: { userId, enabled: true } });
  if (alerts.length === 0) return { evaluated: 0, fired: 0 };

  const needsPrices = alerts.some((a) => ['PRICE_ABOVE', 'PRICE_BELOW', 'PERCENT_MOVE'].includes(a.type));
  const needsPortfolio = alerts.some((a) => ['ALLOCATION_ABOVE', 'PORTFOLIO_DRAWDOWN'].includes(a.type));
  const needsTx = alerts.some((a) => ['LARGE_TRANSACTION', 'WALLET_ACTIVITY'].includes(a.type));

  const symbols = [...new Set(alerts.filter((a) => a.symbol).map((a) => `sym:${a.symbol}`))];
  const earliestSeen = alerts
    .filter((a) => ['LARGE_TRANSACTION', 'WALLET_ACTIVITY'].includes(a.type))
    .reduce<Date>((min, a) => (a.lastSeenAt && a.lastSeenAt < min ? a.lastSeenAt : min), new Date());

  const [quotes, overview, performance, newTx] = await Promise.all([
    needsPrices ? getCurrentPrices(symbols) : null,
    needsPortfolio ? getPortfolioOverview(userId) : null,
    alerts.some((a) => a.type === 'PORTFOLIO_DRAWDOWN') ? getPerformance(userId, '365d') : null,
    needsTx
      ? prisma.transaction.findMany({
          where: { userId, createdAt: { gt: earliestSeen }, type: { not: 'FEE' } },
          orderBy: { createdAt: 'asc' },
          take: 500,
          include: { wallet: { select: { label: true } } },
        })
      : [],
  ]);

  const allocation = new Map<string, number>();
  for (const p of overview?.positions ?? []) {
    if (p.allocationPct !== null) allocation.set(p.symbol.toUpperCase(), (allocation.get(p.symbol.toUpperCase()) ?? 0) + p.allocationPct);
  }

  const ctx: AlertContext = {
    now: new Date(),
    prices: new Map(
      [...(quotes ?? new Map()).entries()].map(([k, q]) => [k.slice(4), { price: q.price, change24hPct: q.change24hPct }])
    ),
    allocationBySymbol: allocation,
    currentDrawdownPct: performance?.currentDrawdownPct ?? null,
    newTransactions: newTx.map((t) => ({
      id: t.id,
      walletId: t.walletId,
      timestamp: t.timestamp,
      createdAt: t.createdAt,
      symbol: t.symbol,
      amount: t.amount.toNumber(),
      usdValue: t.usdValue?.toNumber() ?? null,
      type: t.type,
      walletLabel: t.wallet?.label ?? null,
    })),
  };

  const toEmail: Array<{ title: string; detail: string; eventId: string }> = [];
  let fired = 0;

  for (const alert of alerts) {
    const config: AlertConfig = {
      id: alert.id,
      type: alert.type,
      symbol: alert.symbol,
      walletId: alert.walletId,
      threshold: alert.threshold?.toNumber() ?? null,
      cooldownMinutes: alert.cooldownMinutes,
      lastState: alert.lastState,
      lastTriggeredAt: alert.lastTriggeredAt,
      lastSeenAt: alert.lastSeenAt,
    };
    const result = evaluateAlert(config, ctx);

    let created = 0;
    for (const e of result.events) {
      try {
        const event = await prisma.alertEvent.create({
          data: {
            alertId: alert.id,
            userId,
            title: e.title,
            detail: e.detail,
            observed: e.observed !== null ? new Prisma.Decimal(e.observed.toFixed(8)) : null,
            dedupeKey: e.dedupeKey,
          },
        });
        created++;
        if (alert.notifyEmail) toEmail.push({ title: e.title, detail: e.detail, eventId: event.id });
      } catch (error) {
        // Already recorded by an earlier or concurrent run — that is the point.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    fired += created;

    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        lastState: result.state,
        lastSeenAt: result.lastSeenAt,
        lastEvaluatedAt: ctx.now,
        ...(created ? { lastTriggeredAt: ctx.now } : {}),
      },
    });
  }

  if (toEmail.length) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) {
      const result = await deliver('alerts', alertEmail(user.email, toEmail, `${siteConfig.url}/alerts`));
      if (result.success) {
        await prisma.alertEvent.updateMany({ where: { id: { in: toEmail.map((e) => e.eventId) } }, data: { emailed: true } });
      }
    }
  }

  return { evaluated: alerts.length, fired };
}

/** Cron entry point: every user with at least one enabled alert. */
export async function evaluateAllAlerts(deadline: number): Promise<{ users: number; fired: number; incomplete: boolean }> {
  const users = await prisma.alert.findMany({ where: { enabled: true }, distinct: ['userId'], select: { userId: true } });
  let fired = 0;
  let done = 0;
  for (const { userId } of users) {
    if (Date.now() > deadline) break;
    try {
      fired += (await evaluateAlertsForUser(userId)).fired;
    } catch (error) {
      logServerError('alerts:evaluate', error);
    }
    done++;
  }
  return { users: done, fired, incomplete: done < users.length };
}
