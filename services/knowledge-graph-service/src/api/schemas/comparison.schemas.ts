/**
 * @noema/knowledge-graph-service - PKG↔CKG Comparison API Schemas
 *
 * Zod validation schemas for the comparison route parameters.
 */

import { UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const ComparisonUserIdParamsSchema = z.object({
  userId: UserIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const ComparisonQueryParamsSchema = z.object({
  domain: z.string().min(1, 'Domain is required').max(200),
});

// ============================================================================
// Type Inference
// ============================================================================

export type ComparisonUserIdParams = z.infer<typeof ComparisonUserIdParamsSchema>;
export type ComparisonQueryParams = z.infer<typeof ComparisonQueryParamsSchema>;
