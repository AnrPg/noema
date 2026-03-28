/**
 * @noema/knowledge-graph-service - Metrics API Schemas
 *
 * Zod validation schemas for structural metrics route parameters.
 */

import { StudyModeSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const MetricsUserIdParamsSchema = z.object({
  userId: UserIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const MetricsQueryParamsSchema = z.object({
  domain: z.string().min(1, 'Domain is required').max(200),
  studyMode: StudyModeSchema.default('knowledge_gaining'),
});

export const MetricsHistoryQueryParamsSchema = z.object({
  domain: z.string().min(1, 'Domain is required').max(200),
  studyMode: StudyModeSchema.default('knowledge_gaining'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MetricsComputeRequestSchema = z.object({
  domain: z.string().min(1, 'Domain is required').max(200),
  studyMode: StudyModeSchema.default('knowledge_gaining'),
});

// ============================================================================
// Type Inference
// ============================================================================

export type MetricsUserIdParams = z.infer<typeof MetricsUserIdParamsSchema>;
export type MetricsQueryParams = z.infer<typeof MetricsQueryParamsSchema>;
export type MetricsHistoryQueryParams = z.infer<typeof MetricsHistoryQueryParamsSchema>;
export type MetricsComputeRequest = z.infer<typeof MetricsComputeRequestSchema>;
