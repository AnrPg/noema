/**
 * Session Store — Active learning session working memory.
 *
 * Holds ephemeral state for a single review session.
 * Not persisted — cleared when the user navigates away.
 */

import type { ISessionDto, ISessionQueueDto } from '@noema/api-client/session';
import { create } from 'zustand';

// ============================================================================
// State Shape
// ============================================================================

interface ISessionPendingAttempt {
  confidenceBefore?: number;
  confidenceAfter?: number;
  dwellTimeMs?: number;
}

interface ISessionState {
  activeSession: ISessionDto | null;
  completedCardCount: number;
  queue: ISessionQueueDto | null;
  pendingAttempt: ISessionPendingAttempt | null;
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
  tickElapsedTime: () => void;
  clear: () => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState: ISessionState = {
  activeSession: null,
  completedCardCount: 0,
  queue: null,
  pendingAttempt: null,
  elapsedTime: 0,
  isPaused: false,
};

export const useSessionStore = create<ISessionState & ISessionActions>()((set) => ({
  ...initialState,

  setSession: (session) => {
    set({ activeSession: session, completedCardCount: session.currentCardIndex });
  },

  advanceCard: () => {
    set((s) => ({
      completedCardCount: s.completedCardCount + 1,
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

  tickElapsedTime: () => {
    set((s) => ({ elapsedTime: s.elapsedTime + 1000 }));
  },

  clear: () => {
    set(initialState);
  },
}));
