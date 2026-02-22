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
});

export type StartSessionInput = z.input<typeof StartSessionInputSchema>;

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
