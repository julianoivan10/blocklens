/**
 * Alert evaluation — pure, so the anti-spam rules can be tested exactly.
 *
 * Three rules keep an alert from repeating itself:
 *
 *  1. Edge-triggered. Level conditions (price above, drawdown beyond…)
 *     fire on the transition from not-met to met. While the condition
 *     keeps holding, nothing further fires; it re-arms once it clears.
 *  2. Cooldown. Even a condition that flaps back and forth cannot fire
 *     again until `cooldownMinutes` have passed since the last event.
 *  3. Dedupe key. Every event carries a key unique to the real-world
 *     occurrence (the alert plus a time bucket, or the transaction id),
 *     stored under a unique index — so a retried or concurrent
 *     evaluation cannot record the same event twice.
 */

export type AlertType =
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'PERCENT_MOVE'
  | 'PORTFOLIO_DRAWDOWN'
  | 'ALLOCATION_ABOVE'
  | 'LARGE_TRANSACTION'
  | 'WALLET_ACTIVITY';

export const ALERT_TYPES: Record<
  AlertType,
  { label: string; needsSymbol: boolean; needsThreshold: boolean; thresholdUnit: string | null; describe: string }
> = {
  PRICE_ABOVE: { label: 'Price above', needsSymbol: true, needsThreshold: true, thresholdUnit: 'USD', describe: 'Fires when the price rises to or above the level.' },
  PRICE_BELOW: { label: 'Price below', needsSymbol: true, needsThreshold: true, thresholdUnit: 'USD', describe: 'Fires when the price falls to or below the level.' },
  PERCENT_MOVE: { label: '24h move', needsSymbol: true, needsThreshold: true, thresholdUnit: '%', describe: 'Fires when the absolute 24-hour change reaches the percentage.' },
  PORTFOLIO_DRAWDOWN: { label: 'Portfolio drawdown', needsSymbol: false, needsThreshold: true, thresholdUnit: '%', describe: 'Fires when the portfolio falls this far below its running peak (time-weighted).' },
  ALLOCATION_ABOVE: { label: 'Allocation above', needsSymbol: true, needsThreshold: true, thresholdUnit: '%', describe: 'Fires when one asset grows to this share of the portfolio.' },
  LARGE_TRANSACTION: { label: 'Large transaction', needsSymbol: false, needsThreshold: true, thresholdUnit: 'USD', describe: 'Fires for each synced transaction at or above this USD value.' },
  WALLET_ACTIVITY: { label: 'Wallet activity', needsSymbol: false, needsThreshold: false, thresholdUnit: null, describe: 'Fires when new transactions are synced for the wallet.' },
};

export interface AlertConfig {
  id: string;
  type: AlertType;
  symbol: string | null;
  walletId: string | null;
  threshold: number | null;
  cooldownMinutes: number;
  lastState: boolean;
  lastTriggeredAt: Date | null;
  lastSeenAt: Date | null;
}

export interface AlertContext {
  now: Date;
  /** Current market readings by upper-case symbol. */
  prices: ReadonlyMap<string, { price: number; change24hPct: number | null }>;
  allocationBySymbol: ReadonlyMap<string, number>;
  /** Current drawdown of the portfolio's time-weighted index, percent ≤ 0. */
  currentDrawdownPct: number | null;
  /** Transactions synced since the alert's high-water mark. */
  newTransactions: ReadonlyArray<{
    id: string;
    walletId: string | null;
    timestamp: Date;
    createdAt: Date;
    symbol: string;
    amount: number;
    usdValue: number | null;
    type: string;
    walletLabel: string | null;
  }>;
}

export interface AlertEventDraft {
  dedupeKey: string;
  title: string;
  detail: string;
  observed: number | null;
}

export interface AlertEvaluation {
  /** Whether the level condition holds now (always false for event alerts). */
  state: boolean;
  events: AlertEventDraft[];
  /** New high-water mark for transaction alerts. */
  lastSeenAt: Date | null;
  /** Why nothing fired, for the UI and tests. */
  skipped?: 'NO_DATA' | 'COOLDOWN' | 'ALREADY_ACTIVE' | 'NOT_MET';
}

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 6 })}`;

function inCooldown(alert: AlertConfig, now: Date): boolean {
  if (!alert.lastTriggeredAt) return false;
  return now.getTime() - alert.lastTriggeredAt.getTime() < alert.cooldownMinutes * 60_000;
}

/** Time bucket of the cooldown window, so one window yields at most one key. */
function bucket(alert: AlertConfig, now: Date): number {
  const window = Math.max(1, alert.cooldownMinutes) * 60_000;
  return Math.floor(now.getTime() / window);
}

function levelAlert(
  alert: AlertConfig,
  now: Date,
  reading: { met: boolean; observed: number } | null,
  describe: (observed: number) => { title: string; detail: string }
): AlertEvaluation {
  if (!reading) return { state: alert.lastState, events: [], lastSeenAt: alert.lastSeenAt, skipped: 'NO_DATA' };
  if (!reading.met) return { state: false, events: [], lastSeenAt: alert.lastSeenAt, skipped: 'NOT_MET' };
  if (alert.lastState) return { state: true, events: [], lastSeenAt: alert.lastSeenAt, skipped: 'ALREADY_ACTIVE' };
  // Stay un-armed during a cooldown, so a condition that still holds when
  // the cooldown ends fires then rather than being silently absorbed.
  if (inCooldown(alert, now)) return { state: false, events: [], lastSeenAt: alert.lastSeenAt, skipped: 'COOLDOWN' };

  const text = describe(reading.observed);
  return {
    state: true,
    lastSeenAt: alert.lastSeenAt,
    events: [
      {
        dedupeKey: `${alert.id}:${bucket(alert, now)}`,
        title: text.title,
        detail: text.detail,
        observed: reading.observed,
      },
    ],
  };
}

export function evaluateAlert(alert: AlertConfig, ctx: AlertContext): AlertEvaluation {
  const { now } = ctx;
  const threshold = alert.threshold ?? 0;
  const sym = alert.symbol?.toUpperCase() ?? '';

  switch (alert.type) {
    case 'PRICE_ABOVE':
    case 'PRICE_BELOW': {
      const quote = ctx.prices.get(sym);
      const above = alert.type === 'PRICE_ABOVE';
      return levelAlert(
        alert,
        now,
        quote ? { met: above ? quote.price >= threshold : quote.price <= threshold, observed: quote.price } : null,
        (p) => ({
          title: `${sym} ${above ? 'above' : 'below'} ${usd(threshold)}`,
          detail: `${sym} is at ${usd(p)} (CoinGecko).`,
        })
      );
    }
    case 'PERCENT_MOVE': {
      const quote = ctx.prices.get(sym);
      const change = quote?.change24hPct ?? null;
      return levelAlert(
        alert,
        now,
        change !== null ? { met: Math.abs(change) >= threshold, observed: change } : null,
        (c) => ({
          title: `${sym} moved ${c > 0 ? '+' : ''}${c.toFixed(2)}% in 24h`,
          detail: `The 24-hour change reached your ${threshold}% threshold.`,
        })
      );
    }
    case 'PORTFOLIO_DRAWDOWN': {
      const dd = ctx.currentDrawdownPct;
      return levelAlert(
        alert,
        now,
        dd !== null ? { met: dd <= -Math.abs(threshold), observed: dd } : null,
        (d) => ({
          title: `Portfolio ${d.toFixed(2)}% below its peak`,
          detail: `The time-weighted drawdown passed your ${Math.abs(threshold)}% threshold.`,
        })
      );
    }
    case 'ALLOCATION_ABOVE': {
      const pct = ctx.allocationBySymbol.get(sym);
      return levelAlert(
        alert,
        now,
        pct !== undefined ? { met: pct >= threshold, observed: pct } : null,
        (p) => ({
          title: `${sym} is ${p.toFixed(1)}% of the portfolio`,
          detail: `Its allocation reached your ${threshold}% threshold.`,
        })
      );
    }
    case 'LARGE_TRANSACTION':
    case 'WALLET_ACTIVITY': {
      const since = alert.lastSeenAt?.getTime() ?? -Infinity;
      const scoped = ctx.newTransactions.filter(
        (t) => t.createdAt.getTime() > since && (!alert.walletId || t.walletId === alert.walletId)
      );
      const highWater = scoped.reduce<Date | null>(
        (max, t) => (!max || t.createdAt > max ? t.createdAt : max),
        alert.lastSeenAt
      );

      // First evaluation only establishes the high-water mark: importing a
      // wallet's history must not fire an alert for every old transaction.
      if (!alert.lastSeenAt) return { state: false, events: [], lastSeenAt: highWater ?? now, skipped: 'NO_DATA' };

      if (alert.type === 'LARGE_TRANSACTION') {
        const large = scoped.filter((t) => t.usdValue !== null && t.usdValue >= threshold);
        return {
          state: false,
          lastSeenAt: highWater,
          events: large.map((t) => ({
            dedupeKey: `${alert.id}:tx:${t.id}`,
            title: `${t.type.replace('_', ' ').toLowerCase()} of ${usd(t.usdValue as number)} ${t.symbol}`,
            detail: `${t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${t.symbol}${t.walletLabel ? ` in ${t.walletLabel}` : ''} on ${t.timestamp.toISOString().slice(0, 10)}.`,
            observed: t.usdValue,
          })),
          skipped: large.length ? undefined : 'NOT_MET',
        };
      }

      if (scoped.length === 0) return { state: false, events: [], lastSeenAt: highWater, skipped: 'NOT_MET' };
      if (inCooldown(alert, now)) return { state: false, events: [], lastSeenAt: highWater, skipped: 'COOLDOWN' };
      const groups = new Set(scoped.map((t) => t.id));
      return {
        state: false,
        lastSeenAt: highWater,
        events: [
          {
            dedupeKey: `${alert.id}:activity:${highWater?.getTime()}`,
            title: `${groups.size} new wallet ${groups.size === 1 ? 'movement' : 'movements'}`,
            detail: `New activity was synced${scoped[0].walletLabel ? ` for ${scoped[0].walletLabel}` : ''}.`,
            observed: groups.size,
          },
        ],
      };
    }
  }
}
