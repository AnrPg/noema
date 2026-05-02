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

export const DEFAULT_CONCEPT_STATE_CONFIG = {
  thresholds: {
    S_RET: 21,
    R_REAS: 0.6,
    N_REASONING_WINDOW: 10,
  },
  recompute: {
    enabled: true,
    intervalMs: 15 * 60 * 1000,
    batchSize: 100,
    staleAfterMs: 24 * 60 * 60 * 1000,
  },
} as const;

export const N_TRANSFER = DEFAULT_ELIGIBILITY_CONFIG.transferAttemptsSinceStable;
export const R_STREAK_THRESHOLD = DEFAULT_GAMIFICATION_CONFIG.streakReasoningQualityThreshold;
export const S_RET = DEFAULT_CONCEPT_STATE_CONFIG.thresholds.S_RET;
export const R_REAS = DEFAULT_CONCEPT_STATE_CONFIG.thresholds.R_REAS;
export const N_REASONING_WINDOW = DEFAULT_CONCEPT_STATE_CONFIG.thresholds.N_REASONING_WINDOW;

export const DEFAULT_REALIGNMENT_CONFIG = {
  metacognition: DEFAULT_METACOGNITION_CONFIG,
  gamification: DEFAULT_GAMIFICATION_CONFIG,
  eligibility: DEFAULT_ELIGIBILITY_CONFIG,
  conceptState: DEFAULT_CONCEPT_STATE_CONFIG,
} as const;
