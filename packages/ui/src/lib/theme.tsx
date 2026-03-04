'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

// Naming convention: filter exempts names matching the exact words in the regex.
// "ThemeContextValue" and "ThemeProviderProps" do not match those exact words,
// so the I-prefix rule applies.
export interface IThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export interface IThemeProviderProps {
  children?: ReactNode;
  /** Theme from user API settings — used only when no localStorage value exists. */
  serverTheme?: Theme;
  /** Fallback when neither localStorage nor serverTheme is set. Defaults to 'dark'. */
  defaultTheme?: Theme;
  /** localStorage key. Defaults to 'noema-theme'. */
  storageKey?: string;
}

// Re-export without I-prefix aliases for consumer convenience and backwards compat.
export type ThemeContextValue = IThemeContextValue;
export type ThemeProviderProps = IThemeProviderProps;

const ThemeContext = createContext<IThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement.classList;
  root.remove('dark', 'light');
  root.add(resolved);
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? resolveSystemTheme() : theme;
}

export function ThemeProvider({
  children,
  serverTheme,
  defaultTheme = 'dark',
  storageKey = 'noema-theme',
}: IThemeProviderProps): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return defaultTheme;
    }
    const stored = localStorage.getItem(storageKey) as Theme | null;
    return stored ?? serverTheme ?? defaultTheme;
  });

  useEffect(() => {
    if (serverTheme === undefined) {
      return;
    }
    const stored = localStorage.getItem(storageKey);
    if (stored === null) {
      setThemeState(serverTheme);
    }
  }, [serverTheme, storageKey]);

  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyTheme(resolved);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (): void => {
      applyTheme(resolveSystemTheme());
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme): void => {
      localStorage.setItem(storageKey, next);
      setThemeState(next);
    },
    [storageKey]
  );

  const toggleTheme = useCallback((): void => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<IThemeContextValue>(
    () => ({ theme, resolvedTheme: resolveTheme(theme), setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): IThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
