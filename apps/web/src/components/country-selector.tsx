/**
 * Country Selector Component
 *
 * Trie-powered searchable dropdown for country selection.
 * Features:
 * - O(k) prefix search via Trie data structure
 * - Flag emoji display (zero external assets)
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Radix-compatible combobox pattern
 */

'use client';

import { ChevronDown, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, COUNTRY_BY_CODE, type Country } from '../lib/countries';
import { Trie } from '../lib/trie';

interface CountrySelectorProps {
  /** ISO 3166-1 alpha-2 code */
  value?: string;
  /** Called with the alpha-2 code */
  onChange: (code: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error state */
  error?: boolean;
}

export function CountrySelector({
  value,
  onChange,
  placeholder = 'Select country...',
  error,
}: CountrySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Build trie once — searchable by name, code, and flag
  const trie = useMemo(
    () =>
      Trie.from(COUNTRIES, (country) => [
        country.name,
        country.code,
        // Also index common alternative names
        ...getAlternativeNames(country),
      ]),
    []
  );

  // Search results — show all if query is empty, else trie search
  const results = useMemo(() => {
    if (!query.trim()) return COUNTRIES;
    return trie.search(query.trim());
  }, [trie, query]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [results]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = useCallback(
    (country: Country) => {
      onChange(country.code);
      setIsOpen(false);
      setQuery('');
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[highlightIndex]) {
            handleSelect(results[highlightIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setQuery('');
          break;
      }
    },
    [results, highlightIndex, handleSelect]
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    // Focus input on next tick
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setQuery('');
    },
    [onChange]
  );

  const selectedCountry = value ? COUNTRY_BY_CODE.get(value) : undefined;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className={`
          flex h-10 w-full items-center justify-between rounded-md border bg-background
          px-3 py-2 text-sm ring-offset-background
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${error ? 'border-destructive focus-visible:ring-destructive' : 'border-input'}
        `}
      >
        {selectedCountry ? (
          <span className="flex items-center gap-2">
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span>{selectedCountry.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="rounded-sm hover:bg-muted p-0.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
          {/* Search input */}
          <div className="flex items-center border-b border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search countries..."
              className="flex h-9 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                }}
                className="rounded-sm hover:bg-muted p-0.5"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Results list */}
          <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground text-center">
                No countries found
              </li>
            ) : (
              results.map((country, index) => (
                <li
                  key={country.code}
                  role="option"
                  aria-selected={value === country.code}
                  onClick={() => {
                    handleSelect(country);
                  }}
                  onMouseEnter={() => {
                    setHighlightIndex(index);
                  }}
                  className={`
                    flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer
                    ${index === highlightIndex ? 'bg-accent text-accent-foreground' : ''}
                    ${value === country.code ? 'font-medium' : ''}
                  `}
                >
                  <span className="text-base leading-none shrink-0">{country.flag}</span>
                  <span className="truncate">{country.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {country.code}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Returns alternative searchable names for better discoverability.
 * Covers common aliases and demonyms.
 */
function getAlternativeNames(country: Country): string[] {
  const alternatives: Record<string, string[]> = {
    US: ['USA', 'America', 'United States of America'],
    GB: ['UK', 'Britain', 'England', 'Scotland', 'Wales'],
    KR: ['South Korea'],
    KP: ['North Korea'],
    RU: ['Russian Federation'],
    CN: ["People's Republic of China", 'PRC'],
    TW: ['Republic of China', 'ROC'],
    AE: ['UAE', 'Emirates'],
    CD: ['DRC', 'Democratic Republic of the Congo', 'Zaire'],
    CZ: ['Czech Republic'],
    NL: ['Holland'],
    CI: ['Ivory Coast'],
    VA: ['Holy See'],
    MM: ['Burma'],
    SZ: ['Swaziland'],
    MK: ['Macedonia'],
  };
  return alternatives[country.code] ?? [];
}
