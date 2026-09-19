'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthFooter, AuthHeading, FormError, PasswordField } from '@/features/auth/auth-parts';
import { useAuth } from '@/hooks/use-auth';
import { registerSchema, type RegisterInput } from '@/lib/validations';
import { PASSWORD_MIN_LENGTH, ROUTES } from '@/lib/constants';

export default function RegisterPage() {
  const [serverError, setServerError] = useState('');
  const { register: registerUser } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(data: RegisterInput) {
    setServerError('');
    const result = await registerUser(
      data.name,
      data.email,
      data.password,
      data.confirmPassword
    );
    if (result.success) {
      router.push(ROUTES.dashboard);
      router.refresh();
    } else {
      setServerError(result.error || 'Could not create your account');
    }
  }

  return (
    <div>
      <AuthHeading
        label="Create account"
        title="Start researching."
        intro="Free to open. Every figure is labelled with where it came from."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <FormError message={serverError} />

        <Input
          label="Name"
          autoComplete="name"
          placeholder="Your name"
          icon={<User className="size-3.5" />}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<Mail className="size-3.5" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <PasswordField
          label="Password"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          hint={`Minimum ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password?.message}
          {...register('password')}
        />

        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Type it again"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Create account
        </Button>
      </form>

      <AuthFooter prompt="Already have an account?" href={ROUTES.login} action="Sign in" />
    </div>
  );
}
