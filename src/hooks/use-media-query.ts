'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query.
 *
 * `useSyncExternalStore` is the correct primitive here: it reads the
 * current match during render and subscribes for changes, without the
 * effect-then-setState pattern that causes a cascading re-render on
 * every mount. The server snapshot is `false`, so anything gated on a
 * query renders its unmatched state until hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True when the viewer has asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
