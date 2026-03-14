# Phase 00 — Design Tokens (Synapse) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the Noema neuroscience design token system — color palette, typography, spacing, animations, and dark/light theme infrastructure — so every subsequent phase can consume consistent tokens.

**Architecture:** CSS custom properties in `packages/ui/src/styles/globals.css` carry all token values; `packages/ui/tailwind.config.cjs` references those vars so Tailwind generates utility classes. A `ThemeProvider` + `useTheme` hook in `packages/ui/src/lib/theme.ts` manages dark/light state via localStorage + HTML class toggling, accepting an optional `serverTheme` prop from the app layer so API settings can sync without coupling the UI package to `@noema/api-client`.

**Tech Stack:** Tailwind CSS 3, CSS custom properties (HSL channels), Next.js `next/font/google` (JetBrains Mono), React context, TypeScript 5 strict.

---

## Context: existing files you MUST read before touching anything

- `packages/ui/src/styles/globals.css` — shadcn HSL vars in `:root` and `.dark`; extend both blocks
- `packages/ui/tailwind.config.cjs` — already has `darkMode: ['class']`, extend `colors`, `keyframes`, `animation`, `fontFamily`
- `packages/ui/src/index.ts` — barrel file; add theme exports here
- `apps/web/src/app/layout.tsx` — Inter font + `<html lang="en" suppressHydrationWarning>`; add Mono font + default `dark` class
- `apps/web/src/app/providers.tsx` — QueryClientProvider + AuthProvider; wrap with ThemeProvider here
- `apps/web-admin/src/app/layout.tsx` — same pattern as web layout; add Mono font + `dark` class
- `packages/ui/package.json` — check exports map if you add new entry points

## Constraints
- CSS custom properties are defined as **bare HSL channels** (e.g. `213 100% 60%`), NOT `hsl(...)`. This allows Tailwind opacity modifiers to work (`bg-synapse-400/50`).
- Tailwind color entries use the `hsl(var(--token))` wrapper.
- Do NOT add `next-themes` or any third-party theme library. Implement from scratch.
- `packages/ui` must NOT import from `@noema/api-client` — keep UI package decoupled.
- No tests are required for pure CSS/token tasks (T0.1–T0.4, T0.6). ThemeProvider logic (T0.5) gets a lightweight unit test.
- The token gallery page (T0.6b) is dev-only; guard with `if (process.env.NODE_ENV === 'production') notFound()`.
- Run `pnpm build` from the repo root after all tasks to verify no build errors.

---

## Task 1: Neuroscience Color Palette — CSS custom properties (T0.1)

**Files:**
- Modify: `packages/ui/src/styles/globals.css`

This task adds 6 color families × 6 shades as HSL channel variables in both `:root` (light) and `.dark` blocks, then remaps the existing shadcn generic tokens.

### HSL values reference

**Dark mode values (primary):**

```
/* synapse — Synaptic Blue */
--synapse-50:  213 60% 95%;
--synapse-100: 213 70% 85%;
--synapse-200: 213 80% 70%;
--synapse-400: 213 100% 60%;
--synapse-600: 213 100% 45%;
--synapse-900: 213 100% 15%;

/* dendrite — Dendrite Violet */
--dendrite-50:  267 50% 95%;
--dendrite-100: 267 60% 85%;
--dendrite-200: 267 65% 72%;
--dendrite-400: 267 80% 62%;
--dendrite-600: 267 80% 45%;
--dendrite-900: 267 80% 15%;

/* myelin — Myelin Gold */
--myelin-50:  43 80% 95%;
--myelin-100: 43 85% 85%;
--myelin-200: 43 90% 72%;
--myelin-400: 43 95% 58%;
--myelin-600: 43 90% 40%;
--myelin-900: 43 80% 12%;

/* neuron — Neural Green */
--neuron-50:  152 60% 95%;
--neuron-100: 152 65% 85%;
--neuron-200: 152 70% 70%;
--neuron-400: 152 80% 50%;
--neuron-600: 152 75% 35%;
--neuron-900: 152 70% 12%;

/* cortex — Cortex Rose */
--cortex-50:  4 80% 96%;
--cortex-100: 4 80% 88%;
--cortex-200: 4 75% 74%;
--cortex-400: 4 90% 58%;
--cortex-600: 4 85% 42%;
--cortex-900: 4 75% 15%;

/* axon — Axon Gray */
--axon-50:  220 20% 97%;
--axon-100: 220 18% 90%;
--axon-200: 220 15% 78%;
--axon-400: 220 12% 55%;
--axon-600: 220 12% 35%;
--axon-900: 220 15% 10%;
```

**Light mode values (muted, scholarly — placed in `:root`):**

```
/* synapse — Steel Blue */
--synapse-50:  213 80% 97%;
--synapse-100: 213 75% 90%;
--synapse-200: 213 70% 78%;
--synapse-400: 213 70% 50%;
--synapse-600: 213 75% 35%;
--synapse-900: 213 80% 12%;

/* dendrite — Soft Lavender */
--dendrite-50:  267 60% 97%;
--dendrite-100: 267 55% 90%;
--dendrite-200: 267 50% 78%;
--dendrite-400: 267 55% 55%;
--dendrite-600: 267 60% 38%;
--dendrite-900: 267 65% 12%;

/* myelin — Warm Ochre */
--myelin-50:  43 90% 97%;
--myelin-100: 43 85% 90%;
--myelin-200: 43 80% 78%;
--myelin-400: 43 75% 48%;
--myelin-600: 43 75% 32%;
--myelin-900: 43 70% 10%;

/* neuron — Sage Green */
--neuron-50:  152 65% 97%;
--neuron-100: 152 60% 88%;
--neuron-200: 152 55% 72%;
--neuron-400: 152 55% 40%;
--neuron-600: 152 55% 28%;
--neuron-900: 152 55% 10%;

/* cortex — Dusty Red */
--cortex-50:  4 80% 97%;
--cortex-100: 4 70% 90%;
--cortex-200: 4 65% 76%;
--cortex-400: 4 65% 48%;
--cortex-600: 4 65% 34%;
--cortex-900: 4 60% 12%;

/* axon — Cool Gray */
--axon-50:  220 20% 98%;
--axon-100: 220 18% 92%;
--axon-200: 220 15% 82%;
--axon-400: 220 12% 60%;
--axon-600: 220 12% 40%;
--axon-900: 220 15% 8%;
```

**Remap existing shadcn tokens (add inside both `:root` and `.dark` blocks):**

In `:root` (light), after new palette vars:
```css
--primary: var(--synapse-400);
--primary-foreground: var(--synapse-50);
--destructive: var(--cortex-400);
--destructive-foreground: var(--cortex-50);
--accent: var(--dendrite-200);
--accent-foreground: var(--dendrite-900);
--ring: var(--synapse-600);
```

In `.dark`, after new palette vars:
```css
--primary: var(--synapse-400);
--primary-foreground: var(--synapse-900);
--destructive: var(--cortex-400);
--destructive-foreground: var(--cortex-900);
--accent: var(--dendrite-200);
--accent-foreground: var(--dendrite-900);
--ring: var(--synapse-600);
```

### Steps

**Step 1: Add light-mode palette vars inside `:root { }` block (after existing vars)**

Add all 36 light-mode CSS custom property lines shown above to `packages/ui/src/styles/globals.css` inside the existing `:root { }` block, after the existing shadcn vars. Then add the 7 remap lines.

**Step 2: Add dark-mode palette vars inside `.dark { }` block**

Add all 36 dark-mode CSS custom property lines inside the `.dark { }` block. Then add the 7 remap lines.

**Step 3: Verify globals.css parses without errors**

```bash
cd /path/to/repo && pnpm --filter @noema/ui build:css
```
Expected: exits 0, `dist/styles.css` generated with no errors.

**Step 4: Commit**

```bash
git add packages/ui/src/styles/globals.css
git commit -m "feat(ui): add neuroscience color palette — 6 families × 6 shades (T0.1)"
```

---

## Task 2: Tailwind Color Config — register palette families (T0.6 partial)

**Files:**
- Modify: `packages/ui/tailwind.config.cjs`

Add all 6 color families to `theme.extend.colors`. Each shade entry uses `hsl(var(--<family>-<shade>))`.

**Step 1: Add color families inside `theme.extend.colors`**

```js
// Inside theme.extend.colors, add after existing entries:
synapse: {
  50:  'hsl(var(--synapse-50))',
  100: 'hsl(var(--synapse-100))',
  200: 'hsl(var(--synapse-200))',
  400: 'hsl(var(--synapse-400))',
  600: 'hsl(var(--synapse-600))',
  900: 'hsl(var(--synapse-900))',
},
dendrite: {
  50:  'hsl(var(--dendrite-50))',
  100: 'hsl(var(--dendrite-100))',
  200: 'hsl(var(--dendrite-200))',
  400: 'hsl(var(--dendrite-400))',
  600: 'hsl(var(--dendrite-600))',
  900: 'hsl(var(--dendrite-900))',
},
myelin: {
  50:  'hsl(var(--myelin-50))',
  100: 'hsl(var(--myelin-100))',
  200: 'hsl(var(--myelin-200))',
  400: 'hsl(var(--myelin-400))',
  600: 'hsl(var(--myelin-600))',
  900: 'hsl(var(--myelin-900))',
},
neuron: {
  50:  'hsl(var(--neuron-50))',
  100: 'hsl(var(--neuron-100))',
  200: 'hsl(var(--neuron-200))',
  400: 'hsl(var(--neuron-400))',
  600: 'hsl(var(--neuron-600))',
  900: 'hsl(var(--neuron-900))',
},
cortex: {
  50:  'hsl(var(--cortex-50))',
  100: 'hsl(var(--cortex-100))',
  200: 'hsl(var(--cortex-200))',
  400: 'hsl(var(--cortex-400))',
  600: 'hsl(var(--cortex-600))',
  900: 'hsl(var(--cortex-900))',
},
axon: {
  50:  'hsl(var(--axon-50))',
  100: 'hsl(var(--axon-100))',
  200: 'hsl(var(--axon-200))',
  400: 'hsl(var(--axon-400))',
  600: 'hsl(var(--axon-600))',
  900: 'hsl(var(--axon-900))',
},
```

**Step 2: Verify build still passes**

```bash
pnpm --filter @noema/ui build:css
```
Expected: exits 0.

**Step 3: Commit**

```bash
git add packages/ui/tailwind.config.cjs
git commit -m "feat(ui): register neuroscience color families in Tailwind config (T0.6)"
```

---

## Task 3: Typography — font variable + Tailwind utilities (T0.2)

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/tailwind.config.cjs`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web-admin/src/app/layout.tsx`

### Step 1: Add `--font-mono` fallback to `:root` in `globals.css`

Inside the `:root { }` block, add:
```css
--font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
```

### Step 2: Add typography component utilities to `globals.css`

After the existing `@layer base { }` blocks, add a new layer:

```css
@layer components {
  .text-page-title {
    @apply text-3xl font-bold tracking-tight;
  }
  .text-section-title {
    @apply text-xl font-semibold tracking-tight;
  }
  .text-card-title {
    @apply text-base font-semibold;
  }
  .text-metric-value {
    font-family: var(--font-mono);
    @apply text-4xl font-bold tabular-nums;
  }
  .text-metric-label {
    @apply text-xs font-medium uppercase tracking-widest text-muted-foreground;
  }
  .text-body {
    @apply text-sm leading-relaxed;
  }
  .text-caption {
    @apply text-xs text-muted-foreground;
  }
}
```

### Step 3: Register `fontFamily.mono` in Tailwind config

Inside `theme.extend` in `tailwind.config.cjs`, add:

```js
fontFamily: {
  mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
},
```

### Step 4: Add JetBrains Mono to `apps/web/src/app/layout.tsx`

Read the file first. Then add JetBrains Mono import and wire the CSS variable:

```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});
```

Update the `<body>` className to include `jetbrainsMono.variable`:
```tsx
<body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
```

Also add `dark` class to `<html>` for SSR default:
```tsx
<html lang="en" className="dark" suppressHydrationWarning>
```

### Step 5: Same change to `apps/web-admin/src/app/layout.tsx`

Identical font import + body className + `className="dark"` on `<html>`.

### Step 6: Verify builds

```bash
pnpm --filter @noema/ui build:css
pnpm --filter @noema/web build   # or pnpm --filter @noema/web typecheck
```

Expected: exits 0.

### Step 7: Commit

```bash
git add packages/ui/src/styles/globals.css packages/ui/tailwind.config.cjs \
        apps/web/src/app/layout.tsx apps/web-admin/src/app/layout.tsx
git commit -m "feat(ui): typography scale — JetBrains Mono + named text utilities (T0.2)"
```

---

## Task 4: Spacing tokens (T0.3)

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/tailwind.config.cjs`

### Step 1: Add spacing vars to `:root` in `globals.css`

Inside `:root { }`, add:
```css
--space-section:  1.5rem;
--space-card-gap: 1rem;
--space-inset:    1.5rem;
--space-tight:    0.5rem;
```

### Step 2: Register in Tailwind config

Inside `theme.extend` in `tailwind.config.cjs`, add:

```js
spacing: {
  section:  'var(--space-section)',
  'card-gap': 'var(--space-card-gap)',
  inset:    'var(--space-inset)',
  tight:    'var(--space-tight)',
},
```

### Step 3: Verify

```bash
pnpm --filter @noema/ui build:css
```
Expected: exits 0.

### Step 4: Commit

```bash
git add packages/ui/src/styles/globals.css packages/ui/tailwind.config.cjs
git commit -m "feat(ui): spacing tokens — section, card-gap, inset, tight (T0.3)"
```

---

## Task 5: Animation tokens (T0.4)

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/tailwind.config.cjs`

### Step 1: Add shimmer animation CSS to `globals.css`

The `shimmer` animation needs a background-image approach best defined in CSS directly. Add inside `@layer utilities`:

```css
@layer utilities {
  .shimmer {
    background: linear-gradient(
      90deg,
      hsl(var(--axon-100)) 25%,
      hsl(var(--axon-50))  50%,
      hsl(var(--axon-100)) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s linear infinite;
  }
  .dark .shimmer {
    background: linear-gradient(
      90deg,
      hsl(var(--axon-900)) 25%,
      hsl(var(--axon-600))  50%,
      hsl(var(--axon-900)) 75%
    );
    background-size: 200% 100%;
  }
}
```

### Step 2: Add keyframes to `tailwind.config.cjs`

Inside `theme.extend.keyframes`, add after existing entries:

```js
'pulse-glow': {
  '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
  '50%':      { opacity: '1',   transform: 'scale(1.05)' },
},
'fade-slide-in': {
  from: { opacity: '0', transform: 'translateY(-8px)' },
  to:   { opacity: '1', transform: 'translateY(0)' },
},
'ring-fill': {
  from: { 'stroke-dashoffset': '100' },
  to:   { 'stroke-dashoffset': 'var(--ring-fill-target, 0)' },
},
'particle-flow': {
  '0%':   { 'offset-distance': '0%',   opacity: '0' },
  '10%':  { opacity: '1' },
  '90%':  { opacity: '1' },
  '100%': { 'offset-distance': '100%', opacity: '0' },
},
shimmer: {
  from: { 'background-position': '200% 0' },
  to:   { 'background-position': '-200% 0' },
},
```

### Step 3: Add animation utilities to `tailwind.config.cjs`

Inside `theme.extend.animation`, add after existing entries:

```js
'pulse-glow':    'pulse-glow 2s ease-in-out infinite',
'fade-slide-in': 'fade-slide-in 300ms ease-out',
'ring-fill':     'ring-fill 800ms ease-out forwards',
'particle-flow': 'particle-flow 3s linear infinite',
shimmer:         'shimmer 1.5s linear infinite',
```

### Step 4: Verify

```bash
pnpm --filter @noema/ui build:css
```
Expected: exits 0.

### Step 5: Commit

```bash
git add packages/ui/src/styles/globals.css packages/ui/tailwind.config.cjs
git commit -m "feat(ui): animation tokens — pulse-glow, fade-slide-in, ring-fill, particle-flow, shimmer (T0.4)"
```

---

## Task 6: ThemeProvider + useTheme hook (T0.5)

**Files:**
- Create: `packages/ui/src/lib/theme.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/web/src/app/providers.tsx`

### Step 1: Write the unit test first

Create `packages/ui/src/lib/theme.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { ThemeProvider, useTheme } from './theme.js';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock document.documentElement.classList
const classListMock = {
  _classes: new Set<string>(),
  add: vi.fn((c: string) => classListMock._classes.add(c)),
  remove: vi.fn((c: string) => classListMock._classes.delete(c)),
  contains: (c: string) => classListMock._classes.has(c),
};
Object.defineProperty(document, 'documentElement', {
  value: { classList: classListMock },
  writable: true,
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ThemeProvider, { defaultTheme: 'dark' }, children);

describe('useTheme', () => {
  beforeEach(() => {
    localStorageMock.clear();
    classListMock._classes.clear();
    classListMock.add.mockClear();
    classListMock.remove.mockClear();
  });

  it('defaults to dark theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('setTheme updates theme and localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme('light'); });
    expect(result.current.theme).toBe('light');
    expect(localStorageMock.getItem('noema-theme')).toBe('light');
  });

  it('setTheme adds correct class to html element', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme('light'); });
    expect(classListMock.remove).toHaveBeenCalledWith('dark');
    expect(classListMock.add).toHaveBeenCalledWith('light');
  });

  it('toggleTheme switches between dark and light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe('light');
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe('dark');
  });

  it('serverTheme is ignored when localStorage has a value', () => {
    localStorageMock.setItem('noema-theme', 'light');
    const wrapperWithServer = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ThemeProvider, { serverTheme: 'dark', defaultTheme: 'dark' }, children);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapperWithServer });
    expect(result.current.theme).toBe('light');
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
pnpm --filter @noema/ui test
```
Expected: FAIL — `theme.ts` does not exist.

### Step 3: Implement `packages/ui/src/lib/theme.ts`

```typescript
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Theme from user API settings — used only when no localStorage value exists. */
  serverTheme?: Theme;
  /** Fallback when neither localStorage nor serverTheme is set. Defaults to 'dark'. */
  defaultTheme?: Theme;
  /** localStorage key. Defaults to 'noema-theme'. */
  storageKey?: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
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
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const stored = localStorage.getItem(storageKey) as Theme | null;
    // localStorage wins over serverTheme
    return stored ?? serverTheme ?? defaultTheme;
  });

  // Sync serverTheme changes (e.g. API settings loaded) — only when no local override
  useEffect(() => {
    if (!serverTheme) return;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      setThemeState(serverTheme);
    }
  }, [serverTheme, storageKey]);

  // Apply class to <html> whenever theme changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyTheme(resolved);
  }, [theme]);

  // Re-resolve on system preference change when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(resolveSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setThemeState(next);
    },
    [storageKey],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: resolveTheme(theme), setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
```

**Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @noema/ui test
```
Expected: all 5 tests PASS.

**Step 5: Export from `packages/ui/src/index.ts`**

Add at the bottom:
```typescript
// Theme
export { ThemeProvider, useTheme } from './lib/theme.js';
export type { Theme, ResolvedTheme, ThemeContextValue, ThemeProviderProps } from './lib/theme.js';
```

**Step 6: Wire ThemeProvider into `apps/web/src/app/providers.tsx`**

Read the file. The Provider needs `serverTheme`. Since `useMySettings` is a React Query hook, wrap carefully:

```tsx
'use client';

import { configureApiClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { ThemeProvider } from '@noema/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:8080/api',
  getAccessToken: () => useAuthStore.getState().accessToken,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

Note: `serverTheme` sync from API will be added in Phase 03 (State & Infrastructure) when the settings store is wired. For now, `defaultTheme="dark"` is sufficient.

**Step 7: Verify TypeScript**

```bash
pnpm --filter @noema/ui typecheck
pnpm --filter @noema/web typecheck
```
Expected: exits 0 for both.

**Step 8: Commit**

```bash
git add packages/ui/src/lib/theme.ts packages/ui/src/lib/theme.test.ts \
        packages/ui/src/index.ts apps/web/src/app/providers.tsx
git commit -m "feat(ui): ThemeProvider + useTheme hook — localStorage, dark default, server sync prop (T0.5)"
```

---

## Task 7: Token Gallery page (T0.6 + acceptance criterion)

**Files:**
- Create: `apps/web/src/app/(authenticated)/dev/tokens/page.tsx`

### Step 1: Create the token gallery page

```tsx
import { notFound } from 'next/navigation';

// Dev-only route — excluded from production builds
if (process.env.NODE_ENV === 'production') notFound();

// ─── Color data ───────────────────────────────────────────────────────────
const colorFamilies = [
  {
    name: 'synapse',
    label: 'Synapse — Synaptic Blue',
    description: 'Primary actions, active connections, brand accent',
  },
  {
    name: 'dendrite',
    label: 'Dendrite — Dendrite Violet',
    description: 'Knowledge graph nodes, deep learning states',
  },
  {
    name: 'myelin',
    label: 'Myelin — Myelin Gold',
    description: 'Mastery, confidence, review readiness',
  },
  {
    name: 'neuron',
    label: 'Neuron — Neural Green',
    description: 'Correct answers, healthy states, success',
  },
  {
    name: 'cortex',
    label: 'Cortex — Cortex Rose',
    description: 'Errors, misconceptions, destructive actions',
  },
  {
    name: 'axon',
    label: 'Axon — Axon Gray',
    description: 'Neutral surfaces, text hierarchy, borders',
  },
] as const;

const shades = [50, 100, 200, 400, 600, 900] as const;

const typographyTokens = [
  { cls: 'text-page-title',    label: 'page-title',    sample: 'Page Title — Deep Learning' },
  { cls: 'text-section-title', label: 'section-title', sample: 'Section: Spaced Repetition' },
  { cls: 'text-card-title',    label: 'card-title',    sample: 'Card: Hebbian Learning' },
  { cls: 'text-metric-value',  label: 'metric-value',  sample: '98.4' },
  { cls: 'text-metric-label',  label: 'metric-label',  sample: 'Retention Rate' },
  { cls: 'text-body',          label: 'body',          sample: 'Spaced repetition is a learning technique that incorporates increasing intervals of time between reviews of previously learned material.' },
  { cls: 'text-caption',       label: 'caption',       sample: 'Last reviewed 3 days ago · Due tomorrow' },
] as const;

const spacingTokens = [
  { cls: 'p-section',   label: '--space-section (1.5rem)',  },
  { cls: 'p-card-gap',  label: '--space-card-gap (1rem)',   },
  { cls: 'p-inset',     label: '--space-inset (1.5rem)',    },
  { cls: 'p-tight',     label: '--space-tight (0.5rem)',    },
] as const;

const animationTokens = [
  { cls: 'animate-pulse-glow',    label: 'pulse-glow',     description: 'Active session indicator' },
  { cls: 'animate-fade-slide-in', label: 'fade-slide-in',  description: 'Panel/card entrance' },
  { cls: 'animate-shimmer shimmer', label: 'shimmer',       description: 'Loading placeholder' },
  { cls: 'animate-spin-slow',     label: 'spin-slow',      description: 'Existing spinner (reference)' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────
export default function TokenGalleryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-inset space-y-section">
      <header>
        <h1 className="text-page-title text-synapse-400">
          Design Token Gallery — Phase 00 Synapse
        </h1>
        <p className="text-body text-axon-400 mt-tight">
          Dev-only · All tokens, all shades, both themes
        </p>
      </header>

      {/* Theme Toggle */}
      <ThemeToggleSection />

      {/* Color Swatches */}
      <section>
        <h2 className="text-section-title mb-card-gap">Color Families</h2>
        <div className="space-y-section">
          {colorFamilies.map((family) => (
            <div key={family.name}>
              <h3 className="text-card-title mb-tight">{family.label}</h3>
              <p className="text-caption mb-card-gap">{family.description}</p>
              <div className="flex gap-card-gap flex-wrap">
                {shades.map((shade) => (
                  <div key={shade} className="flex flex-col items-center gap-tight">
                    <div
                      className={`w-16 h-16 rounded-lg border border-border bg-${family.name}-${shade}`}
                    />
                    <span className="text-caption">{shade}</span>
                    <span className="text-caption font-mono text-[10px]">
                      {family.name}-{shade}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section>
        <h2 className="text-section-title mb-card-gap">Typography Scale</h2>
        <div className="space-y-card-gap border border-border rounded-lg p-inset">
          {typographyTokens.map((t) => (
            <div key={t.cls} className="flex flex-col gap-tight border-b border-border pb-card-gap last:border-0 last:pb-0">
              <span className="text-caption text-axon-400 font-mono">.{t.label}</span>
              <span className={t.cls}>{t.sample}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Spacing */}
      <section>
        <h2 className="text-section-title mb-card-gap">Spacing Tokens</h2>
        <div className="space-y-card-gap">
          {spacingTokens.map((s) => (
            <div key={s.cls} className="flex items-center gap-card-gap">
              <span className="text-caption font-mono w-48">{s.label}</span>
              <div className={`bg-synapse-400/30 border border-synapse-400 ${s.cls}`}>
                <span className="text-caption whitespace-nowrap">{s.cls}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Animations */}
      <section>
        <h2 className="text-section-title mb-card-gap">Animations</h2>
        <div className="flex flex-wrap gap-card-gap">
          {animationTokens.map((a) => (
            <div
              key={a.cls}
              className="flex flex-col items-center gap-tight border border-border rounded-lg p-inset"
            >
              <div
                className={`w-12 h-12 rounded-full bg-synapse-400 ${a.cls}`}
              />
              <span className="text-caption font-mono">{a.label}</span>
              <span className="text-caption text-axon-400">{a.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Client component for theme toggle ────────────────────────────────────
// Separate file in a real codebase, inlined here for simplicity
'use client';

import { useTheme } from '@noema/ui';

function ThemeToggleSection() {
  const { theme, toggleTheme } = useTheme();
  return (
    <section className="flex items-center gap-card-gap">
      <span className="text-body">Current theme: <strong>{theme}</strong></span>
      <button
        onClick={toggleTheme}
        className="px-inset py-tight rounded-lg bg-synapse-400 text-synapse-900 text-sm font-medium hover:bg-synapse-600 transition-colors"
      >
        Toggle Theme
      </button>
    </section>
  );
}
```

> **Note:** The `ThemeToggleSection` has `'use client'` — in Next.js App Router you cannot mix server and client directives in one file. Split it into `_theme-toggle.tsx` (client component) and import it in the server page component. The plan above co-locates for readability; during implementation, split into two files:
> - `apps/web/src/app/(authenticated)/dev/tokens/page.tsx` — server component (the main gallery)
> - `apps/web/src/app/(authenticated)/dev/tokens/_theme-toggle.tsx` — client component

**Step 2: Verify the page renders (dev server)**

```bash
pnpm --filter @noema/web dev
```
Navigate to `http://localhost:3000/dev/tokens`. Expected: gallery renders with color swatches, typography samples, spacing blocks, and animated boxes.

**Step 3: Verify production guard**

Set `NODE_ENV=production` temporarily and confirm the page returns 404 (or just trust the `notFound()` call — no automated test needed here).

**Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/dev/tokens/
git commit -m "feat(web): dev token gallery at /dev/tokens — all Phase 00 tokens visible (T0.6)"
```

---

## Task 8: Final build verification

**Step 1: Build all affected packages**

```bash
pnpm --filter @noema/ui build
pnpm --filter @noema/web build
pnpm --filter @noema/web-admin build
```
Expected: all three exit 0, no TypeScript errors, no Tailwind errors.

**Step 2: Run all tests**

```bash
pnpm --filter @noema/ui test
```
Expected: 5 ThemeProvider tests pass.

**Step 3: Final commit (if any residual changes)**

```bash
git add -A
git commit -m "chore(ui): phase 00 complete — design tokens, animations, typography, theme provider"
```

---

## Acceptance Checklist

- [ ] `dark` class on `<html>` activates dark palette; removing it activates light
- [ ] All 6 color families × 6 shades resolve in both themes without build errors
- [ ] All existing shadcn-based components (Button, Card, Input, Alert) render identically
- [ ] `pnpm build` succeeds across `@noema/ui`, `@noema/web`, `@noema/web-admin`
- [ ] `/dev/tokens` gallery shows all swatches, typography, spacing, and animations
- [ ] Theme toggle on `/dev/tokens` switches theme and persists to localStorage
- [ ] 5 ThemeProvider unit tests pass
