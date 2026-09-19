'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { ROUTES } from '@/lib/constants';
import type { ApiResponse } from '@/types';

/**
 * Account deletion, behind a typed confirmation.
 *
 * The control this replaces was a button that did nothing at all. A
 * destructive action needs a deliberate gesture, so the account's own
 * email has to be retyped — and the consequence is stated in words
 * before the field, not after the click.
 */
export function DeleteAccountControl() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [armed, setArmed] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail }),
      });
      const data: ApiResponse<null> = await res.json();

      if (!data.success) {
        addToast({ type: 'error', title: 'Account not deleted', description: data.error });
        return;
      }

      // The session cookie is already gone; a full navigation clears
      // any client state that outlived it.
      window.location.assign(ROUTES.home);
    } catch {
      addToast({
        type: 'error',
        title: 'Account not deleted',
        description: 'The request could not be completed. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-[32rem] text-[0.8125rem] leading-relaxed text-ink-faint">
          Deleting your account removes your profile, watchlist, research history and saved
          research. This cannot be undone.
        </p>
        <Button variant="danger" size="sm" onClick={() => setArmed(true)}>
          Delete account
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-[26rem] flex-col gap-5 border-l-2 border-down/50 pl-5">
      <p className="text-[0.8125rem] leading-relaxed text-ink-dim">
        This permanently deletes everything belonging to{' '}
        <span className="font-mono text-ink">{user?.email}</span>. Type the address to confirm.
      </p>

      <Input
        label="Confirm email"
        type="email"
        autoComplete="off"
        value={confirmEmail}
        onChange={(e) => setConfirmEmail(e.target.value)}
        placeholder={user?.email ?? 'you@example.com'}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="danger"
          size="sm"
          loading={busy}
          disabled={confirmEmail.trim().length === 0}
          onClick={() => void onDelete()}
        >
          Delete permanently
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            setArmed(false);
            setConfirmEmail('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
