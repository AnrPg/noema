// =============================================================================
// API TYPES - Request/Response structures for the backend API
// =============================================================================

import type {
  UserId, DeckId, CardId, TagId, PluginId, SessionId,
} from './user.types';
import type { Card, CardContent, Rating } from './card.types';
import type { Deck, StudySession } from './deck.types';
import type { SchedulerType } from './scheduler.types';

// =============================================================================
// COMMON API TYPES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface APIResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: APIError | null;
  readonly meta: APIMeta;
}

/**
 * API error structure
 */
export interface APIError {
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown> | null;
  readonly field: string | null;                // For validation errors
}

/**
 * API metadata
 */
export interface APIMeta {
  readonly requestId: string;
  readonly timestamp: Date;
  readonly duration: number;                    // Milliseconds
  readonly version: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
  readonly sortBy: string | null;
  readonly sortOrder: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

// =============================================================================
// AUTHENTICATION API
// =============================================================================

/**
 * Login request
 */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly rememberMe: boolean;
}

/**
 * Login response
 */
export interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: UserDTO;
}

/**
 * Register request
 */
export interface RegisterRequest {
  readonly email: string;
  readonly username: string;
  readonly password: string;
  readonly displayName: string;
}

/**
 * OAuth login request
 */
export interface OAuthLoginRequest {
  readonly provider: 'google' | 'apple' | 'github';
  readonly idToken: string;
  readonly accessToken: string | null;
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  readonly refreshToken: string;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  readonly email: string;
}

// =============================================================================
// USER API
// =============================================================================

/**
 * User data transfer object (returned from API)
 */
export interface UserDTO {
  readonly id: UserId;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly subscription: string;
  readonly createdAt: string;                   // ISO date string
  readonly stats: UserStatsDTO;
}

/**
 * User statistics DTO
 */
export interface UserStatsDTO {
  readonly totalCards: number;
  readonly totalDecks: number;
  readonly totalReviews: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly xp: number;
  readonly level: number;
}

/**
 * Update user profile request
 */
export interface UpdateProfileRequest {
  readonly displayName?: string;
  readonly username?: string;
  readonly avatarUrl?: string;
}

/**
 * Update preferences request
 */
export interface UpdatePreferencesRequest {
  readonly theme?: 'light' | 'dark' | 'system';
  readonly language?: string;
  readonly defaultScheduler?: SchedulerType;
  readonly targetRetention?: number;
  readonly maxNewCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
  readonly dailyReminder?: boolean;
  readonly reminderTime?: string;
}

// =============================================================================
// DECK API
// =============================================================================

/**
 * Deck DTO
 */
export interface DeckDTO {
  readonly id: DeckId;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: DeckId | null;
  readonly path: string;
  readonly color: string;
  readonly icon: string | null;
  readonly coverImageUrl: string | null;
  readonly isPublic: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stats: DeckStatsDTO;
}

/**
 * Deck statistics DTO
 */
export interface DeckStatsDTO {
  readonly totalCards: number;
  readonly newCards: number;
  readonly dueCards: number;
  readonly learningCards: number;
  readonly reviewCards: number;
  readonly averageRetention: number;
}

/**
 * Create deck request
 */
export interface CreateDeckRequest {
  readonly name: string;
  readonly description?: string;
  readonly parentId?: DeckId;
  readonly color?: string;
  readonly icon?: string;
}

/**
 * Update deck request
 */
export interface UpdateDeckRequest {
  readonly name?: string;
  readonly description?: string;
  readonly parentId?: DeckId | null;
  readonly color?: string;
  readonly icon?: string;
  readonly coverImageUrl?: string;
  readonly isPublic?: boolean;
}

/**
 * Deck settings update request
 */
export interface UpdateDeckSettingsRequest {
  readonly scheduler?: SchedulerType;
  readonly targetRetention?: number;
  readonly maxNewCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
  readonly learningSteps?: readonly number[];
  readonly relearnSteps?: readonly number[];
  readonly newCardOrder?: 'sequential' | 'random';
  readonly reviewOrder?: string;
  readonly interleavingEnabled?: boolean;
}

// =============================================================================
// CARD API
// =============================================================================

/**
 * Card DTO (lightweight, for lists)
 */
export interface CardSummaryDTO {
  readonly id: CardId;
  readonly deckId: DeckId;
  readonly type: string;
  readonly preview: string;                     // Short preview text
  readonly tags: readonly string[];
  readonly state: string;
  readonly dueDate: string | null;
  readonly stability: number;
  readonly difficulty: number;
}

/**
 * Full card DTO (with all content)
 */
export interface CardDTO {
  readonly id: CardId;
  readonly deckId: DeckId;
  readonly content: CardContent;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly srsState: CardSRSStateDTO;
  readonly stats: CardStatsDTO;
  readonly isSuspended: boolean;
  readonly isBuried: boolean;
  readonly isLeech: boolean;
}

/**
 * Card SRS state DTO
 */
export interface CardSRSStateDTO {
  readonly stability: number;
  readonly difficulty: number;
  readonly elapsedDays: number;
  readonly scheduledDays: number;
  readonly retrievability: number;
  readonly dueDate: string;
  readonly state: string;
  readonly lastReviewDate: string | null;
}

/**
 * Card statistics DTO
 */
export interface CardStatsDTO {
  readonly totalReviews: number;
  readonly correctReviews: number;
  readonly averageResponseTime: number;
  readonly streakCurrent: number;
  readonly lapseCount: number;
}

/**
 * Create card request
 */
export interface CreateCardRequest {
  readonly deckId: DeckId;
  readonly content: CardContent;
  readonly tags?: readonly string[];
}

/**
 * Bulk create cards request
 */
export interface BulkCreateCardsRequest {
  readonly deckId: DeckId;
  readonly cards: readonly {
    readonly content: CardContent;
    readonly tags?: readonly string[];
  }[];
}

/**
 * Update card request
 */
export interface UpdateCardRequest {
  readonly content?: CardContent;
  readonly tags?: readonly string[];
  readonly isSuspended?: boolean;
  readonly deckId?: DeckId;
}

/**
 * Card filter for queries
 */
export interface CardFilter {
  readonly deckId?: DeckId;
  readonly deckIds?: readonly DeckId[];
  readonly types?: readonly string[];
  readonly states?: readonly string[];
  readonly tags?: readonly string[];
  readonly isDue?: boolean;
  readonly isSuspended?: boolean;
  readonly isLeech?: boolean;
  readonly search?: string;
  readonly minDifficulty?: number;
  readonly maxDifficulty?: number;
  readonly minStability?: number;
  readonly maxStability?: number;
}

// =============================================================================
// STUDY SESSION API
// =============================================================================

/**
 * Start study session request
 */
export interface StartSessionRequest {
  readonly deckId?: DeckId;
  readonly deckIds?: readonly DeckId[];
  readonly sessionType: string;
  readonly settings: SessionSettingsDTO;
}

/**
 * Session settings DTO
 */
export interface SessionSettingsDTO {
  readonly cardLimit?: number;
  readonly timeLimit?: number;
  readonly newCardLimit?: number;
  readonly reviewLimit?: number;
  readonly includeNew?: boolean;
  readonly includeReview?: boolean;
}

/**
 * Study session DTO
 */
export interface StudySessionDTO {
  readonly id: SessionId;
  readonly deckIds: readonly DeckId[];
  readonly sessionType: string;
  readonly startedAt: string;
  readonly cardsStudied: number;
  readonly correctCount: number;
  readonly settings: SessionSettingsDTO;
}

/**
 * Next card response
 */
export interface NextCardResponse {
  readonly card: CardDTO | null;
  readonly schedulingOptions: SchedulingOptionsDTO;
  readonly sessionProgress: SessionProgressDTO;
  readonly hasMoreCards: boolean;
}

/**
 * Scheduling options for current card
 */
export interface SchedulingOptionsDTO {
  readonly again: IntervalOptionDTO;
  readonly hard: IntervalOptionDTO;
  readonly good: IntervalOptionDTO;
  readonly easy: IntervalOptionDTO;
}

/**
 * Single interval option
 */
export interface IntervalOptionDTO {
  readonly interval: number;
  readonly intervalDisplay: string;             // "10m", "1d", "2w"
  readonly predictedRetention: number;
}

/**
 * Session progress
 */
export interface SessionProgressDTO {
  readonly cardsStudied: number;
  readonly cardsRemaining: number;
  readonly newCardsStudied: number;
  readonly newCardsRemaining: number;
  readonly reviewsStudied: number;
  readonly reviewsRemaining: number;
  readonly correctCount: number;
  readonly againCount: number;
  readonly duration: number;
  readonly accuracy: number;
}

/**
 * Submit review request
 */
export interface SubmitReviewRequest {
  readonly cardId: CardId;
  readonly rating: Rating;
  readonly responseTime: number;
  readonly confidence?: number;
  readonly hintUsed?: boolean;
}

/**
 * Submit review response
 */
export interface SubmitReviewResponse {
  readonly cardId: CardId;
  readonly newState: CardSRSStateDTO;
  readonly nextCard: CardDTO | null;
  readonly sessionProgress: SessionProgressDTO;
  readonly xpEarned: number;
  readonly achievements: readonly string[];
}

/**
 * End session request
 */
export interface EndSessionRequest {
  readonly sessionId: SessionId;
}

/**
 * End session response
 */
export interface EndSessionResponse {
  readonly summary: SessionSummaryDTO;
  readonly xpEarned: number;
  readonly streakUpdated: boolean;
  readonly newStreak: number;
  readonly achievements: readonly AchievementDTO[];
}

/**
 * Session summary
 */
export interface SessionSummaryDTO {
  readonly duration: number;
  readonly cardsStudied: number;
  readonly newCardsLearned: number;
  readonly reviewsCompleted: number;
  readonly accuracy: number;
  readonly againCount: number;
  readonly hardCount: number;
  readonly goodCount: number;
  readonly easyCount: number;
  readonly averageResponseTime: number;
}

/**
 * Achievement DTO
 */
export interface AchievementDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly rarity: string;
  readonly xpReward: number;
  readonly earnedAt: string;
}

// =============================================================================
// IMPORT/EXPORT API
// =============================================================================

/**
 * Import request
 */
export interface ImportRequest {
  readonly format: 'anki' | 'csv' | 'json' | 'markdown';
  readonly targetDeckId?: DeckId;
  readonly createNewDeck?: boolean;
  readonly newDeckName?: string;
  readonly options: ImportOptions;
}

/**
 * Import options
 */
export interface ImportOptions {
  readonly duplicateHandling: 'skip' | 'update' | 'create';
  readonly preserveScheduling: boolean;
  readonly preserveTags: boolean;
  readonly tagPrefix?: string;
}

/**
 * Import progress
 */
export interface ImportProgressDTO {
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly progress: number;                    // 0-100
  readonly cardsProcessed: number;
  readonly cardsImported: number;
  readonly cardsSkipped: number;
  readonly errors: readonly string[];
}

/**
 * Export request
 */
export interface ExportRequest {
  readonly format: 'anki' | 'csv' | 'json' | 'markdown';
  readonly deckIds: readonly DeckId[];
  readonly includeMedia: boolean;
  readonly includeScheduling: boolean;
}

/**
 * Export response
 */
export interface ExportResponse {
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly fileSize: number;
  readonly cardCount: number;
}

// =============================================================================
// SYNC API (for offline-first)
// =============================================================================

/**
 * Sync request
 */
export interface SyncRequest {
  readonly lastSyncAt: string;
  readonly clientChanges: readonly SyncChange[];
  readonly clientVersion: string;
}

/**
 * A change to sync
 */
export interface SyncChange {
  readonly type: 'create' | 'update' | 'delete';
  readonly entity: 'card' | 'deck' | 'review' | 'tag';
  readonly id: string;
  readonly data: unknown;
  readonly timestamp: string;
  readonly clientId: string;
}

/**
 * Sync response
 */
export interface SyncResponse {
  readonly serverChanges: readonly SyncChange[];
  readonly conflicts: readonly SyncConflict[];
  readonly syncedAt: string;
}

/**
 * Sync conflict
 */
export interface SyncConflict {
  readonly entity: string;
  readonly id: string;
  readonly clientVersion: unknown;
  readonly serverVersion: unknown;
  readonly resolution: 'client_wins' | 'server_wins' | 'manual';
}

// =============================================================================
// ANALYTICS API
// =============================================================================

/**
 * Analytics time range
 */
export interface AnalyticsTimeRange {
  readonly start: string;
  readonly end: string;
  readonly granularity: 'day' | 'week' | 'month';
}

/**
 * Study analytics response
 */
export interface StudyAnalyticsDTO {
  readonly timeRange: AnalyticsTimeRange;
  readonly summary: {
    readonly totalReviews: number;
    readonly totalStudyTime: number;
    readonly cardsLearned: number;
    readonly averageAccuracy: number;
    readonly averageRetention: number;
  };
  readonly dailyStats: readonly DailyStatsDTO[];
  readonly deckBreakdown: readonly DeckAnalyticsDTO[];
  readonly retentionOverTime: readonly RetentionDataPoint[];
  readonly heatmap: readonly HeatmapDataPoint[];
}

/**
 * Daily statistics
 */
export interface DailyStatsDTO {
  readonly date: string;
  readonly reviews: number;
  readonly newCards: number;
  readonly studyTime: number;
  readonly accuracy: number;
  readonly retention: number;
}

/**
 * Deck analytics
 */
export interface DeckAnalyticsDTO {
  readonly deckId: DeckId;
  readonly deckName: string;
  readonly reviews: number;
  readonly accuracy: number;
  readonly averageStability: number;
}

/**
 * Retention data point
 */
export interface RetentionDataPoint {
  readonly date: string;
  readonly predicted: number;
  readonly actual: number;
}

/**
 * Heatmap data point
 */
export interface HeatmapDataPoint {
  readonly date: string;
  readonly count: number;
  readonly intensity: number;
}

// =============================================================================
// WEBSOCKET EVENTS
// =============================================================================

/**
 * WebSocket event types
 */
export type WSEventType =
  | 'sync_required'
  | 'card_updated'
  | 'deck_updated'
  | 'session_ended'
  | 'achievement_earned'
  | 'streak_updated'
  | 'notification';

/**
 * WebSocket message
 */
export interface WSMessage<T = unknown> {
  readonly type: WSEventType;
  readonly data: T;
  readonly timestamp: string;
}
