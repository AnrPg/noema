// =============================================================================
// DECK & ORGANIZATION TYPES
// =============================================================================
// Decks are collections of cards with shared settings and metadata.
// They support hierarchical organization (nested decks) and tags.

import type { DeckId, UserId, CardId, TagId, PluginId } from './user.types';
import type { SchedulerType, SchedulerConfig } from './scheduler.types';

/**
 * A deck (collection) of flashcards with shared settings.
 * Decks can be nested to create hierarchies (e.g., "Languages::Spanish::Vocab")
 */
export interface Deck {
  readonly id: DeckId;
  readonly userId: UserId;
  readonly name: string;
  readonly description: string | null;
  
  // Hierarchy
  readonly parentId: DeckId | null;             // Null for root-level decks
  readonly path: string;                        // Full path: "Parent::Child::Grandchild"
  readonly depth: number;                       // 0 for root, 1 for child, etc.
  
  // Appearance
  readonly color: string;                       // Hex color for visual identification
  readonly icon: string | null;                 // Emoji or icon name
  readonly coverImageUrl: string | null;
  
  // Settings (can override user defaults)
  readonly settings: DeckSettings;
  
  // Statistics (aggregated from cards)
  readonly stats: DeckStats;
  
  // Metadata
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastStudiedAt: Date | null;
  
  // Sharing & Collaboration
  readonly isPublic: boolean;
  readonly isShared: boolean;
  readonly shareCode: string | null;            // For sharing with link
  readonly collaborators: readonly DeckCollaborator[];
  
  // Source tracking
  readonly sourcePlugin: PluginId | null;       // If created by a plugin
  readonly importSource: string | null;         // If imported from file/URL
  
  // Flags
  readonly isArchived: boolean;
  readonly isPinned: boolean;
}

/**
 * Deck-specific settings that can override user defaults
 */
export interface DeckSettings {
  // Scheduling
  readonly scheduler: SchedulerType | null;     // Null = use user default
  readonly schedulerConfig: Partial<SchedulerConfig> | null;
  readonly targetRetention: number | null;      // Override user's target
  
  // Daily limits
  readonly maxNewCardsPerDay: number | null;
  readonly maxReviewsPerDay: number | null;
  
  // Learning steps (for new/relearning cards)
  readonly learningSteps: readonly number[];    // Minutes: [1, 10, 60, 1440]
  readonly relearnSteps: readonly number[];     // Steps for relearning
  readonly graduatingInterval: number;          // Days for first review after learning
  readonly easyInterval: number;                // Days for "easy" first review
  
  // Card order
  readonly newCardOrder: 'sequential' | 'random';
  readonly reviewOrder: 'due_date' | 'random' | 'difficulty' | 'relative_overdueness';
  readonly newCardPosition: 'front' | 'back' | 'mixed';
  
  // Interleaving (research-backed: mixing topics improves retention)
  readonly interleavingEnabled: boolean;
  readonly interleavingRatio: number;           // 0-1, how much to mix
  
  // Lapse handling
  readonly lapseThreshold: number;              // Lapses before marking as leech
  readonly leechAction: 'suspend' | 'tag' | 'notify';
  
  // Audio/TTS
  readonly autoPlayAudio: boolean;
  readonly ttsEnabled: boolean;
  readonly ttsVoice: string | null;
}

/**
 * Default deck settings
 */
export const DEFAULT_DECK_SETTINGS: DeckSettings = {
  scheduler: null,
  schedulerConfig: null,
  targetRetention: null,
  maxNewCardsPerDay: null,
  maxReviewsPerDay: null,
  learningSteps: [1, 10],                       // 1 min, 10 min
  relearnSteps: [10],                           // 10 min
  graduatingInterval: 1,                        // 1 day
  easyInterval: 4,                              // 4 days
  newCardOrder: 'sequential',
  reviewOrder: 'due_date',
  newCardPosition: 'mixed',
  interleavingEnabled: false,
  interleavingRatio: 0.3,
  lapseThreshold: 8,
  leechAction: 'tag',
  autoPlayAudio: true,
  ttsEnabled: false,
  ttsVoice: null,
} as const;

/**
 * Aggregated statistics for a deck
 */
export interface DeckStats {
  readonly totalCards: number;
  readonly newCards: number;
  readonly learningCards: number;
  readonly reviewCards: number;
  readonly dueCards: number;                    // Cards due today
  readonly suspendedCards: number;
  readonly leechCards: number;
  
  // Performance
  readonly averageRetention: number;
  readonly averageAccuracy: number;
  readonly averageDifficulty: number;
  readonly averageStability: number;
  
  // Time
  readonly totalStudyTime: number;              // Minutes
  readonly averageTimePerCard: number;          // Seconds
  readonly estimatedTimeToReview: number;       // Minutes for today's reviews
  
  // Progress
  readonly masteredCards: number;               // Stability > 90 days
  readonly youngCards: number;                  // Stability < 21 days
  readonly matureCards: number;                 // Stability > 21 days
}

/**
 * A collaborator on a shared deck
 */
export interface DeckCollaborator {
  readonly userId: UserId;
  readonly role: 'viewer' | 'editor' | 'admin';
  readonly addedAt: Date;
  readonly addedBy: UserId;
}

// =============================================================================
// TAG TYPES
// =============================================================================

/**
 * A tag for organizing cards across decks
 */
export interface Tag {
  readonly id: TagId;
  readonly userId: UserId;
  readonly name: string;                        // e.g., "important", "hard", "review-later"
  readonly color: string;
  readonly description: string | null;
  readonly parentId: TagId | null;              // For hierarchical tags
  readonly cardCount: number;
  readonly createdAt: Date;
}

/**
 * Built-in system tags
 */
export const SYSTEM_TAGS = {
  LEECH: 'system:leech',
  SUSPENDED: 'system:suspended',
  MARKED: 'system:marked',
  NEW: 'system:new',
  LEARNING: 'system:learning',
  REVIEW: 'system:review',
} as const;

// =============================================================================
// STUDY SESSION TYPES
// =============================================================================

/**
 * A study session - a period of active learning
 */
export interface StudySession {
  readonly id: string;
  readonly userId: UserId;
  readonly deckId: DeckId | null;               // Null for mixed/custom sessions
  readonly deckIds: readonly DeckId[];          // All decks included
  
  // Timing
  readonly startedAt: Date;
  readonly endedAt: Date | null;                // Null if in progress
  readonly duration: number;                    // Minutes
  readonly activeTime: number;                  // Minutes actually studying (excludes breaks)
  
  // Cards reviewed
  readonly cardsStudied: number;
  readonly newCardsStudied: number;
  readonly reviewCardsStudied: number;
  
  // Performance
  readonly correctCount: number;
  readonly againCount: number;
  readonly hardCount: number;
  readonly goodCount: number;
  readonly easyCount: number;
  
  // Detailed reviews (for replay/analysis)
  readonly reviews: readonly ReviewRecord[];
  
  // Context
  readonly device: 'mobile' | 'tablet' | 'desktop' | 'web';
  readonly platform: 'ios' | 'android' | 'web' | 'desktop';
  readonly appVersion: string;
  
  // Session type
  readonly sessionType: SessionType;
  readonly settings: SessionSettings;
}

/**
 * Types of study sessions
 */
export type SessionType =
  | 'standard'           // Normal review session
  | 'cram'               // Review all cards regardless of due date
  | 'custom'             // Custom filtered session
  | 'preview'            // Browse without affecting SRS
  | 'test'               // Practice test mode
  | 'challenge';         // Gamified challenge session

/**
 * Settings for a study session
 */
export interface SessionSettings {
  readonly cardLimit: number | null;            // Max cards to review
  readonly timeLimit: number | null;            // Max minutes
  readonly newCardLimit: number | null;
  readonly reviewLimit: number | null;
  readonly includeNew: boolean;
  readonly includeReview: boolean;
  readonly includeOverdue: boolean;
  readonly shuffleCards: boolean;
  readonly showTimer: boolean;
  readonly enableUndo: boolean;
}

/**
 * A single review within a session
 */
export interface ReviewRecord {
  readonly id: string;
  readonly cardId: CardId;
  readonly timestamp: Date;
  
  // User response
  readonly rating: Rating;
  readonly responseTime: number;                // Milliseconds
  readonly confidence: number | null;           // If using confidence cards
  
  // State changes
  readonly previousState: {
    readonly stability: number;
    readonly difficulty: number;
    readonly state: string;
    readonly dueDate: Date;
  };
  readonly newState: {
    readonly stability: number;
    readonly difficulty: number;
    readonly state: string;
    readonly dueDate: Date;
    readonly interval: number;
  };
  
  // Context
  readonly wasRevealed: boolean;                // Did user flip to see answer
  readonly hintUsed: boolean;
  readonly undoCount: number;                   // Times undone before final answer
  
  // For metacognition tracking
  readonly reflectionNote: string | null;       // "Why did I forget this?"
}
