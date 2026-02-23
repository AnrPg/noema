/**
 * @noema/session-service - Input Validation Schemas
 *
 * Zod schemas for validating all REST API and domain inputs.
 * Re-uses enum and ID schemas from @noema/validation.
 */

import {
  AttemptOutcomeSchema,
  CardIdSchema,
  CognitiveLoadLevelSchema,
  DeckQueryLogIdSchema,
  FatigueLevelSchema,
  ForceLevelSchema,
  HintDepthSchema,
  LearningModeSchema,
  LoadoutArchetypeSchema,
  LoadoutIdSchema,
  MotivationSignalSchema,
  RatingSchema,
  SchedulingAlgorithmSchema,
  SessionIdSchema,
  TeachingApproachSchema,
} from '@noema/validation';
import { z } from 'zod';

import type { ISessionBlueprint } from '../../types/index.js';

const AdaptiveCheckpointSignalSchema = z.enum([
  'confidence_drift',
  'latency_spike',
  'error_cascade',
  'streak_break',
  'manual',
]);

export const SessionBlueprintSchema: z.ZodType<ISessionBlueprint> = z.object({
  blueprintVersion: z.literal('v1'),
  generatedAt: z.string().datetime(),
  generatedBy: z.literal('agent'),
  deckQueryId: z.string().min(1),
  initialCardIds: z.array(CardIdSchema).min(1),
  laneMix: z.object({
    retention: z.number().min(0).max(1),
    calibration: z.number().min(0).max(1),
  }),
  checkpointSignals: z.array(AdaptiveCheckpointSignalSchema),
  policySnapshot: z.object({
    pacingPolicy: z.object({
      targetSecondsPerCard: z.number().int().min(5).max(300),
      hardCapSecondsPerCard: z.number().int().min(10).max(600),
      slowdownOnError: z.boolean(),
    }),
    hintPolicy: z.object({
      maxHintsPerCard: z.number().int().min(0).max(5),
      progressiveHintsOnly: z.boolean(),
      allowAnswerReveal: z.boolean(),
    }),
    commitPolicy: z.object({
      requireConfidenceBeforeCommit: z.boolean(),
      requireVerificationGate: z.boolean(),
    }),
    reflectionPolicy: z.object({
      postAttemptReflection: z.boolean(),
      postSessionReflection: z.boolean(),
    }),
  }),
  assumptions: z.array(z.string()),
});

// ============================================================================
// Session Config Schema
// ============================================================================

export const SessionConfigSchema = z.object({
  maxCards: z.number().int().positive().optional().describe('Maximum cards to present'),
  maxDurationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max session duration in minutes'),
  sessionTimeoutHours: z.number().positive().default(24).describe('Auto-expire timeout in hours'),
  categoryIds: z.array(z.string()).optional().describe('Limit to specific categories'),
  cardTypes: z.array(z.string()).optional().describe('Limit to specific card types'),
});

export type SessionConfigInput = z.input<typeof SessionConfigSchema>;

// ============================================================================
// Start Session Input
// ============================================================================

export const StartSessionInputSchema = z.object({
  deckQueryId: DeckQueryLogIdSchema.describe('Deck query log that produced the card set'),
  learningMode: LearningModeSchema.describe('Active learning mode'),
  teachingApproach: TeachingApproachSchema.optional().describe('Initial teaching approach'),
  schedulingAlgorithm: SchedulingAlgorithmSchema.optional().describe('Scheduling algorithm to use'),
  loadoutId: LoadoutIdSchema.optional().describe('Active loadout ID'),
  loadoutArchetype: LoadoutArchetypeSchema.optional().describe('Loadout archetype'),
  config: SessionConfigSchema.describe('Session configuration'),
  initialCardIds: z
    .array(CardIdSchema)
    .min(1, 'At least one card is required')
    .describe('Ordered list of card IDs for the session queue'),
  blueprint: SessionBlueprintSchema.optional(),
  offlineIntentToken: z.string().min(1).optional(),
});

export type StartSessionInput = z.input<typeof StartSessionInputSchema>;

export const ValidateSessionBlueprintInputSchema = z.object({
  blueprint: SessionBlueprintSchema,
});

export const EvaluateAdaptiveCheckpointInputSchema = z.object({
  trigger: AdaptiveCheckpointSignalSchema,
  lastAttemptResponseTimeMs: z.number().int().nonnegative().optional(),
  rollingAverageResponseTimeMs: z.number().int().positive().optional(),
  recentIncorrectStreak: z.number().int().nonnegative().optional(),
  confidenceDrift: z.number().min(-1).max(1).optional(),
});

export type EvaluateAdaptiveCheckpointInput = z.input<typeof EvaluateAdaptiveCheckpointInputSchema>;

export type ValidateSessionBlueprintInput = z.input<typeof ValidateSessionBlueprintInputSchema>;

// ============================================================================
// Attempt Context Snapshot Schema
// ============================================================================

export const AttemptContextSchema = z.object({
  learningMode: LearningModeSchema,
  teachingApproach: TeachingApproachSchema,
  loadoutArchetype: LoadoutArchetypeSchema.optional(),
  forceLevel: ForceLevelSchema.optional(),
  cognitiveLoad: CognitiveLoadLevelSchema.optional(),
  fatigueLevel: FatigueLevelSchema.optional(),
  motivationSignal: MotivationSignalSchema.optional(),
  activeInterventionIds: z.array(z.string()).default([]),
});

export type AttemptContextInput = z.input<typeof AttemptContextSchema>;

// ============================================================================
// Prior Scheduling State Schema
// ============================================================================

export const PriorSchedulingStateSchema = z.object({
  algorithm: SchedulingAlgorithmSchema,
  stability: z.number().nonnegative().optional(),
  difficulty: z.number().nonnegative().optional(),
  elapsedDays: z.number().nonnegative(),
  retrievability: z.number().min(0).max(1).optional(),
  intervalDays: z.number().nonnegative().optional(),
  lapseCount: z.number().int().nonnegative().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  leitnerBox: z.number().int().nonnegative().optional(),
  sm2EaseFactor: z.number().nonnegative().optional(),
});

export type PriorSchedulingStateInput = z.input<typeof PriorSchedulingStateSchema>;

// ============================================================================
// Record Attempt Input
// ============================================================================

export const RecordAttemptInputSchema = z.object({
  cardId: CardIdSchema.describe('Card that was reviewed'),
  outcome: AttemptOutcomeSchema.describe('Result of the attempt'),
  rating: RatingSchema.describe('User rating'),
  ratingValue: z.number().int().min(1).max(4).describe('Numeric rating (1-4)'),
  responseTimeMs: z.number().int().nonnegative().describe('Time to respond in milliseconds'),
  dwellTimeMs: z.number().int().nonnegative().describe('Total time card was displayed'),
  timeToFirstInteractionMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Time to first interaction'),
  confidenceBefore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Confidence before revealing answer'),
  confidenceAfter: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Confidence after revealing answer'),
  wasRevisedBeforeCommit: z
    .boolean()
    .describe('Whether user revised their answer before committing'),
  revisionCount: z.number().int().nonnegative().default(0).describe('Number of revisions'),
  hintRequestCount: z.number().int().nonnegative().default(0).describe('Number of hints used'),
  hintDepthReached: HintDepthSchema.describe('Deepest hint level reached'),
  contextSnapshot: AttemptContextSchema.describe('State at time of attempt'),
  priorSchedulingState: PriorSchedulingStateSchema.optional().describe(
    'Scheduling state before attempt'
  ),
});

export type RecordAttemptInput = z.input<typeof RecordAttemptInputSchema>;

// ============================================================================
// Request Hint Input
// ============================================================================

export const RequestHintInputSchema = z.object({
  cardId: CardIdSchema.optional().describe('Card ID if provided by caller for consistency checks'),
  hintDepth: HintDepthSchema.describe('Hint depth requested'),
  hintRequestNumber: z.number().int().positive().describe('Sequential hint number in this attempt'),
  responseTimeMsAtRequest: z
    .number()
    .int()
    .nonnegative()
    .describe('Response time at time of hint request'),
});

export type RequestHintInput = z.input<typeof RequestHintInputSchema>;

// ============================================================================
// Dialogue Turn Input
// ============================================================================

export const RecordDialogueTurnInputSchema = z.object({
  role: z.enum(['agent', 'learner']).describe('Who sent the dialogue message'),
  content: z.string().min(1).max(4000).describe('Dialogue message content'),
  turnType: z.string().min(1).max(100).optional().describe('Semantic turn type'),
  metadata: z.record(z.unknown()).optional().describe('Optional dialogue metadata'),
});

export type RecordDialogueTurnInput = z.input<typeof RecordDialogueTurnInputSchema>;

// ============================================================================
// Inject Queue Item Input
// ============================================================================

export const InjectQueueInputSchema = z.object({
  cardId: CardIdSchema.describe('Card to inject into queue'),
  position: z.number().int().nonnegative().describe('Position in queue (0-based)'),
  reason: z.string().min(1).max(500).describe('Reason for injection'),
  injectedBy: z.string().optional().describe('Agent or system that requested injection'),
});

export type InjectQueueInput = z.input<typeof InjectQueueInputSchema>;

// ============================================================================
// Remove Queue Item Input
// ============================================================================

export const RemoveQueueInputSchema = z.object({
  cardId: CardIdSchema.describe('Card to remove from queue'),
  reason: z.string().min(1).max(500).describe('Reason for removal'),
  removedBy: z.string().optional().describe('Agent or system that requested removal'),
});

export type RemoveQueueInput = z.input<typeof RemoveQueueInputSchema>;

// ============================================================================
// Update Strategy Input
// ============================================================================

export const UpdateStrategyInputSchema = z.object({
  newLoadoutId: LoadoutIdSchema.describe('New loadout to apply'),
  newLoadoutArchetype: LoadoutArchetypeSchema.describe('New archetype'),
  newForceLevel: ForceLevelSchema.describe('New force level'),
  trigger: z.string().min(1).max(500).describe('What triggered the strategy change'),
});

export type UpdateStrategyInput = z.input<typeof UpdateStrategyInputSchema>;

// ============================================================================
// Change Teaching Approach Input
// ============================================================================

export const ChangeTeachingInputSchema = z.object({
  newApproach: TeachingApproachSchema.describe('New teaching approach'),
  trigger: z.string().min(1).max(500).describe('What triggered the teaching change'),
});

export type ChangeTeachingInput = z.input<typeof ChangeTeachingInputSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const SessionListQuerySchema = z.object({
  state: z.string().optional().describe('Filter by session state'),
  learningMode: z.string().optional().describe('Filter by learning mode'),
  limit: z.coerce.number().int().positive().max(100).default(20).describe('Page size'),
  offset: z.coerce.number().int().nonnegative().default(0).describe('Page offset'),
});

export type SessionListQuery = z.input<typeof SessionListQuerySchema>;

export const AttemptListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50).describe('Page size'),
  offset: z.coerce.number().int().nonnegative().default(0).describe('Page offset'),
});

export type AttemptListQuery = z.input<typeof AttemptListQuerySchema>;

// ============================================================================
// Path Parameter Schemas
// ============================================================================

export const SessionIdParamSchema = z.object({
  sessionId: SessionIdSchema,
});

export const AttemptIdParamSchema = z.object({
  sessionId: SessionIdSchema,
  attemptId: z.string().describe('Attempt ID'),
});

// ============================================================================
// Offline Intent Token Schemas
// ============================================================================

export const IssueOfflineIntentTokenInputSchema = z.object({
  userId: z.string().min(1).describe('User ID requesting the token'),
  sessionBlueprint: z.unknown().describe('Session blueprint for offline replay'),
  expiresInSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24)
    .describe('TTL in seconds'),
});

export type IssueOfflineIntentTokenInput = z.input<typeof IssueOfflineIntentTokenInputSchema>;

export const VerifyOfflineIntentTokenInputSchema = z.object({
  token: z.string().min(1).describe('Signed JWT token to verify'),
});

export type VerifyOfflineIntentTokenInput = z.input<typeof VerifyOfflineIntentTokenInputSchema>;
