'use client';

import * as React from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';

/**
 * Shared pieces of the auth forms. The four forms previously repeated
 * the same heading block, the same error box and the same show/hide
 * password wiring; this is that duplication removed.
 */

export function AuthHeading({
  label,
  title,
  intro,
}: {
  label: string;
  title: string;
  intro?: string;
}) {
  return (
    <header className="mb-10">
      <span className="t-micro">{label}</span>
      <h1 className="mt-4 font-display text-[1.875rem] leading-[1.1] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {intro && <p className="t-body mt-3">{intro}</p>}
    </header>
  );
}

/** A ruled notice, not a red-tinted box. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="border-l-2 border-down pl-4">
      <p className="text-[0.8125rem] leading-relaxed text-down">{message}</p>
    </div>
  );
}

export function AuthFooter({
  prompt,
  href,
  action,
}: {
  prompt: string;
  href: string;
  action: string;
}) {
  return (
    <p className="mt-10 border-t border-line-faint pt-6 text-[0.8125rem] text-ink-faint">
      {prompt}{' '}
      <Link
        href={href}
        className="font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-signal"
      >
        {action}
      </Link>
    </p>
  );
}

/**
 * A password field with a visibility toggle. The toggle is a real
 * button with an accessible name, and the control reports its state
 * through aria-pressed.
 */
export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type' | 'rightSlot'>
>(function PasswordField(props, ref) {
  const [visible, setVisible] = React.useState(false);

  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="size-7 text-ink-ghost transition-colors hover:text-ink"
        >
          {visible ? (
            <EyeOff className="mx-auto size-3.5" />
          ) : (
            <Eye className="mx-auto size-3.5" />
          )}
        </button>
      }
      {...props}
    />
  );
});

/** A confirmation outcome: a rule, a statement, a way onward. */
export function AuthOutcome({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-signal pl-6">
      <span className="t-micro">{label}</span>
      <h1 className="mt-4 font-display text-[1.625rem] leading-[1.15] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="t-body mt-3">{description}</p>
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}
