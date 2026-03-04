/**
 * @noema/ui
 *
 * Shared UI components for Noema web applications.
 */

// Utilities
export { cn } from './lib/utils.js';

// Primitives
export * from './primitives/index.js';

// Forms
export * from './forms/index.js';

// Layouts
export * from './layouts/index.js';

// Theme
export { ThemeProvider, useTheme } from './lib/theme.js';
export type {
  Theme,
  ResolvedTheme,
  IThemeContextValue,
  IThemeProviderProps,
  ThemeContextValue,
  ThemeProviderProps,
} from './lib/theme.js';

// Data Display
export * from './data-display/index.js';

// Feedback
export * from './feedback/index.js';

// Shared types
export type { ColorFamily } from './lib/types.js';
