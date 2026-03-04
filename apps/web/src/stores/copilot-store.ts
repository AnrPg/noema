/**
 * Copilot Store — Cognitive Copilot sidebar state.
 * isOpen is persisted to localStorage; hints are ephemeral.
 */

import type { IAgentHints } from '@noema/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
      partialize: (state) => ({ isOpen: state.isOpen }),
    }
  )
);
