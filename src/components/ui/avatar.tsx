import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Used for the initial and the accessible name. */
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'size-7 text-[0.625rem]',
  md: 'size-9 text-[0.75rem]',
  lg: 'size-12 text-[0.875rem]',
} as const;

/**
 * An account plate.
 *
 * Square with a hairline, matching the asset plate rather than the
 * circular avatar convention — one identity vocabulary, not two.
 *
 * Initials only: nothing in the product sets `User.image` yet, and a
 * remote `<img>` of unknown origin costs a layout-shift risk and an
 * image-host allowlist for a feature that does not exist. The schema
 * field remains for when uploads do.
 */
function Avatar({ alt, fallback, size = 'md', className, ...props }: AvatarProps) {
  const initial = (fallback || alt?.charAt(0) || '?').toUpperCase();

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
        'border border-line bg-panel-sunken font-mono font-medium text-ink-dim',
        SIZES[size],
        className
      )}
      {...props}
    >
      <span aria-hidden="true">{initial}</span>
      {alt && <span className="sr-only">{alt}</span>}
    </span>
  );
}

export { Avatar, type AvatarProps };
