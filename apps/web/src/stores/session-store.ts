/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/**
 * Session Store — Active learning session working memory.
 *
 * Holds ephemeral state for a single review session.
 * Not persisted — cleared when the user navigates away.
 *
 * Note: The eslint-disable directives above suppress rules that fire because
 * the @noema/api-client package has not been built yet (no dist/ directory).
 * Once packages are built these suppressions should be removed.
 */

import type { IAttemptInput, ISessionDto, ISessionQueueDto } from '@noema/api-client/session';
import { create } from 'zustand';

// ============================================================================
// State Shape
// ============================================================================

interface ISessionState {
  activeSession: ISessionDto | null;
  currentCardIndex: number;
  queue: ISessionQueueDto | null;
  pendingAttempt: Partial<IAttemptInput> | null;
  elapsedTime: number;
  isPaused: boolean;
}

// ============================================================================
// Actions
// ============================================================================

interface ISessionActions {
  setSession: (session: ISessionDto) => void;
  advanceCard: () => void;
  setConfidenceBefore: (confidence: number) => void;
  setConfidenceAfter: (confidence: number) => void;
  recordDwellTime: (ms: number) => void;
  setIsPaused: (paused: boolean) => void;
  resetAttempt: () => void;
  clear: () => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState: ISessionState = {
  activeSession: null,
  currentCardIndex: 0,
  queue: null,
  pendingAttempt: null,
  elapsedTime: 0,
  isPaused: false,
};

export const useSessionStore = create<ISessionState & ISessionActions>()((set) => ({
  ...initialState,

  setSession: (session) => {
    set({ activeSession: session, currentCardIndex: session.currentCardIndex });
  },

  advanceCard: () => {
    set((s) => ({
      currentCardIndex: s.currentCardIndex + 1,
      pendingAttempt: null,
      elapsedTime: 0,
    }));
  },

  setConfidenceBefore: (confidence) => {
    set((s) => ({
      pendingAttempt: { ...s.pendingAttempt, confidenceBefore: confidence },
    }));
  },

  setConfidenceAfter: (confidence) => {
    set((s) => ({
      pendingAttempt: { ...s.pendingAttempt, confidenceAfter: confidence },
    }));
  },

  recordDwellTime: (ms) => {
    set((s) => ({
      pendingAttempt: { ...s.pendingAttempt, dwellTimeMs: ms },
    }));
  },

  setIsPaused: (paused) => {
    set({ isPaused: paused });
  },

  resetAttempt: () => {
    set({ pendingAttempt: null, elapsedTime: 0 });
  },

  clear: () => {
    set(initialState);
  },
}));
