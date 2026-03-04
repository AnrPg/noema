/**
 * Session Store — Active learning session working memory.
 * Not persisted — ephemeral.
 */

import type { IAttemptInput, ISessionDto, ISessionQueueDto } from '@noema/api-client/session';
import { create } from 'zustand';

interface ISessionState {
  activeSession: ISessionDto | null;
  currentCardIndex: number;
  queue: ISessionQueueDto | null;
  pendingAttempt: Partial<IAttemptInput> | null;
  elapsedTime: number;
  isPaused: boolean;
}

interface ISessionActions {
  setSession: (session: ISessionDto) => void;
  advanceCard: () => void;
  setConfidenceBefore: (confidence: number) => void;
  setConfidenceAfter: (confidence: number) => void;
  recordDwellTime: (ms: number) => void;
  resetAttempt: () => void;
  clear: () => void;
}

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

  resetAttempt: () => {
    set({ pendingAttempt: null, elapsedTime: 0 });
  },

  clear: () => {
    set(initialState);
  },
}));
