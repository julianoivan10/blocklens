'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthHeading, AuthOutcome, FormError, PasswordField } from '@/features/auth/auth-parts';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations';
import { API_ROUTES, PASSWORD_MIN_LENGTH, ROUTES } from '@/lib/constants';
import type { ApiResponse } from '@/types';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  async function onSubmit(data: ResetPasswordInput) {
    setServerError('');
    try {
      const res = await fetch(API_ROUTES.auth.resetPassword, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<null> = await res.json();
      if (result.success) setDone(true);
      else setServerError(result.error || 'Could not reset your password');
    } catch {
      setServerError('Something went wrong. Please try again.');
    }
  }

  if (done) {
    return (
      <AuthOutcome
        label="Password reset"
        title="You're set."
        description="Your password has been changed. Sign in with the new one."
      >
        <Link href={ROUTES.login}>
          <Button variant="primary" size="md">
            Sign in
          </Button>
        </Link>
      </AuthOutcome>
    );
  }

  if (!token) {
    return (
      <AuthOutcome
        label="Invalid link"
        title="This link has expired."
        description="Password reset links are valid for one hour and can be used once. Request a fresh one to continue."
      >
        <Link href={ROUTES.forgotPassword}>
          <Button variant="line" size="md">
            Request a new link
          </Button>
        </Link>
      </AuthOutcome>
    );
  }

  return (
    <div>
      <AuthHeading label="Reset password" title="Set a new password." />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <FormError message={serverError} />

        <input type="hidden" {...register('token')} />

        <PasswordField
          label="New password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          error={errors.password?.message}
          {...register('password')}
        />

        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="Type it again"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Reset password
        </Button>
      </form>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
