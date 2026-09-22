'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { CHAINS, CHAIN_IDS, type ChainId } from '@/lib/portfolio/chains';
import { formatTimeAgo, truncateAddress } from '@/lib/format';
import type { ApiResponse } from '@/types';

export interface WalletRow {
  id: string;
  chain: ChainId;
  address: string;
  label: string;
  syncStatus: 'PENDING' | 'SYNCING' | 'PARTIAL' | 'COMPLETE' | 'ERROR';
  syncError: string | null;
  lastSyncedAt: string | null;
  transactionCount: number;
}

const STATUS: Record<WalletRow['syncStatus'], { tone: 'neutral' | 'up' | 'caution' | 'down' | 'signal'; text: string }> = {
  PENDING: { tone: 'neutral', text: 'Not synced' },
  SYNCING: { tone: 'signal', text: 'Syncing' },
  PARTIAL: { tone: 'caution', text: 'Partly imported' },
  COMPLETE: { tone: 'up', text: 'Up to date' },
  ERROR: { tone: 'down', text: 'Sync failed' },
};

/** Keeps calling sync while the importer reports more history to fetch. */
const MAX_SLICES = 25;

export function WalletManager({ wallets, enabled }: { wallets: WalletRow[]; enabled: boolean }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [chain, setChain] = useState<ChainId>('ETHEREUM');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, string>>({});

  async function sync(id: string) {
    for (let slice = 1; slice <= MAX_SLICES; slice++) {
      setSyncing((s) => ({ ...s, [id]: slice === 1 ? 'Importing…' : `Importing… (part ${slice})` }));
      const res = await fetch(`/api/portfolio/wallets/${id}/sync`, { method: 'POST' });
      const data: ApiResponse<{ imported: number; complete: boolean }> = await res.json().catch(() => ({ success: false, error: 'Unexpected response' }));
      if (!data.success) {
        addToast({ type: 'error', title: 'Sync stopped', description: data.error });
        break;
      }
      router.refresh();
      if (data.data?.complete) {
        addToast({ type: 'success', title: 'Wallet up to date' });
        break;
      }
    }
    setSyncing((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    router.refresh();
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setAdding(true);
    try {
      const res = await fetch('/api/portfolio/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain, address, label }),
      });
      const data: ApiResponse<{ id: string }> = await res.json();
      if (!data.success || !data.data) {
        setError(data.error ?? 'Could not add the wallet');
        // Never keep a pasted secret on screen.
        if (res.status === 400 && /private key|recovery phrase/i.test(data.error ?? '')) setAddress('');
        return;
      }
      setAddress('');
      setLabel('');
      router.refresh();
      void sync(data.data.id);
    } finally {
      setAdding(false);
    }
  }

  async function remove(w: WalletRow) {
    if (!window.confirm(`Remove “${w.label}”? Its ${w.transactionCount} imported transactions are deleted with it. Nothing on-chain is affected.`)) return;
    const res = await fetch(`/api/portfolio/wallets/${w.id}`, { method: 'DELETE' });
    const data: ApiResponse = await res.json();
    if (data.success) router.refresh();
    else addToast({ type: 'error', title: 'Could not remove', description: data.error });
  }

  return (
    <div className="grid grid-cols-1 gap-x-16 gap-y-14 lg:grid-cols-12">
      <section className="lg:col-span-5">
        <h2 className="t-micro border-b border-line pb-3">Add a wallet</h2>
        {!enabled ? (
          <p className="t-body-sm mt-6 text-ink-faint">Wallet import is not configured on this deployment.</p>
        ) : (
          <form onSubmit={add} className="mt-6 flex flex-col gap-6" noValidate>
            <p className="border-l-2 border-signal-deep pl-4 text-[0.8125rem] leading-relaxed text-ink-dim">
              Read-only. Paste a <strong className="text-ink">public address</strong>. BlockLens never asks for — and will
              refuse — a private key, recovery phrase or wallet password.
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor="chain" className="t-micro">Chain</label>
              <select
                id="chain"
                value={chain}
                onChange={(e) => setChain(e.target.value as ChainId)}
                className="border-b border-line-strong bg-transparent py-2 text-[0.875rem] text-ink focus:border-signal focus:outline-none"
              >
                {CHAIN_IDS.map((c) => (
                  <option key={c} value={c} className="bg-panel">
                    {CHAINS[c].label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Public address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={CHAINS[chain].family === 'evm' ? '0x…' : 'Base58 address'}
              autoComplete="off"
              spellCheck={false}
              error={error || undefined}
            />
            <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main wallet" maxLength={60} />
            <Button type="submit" variant="primary" loading={adding} className="self-start">
              Add and import
            </Button>
          </form>
        )}
      </section>

      <section className="lg:col-span-7">
        <h2 className="t-micro border-b border-line pb-3">Tracked wallets</h2>
        {wallets.length === 0 ? (
          <p className="t-body-sm mt-6 text-ink-faint">No wallets yet.</p>
        ) : (
          <ul data-testid="wallet-list">
            {wallets.map((w) => {
              const status = STATUS[w.syncStatus];
              const busy = syncing[w.id];
              return (
                <li key={w.id} className="flex flex-col gap-2 border-b border-line-faint py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="font-medium text-ink">{w.label}</span>
                      <span className="t-micro-tight text-ink-ghost">{CHAINS[w.chain].label}</span>
                    </div>
                    <Badge tone={busy ? 'signal' : status.tone}>{busy ?? status.text}</Badge>
                  </div>
                  <a
                    href={CHAINS[w.chain].explorerAddress(w.address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="w-fit font-mono text-[0.75rem] text-ink-faint hover:text-ink"
                    title={w.address}
                  >
                    {truncateAddress(w.address, 6)}
                  </a>
                  <p className="text-[0.75rem] text-ink-ghost">
                    {w.transactionCount} movements imported
                    {w.lastSyncedAt ? ` · synced ${formatTimeAgo(w.lastSyncedAt)}` : ''}
                    {w.syncStatus === 'PARTIAL' && !busy ? ' · more history remains — sync again to continue' : ''}
                  </p>
                  {w.syncStatus === 'ERROR' && w.syncError && <p className="text-[0.75rem] text-down">{w.syncError}</p>}
                  <div className="flex gap-2">
                    <Button variant="line" size="sm" disabled={Boolean(busy) || !enabled} onClick={() => void sync(w.id)}>
                      Sync
                    </Button>
                    <Button variant="quiet" size="sm" disabled={Boolean(busy)} onClick={() => void remove(w)}>
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
