'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the panel. */
  title: string;
  side?: 'left' | 'right';
  children: React.ReactNode;
}

/**
 * An edge-anchored overlay panel, used for navigation on small
 * screens. Locks scroll, traps focus, restores focus on close, and
 * closes on Escape — the things a hand-rolled overlay usually
 * forgets.
 */
export function Sheet({ open, onClose, title, side = 'left', children }: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel so the keyboard lands inside it.
    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-90 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-ground-deep/80 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 flex w-[min(20rem,86vw)] flex-col bg-panel shadow-float',
          side === 'left' ? 'left-0 border-r border-line' : 'right-0 border-l border-line'
        )}
        style={{
          animation: 'bl-fade 0.2s var(--ease-out-quint) both',
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="t-micro">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="size-8 text-ink-faint transition-colors hover:text-ink"
          >
            <X className="mx-auto size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
