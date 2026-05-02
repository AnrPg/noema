/**
 * Session Store — Active learning session working memory.
 *
 * Holds ephemeral state for a single review session.
 * Not persisted — cleared when the user navigates away.
 */

import type { ISessionDto, IStepLoopSnapshotDto } from '@noema/api-client/session';
import { create } from 'zustand';

// ============================================================================
// State Shape
// ============================================================================

interface ISessionPendingEvaluation {
  confidenceBefore?: number;
  confidenceAfter?: number;
  dwellTimeMs?: number;
}

interface ISessionState {
  activeSession: ISessionDto | null;
  completedStepCount: number;
  queue: IStepLoopSnapshotDto | null;
  pendingEvaluation: ISessionPendingEvaluation | null;
  elapsedTime: number;
  isPaused: boolean;
}

// ============================================================================
// Actions
// ============================================================================

interface ISessionActions {
  setSession: (session: ISessionDto) => void;
  advanceStep: () => void;
  setConfidenceBefore: (confidence: number) => void;
  setConfidenceAfter: (confidence: number) => void;
  recordDwellTime: (ms: number) => void;
  setIsPaused: (paused: boolean) => void;
  resetEvaluation: () => void;
  tickElapsedTime: () => void;
  clear: () => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState: ISessionState = {
  activeSession: null,
  completedStepCount: 0,
  queue: null,
  pendingEvaluation: null,
  elapsedTime: 0,
  isPaused: false,
};

export const useSessionStore = create<ISessionState & ISessionActions>()((set) => ({
  ...initialState,

  setSession: (session) => {
    set({
      activeSession: session,
      completedStepCount: session.stats.stepsEvaluated + session.stats.stepsSkipped,
    });
  },

  advanceStep: () => {
    set((s) => ({
      completedStepCount: s.completedStepCount + 1,
      pendingEvaluation: null,
      elapsedTime: 0,
    }));
  },

  setConfidenceBefore: (confidence) => {
    set((s) => ({
      pendingEvaluation: { ...s.pendingEvaluation, confidenceBefore: confidence },
    }));
  },

  setConfidenceAfter: (confidence) => {
    set((s) => ({
      pendingEvaluation: { ...s.pendingEvaluation, confidenceAfter: confidence },
    }));
  },

  recordDwellTime: (ms) => {
    set((s) => ({
      pendingEvaluation: { ...s.pendingEvaluation, dwellTimeMs: ms },
    }));
  },

  setIsPaused: (paused) => {
    set({ isPaused: paused });
  },

  resetEvaluation: () => {
    set({ pendingEvaluation: null, elapsedTime: 0 });
  },

  tickElapsedTime: () => {
    set((s) => ({ elapsedTime: s.elapsedTime + 1000 }));
  },

  clear: () => {
    set(initialState);
  },
}));
