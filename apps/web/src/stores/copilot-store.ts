/**
 * Copilot Store — Cognitive Copilot sidebar state.
 *
 * Tracks sidebar open/close (persisted) and per-page hints (ephemeral).
 * Enhanced in Phase 10 with freshness tracking and expiry animation state.
 */

import type { IAgentHints, ISuggestedAction } from '@noema/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ============================================================================
// State + Actions
// ============================================================================

interface ICopilotState {
  isOpen: boolean;
  hintsByPage: Record<string, IAgentHints[]>;
  activePageKey: string;
  /** Timestamp (Date.now()) of most recent pushHints call per page */
  lastReceivedAt: Record<string, number>;
  /** Pages currently in expiry fade-out animation (cleared after animation) */
  expiringPages: Set<string>;
  /** Count of unread high-priority (critical/high) actions accumulated while sidebar is closed */
  unreadHighCount: number;
}

interface ICopilotActions {
  toggle: () => void;
  open: () => void;
  close: () => void;
  pushHints: (pageKey: string, hints: IAgentHints) => void;
  clearPage: (pageKey: string) => void;
  setActivePage: (pageKey: string) => void;
  markPageExpiring: (pageKey: string) => void;
  clearUnread: () => void;
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
      lastReceivedAt: {},
      expiringPages: new Set<string>(),
      unreadHighCount: 0,

      toggle: () =>
        set((s) => ({ isOpen: !s.isOpen, unreadHighCount: !s.isOpen ? 0 : s.unreadHighCount })),
      open: () => set({ isOpen: true, unreadHighCount: 0 }),
      close: () => set({ isOpen: false }),

      pushHints: (pageKey, hints) =>
        set((s) => {
          const existing = s.hintsByPage[pageKey] ?? [];
          // Build a map from action ID → action for O(1) lookup of both existence and current values
          const existingActionsMap = new Map<string, ISuggestedAction>(
            existing.flatMap((h) =>
              h.suggestedNextActions.map((a: ISuggestedAction) => [a.action, a] as const)
            )
          );
          const hasNew = hints.suggestedNextActions.some(
            (a: ISuggestedAction) => !existingActionsMap.has(a.action)
          );
          // Also trigger update if an existing action's confidence or priority changed
          const hasUpdated = hints.suggestedNextActions.some((a: ISuggestedAction) => {
            const prev = existingActionsMap.get(a.action);
            return (
              prev !== undefined &&
              (prev.confidence !== a.confidence || prev.priority !== a.priority)
            );
          });
          if (!hasNew && !hasUpdated) return s;

          // Count new critical/high actions for the unread badge
          const newHighCount = !s.isOpen
            ? hints.suggestedNextActions.filter(
                (a: ISuggestedAction) => a.priority === 'critical' || a.priority === 'high'
              ).length
            : 0;

          return {
            hintsByPage: {
              ...s.hintsByPage,
              [pageKey]: [...existing, hints].slice(-10),
            },
            lastReceivedAt: { ...s.lastReceivedAt, [pageKey]: Date.now() },
            unreadHighCount: s.unreadHighCount + newHighCount,
            // Clear expiring state for this page since we just received fresh hints
            expiringPages: new Set([...s.expiringPages].filter((k) => k !== pageKey)),
          };
        }),

      clearPage: (pageKey) =>
        set((s) => {
          const { [pageKey]: _r, ...restHints } = s.hintsByPage;
          const { [pageKey]: _rTs, ...restTs } = s.lastReceivedAt;
          const newExpiring = new Set([...s.expiringPages].filter((k) => k !== pageKey));
          return { hintsByPage: restHints, lastReceivedAt: restTs, expiringPages: newExpiring };
        }),

      setActivePage: (pageKey) => set({ activePageKey: pageKey }),

      markPageExpiring: (pageKey) =>
        set((s) => ({ expiringPages: new Set([...s.expiringPages, pageKey]) })),

      clearUnread: () => set({ unreadHighCount: 0 }),
    }),
    {
      name: 'noema-copilot',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ isOpen: state.isOpen }),
    }
  )
);
