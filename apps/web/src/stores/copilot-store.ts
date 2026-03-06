/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
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
          const existingActionIds = new Set(
            existing.flatMap((h) => h.suggestedNextActions.map((a: ISuggestedAction) => a.action))
          );
          const hasNew = hints.suggestedNextActions.some(
            (a: ISuggestedAction) => !existingActionIds.has(a.action)
          );
          if (!hasNew) return s;

          // Count new critical/high actions for the unread badge
          const newHighCount = !s.isOpen
            ? hints.suggestedNextActions.filter(
                (a: ISuggestedAction) => a.priority === 'critical' || a.priority === 'high'
              ).length
            : 0;

          return {
            hintsByPage: { ...s.hintsByPage, [pageKey]: [...existing, hints] },
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
