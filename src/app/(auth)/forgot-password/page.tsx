'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeading, AuthOutcome, FormError } from '@/features/auth/auth-parts';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations';
import { API_ROUTES, ROUTES } from '@/lib/constants';
import type { ApiResponse } from '@/types';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError('');
    try {
      const res = await fetch(API_ROUTES.auth.forgotPassword, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result: ApiResponse<null> = await res.json();
      if (result.success) setSent(true);
      else setServerError(result.error || 'Could not send the reset link');
    } catch {
      setServerError('Something went wrong. Please try again.');
    }
  }

  if (sent) {
    return (
      <AuthOutcome
        label="Check your email"
        title="Link sent."
        description="If an account exists for that address, a password reset link is on its way. It expires in one hour."
      >
        <BackToSignIn />
      </AuthOutcome>
    );
  }

  return (
    <div>
      <AuthHeading
        label="Reset password"
        title="Forgot your password?"
        intro="Enter the address on your account and we'll send a reset link."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <FormError message={serverError} />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<Mail className="size-3.5" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Send reset link
        </Button>
      </form>

      <div className="mt-10 border-t border-line-faint pt-6">
        <BackToSignIn />
      </div>
    </div>
  );
}

function BackToSignIn() {
  return (
    <Link
      href={ROUTES.login}
      className="group inline-flex items-center gap-2 text-[0.8125rem] text-ink-faint transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-3.5 transition-transform duration-300 ease-out-quint group-hover:-translate-x-1" />
      Back to sign in
    </Link>
  );
}
