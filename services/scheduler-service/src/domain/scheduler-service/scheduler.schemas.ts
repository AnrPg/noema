import { CardIdSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

export const DualLanePlanInputSchema = z.object({
  userId: UserIdSchema,
  retentionCardIds: z.array(CardIdSchema).default([]),
  calibrationCardIds: z.array(CardIdSchema).default([]),
  targetMix: z
    .object({
      retention: z.number().min(0).max(1),
      calibration: z.number().min(0).max(1),
    })
    .optional(),
  maxCards: z.number().int().min(1).max(500),
  cardPriorityScores: z.record(z.string(), z.number()).optional(),
  interleave: z.boolean().optional(),
  commit: z.boolean().optional(),
});

const SchedulerAlgorithmSchema = z.enum(['fsrs', 'hlr', 'sm2']);
const SchedulerLaneSchema = z.enum(['retention', 'calibration']);

export const CardScheduleInputSchema = z.object({
  cardId: CardIdSchema,
  algorithm: SchedulerAlgorithmSchema,
  lastReviewAt: z.string().datetime().nullable().optional(),
  stability: z.number().min(0).nullable().optional(),
  difficulty: z.number().min(0).nullable().optional(),
  lapses: z.number().int().min(0).nullable().optional(),
});

export const CardScheduleDecisionSchema = z.object({
  cardId: CardIdSchema,
  nextReviewAt: z.string().datetime(),
  intervalDays: z.number().min(0),
  lane: SchedulerLaneSchema,
  algorithm: SchedulerAlgorithmSchema,
  rationale: z.string().min(1),
});

export const SessionConstraintsSchema = z.object({
  targetCards: z.number().int().min(1).max(500),
  maxSessionDurationMinutes: z.number().int().min(1).max(240).optional(),
  includeCalibration: z.boolean().optional(),
  laneMix: z
    .object({
      retention: z.number().min(0).max(1),
      calibration: z.number().min(0).max(1),
    })
    .optional(),
});

export const SessionCandidateCardSchema = z.object({
  cardId: CardIdSchema,
  lane: SchedulerLaneSchema,
  dueAt: z.string().datetime().nullable().optional(),
  retentionProbability: z.number().min(0).max(1).nullable().optional(),
  estimatedSeconds: z.number().int().min(1).nullable().optional(),
});

export const ReviewWindowProposalInputSchema = z.object({
  userId: UserIdSchema,
  cards: z.array(CardScheduleInputSchema).min(1).max(500),
  asOf: z.string().datetime().nullable().optional(),
});

export const SessionCandidateProposalInputSchema = z.object({
  userId: UserIdSchema,
  cards: z.array(SessionCandidateCardSchema).min(1).max(2000),
  constraints: SessionConstraintsSchema,
  sourceDeckId: z.string().nullable().optional(),
  sessionContext: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const SessionCandidateSimulationInputSchema = z.object({
  userId: UserIdSchema,
  cards: z.array(SessionCandidateCardSchema).min(1).max(2000),
  constraints: SessionConstraintsSchema,
  whatIfAdjustments: z.record(z.string(), z.unknown()).nullable().optional(),
  sessionContext: z.record(z.string(), z.unknown()).nullable().optional(),
});

const PolicyVersionSchema = z.object({
  version: z.string().min(1),
  rulesetChecksum: z.string().optional(),
});

const OrchestrationMetadataSchema = z.object({
  proposalId: z.string().min(1),
  decisionId: z.string().min(1),
  sessionRevision: z.number().int().min(0),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),
});

export const CardScheduleCommitInputSchema = z.object({
  userId: UserIdSchema,
  decision: CardScheduleDecisionSchema,
  policyVersion: PolicyVersionSchema,
  orchestration: OrchestrationMetadataSchema,
  reason: z.string().min(1).optional(),
});

export const BatchScheduleCommitInputSchema = z.object({
  userId: UserIdSchema,
  decisions: z.array(CardScheduleDecisionSchema).min(1).max(500),
  source: z.enum(['agent', 'session-service', 'scheduler-service']),
  policyVersion: PolicyVersionSchema,
  orchestration: OrchestrationMetadataSchema,
  reason: z.string().min(1).optional(),
});

// ============================================================================
// Phase 4 Tool Schemas
// ============================================================================

export const ReviewQueueInputSchema = z.object({
  userId: UserIdSchema,
  lane: SchedulerLaneSchema.optional(),
  limit: z.number().int().min(1).max(500).optional(),
  asOf: z.string().datetime().optional(),
});

export const GetCardProjectionInputSchema = z.object({
  userId: UserIdSchema,
  cardId: CardIdSchema,
  asOf: z.string().datetime().optional(),
});

export const RetentionPredictionRequestSchema = z.object({
  cardId: CardIdSchema,
  algorithm: SchedulerAlgorithmSchema,
  asOf: z.string().datetime().optional(),
});

export const RetentionPredictionInputSchema = z.object({
  userId: UserIdSchema,
  cards: z.array(RetentionPredictionRequestSchema).min(1).max(500),
});

export const SessionCardAdjustmentSchema = z.object({
  cardId: CardIdSchema,
  action: z.enum(['add', 'remove', 'reprioritize']),
  reason: z.string().min(1).max(500),
  newPriority: z.number().min(0).max(1).optional(),
});

export const SessionAdjustmentInputSchema = z.object({
  userId: UserIdSchema,
  sessionId: z.string().min(1),
  adjustments: z.array(SessionCardAdjustmentSchema).min(1).max(100),
  orchestration: OrchestrationMetadataSchema,
});
