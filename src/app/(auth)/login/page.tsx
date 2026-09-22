'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthFooter, AuthHeading, FormError, PasswordField } from '@/features/auth/auth-parts';
import { useAuth } from '@/hooks/use-auth';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { ROUTES } from '@/lib/constants';

export default function LoginPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [serverError, setServerError] = useState('');
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only same-origin paths are honoured, so a crafted callbackUrl
  // cannot bounce a freshly signed-in user to another site.
  const requested = searchParams.get('callbackUrl');
  const callbackUrl =
    requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : ROUTES.dashboard;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(data: LoginInput) {
    setServerError('');
    const result = await login(data.email, data.password);
    if (result.success) {
      router.push(callbackUrl);
      router.refresh();
    } else {
      setServerError(result.error || 'Could not sign you in');
    }
  }

  return (
    <div>
      <AuthHeading label="Sign in" title="Welcome back." />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        {searchParams.get('reason') === 'session-ended' && !serverError && (
          <p role="status" className="t-micro-tight border-l border-line-strong pl-3 text-ink-faint">
            Your session ended. Sign in again to continue.
          </p>
        )}
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

        <div className="flex flex-col gap-2">
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Your password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Link
            href={ROUTES.forgotPassword}
            className="t-micro-tight self-end text-ink-ghost transition-colors hover:text-ink"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Sign in
        </Button>
      </form>

      <AuthFooter prompt="No account yet?" href={ROUTES.register} action="Create one" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
