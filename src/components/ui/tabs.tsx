'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  baseId: string;
  register: (value: string) => void;
  order: React.RefObject<string[]>;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
  ...props
}: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue);
  const activeTab = value ?? internal;
  const baseId = React.useId();
  const order = React.useRef<string[]>([]);

  const setActiveTab = React.useCallback(
    (tab: string) => {
      setInternal(tab);
      onValueChange?.(tab);
    },
    [onValueChange]
  );

  const register = React.useCallback((v: string) => {
    if (!order.current.includes(v)) order.current.push(v);
  }, []);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId, register, order }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex items-center gap-6 border-b border-line', className)}
      {...props}
    />
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

/**
 * The active state is a hairline under the label plus a shift in ink
 * weight. No filled pill — the label itself carries selection, which
 * keeps a tab strip from reading as a row of buttons.
 */
function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const { activeTab, setActiveTab, baseId, register, order } = useTabs();
  const isActive = activeTab === value;

  React.useEffect(() => register(value), [register, value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const list = order.current;
    const i = list.indexOf(value);
    if (i === -1) return;

    let next: string | undefined;
    if (e.key === 'ArrowRight') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowLeft') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (!next) return;

    e.preventDefault();
    setActiveTab(next);
    // Move focus with selection, as the tablist pattern expects.
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(value)}
      onKeyDown={onKeyDown}
      className={cn(
        'relative -mb-px py-3 font-mono text-[0.6875rem] font-medium uppercase tracking-widest',
        'transition-colors duration-200',
        isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-dim',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-px after:transition-colors after:duration-200',
        isActive ? 'after:bg-signal' : 'after:bg-transparent',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { activeTab, baseId } = useTabs();
  if (activeTab !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn('anim-fade mt-2 focus-visible:outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
