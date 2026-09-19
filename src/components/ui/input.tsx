'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

/**
 * A field ruled on the underside only.
 *
 * The full-box input is what makes forms look like a component
 * library; an underline focuses attention on the baseline the value
 * sits on and keeps the form reading as a document. The rule
 * thickens and takes the signal colour on focus.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon, rightSlot, id, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? `f-${reactId}`;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={inputId} className="t-micro">
            {label}
          </label>
        )}

        <div
          className={cn(
            'group relative flex items-center gap-2.5 border-b bg-transparent transition-colors duration-200',
            error
              ? 'border-down'
              : 'border-line-strong focus-within:border-signal hover:border-ink-ghost'
          )}
        >
          {icon && (
            <span className="shrink-0 text-ink-ghost transition-colors group-focus-within:text-signal">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-10 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink',
              'placeholder:text-ink-ghost focus:outline-none',
              // The wrapper carries the focus treatment, so the inner
              // control must not draw a second one.
              'focus-visible:outline-none',
              className
            )}
            {...props}
          />

          {rightSlot && <span className="shrink-0">{rightSlot}</span>}
        </div>

        {error ? (
          <p id={`${inputId}-error`} className="text-[0.75rem] text-down" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-[0.75rem] text-ink-ghost">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input, type InputProps };
