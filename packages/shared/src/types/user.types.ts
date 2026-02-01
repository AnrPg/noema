// =============================================================================
// USER & AUTHENTICATION TYPES
// =============================================================================
// These types define user accounts, authentication, and profile information.
// Users are the core entity that owns all learning data.

/**
 * Unique identifier type using branded types for type safety.
 * This prevents accidentally mixing up different ID types (e.g., userId with deckId).
 */
export type UserId = string & { readonly __brand: 'UserId' };
export type DeckId = string & { readonly __brand: 'DeckId' };
export type CardId = string & { readonly __brand: 'CardId' };
export type ReviewId = string & { readonly __brand: 'ReviewId' };
export type PluginId = string & { readonly __brand: 'PluginId' };
export type AchievementId = string & { readonly __brand: 'AchievementId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type TagId = string & { readonly __brand: 'TagId' };

/**
 * Authentication provider types supported by the platform.
 * Allows users to sign in via multiple methods.
 */
export type AuthProvider = 
  | 'email'          // Traditional email/password
  | 'google'         // Google OAuth
  | 'apple'          // Apple Sign In
  | 'github'         // GitHub OAuth (for developers)
  | 'anonymous';     // Guest mode (limited features)

/**
 * User subscription tiers with different feature access.
 * Designed to be extensible for future monetization.
 */
export type SubscriptionTier = 
  | 'free'           // Basic features, limited storage
  | 'pro'            // Full features, more storage
  | 'team'           // Collaboration features
  | 'enterprise';    // Custom integrations, SSO

/**
 * User preferences for learning and UI customization.
 * These affect how the app behaves and looks.
 */
export interface UserPreferences {
  // UI Preferences
  readonly theme: 'light' | 'dark' | 'system';
  readonly language: string;                    // ISO 639-1 code (e.g., 'en', 'es')
  readonly fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  readonly reducedMotion: boolean;              // Accessibility: disable animations
  readonly highContrast: boolean;               // Accessibility: high contrast mode
  
  // Learning Preferences
  readonly defaultScheduler: SchedulerType;     // Which SRS algorithm to use
  readonly targetRetention: number;             // 0.75 - 0.95 (default: 0.9)
  readonly maxNewCardsPerDay: number;           // Daily limit for new cards
  readonly maxReviewsPerDay: number;            // Daily limit for reviews
  readonly studySessionDuration: number;        // Target session length in minutes
  
  // Notification Preferences
  readonly dailyReminder: boolean;
  readonly reminderTime: string;                // HH:MM format in user's timezone
  readonly streakReminder: boolean;
  readonly weeklyReport: boolean;
  
  // Gamification Preferences
  readonly showXP: boolean;
  readonly showStreaks: boolean;
  readonly showLeaderboards: boolean;
  readonly soundEffects: boolean;
}

/**
 * Complete user profile including authentication and learning data.
 */
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  
  // Authentication
  readonly authProvider: AuthProvider;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly lastLoginAt: Date;
  readonly lastActiveAt: Date;
  
  // Subscription
  readonly subscription: SubscriptionTier;
  readonly subscriptionExpiresAt: Date | null;
  
  // Preferences
  readonly preferences: UserPreferences;
  
  // Learning Statistics (aggregated)
  readonly stats: UserLearningStats;
  
  // Gamification
  readonly xp: number;
  readonly level: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly achievements: readonly AchievementId[];
}

/**
 * Aggregated learning statistics for a user.
 * Updated periodically for performance.
 */
export interface UserLearningStats {
  readonly totalCards: number;
  readonly totalDecks: number;
  readonly totalReviews: number;
  readonly totalStudyTime: number;              // Total minutes studied
  readonly cardsLearned: number;                // Cards with stability > 30 days
  readonly cardsMastered: number;               // Cards with stability > 90 days
  readonly averageRetention: number;            // Overall retention rate
  readonly averageAccuracy: number;             // Correct recall percentage
  readonly calibrationScore: number;            // Confidence vs actual accuracy
  readonly memoryIntegrityScore: number;        // Long-term retention health
  readonly learningEfficiency: number;          // Cards learned per hour
}
