/**
 * Command Palette — Cmd+K quick-action launcher.
 *
 * Global keyboard shortcut opens a modal with fuzzy-matched commands
 * grouped by category. Arrow keys navigate; Enter executes.
 */

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ICommand {
  id: string;
  label: string;
  keywords: string[];
  icon?: React.ReactNode;
  category: string;
  action: () => void;
}

// ============================================================================
// Fuzzy match helper
// ============================================================================

function matches(cmd: ICommand, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return (
    cmd.label.toLowerCase().includes(q) || cmd.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

// ============================================================================
// Component
// ============================================================================

interface ICommandPaletteProps {
  extraCommands?: ICommand[];
}

export function CommandPalette({ extraCommands = [] }: ICommandPaletteProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Built-in command registry ----
  const builtInCommands = useMemo<ICommand[]>(
    () => [
      // Navigation
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        keywords: ['home', 'overview'],
        category: 'Navigation',
        action: () => {
          router.push('/dashboard');
        },
      },
      {
        id: 'nav-knowledge-map',
        label: 'Go to Knowledge Map',
        keywords: ['graph', 'kg', 'knowledge'],
        category: 'Navigation',
        action: () => {
          router.push('/knowledge' as never);
        },
      },
      {
        id: 'nav-reviews',
        label: 'Go to Reviews',
        keywords: ['study', 'session', 'cards'],
        category: 'Navigation',
        action: () => {
          router.push('/learning' as never);
        },
      },
      {
        id: 'nav-cards',
        label: 'Go to Cards',
        keywords: ['flashcard', 'deck'],
        category: 'Navigation',
        action: () => {
          router.push('/cards' as never);
        },
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        keywords: ['preferences', 'config'],
        category: 'Navigation',
        action: () => {
          router.push('/settings');
        },
      },
      {
        id: 'nav-profile',
        label: 'Go to Profile',
        keywords: ['account', 'user'],
        category: 'Navigation',
        action: () => {
          router.push('/profile');
        },
      },
      // Actions
      {
        id: 'action-new-session',
        label: 'Start a New Session',
        keywords: ['review', 'study', 'start', 'begin'],
        category: 'Actions',
        action: () => {
          router.push('/learning/new' as never);
        },
      },
      {
        id: 'action-create-card',
        label: 'Create a Card',
        keywords: ['add', 'new card', 'flashcard'],
        category: 'Actions',
        action: () => {
          router.push('/cards/new' as never);
        },
      },
      {
        id: 'action-misconceptions',
        label: 'Scan for Misconceptions',
        keywords: ['analyze', 'check', 'detect'],
        category: 'Actions',
        action: () => {
          router.push('/knowledge/misconceptions' as never);
        },
      },
    ],
    [router]
  );

  const allCommands = useMemo(
    () => [...builtInCommands, ...extraCommands],
    [builtInCommands, extraCommands]
  );

  const filtered = useMemo(
    () => allCommands.filter((cmd) => matches(cmd, query)),
    [allCommands, query]
  );

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ICommand[]>();
    for (const cmd of filtered) {
      const existing = map.get(cmd.category) ?? [];
      map.set(cmd.category, [...existing, cmd]);
    }
    return map;
  }, [filtered]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const execute = useCallback((cmd: ICommand) => {
    setOpen(false);
    cmd.action();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const cmd = filtered[selectedIndex];
        if (cmd !== undefined) execute(cmd);
      }
    },
    [filtered, selectedIndex, execute]
  );

  // Flat index tracker for grouped rendering
  let flatIndex = 0;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-slide-in" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          aria-label="Command palette"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No commands found.
              </p>
            )}
            {[...grouped.entries()].map(([category, commands]) => (
              <div key={category}>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                {commands.map((cmd) => {
                  const currentIndex = flatIndex;
                  flatIndex += 1;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      className={[
                        'flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted',
                      ].join(' ')}
                      onClick={() => {
                        execute(cmd);
                      }}
                      onMouseEnter={() => {
                        setSelectedIndex(currentIndex);
                      }}
                    >
                      {cmd.icon !== undefined && (
                        <span className="shrink-0 text-muted-foreground">{cmd.icon}</span>
                      )}
                      {cmd.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search and execute commands. Use arrow keys to navigate and Enter to execute.
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
