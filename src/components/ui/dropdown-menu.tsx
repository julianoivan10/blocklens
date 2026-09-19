'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  baseId: string;
}

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const ctx = React.useContext(DropdownContext);
  if (!ctx) throw new Error('Dropdown components must be used within <DropdownMenu>');
  return ctx;
}

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const baseId = React.useId();

  React.useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, triggerRef, rootRef, baseId }}>
      <div ref={rootRef} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

function DropdownMenuTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isOpen, setIsOpen, triggerRef, baseId } = useDropdown();
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      aria-controls={isOpen ? `${baseId}-menu` : undefined}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuContent({
  children,
  className,
  align = 'end',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) {
  const { isOpen, baseId } = useDropdown();
  if (!isOpen) return null;

  return (
    <div
      id={`${baseId}-menu`}
      role="menu"
      className={cn(
        // Entrance is defined in globals.css rather than relying on a
        // plugin that is not installed.
        'anim-rise absolute top-full z-50 mt-2 min-w-[13rem] overflow-hidden',
        'border border-line-strong bg-panel-raised/95 p-1 shadow-float backdrop-blur-xl',
        align === 'end' ? 'right-0' : 'left-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

const ITEM_STYLES =
  'flex w-full cursor-pointer select-none items-center gap-2.5 px-3 py-2 text-left ' +
  'text-[0.8125rem] transition-colors duration-150';

const TONE_STYLES = {
  default: 'text-ink-dim hover:bg-panel hover:text-ink',
  danger: 'text-down hover:bg-down/10',
} as const;

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger';
}

function DropdownMenuItem({
  children,
  className,
  onClick,
  tone = 'default',
  ...props
}: DropdownMenuItemProps) {
  const { setIsOpen } = useDropdown();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        onClick?.(e);
        setIsOpen(false);
      }}
      className={cn(ITEM_STYLES, TONE_STYLES[tone], className)}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A navigation entry. A real anchor rather than a button with an
 * onClick, so it keeps middle-click, open-in-new-tab and the status bar
 * preview that a menu item pointing at a route should have.
 */
function DropdownMenuLink({
  href,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  const { setIsOpen } = useDropdown();
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={() => setIsOpen(false)}
      className={cn(ITEM_STYLES, TONE_STYLES.default, className)}
      {...props}
    >
      {children}
    </Link>
  );
}

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('my-1 h-px bg-line', className)} {...props} />;
}

function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-3 py-2', className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLink,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
