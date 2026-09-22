'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ALERT_TYPES, type AlertType } from '@/lib/alerts/evaluate';
import { formatTimeAgo } from '@/lib/format';
import type { ApiResponse } from '@/types';

export interface AlertRow {
  id: string;
  type: AlertType;
  symbol: string | null;
  walletId: string | null;
  threshold: number | null;
  cooldownMinutes: number;
  enabled: boolean;
  notifyEmail: boolean;
  lastTriggeredAt: string | null;
  lastEvaluatedAt: string | null;
}

const selectClass =
  'border-b border-line-strong bg-transparent py-2 text-[0.875rem] text-ink focus:border-signal focus:outline-none';

function describe(a: AlertRow, wallets: Map<string, string>): string {
  const spec = ALERT_TYPES[a.type];
  const unit = spec.thresholdUnit;
  const t = a.threshold !== null ? (unit === 'USD' ? `$${a.threshold.toLocaleString('en-US')}` : `${a.threshold}%`) : '';
  const scope = a.walletId ? ` · ${wallets.get(a.walletId) ?? 'removed wallet'}` : '';
  return [spec.label, a.symbol, t].filter(Boolean).join(' ') + scope;
}

export function AlertManager({
  alerts,
  wallets,
  emailVerified,
}: {
  alerts: AlertRow[];
  wallets: Array<{ id: string; label: string }>;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [type, setType] = useState<AlertType>('PRICE_ABOVE');
  const [symbol, setSymbol] = useState('');
  const [threshold, setThreshold] = useState('');
  const [walletId, setWalletId] = useState('');
  const [cooldown, setCooldown] = useState('360');
  const [email, setEmail] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const spec = ALERT_TYPES[type];
  const walletNames = new Map(wallets.map((w) => [w.id, w.label]));

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          ...(spec.needsSymbol ? { symbol } : {}),
          ...(spec.needsThreshold ? { threshold } : {}),
          ...(['LARGE_TRANSACTION', 'WALLET_ACTIVITY'].includes(type) && walletId ? { walletId } : {}),
          cooldownMinutes: cooldown,
          notifyEmail: email,
        }),
      });
      const data: ApiResponse = await res.json();
      if (!data.success) return setError(data.error ?? 'Could not create the alert');
      setSymbol('');
      setThreshold('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data: ApiResponse = await res.json();
    if (!data.success) addToast({ type: 'error', title: 'Not saved', description: data.error });
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    const data: ApiResponse = await res.json();
    if (!data.success) addToast({ type: 'error', title: 'Not deleted', description: data.error });
    router.refresh();
  }

  async function checkNow() {
    setChecking(true);
    try {
      const res = await fetch('/api/alerts/evaluate', { method: 'POST' });
      const data: ApiResponse = await res.json();
      addToast(data.success ? { type: 'success', title: data.message ?? 'Checked' } : { type: 'error', title: 'Not checked', description: data.error });
      router.refresh();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-x-16 gap-y-14 lg:grid-cols-12">
      <section className="lg:col-span-5">
        <h2 className="t-micro border-b border-line pb-3">New alert</h2>
        <form onSubmit={create} className="mt-6 flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="alert-type" className="t-micro">Condition</label>
            <select id="alert-type" value={type} onChange={(e) => setType(e.target.value as AlertType)} className={selectClass}>
              {(Object.keys(ALERT_TYPES) as AlertType[]).map((t) => (
                <option key={t} value={t} className="bg-panel">{ALERT_TYPES[t].label}</option>
              ))}
            </select>
            <span className="text-[0.75rem] text-ink-ghost">{spec.describe}</span>
          </div>
          {spec.needsSymbol && <Input label="Asset ticker" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" maxLength={16} />}
          {spec.needsThreshold && (
            <Input label={`Threshold (${spec.thresholdUnit})`} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          )}
          {['LARGE_TRANSACTION', 'WALLET_ACTIVITY'].includes(type) && (
            <div className="flex flex-col gap-2">
              <label htmlFor="alert-wallet" className="t-micro">Wallet</label>
              <select id="alert-wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)} className={selectClass}>
                <option value="" className="bg-panel">All wallets</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id} className="bg-panel">{w.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="alert-cooldown" className="t-micro">Minimum gap between alerts</label>
            <select id="alert-cooldown" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className={selectClass}>
              {[
                ['60', '1 hour'],
                ['360', '6 hours'],
                ['1440', '1 day'],
                ['10080', '1 week'],
              ].map(([v, l]) => (
                <option key={v} value={v} className="bg-panel">{l}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink-dim">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} disabled={!emailVerified} />
            Also email me{!emailVerified && ' (verify your email in Settings first)'}
          </label>
          {error && <p role="alert" className="text-[0.8125rem] text-down">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="self-start">Create alert</Button>
        </form>
      </section>

      <section className="lg:col-span-7">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="t-micro">Your alerts</h2>
          <Button variant="quiet" size="sm" loading={checking} onClick={() => void checkNow()} disabled={alerts.length === 0}>
            Check now
          </Button>
        </div>
        {alerts.length === 0 ? (
          <p className="t-body-sm mt-6 text-ink-faint">No alerts yet.</p>
        ) : (
          <ul data-testid="alert-list">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-faint py-3.5">
                <div className="flex flex-col gap-1">
                  <span className={a.enabled ? 'text-ink' : 'text-ink-ghost'}>{describe(a, walletNames)}</span>
                  <span className="text-[0.6875rem] text-ink-ghost">
                    At most once per {a.cooldownMinutes >= 1440 ? `${a.cooldownMinutes / 1440} day(s)` : `${a.cooldownMinutes / 60} hour(s)`}
                    {a.notifyEmail ? ' · email' : ''}
                    {a.lastTriggeredAt ? ` · last fired ${formatTimeAgo(a.lastTriggeredAt)}` : ' · not fired yet'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!a.enabled && <Badge tone="neutral">Paused</Badge>}
                  <Button variant="quiet" size="sm" onClick={() => void patch(a.id, { enabled: !a.enabled })}>
                    {a.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => void remove(a.id)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
