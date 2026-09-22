'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { ApiResponse } from '@/types';

const TYPE_LABEL: Record<string, string> = {
  BUY: 'Buy (acquired for money)',
  SELL: 'Sell (disposed for money)',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  SWAP: 'Swap',
  FEE: 'Fee',
  STAKE: 'Stake',
  UNSTAKE: 'Unstake',
  UNKNOWN: 'Unknown',
};

const BY_DIRECTION: Record<string, string[]> = {
  '1': ['BUY', 'TRANSFER_IN', 'SWAP', 'UNSTAKE', 'UNKNOWN'],
  '-1': ['SELL', 'TRANSFER_OUT', 'SWAP', 'FEE', 'STAKE', 'UNKNOWN'],
};

const selectClass =
  'border-b border-line-strong bg-transparent py-1.5 text-[0.8125rem] text-ink focus:border-signal focus:outline-none';

export function ManualEntryForm() {
  const router = useRouter();
  const { addToast } = useToast();
  const [form, setForm] = useState({ type: 'BUY', symbol: '', quantity: '', priceUsd: '', feeUsd: '', date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          symbol: form.symbol,
          quantity: form.quantity,
          priceUsd: form.priceUsd || undefined,
          feeUsd: form.feeUsd || undefined,
          date: `${form.date}T12:00:00Z`,
        }),
      });
      const data: ApiResponse = await res.json();
      if (!data.success) return setError(data.error ?? 'Could not record the transaction');
      addToast({ type: 'success', title: data.message ?? 'Recorded' });
      setForm({ ...form, symbol: '', quantity: '', priceUsd: '', feeUsd: '' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate data-testid="manual-form">
      <div className="flex flex-col gap-2">
        <label htmlFor="mt-type" className="t-micro">Type</label>
        <select id="mt-type" value={form.type} onChange={set('type')} className={selectClass}>
          <option value="BUY" className="bg-panel">Buy</option>
          <option value="SELL" className="bg-panel">Sell</option>
        </select>
      </div>
      <Input label="Asset ticker" value={form.symbol} onChange={set('symbol')} placeholder="BTC" maxLength={16} />
      <Input label="Quantity" inputMode="decimal" value={form.quantity} onChange={set('quantity')} placeholder="0.5" />
      <Input label="Price per unit (USD)" inputMode="decimal" value={form.priceUsd} onChange={set('priceUsd')} hint="Leave blank to use that day's close" />
      <Input label="Fee (USD)" inputMode="decimal" value={form.feeUsd} onChange={set('feeUsd')} placeholder="0" />
      <Input label="Date" type="date" value={form.date} onChange={set('date')} max={new Date().toISOString().slice(0, 10)} />
      {error && <p role="alert" className="text-[0.8125rem] text-down">{error}</p>}
      <Button type="submit" variant="primary" loading={busy} className="self-start">Record</Button>
    </form>
  );
}

export function ReclassifyControl({
  id,
  type,
  direction,
  isInternal,
  hasValue,
  manual,
}: {
  id: string;
  type: string;
  direction: number;
  isInternal: boolean;
  hasValue: boolean;
  manual: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState(type);
  const [price, setPrice] = useState('');
  const [internal, setInternal] = useState(isInternal);
  const [busy, setBusy] = useState(false);

  const needsPrice = (next === 'BUY' || next === 'SELL') && !hasValue;
  const isTransfer = next === 'TRANSFER_IN' || next === 'TRANSFER_OUT';

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/portfolio/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: next,
          ...(price ? { priceUsd: price } : {}),
          ...(isTransfer ? { isInternal: internal } : {}),
        }),
      });
      const data: ApiResponse = await res.json();
      if (!data.success) return addToast({ type: 'error', title: 'Not saved', description: data.error });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this manual transaction?')) return;
    const res = await fetch(`/api/portfolio/transactions/${id}`, { method: 'DELETE' });
    const data: ApiResponse = await res.json();
    if (data.success) router.refresh();
    else addToast({ type: 'error', title: 'Not deleted', description: data.error });
  }

  if (manual) {
    return (
      <button type="button" onClick={() => void remove()} className="t-micro-tight text-ink-ghost hover:text-down">
        Delete
      </button>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="t-micro-tight text-ink-ghost hover:text-ink">
        Classify
      </button>
    );
  }

  return (
    <div className="flex min-w-[14rem] flex-col gap-2 text-left">
      <select value={next} onChange={(e) => setNext(e.target.value)} className={selectClass} aria-label="Transaction type">
        {BY_DIRECTION[String(direction)].map((t) => (
          <option key={t} value={t} className="bg-panel">{TYPE_LABEL[t]}</option>
        ))}
      </select>
      {isTransfer && (
        <label className="flex items-center gap-2 text-[0.75rem] text-ink-dim">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Between accounts I own (keeps cost basis)
        </label>
      )}
      {(next === 'BUY' || next === 'SELL' || next === 'SWAP') && (
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={needsPrice ? 'USD price per unit (required)' : 'USD price per unit (optional)'}
          className={selectClass}
          aria-label="USD price per unit"
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="line" loading={busy} disabled={needsPrice && !price} onClick={() => void save()}>Save</Button>
        <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
