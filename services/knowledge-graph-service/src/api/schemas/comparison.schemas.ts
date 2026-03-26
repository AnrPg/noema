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
  domain: z
    .string()
    .trim()
    .min(1, 'Domain must not be empty')
    .max(200)
    .optional()
    .transform((value) => (value === 'all' ? undefined : value)),
  scopeMode: z.enum(['domain', 'engagement_hops']).default('engagement_hops'),
  hopCount: z.coerce.number().int().min(0).max(5).default(2),
  bootstrapWhenUnseeded: z.coerce.boolean().default(false),
});

// ============================================================================
// Type Inference
// ============================================================================

export type ComparisonUserIdParams = z.infer<typeof ComparisonUserIdParamsSchema>;
export type ComparisonQueryParams = z.infer<typeof ComparisonQueryParamsSchema>;
