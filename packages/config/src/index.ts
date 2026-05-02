/**
 * @noema/config
 * Shared configuration utilities for Noema services
 */

export const VERSION = '0.1.0';

export const DEFAULT_METACOGNITION_CONFIG = {
  reasoningWeights: {
    highReasoning: { thresholdExclusive: 0.7, traceWeight: 0.85, selfRatingWeight: 0.15 },
    mediumReasoning: { thresholdInclusive: 0.3, traceWeight: 0.6, selfRatingWeight: 0.4 },
    lowReasoning: { traceWeight: 0.95, selfRatingWeight: 0.05 },
  },
  fsrsRatingBoundaries: {
    againBelow: 0.3,
    hardBelow: 0.5,
    goodBelow: 0.8,
  },
  triggerThresholds: {
    lowReasoning: 0.3,
    highReasoning: 0.7,
    overconfidenceConfidence: 0.8,
    slowThinkingBaselineMultiplier: 1.8,
  },
} as const;

export const DEFAULT_GAMIFICATION_CONFIG = {
  streakReasoningQualityThreshold: 0.5,
  memoryIntegrityWeights: {
    stableConceptCount: 0.4,
    averageReasoningQuality: 0.4,
    recencySinceUnstableFlip: 0.2,
  },
  progressiveCapabilityThresholds: [
    { tier: 1, stepsCompleted: 20, categoriesEngaged: 3 },
    { tier: 2, stepsCompleted: 50, categoriesEngaged: 5 },
    {
      tier: 3,
      stepsCompleted: 75,
      categoriesEngaged: 7,
      daysActive: 7,
      averageReasoningQuality: 0.5,
    },
    {
      tier: 4,
      stepsCompleted: 100,
      categoriesEngaged: 10,
      daysActive: 14,
      averageReasoningQuality: 0.55,
    },
    {
      tier: 5,
      stepsCompleted: 150,
      sessionsCompleted: 50,
      daysActive: 21,
      averageReasoningQuality: 0.6,
    },
    {
      tier: 6,
      stepsCompleted: 200,
      categoriesEngaged: 15,
      daysActive: 30,
      averageReasoningQuality: 0.65,
    },
  ],
} as const;

export const DEFAULT_ELIGIBILITY_CONFIG = {
  transferAttemptsSinceStable: 5,
  recentModeWindow: 5,
  recentTransformationWindow: 6,
} as const;

export const DEFAULT_REALIGNMENT_CONFIG = {
  metacognition: DEFAULT_METACOGNITION_CONFIG,
  gamification: DEFAULT_GAMIFICATION_CONFIG,
  eligibility: DEFAULT_ELIGIBILITY_CONFIG,
} as const;
