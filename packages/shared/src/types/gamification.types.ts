// =============================================================================
// GAMIFICATION TYPES
// =============================================================================
// Research basis: Self-determination theory, flow theory, operant conditioning
// Designed to motivate without undermining intrinsic motivation

import type { UserId, DeckId, CardId, AchievementId } from './user.types';

// =============================================================================
// XP & LEVELING SYSTEM
// =============================================================================

/**
 * Experience points configuration
 * XP is earned through learning activities, not just volume
 */
export interface XPConfig {
  // Base XP rewards
  readonly xpPerNewCard: number;                // Learning new card
  readonly xpPerReview: number;                 // Any review
  readonly xpPerCorrectReview: number;          // Bonus for correct
  readonly xpPerPerfectSession: number;         // All correct in session
  readonly xpPerStreak: number;                 // Per day of streak
  
  // Quality multipliers (reward quality over quantity)
  readonly difficultyMultiplier: number;        // Harder cards = more XP
  readonly retentionMultiplier: number;         // High retention = more XP
  readonly efficiencyMultiplier: number;        // Faster accurate reviews = more XP
  readonly consistencyMultiplier: number;       // Regular study = more XP
  
  // Anti-gaming measures
  readonly dailyXPCap: number;                  // Max XP per day
  readonly cramPenalty: number;                 // Reduce XP for cramming
  readonly minimumSessionForXP: number;         // Min cards for XP
}

/**
 * Default XP configuration
 */
export const DEFAULT_XP_CONFIG: XPConfig = {
  xpPerNewCard: 10,
  xpPerReview: 5,
  xpPerCorrectReview: 3,
  xpPerPerfectSession: 50,
  xpPerStreak: 25,
  difficultyMultiplier: 1.5,
  retentionMultiplier: 1.3,
  efficiencyMultiplier: 1.2,
  consistencyMultiplier: 1.4,
  dailyXPCap: 500,
  cramPenalty: 0.5,
  minimumSessionForXP: 5,
} as const;

/**
 * Level progression
 * XP required increases logarithmically to prevent grind
 */
export interface Level {
  readonly level: number;
  readonly name: string;                        // "Novice", "Apprentice", etc.
  readonly minXP: number;                       // XP needed to reach this level
  readonly maxXP: number;                       // XP needed for next level
  readonly perks: readonly LevelPerk[];         // Unlocked features
  readonly badge: string;                       // Visual badge/icon
}

/**
 * Perks unlocked at certain levels
 */
export interface LevelPerk {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: 'feature' | 'cosmetic' | 'strategy';
}

// =============================================================================
// STREAKS - But smarter than just daily
// =============================================================================

/**
 * Streak tracking with anti-burnout design
 * Research basis: Habit formation, variable ratio reinforcement
 */
export interface StreakData {
  readonly userId: UserId;
  
  // Core streak
  readonly currentStreak: number;               // Days in current streak
  readonly longestStreak: number;               // All-time best
  readonly lastStudyDate: Date;
  
  // Streak freeze (prevent loss for legitimate reasons)
  readonly freezesAvailable: number;            // Can miss N days
  readonly freezesUsed: number;
  readonly lastFreezeDate: Date | null;
  
  // Quality-aware streaks (not just showing up)
  readonly qualityStreak: number;               // Days with >80% accuracy
  readonly masteryStreak: number;               // Days with new mastered cards
  
  // Anti-burnout
  readonly restDaysThisMonth: number;           // Encouraged rest days
  readonly suggestedRestDay: boolean;           // Algorithm suggests break
  readonly burnoutRisk: number;                 // 0-1 based on patterns
}

/**
 * Streak milestone rewards
 */
export interface StreakMilestone {
  readonly days: number;
  readonly name: string;
  readonly reward: StreakReward;
  readonly message: string;
}

/**
 * Reward for reaching a streak milestone
 */
export interface StreakReward {
  readonly xp: number;
  readonly achievementId: AchievementId | null;
  readonly freezeGrant: number;                 // Extra freeze days
  readonly customReward: string | null;
}

// =============================================================================
// MEMORY INTEGRITY SCORE (Your Unique Metric)
// =============================================================================

/**
 * Memory Integrity Score - A sophisticated metric for long-term retention health
 * Better than streaks because it measures actual learning, not just activity
 * Research basis: Spacing effect, desirable difficulties
 */
export interface MemoryIntegrityScore {
  readonly userId: UserId;
  readonly calculatedAt: Date;
  
  // Overall score (0-100)
  readonly score: number;
  
  // Component scores
  readonly components: {
    // Stability score: How stable are your memories?
    readonly stabilityScore: number;            // Based on average stability
    
    // Retention score: How well do you retain?
    readonly retentionScore: number;            // Actual retention vs target
    
    // Coverage score: How much of your deck is learned?
    readonly coverageScore: number;             // % cards with stability > threshold
    
    // Consistency score: How regular is your study?
    readonly consistencyScore: number;          // Variance in study patterns
    
    // Growth score: Are you learning new things?
    readonly growthScore: number;               // New cards mastered recently
    
    // Durability score: Long-term retention success
    readonly durabilityScore: number;           // Cards retained > 90 days
  };
  
  // Trend
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly trendStrength: number;               // 0-1
  
  // Per-deck breakdown
  readonly deckScores: Record<string, number>;
  
  // Historical
  readonly history: readonly MemoryIntegritySnapshot[];
}

/**
 * Historical snapshot of memory integrity
 */
export interface MemoryIntegritySnapshot {
  readonly date: Date;
  readonly score: number;
  readonly totalCards: number;
  readonly masteredCards: number;
}

// =============================================================================
// ACHIEVEMENTS & BADGES
// =============================================================================

/**
 * Achievement categories
 */
export type AchievementCategory =
  | 'learning'           // Learning milestones
  | 'mastery'            // Long-term retention
  | 'consistency'        // Regular study
  | 'efficiency'         // Learning efficiency
  | 'metacognition'      // Self-awareness
  | 'exploration'        // Trying features
  | 'social'             // Sharing, collaboration
  | 'special';           // Events, holidays

/**
 * Achievement rarity
 */
export type AchievementRarity =
  | 'common'             // Most users get this
  | 'uncommon'           // ~50% of active users
  | 'rare'               // ~10% of active users
  | 'epic'               // ~1% of active users
  | 'legendary';         // <0.1% of users

/**
 * Achievement definition
 */
export interface Achievement {
  readonly id: AchievementId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: AchievementCategory;
  readonly rarity: AchievementRarity;
  
  // Requirements
  readonly requirement: AchievementRequirement;
  
  // Rewards
  readonly xpReward: number;
  readonly unlocksFeature: string | null;
  
  // Display
  readonly isHidden: boolean;                   // Secret achievement
  readonly isRepeatable: boolean;               // Can earn multiple times
}

/**
 * Achievement requirement definition
 */
export type AchievementRequirement =
  | { type: 'cards_learned'; count: number }
  | { type: 'cards_mastered'; count: number }   // 90+ day stability
  | { type: 'streak'; days: number }
  | { type: 'memory_integrity'; score: number }
  | { type: 'accuracy'; rate: number; minReviews: number }
  | { type: 'calibration'; score: number }      // Confidence accuracy
  | { type: 'total_reviews'; count: number }
  | { type: 'decks_created'; count: number }
  | { type: 'perfect_sessions'; count: number }
  | { type: 'study_time'; minutes: number }
  | { type: 'early_bird'; sessions: number }    // Study before 8am
  | { type: 'night_owl'; sessions: number }     // Study after 10pm
  | { type: 'custom'; evaluator: string };      // Plugin-defined

/**
 * User's earned achievement
 */
export interface UserAchievement {
  readonly achievementId: AchievementId;
  readonly userId: UserId;
  readonly earnedAt: Date;
  readonly progress: number;                    // 0-1 for in-progress
  readonly isDisplayed: boolean;                // Show on profile
}

// =============================================================================
// MASTERY BADGES (Your Unique Feature)
// =============================================================================

/**
 * Mastery badges - Tied to LONG-TERM retention (90-180+ days)
 * This is different from achievements; these prove real learning
 */
export interface MasteryBadge {
  readonly id: string;
  readonly userId: UserId;
  readonly deckId: DeckId;
  readonly deckName: string;
  
  // Badge level
  readonly level: MasteryLevel;
  
  // Requirements met
  readonly cardsQualified: number;              // Cards meeting retention requirement
  readonly totalCards: number;
  readonly percentageMastered: number;
  
  // Retention proof
  readonly minimumStability: number;            // All cards have at least this stability
  readonly averageStability: number;
  readonly verifiedAt: Date;
  
  // Can be revoked if cards lapse
  readonly isValid: boolean;
  readonly lastValidationDate: Date;
}

/**
 * Mastery badge levels
 */
export type MasteryLevel =
  | 'bronze'             // 50% cards with 30-day stability
  | 'silver'             // 75% cards with 60-day stability
  | 'gold'               // 90% cards with 90-day stability
  | 'platinum'           // 95% cards with 180-day stability
  | 'diamond';           // 99% cards with 365-day stability

/**
 * Mastery level requirements
 */
export const MASTERY_REQUIREMENTS: Record<MasteryLevel, {
  percentageRequired: number;
  minimumStabilityDays: number;
  minimumCards: number;
}> = {
  bronze: { percentageRequired: 0.5, minimumStabilityDays: 30, minimumCards: 20 },
  silver: { percentageRequired: 0.75, minimumStabilityDays: 60, minimumCards: 20 },
  gold: { percentageRequired: 0.9, minimumStabilityDays: 90, minimumCards: 20 },
  platinum: { percentageRequired: 0.95, minimumStabilityDays: 180, minimumCards: 20 },
  diamond: { percentageRequired: 0.99, minimumStabilityDays: 365, minimumCards: 50 },
} as const;

// =============================================================================
// CALIBRATION SCORE (Metacognition)
// =============================================================================

/**
 * Calibration score - How well does user predict their recall?
 * Research basis: Metacognition, judgment of learning
 */
export interface CalibrationScore {
  readonly userId: UserId;
  readonly calculatedAt: Date;
  
  // Overall calibration (0-100, 100 = perfectly calibrated)
  readonly score: number;
  
  // Calibration by confidence level
  readonly calibrationBuckets: readonly CalibrationBucket[];
  
  // Tendencies
  readonly overconfidenceBias: number;          // Positive = overconfident
  readonly underconfidenceBias: number;         // Positive = underconfident
  
  // Improvement over time
  readonly trend: 'improving' | 'stable' | 'declining';
}

/**
 * Calibration data for a confidence bucket
 * E.g., "When user says 80% confident, they're correct 75% of time"
 */
export interface CalibrationBucket {
  readonly confidenceLevel: number;             // User's stated confidence (0-100)
  readonly actualAccuracy: number;              // Actual correct rate (0-100)
  readonly sampleSize: number;                  // Number of reviews in bucket
  readonly isCalibrated: boolean;               // Within acceptable range
}

// =============================================================================
// SKILL TREES (Knowledge Prerequisites)
// =============================================================================

/**
 * Skill tree for knowledge progression
 * Shows prerequisites and unlockable advanced topics
 */
export interface SkillTree {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly domain: string;                      // "Spanish", "Anatomy", etc.
  readonly nodes: readonly SkillNode[];
  readonly edges: readonly SkillEdge[];         // Prerequisites
}

/**
 * A node in the skill tree
 */
export interface SkillNode {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly deckId: DeckId | null;               // Associated deck
  readonly level: number;                       // Tier (0 = beginner)
  readonly position: { x: number; y: number };  // For visualization
  
  // Mastery requirements
  readonly cardsRequired: number;
  readonly masteryThreshold: number;            // % cards mastered
  readonly stabilityRequired: number;           // Min stability days
  
  // User progress
  readonly progress: number;                    // 0-1
  readonly isUnlocked: boolean;
  readonly isMastered: boolean;
  readonly masteredAt: Date | null;
}

/**
 * Prerequisites edge in skill tree
 */
export interface SkillEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly isRequired: boolean;                 // Must complete vs recommended
}

// =============================================================================
// REFLECTION PROMPTS (Metacognition)
// =============================================================================

/**
 * Reflection prompt after reviews
 * "Why did I forget this?"
 */
export interface ReflectionPrompt {
  readonly id: string;
  readonly type: 'forgetting' | 'difficulty' | 'success' | 'strategy';
  readonly question: string;
  readonly options: readonly ReflectionOption[];
  readonly allowFreeform: boolean;
}

/**
 * Pre-defined reflection options
 */
export interface ReflectionOption {
  readonly id: string;
  readonly label: string;
  readonly category: string;                    // "encoding", "interference", "context"
  readonly suggestedAction: string | null;      // "Try adding a mnemonic"
}

/**
 * User's reflection response
 */
export interface ReflectionResponse {
  readonly cardId: CardId;
  readonly promptId: string;
  readonly selectedOptionIds: readonly string[];
  readonly freeformResponse: string | null;
  readonly timestamp: Date;
}

// =============================================================================
// LEARNING STRATEGY UNLOCKS
// =============================================================================

/**
 * Learning strategies that can be unlocked/recommended
 */
export interface LearningStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly researchBasis: string;               // "Elaborative Interrogation - Dunlosky 2013"
  
  // When to recommend
  readonly recommendedFor: readonly string[];   // Contexts
  readonly notRecommendedFor: readonly string[];
  
  // How to apply
  readonly applicationSteps: readonly string[];
  readonly exampleUsage: string;
  
  // Unlock requirements
  readonly unlockedByDefault: boolean;
  readonly unlockLevel: number | null;
  readonly unlockAchievement: AchievementId | null;
}

/**
 * Available learning strategies
 */
export const LEARNING_STRATEGIES: Record<string, LearningStrategy> = {
  SPACED_PRACTICE: {
    id: 'spaced_practice',
    name: 'Spaced Practice',
    description: 'Distribute study over time rather than cramming',
    researchBasis: 'Cepeda et al. (2006) - Spacing effects in learning',
    recommendedFor: ['all learning'],
    notRecommendedFor: [],
    applicationSteps: [
      'Review cards according to their due dates',
      'Resist the urge to review early',
      'Trust the algorithm spacing',
    ],
    exampleUsage: 'Instead of reviewing 100 cards today, review 20 cards each day for 5 days',
    unlockedByDefault: true,
    unlockLevel: null,
    unlockAchievement: null,
  },
  INTERLEAVING: {
    id: 'interleaving',
    name: 'Interleaved Practice',
    description: 'Mix different topics during study instead of blocking',
    researchBasis: 'Rohrer & Taylor (2007) - The shuffling of mathematics problems',
    recommendedFor: ['similar concepts', 'problem solving', 'categorization'],
    notRecommendedFor: ['completely new material'],
    applicationSteps: [
      'Enable interleaving in deck settings',
      'Study multiple decks in one session',
      'Embrace the difficulty - it helps!',
    ],
    exampleUsage: 'Mix Spanish and French vocabulary cards together',
    unlockedByDefault: false,
    unlockLevel: 5,
    unlockAchievement: null,
  },
  ELABORATIVE_INTERROGATION: {
    id: 'elaborative_interrogation',
    name: 'Elaborative Interrogation',
    description: 'Ask "why" and "how" questions about the material',
    researchBasis: 'Dunlosky et al. (2013) - Improving Students\' Learning',
    recommendedFor: ['factual information', 'concepts', 'procedures'],
    notRecommendedFor: ['purely rote memorization'],
    applicationSteps: [
      'After seeing the answer, ask "Why is this true?"',
      'Connect new information to what you already know',
      'Create explanations in your own words',
    ],
    exampleUsage: 'For "Mitochondria is the powerhouse of the cell", ask "Why is it called that? How does it produce energy?"',
    unlockedByDefault: false,
    unlockLevel: 3,
    unlockAchievement: null,
  },
  DUAL_CODING: {
    id: 'dual_coding',
    name: 'Dual Coding',
    description: 'Combine verbal and visual information',
    researchBasis: 'Paivio (1971) - Dual coding theory',
    recommendedFor: ['visual subjects', 'abstract concepts', 'vocabulary'],
    notRecommendedFor: ['audio-only content'],
    applicationSteps: [
      'Add images to text-only cards',
      'Create diagrams for processes',
      'Use image occlusion for visual material',
    ],
    exampleUsage: 'Add a picture of the heart when learning cardiovascular anatomy',
    unlockedByDefault: true,
    unlockLevel: null,
    unlockAchievement: null,
  },
  RETRIEVAL_PRACTICE: {
    id: 'retrieval_practice',
    name: 'Retrieval Practice',
    description: 'Test yourself rather than re-reading',
    researchBasis: 'Roediger & Butler (2011) - The critical role of retrieval practice',
    recommendedFor: ['all learning'],
    notRecommendedFor: [],
    applicationSteps: [
      'Try to recall before flipping the card',
      'Don\'t peek at the answer',
      'Struggle is good - it strengthens memory',
    ],
    exampleUsage: 'Cover the answer and really try to remember before revealing',
    unlockedByDefault: true,
    unlockLevel: null,
    unlockAchievement: null,
  },
} as const;

// =============================================================================
// ANTI-CRAMMING & BURNOUT PROTECTION
// =============================================================================

/**
 * Burnout detection and prevention
 */
export interface BurnoutIndicators {
  readonly userId: UserId;
  readonly calculatedAt: Date;
  
  // Risk level
  readonly burnoutRisk: 'low' | 'moderate' | 'high' | 'critical';
  readonly riskScore: number;                   // 0-100
  
  // Warning signs
  readonly indicators: readonly BurnoutIndicator[];
  
  // Recommendations
  readonly recommendations: readonly BurnoutRecommendation[];
}

/**
 * Individual burnout indicator
 */
export interface BurnoutIndicator {
  readonly name: string;
  readonly description: string;
  readonly severity: 'mild' | 'moderate' | 'severe';
  readonly detected: boolean;
  readonly value: number | null;                // If measurable
}

/**
 * Recommendation to prevent burnout
 */
export interface BurnoutRecommendation {
  readonly priority: 'low' | 'medium' | 'high';
  readonly action: string;
  readonly reason: string;
}

/**
 * Default burnout indicators to track
 */
export const BURNOUT_INDICATORS = [
  { name: 'Declining accuracy', threshold: 0.15 },           // 15% drop
  { name: 'Increasing response time', threshold: 1.5 },      // 50% increase
  { name: 'Session duration drop', threshold: 0.5 },         // 50% shorter
  { name: 'Streak anxiety', threshold: 3 },                  // 3+ freeze uses
  { name: 'Review debt accumulation', threshold: 100 },      // 100+ overdue
  { name: 'Study time increase', threshold: 2.0 },           // 2x normal
] as const;
