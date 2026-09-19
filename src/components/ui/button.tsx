'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'quiet' | 'line' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/**
 * Buttons are tactile rather than decorative: a hairline, a ground
 * shift, and a 1px downward press. The primary action is the one
 * place a solid light surface appears, which is what makes it read as
 * the primary action without a saturated fill.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-ink text-ground hover:bg-white active:translate-y-px shadow-[0_1px_0_0_rgb(255_255_255/0.08)_inset]',
  secondary:
    'border border-line-strong bg-panel text-ink hover:border-ink-ghost hover:bg-panel-raised active:translate-y-px',
  quiet: 'text-ink-dim hover:bg-panel hover:text-ink',
  line: 'border border-line text-ink-dim hover:border-signal-deep hover:text-ink active:translate-y-px',
  danger:
    'border border-down/30 text-down hover:border-down/60 hover:bg-down/10 active:translate-y-px',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.75rem]',
  md: 'h-10 px-4 text-[0.8125rem]',
  lg: 'h-12 px-6 text-[0.875rem]',
  icon: 'size-9',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-2 rounded-xs',
        'font-medium tracking-[-0.005em] transition-all duration-150 ease-out-quint',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {/* Loading reads as a scan across the label, not a spinner. */}
      {loading && (
        <span
          aria-hidden="true"
          className="skeleton absolute inset-0 rounded-xs opacity-60"
        />
      )}
      <span className={cn('inline-flex items-center gap-2', loading && 'opacity-50')}>
        {children}
      </span>
    </button>
  )
);
Button.displayName = 'Button';

export { Button, type ButtonProps };
