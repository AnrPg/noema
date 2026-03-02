/**
 * @noema/knowledge-graph-service - Misconception API Schemas
 *
 * Zod validation schemas for misconception route parameters.
 */

import { MisconceptionStatusSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const MisconceptionUserIdParamsSchema = z.object({
  userId: UserIdSchema,
});

export const DetectionIdParamsSchema = z.object({
  userId: UserIdSchema,
  detectionId: z.string().min(1),
});

// ============================================================================
// Query Parameters
// ============================================================================

export const MisconceptionQueryParamsSchema = z.object({
  domain: z.string().min(1).max(200).optional(),
  status: MisconceptionStatusSchema.optional(),
});

// ============================================================================
// Request Bodies
// ============================================================================

export const DetectMisconceptionsRequestSchema = z.object({
  domain: z.string().min(1, 'Domain is required').max(200),
});

export const UpdateMisconceptionStatusRequestSchema = z.object({
  status: MisconceptionStatusSchema,
});

// ============================================================================
// Type Inference
// ============================================================================

export type MisconceptionUserIdParams = z.infer<typeof MisconceptionUserIdParamsSchema>;
export type DetectionIdParams = z.infer<typeof DetectionIdParamsSchema>;
export type MisconceptionQueryParams = z.infer<typeof MisconceptionQueryParamsSchema>;
export type DetectMisconceptionsRequest = z.infer<typeof DetectMisconceptionsRequestSchema>;
export type UpdateMisconceptionStatusRequest = z.infer<
  typeof UpdateMisconceptionStatusRequestSchema
>;
