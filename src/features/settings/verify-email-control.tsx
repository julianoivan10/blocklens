'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { ApiResponse } from '@/types';

/** Re-sends the verification email, reporting delivery failure honestly. */
export function VerifyEmailControl() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data: ApiResponse = await res.json();
      addToast(
        data.success
          ? { type: 'success', title: 'Verification email sent', description: data.message }
          : { type: 'error', title: 'Email not sent', description: data.error }
      );
    } catch {
      addToast({
        type: 'error',
        title: 'Email not sent',
        description: 'The request could not be completed. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="line" size="sm" loading={busy} onClick={() => void resend()}>
      Resend verification email
    </Button>
  );
}
