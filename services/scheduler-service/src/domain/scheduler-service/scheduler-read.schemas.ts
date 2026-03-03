/**
 * @noema/scheduler-service — Phase 3 Read API Zod Schemas
 *
 * Validation schemas for GET query parameters and POST body on all read endpoints.
 * Uses z.coerce for numeric params (GET query strings arrive as strings).
 */

import { CardIdSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// Shared Enums
// ============================================================================

const SchedulerLaneEnum = z.enum(['retention', 'calibration']);
const SchedulerCardStateEnum = z.enum([
  'new',
  'learning',
  'review',
  'relearning',
  'suspended',
  'graduated',
]);
const SchedulerAlgorithmEnum = z.enum(['fsrs', 'hlr', 'sm2']);
const RatingEnum = z.enum(['again', 'hard', 'good', 'easy']);

// ============================================================================
// Shared Pagination
// ============================================================================

const PaginationLimitSchema = z.coerce.number().int().min(1).max(200).default(50);
const PaginationOffsetSchema = z.coerce.number().int().min(0).default(0);

// ============================================================================
// T3.1 — Scheduler Card Query Schemas
// ============================================================================

/**
 * GET /v1/scheduler/cards — query parameters.
 */
export const SchedulerCardListQuerySchema = z.object({
  userId: UserIdSchema,
  lane: SchedulerLaneEnum.optional(),
  state: SchedulerCardStateEnum.optional(),
  algorithm: SchedulerAlgorithmEnum.optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  sortBy: z
    .enum(['nextReviewDate', 'stability', 'difficulty', 'reviewCount', 'createdAt'])
    .default('nextReviewDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  limit: PaginationLimitSchema,
  offset: PaginationOffsetSchema,
});

/**
 * GET /v1/scheduler/cards/:cardId — path params.
 */
export const SchedulerCardParamsSchema = z.object({
  cardId: CardIdSchema,
});

// ============================================================================
// T3.2 — Review History Query Schemas
// ============================================================================

/**
 * GET /v1/scheduler/reviews — query parameters.
 */
export const ReviewListQuerySchema = z.object({
  userId: UserIdSchema,
  cardId: CardIdSchema.optional(),
  sessionId: z.string().min(1).optional(),
  lane: SchedulerLaneEnum.optional(),
  algorithm: SchedulerAlgorithmEnum.optional(),
  rating: RatingEnum.optional(),
  outcome: z.string().min(1).optional(),
  reviewedAfter: z.string().datetime().optional(),
  reviewedBefore: z.string().datetime().optional(),
  sortBy: z.enum(['reviewedAt', 'responseTime', 'rating']).default('reviewedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: PaginationLimitSchema,
  offset: PaginationOffsetSchema,
});

/**
 * GET /v1/scheduler/reviews/stats — query parameters.
 * Same filters as review list, but no pagination (aggregation endpoint).
 */
export const ReviewStatsQuerySchema = z.object({
  userId: UserIdSchema,
  cardId: CardIdSchema.optional(),
  sessionId: z.string().min(1).optional(),
  lane: SchedulerLaneEnum.optional(),
  algorithm: SchedulerAlgorithmEnum.optional(),
  rating: RatingEnum.optional(),
  outcome: z.string().min(1).optional(),
  reviewedAfter: z.string().datetime().optional(),
  reviewedBefore: z.string().datetime().optional(),
});

// ============================================================================
// T3.3 — Forecast Schema
// ============================================================================

/**
 * POST /v1/scheduler/forecast — request body.
 */
export const ForecastInputSchema = z.object({
  userId: UserIdSchema,
  days: z.number().int().min(1).max(90).default(7),
  includeOverdue: z.boolean().default(true),
});
