/**
 * @noema/knowledge-graph-service - PKG Operation Log API Schemas
 *
 * Zod validation schemas for PKG operation log route query parameters.
 * The operation log provides an append-only audit trail of all PKG mutations.
 */

import { EdgeIdSchema, NodeIdSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

// ============================================================================
// URL Parameters
// ============================================================================

export const OperationLogParamsSchema = z.object({
  userId: UserIdSchema,
});

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * Supported PKG operation type filter values.
 *
 * Maps to `PkgOperationType` enum values. Defined inline here rather than
 * importing from the domain layer to keep API schemas self-contained.
 */
const PkgOperationTypeValues = [
  'PkgNodeCreated',
  'PkgNodeUpdated',
  'PkgNodeDeleted',
  'PkgEdgeCreated',
  'PkgEdgeUpdated',
  'PkgEdgeDeleted',
  'PkgBatchImport',
] as const;

export const OperationLogQueryParamsSchema = z.object({
  operationType: z.enum(PkgOperationTypeValues).optional(),
  nodeId: NodeIdSchema.optional(),
  edgeId: EdgeIdSchema.optional(),
  since: z.string().datetime({ message: 'Must be a valid ISO 8601 datetime string' }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

// ============================================================================
// Type Inference
// ============================================================================

export type OperationLogParams = z.infer<typeof OperationLogParamsSchema>;
export type OperationLogQueryParams = z.infer<typeof OperationLogQueryParamsSchema>;
