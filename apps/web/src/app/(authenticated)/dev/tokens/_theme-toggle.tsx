'use client';

import type { JSX } from 'react';
import { useTheme } from '@noema/ui';

export function ThemeToggleSection(): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  return (
    <section className="flex items-center gap-4">
      <span className="text-body">
        Current theme: <strong>{theme}</strong>
      </span>
      <button
        onClick={toggleTheme}
        className="px-4 py-2 rounded-lg bg-synapse-400 text-synapse-900 text-sm font-medium hover:bg-synapse-600 transition-colors"
        type="button"
      >
        Toggle Theme
      </button>
    </section>
  );
}
