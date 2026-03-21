/**
 * @noema/knowledge-graph-service - Structural Health API Schemas
 *
 * Zod validation schemas for structural health and metacognitive
 * stage route parameters.
 */

import { UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const HealthUserIdParamsSchema = z.object({
  userId: UserIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const HealthQueryParamsSchema = z.object({
  domain: z.string().min(1).max(200).default('general'),
});

export const StageQueryParamsSchema = z.object({
  domain: z.string().min(1).max(200).default('general'),
});

// ============================================================================
// Type Inference
// ============================================================================

export type HealthUserIdParams = z.infer<typeof HealthUserIdParamsSchema>;
export type HealthQueryParams = z.infer<typeof HealthQueryParamsSchema>;
export type StageQueryParams = z.infer<typeof StageQueryParamsSchema>;
