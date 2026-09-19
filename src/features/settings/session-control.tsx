'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/lib/constants';
import type { ApiResponse } from '@/types';

/**
 * Sign out everywhere.
 *
 * Sessions are database rows, so this is a real revocation rather than
 * a cosmetic control: every device holding a session for this account
 * loses it, including this one.
 */
export function SessionControl({ activeSessions }: { activeSessions: number }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const others = Math.max(0, activeSessions - 1);

  async function revokeAll() {
    setBusy(true);
    try {
      const res = await fetch('/api/account/sessions', { method: 'DELETE' });
      const data: ApiResponse<{ revoked: number }> = await res.json();

      if (!data.success) {
        addToast({ type: 'error', title: 'Could not sign out', description: data.error });
        return;
      }

      // This device's session is gone too, so a full navigation clears
      // any client state that outlived it.
      window.location.assign(ROUTES.login);
    } catch {
      addToast({
        type: 'error',
        title: 'Could not sign out',
        description: 'The request could not be completed. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="t-body-sm max-w-[26rem]">
        {activeSessions <= 1
          ? 'This is the only device signed in to your account.'
          : `Your account is signed in on ${activeSessions} devices${
              others > 0 ? `, including ${others} other than this one` : ''
            }.`}
      </p>

      <p className="t-micro-tight max-w-[26rem] leading-relaxed text-ink-ghost">
        Signing out everywhere revokes every active session, including this one. You will
        need to sign in again.
      </p>

      <Button variant="line" size="sm" loading={busy} onClick={() => void revokeAll()}>
        Sign out of all devices
      </Button>
    </div>
  );
}
