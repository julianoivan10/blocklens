'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { API_ROUTES } from '@/lib/constants';
import { useToast } from '@/components/ui/toast';
import type { ApiResponse } from '@/types';

/**
 * Watchlist mutations from the client.
 *
 * The rows themselves are read on the server; this only writes, then
 * asks the server to re-render. `isPending` covers both the request
 * and the refresh, so the control stays busy until the new data is
 * actually on screen rather than flickering back mid-refresh.
 */
export function useWatchlist() {
  const router = useRouter();
  const { addToast } = useToast();
  const [isSaving, setSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const mutate = useCallback(
    async (request: () => Promise<Response>, failure: string) => {
      setSaving(true);
      try {
        const res = await request();
        const data: ApiResponse<null> = await res.json();

        if (!data.success) {
          addToast({ type: 'error', title: failure, description: data.error });
          return false;
        }

        startTransition(() => router.refresh());
        return true;
      } catch {
        addToast({
          type: 'error',
          title: failure,
          description: 'The request could not be completed. Check your connection and try again.',
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [addToast, router]
  );

  const add = useCallback(
    (symbol: string, name: string) =>
      mutate(
        () =>
          fetch(API_ROUTES.watchlist, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, name }),
          }),
        'Could not add to watchlist'
      ),
    [mutate]
  );

  const remove = useCallback(
    (symbol: string) =>
      mutate(
        () =>
          fetch(`${API_ROUTES.watchlist}?symbol=${encodeURIComponent(symbol)}`, {
            method: 'DELETE',
          }),
        'Could not remove from watchlist'
      ),
    [mutate]
  );

  return { add, remove, isPending: isSaving || isRefreshing };
}
