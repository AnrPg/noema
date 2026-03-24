/**
 * @noema/knowledge-graph-service - CKG Mutation API Schemas
 *
 * Zod validation schemas for CKG mutation route request parameters
 * and query strings. Mutation operation schemas are defined in the
 * domain layer (ckg-mutation-dsl.ts).
 */

import { MutationIdSchema, MutationStateSchema } from '@noema/validation';
import { z } from 'zod';
import { CkgMutationOperationSchema } from '../../domain/knowledge-graph-service/ckg-mutation-dsl.js';

// ============================================================================
// URL Parameters
// ============================================================================

export const MutationIdParamsSchema = z.object({
  mutationId: MutationIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

export const MutationQueryParamsSchema = z.object({
  state: MutationStateSchema.optional(),
  proposedBy: z.string().min(1).optional(),
  importRunId: z.string().min(1).optional(),
  includeImportRunAggregation: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Request Bodies
// ============================================================================

/**
 * API-layer mutation proposal request.
 *
 * Uses the domain's CkgMutationOperationSchema for operations validation,
 * ensuring the discriminated union (ADD_NODE, REMOVE_NODE, etc.) is enforced
 * at the HTTP boundary.
 */
export const ProposeMutationRequestSchema = z.object({
  operations: z
    .array(CkgMutationOperationSchema)
    .min(1, 'At least one operation is required')
    .max(50, 'Maximum 50 operations per mutation'),
  rationale: z.string().min(1, 'Rationale is required').max(2000),
  evidence: z
    .object({
      aggregationId: z.string().optional(),
      sourceType: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// Escalation Review Request Bodies (Phase 8e)
// ============================================================================

/**
 * Request body for approving an escalated (pending_review) mutation.
 * A human reviewer must provide a reason justifying the override of
 * ontological conflict warnings.
 */
export const ApproveMutationRequestSchema = z.object({
  reason: z
    .string()
    .min(1, 'Approval reason is required')
    .max(2000, 'Approval reason must not exceed 2000 characters'),
});

/**
 * Request body for rejecting an escalated (pending_review) mutation.
 */
export const RejectMutationRequestSchema = z.object({
  reason: z
    .string()
    .min(1, 'Rejection reason is required')
    .max(2000, 'Rejection reason must not exceed 2000 characters'),
});

/**
 * Request body for requesting a revision of an escalated (pending_review) mutation.
 * The reviewer provides specific feedback describing what needs to change.
 */
export const RequestRevisionRequestSchema = z.object({
  feedback: z
    .string()
    .min(1, 'Revision feedback is required')
    .max(4000, 'Revision feedback must not exceed 4000 characters'),
});

export const BulkReviewMutationRequestSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'request_revision']),
    mutationIds: z.array(MutationIdSchema).min(1).max(200).optional(),
    importRunId: z.string().min(1).optional(),
    note: z
      .string()
      .min(1, 'A reviewer note is required')
      .max(4000, 'Reviewer note must not exceed 4000 characters'),
  })
  .superRefine((value, ctx) => {
    if ((value.mutationIds?.length ?? 0) === 0 && value.importRunId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either mutationIds or importRunId for bulk review.',
        path: ['mutationIds'],
      });
    }
  });

/**
 * Request body for resubmitting a mutation after revision.
 * The proposer provides updated operations replacing the old ones.
 */
export const ResubmitMutationRequestSchema = z.object({
  operations: z
    .array(CkgMutationOperationSchema)
    .min(1, 'At least one operation is required')
    .max(50, 'Maximum 50 operations per mutation'),
});

// ============================================================================
// Type Inference
// ============================================================================

export type MutationIdParams = z.infer<typeof MutationIdParamsSchema>;
export type MutationQueryParams = z.infer<typeof MutationQueryParamsSchema>;
export type ProposeMutationRequest = z.infer<typeof ProposeMutationRequestSchema>;
export type ApproveMutationRequest = z.infer<typeof ApproveMutationRequestSchema>;
export type RejectMutationRequest = z.infer<typeof RejectMutationRequestSchema>;
export type RequestRevisionRequest = z.infer<typeof RequestRevisionRequestSchema>;
export type ResubmitMutationRequest = z.infer<typeof ResubmitMutationRequestSchema>;
export type BulkReviewMutationRequest = z.infer<typeof BulkReviewMutationRequestSchema>;
