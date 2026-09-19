'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SearchContextValue {
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

export const SearchContext = createContext<SearchContextValue>({
  isOpen: false,
  openSearch: () => {},
  closeSearch: () => {},
  toggleSearch: () => {},
});

export function useSearch() {
  return useContext(SearchContext);
}

export function useSearchProvider() {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => setIsOpen(false), []);
  const toggleSearch = useCallback(() => setIsOpen(prev => !prev), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  return { isOpen, openSearch, closeSearch, toggleSearch };
}
