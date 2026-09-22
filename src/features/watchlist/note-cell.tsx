'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import type { ApiResponse } from '@/types';

/** An inline, private note on a watchlist row. Saved on blur. */
export function NoteCell({ symbol, initial }: { symbol: string; initial: string | null | undefined }) {
  const { addToast } = useToast();
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');

  async function save() {
    const next = value.trim();
    if (next === saved) return;
    const res = await fetch('/api/watchlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, notes: next || null }),
    });
    const data: ApiResponse = await res.json().catch(() => ({ success: false }));
    if (data.success) setSaved(next);
    else addToast({ type: 'error', title: 'Note not saved', description: data.error });
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      maxLength={500}
      placeholder="Add a note"
      aria-label={`Note for ${symbol}`}
      className="w-full min-w-[10rem] border-b border-transparent bg-transparent py-1 text-[0.75rem] text-ink-dim placeholder:text-ink-ghost hover:border-line focus:border-signal focus:outline-none"
    />
  );
}
