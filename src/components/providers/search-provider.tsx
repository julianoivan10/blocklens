'use client';

import { SearchContext, useSearchProvider } from '@/hooks/use-search';

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const search = useSearchProvider();
  return (
    <SearchContext.Provider value={search}>
      {children}
    </SearchContext.Provider>
  );
}
