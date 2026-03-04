/**
 * Copilot Store — Cognitive Copilot sidebar state.
 *
 * Tracks sidebar open/close (persisted) and per-page hints (ephemeral).
 */

import type { IAgentHints } from '@noema/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ============================================================================
// State + Actions
// ============================================================================

interface ICopilotState {
  isOpen: boolean;
  hintsByPage: Record<string, IAgentHints[]>;
  activePageKey: string;
}

interface ICopilotActions {
  toggle: () => void;
  open: () => void;
  close: () => void;
  pushHints: (pageKey: string, hints: IAgentHints) => void;
  clearPage: (pageKey: string) => void;
  setActivePage: (pageKey: string) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useCopilotStore = create<ICopilotState & ICopilotActions>()(
  persist(
    (set) => ({
      isOpen: false,
      hintsByPage: {},
      activePageKey: '/',

      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),

      pushHints: (pageKey, hints) =>
        set((s) => {
          const existing = s.hintsByPage[pageKey] ?? [];
          // Deduplicate: skip if all action IDs from incoming hints are already present
          const existingActionIds = new Set(
            existing.flatMap((h) => h.suggestedNextActions.map((a) => a.action))
          );
          const hasNew = hints.suggestedNextActions.some((a) => !existingActionIds.has(a.action));
          if (!hasNew) return s;
          return { hintsByPage: { ...s.hintsByPage, [pageKey]: [...existing, hints] } };
        }),

      clearPage: (pageKey) =>
        set((s) => {
          const { [pageKey]: _removed, ...rest } = s.hintsByPage;
          return { hintsByPage: rest };
        }),

      setActivePage: (pageKey) => set({ activePageKey: pageKey }),
    }),
    {
      name: 'noema-copilot',
      storage: createJSONStorage(() => localStorage),
      // Only persist sidebar open/close preference
      partialize: (state) => ({ isOpen: state.isOpen }),
    }
  )
);
