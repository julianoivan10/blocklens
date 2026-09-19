'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthOutcome } from '@/features/auth/auth-parts';
import { API_ROUTES, ROUTES } from '@/lib/constants';
import type { ApiResponse } from '@/types';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

type Status = 'working' | 'verified' | 'failed';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  // Derived at mount rather than set from an effect: a link with no
  // token is already in its final state before anything runs.
  const [outcome, setOutcome] = useState<{ status: Status; message: string }>(() =>
    token
      ? { status: 'working', message: '' }
      : { status: 'failed', message: 'This link is missing its verification token.' }
  );
  const { status, message } = outcome;

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(API_ROUTES.auth.verifyEmail, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
        const data: ApiResponse<null> = await res.json();

        if (data.success) {
          setOutcome({ status: 'verified', message: 'Your email address is confirmed.' });
        } else {
          setOutcome({
            status: 'failed',
            message: data.error || 'This link is invalid or has already been used.',
          });
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setOutcome({
          status: 'failed',
          message: 'Something went wrong. Please try again.',
        });
      }
    })();

    return () => controller.abort();
  }, [token]);

  if (status === 'working') {
    return (
      <div className="border-l-2 border-line-strong pl-6">
        <span className="t-micro anim-scan">Verifying</span>
        <h1 className="mt-4 font-display text-[1.625rem] leading-[1.15] tracking-[-0.02em] text-ink">
          Checking your link…
        </h1>
        <div className="mt-6 flex max-w-[16rem] flex-col gap-2">
          <Skeleton className="h-px w-full" />
        </div>
      </div>
    );
  }

  if (status === 'verified') {
    return (
      <AuthOutcome label="Email verified" title="You're confirmed." description={message}>
        <Link href={ROUTES.dashboard}>
          <Button variant="primary" size="md">
            Go to your workspace
          </Button>
        </Link>
      </AuthOutcome>
    );
  }

  return (
    <div className="border-l-2 border-down pl-6">
      <span className="t-micro text-down">Verification failed</span>
      <h1 className="mt-4 font-display text-[1.625rem] leading-[1.15] tracking-[-0.02em] text-ink">
        That link didn&rsquo;t work.
      </h1>
      <p className="t-body mt-3">{message}</p>
      <div className="mt-8">
        <Link href={ROUTES.login}>
          <Button variant="line" size="md">
            Back to sign in
          </Button>
        </Link>
      </div>
    </div>
  );
}

function VerifySkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-2 w-24" />
      <Skeleton className="h-8 w-56" />
    </div>
  );
}
