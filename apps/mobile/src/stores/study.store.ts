// =============================================================================
// STUDY STORE
// =============================================================================

import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'study-storage' });

interface Card {
  id: string;
  deckId: string;
  type: string;
  front: string;
  back: string;
  stability: number;
  difficulty: number;
  state: string;
  nextReviewDate?: Date;
}

interface StudySession {
  id: string;
  deckId?: string;
  startTime: Date;
  cards: Card[];
  currentIndex: number;
  reviews: Review[];
}

interface Review {
  cardId: string;
  rating: number;
  responseTimeMs: number;
  timestamp: Date;
}

interface StudyState {
  currentSession: StudySession | null;
  pendingReviews: Review[];
  offlineMode: boolean;
  
  // Actions
  startSession: (cards: Card[], deckId?: string) => string;
  endSession: () => void;
  recordReview: (cardId: string, rating: number, responseTimeMs: number) => void;
  getCurrentCard: () => Card | null;
  nextCard: () => void;
  previousCard: () => void;
  setOfflineMode: (offline: boolean) => void;
  syncPendingReviews: () => Promise<void>;
  getSessionStats: () => {
    total: number;
    reviewed: number;
    correct: number;
    remaining: number;
  };
}

export const useStudyStore = create<StudyState>((set, get) => ({
  currentSession: null,
  pendingReviews: [],
  offlineMode: false,
  
  startSession: (cards, deckId) => {
    const sessionId = `session_${Date.now()}`;
    set({
      currentSession: {
        id: sessionId,
        deckId,
        startTime: new Date(),
        cards,
        currentIndex: 0,
        reviews: [],
      },
    });
    return sessionId;
  },
  
  endSession: () => {
    const { currentSession, pendingReviews } = get();
    if (currentSession) {
      // Save reviews to pending if offline
      const offlineReviews = currentSession.reviews.map((r) => ({
        ...r,
        sessionId: currentSession.id,
      }));
      
      // Store offline reviews for later sync
      const existing = storage.getString('pending-reviews');
      const allPending = existing ? JSON.parse(existing) : [];
      storage.set('pending-reviews', JSON.stringify([...allPending, ...offlineReviews]));
    }
    
    set({ currentSession: null });
  },
  
  recordReview: (cardId, rating, responseTimeMs) => {
    const { currentSession } = get();
    if (!currentSession) return;
    
    const review: Review = {
      cardId,
      rating,
      responseTimeMs,
      timestamp: new Date(),
    };
    
    set({
      currentSession: {
        ...currentSession,
        reviews: [...currentSession.reviews, review],
      },
    });
  },
  
  getCurrentCard: () => {
    const { currentSession } = get();
    if (!currentSession || currentSession.currentIndex >= currentSession.cards.length) {
      return null;
    }
    return currentSession.cards[currentSession.currentIndex];
  },
  
  nextCard: () => {
    const { currentSession } = get();
    if (!currentSession) return;
    
    set({
      currentSession: {
        ...currentSession,
        currentIndex: Math.min(
          currentSession.currentIndex + 1,
          currentSession.cards.length
        ),
      },
    });
  },
  
  previousCard: () => {
    const { currentSession } = get();
    if (!currentSession) return;
    
    set({
      currentSession: {
        ...currentSession,
        currentIndex: Math.max(0, currentSession.currentIndex - 1),
      },
    });
  },
  
  setOfflineMode: (offline) => {
    set({ offlineMode: offline });
  },
  
  syncPendingReviews: async () => {
    const pendingStr = storage.getString('pending-reviews');
    if (!pendingStr) return;
    
    const pending = JSON.parse(pendingStr);
    if (pending.length === 0) return;
    
    try {
      // TODO: Implement actual sync with API
      // await apiClient.post('/reviews/batch', { reviews: pending });
      storage.delete('pending-reviews');
      set({ pendingReviews: [] });
    } catch (error) {
      console.error('Failed to sync reviews:', error);
    }
  },
  
  getSessionStats: () => {
    const { currentSession } = get();
    if (!currentSession) {
      return { total: 0, reviewed: 0, correct: 0, remaining: 0 };
    }
    
    const reviewed = currentSession.reviews.length;
    const correct = currentSession.reviews.filter((r) => r.rating >= 3).length;
    
    return {
      total: currentSession.cards.length,
      reviewed,
      correct,
      remaining: currentSession.cards.length - reviewed,
    };
  },
}));
