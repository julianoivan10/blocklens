'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => removeToast(id), DISMISS_AFTER_MS)
      );
    },
    [removeToast]
  );

  // Clear pending timers if the provider unmounts mid-flight.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-100 flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:max-w-sm"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* A leading rule carries the type, so the surface stays neutral and
   several stacked toasts do not turn into a block of colour. */
const RULES: Record<ToastType, string> = {
  success: 'bg-up',
  error: 'bg-down',
  warning: 'bg-caution',
  info: 'bg-signal',
};

const LABELS: Record<ToastType, string> = {
  success: 'Done',
  error: 'Error',
  warning: 'Warning',
  info: 'Note',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'anim-rise pointer-events-auto relative flex w-full gap-3 overflow-hidden',
        'border border-line-strong bg-panel-raised/95 py-3 pl-4 pr-3 shadow-float backdrop-blur-xl'
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-0.5', RULES[toast.type])} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The type is stated in words, never by colour alone. */}
        <span className="t-micro">{LABELS[toast.type]}</span>
        <p className="text-[0.8125rem] font-medium text-ink">{toast.title}</p>
        {toast.description && (
          <p className="text-[0.75rem] leading-relaxed text-ink-faint">{toast.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 size-7 shrink-0 self-start text-ink-ghost transition-colors hover:text-ink"
      >
        <X className="mx-auto size-3.5" />
      </button>
    </div>
  );
}
