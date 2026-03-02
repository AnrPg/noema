/**
 * @noema/knowledge-graph-service — Shared Service Helpers
 *
 * Pure utility functions and constants extracted from KnowledgeGraphService.
 * These are stateless functions that do not depend on class state — they
 * operate solely on their arguments.
 *
 * Extracted as part of Fix 4.3 (God-object decomposition).
 */

import type { IGraphEdge, IGraphNode, IStructuralMetrics } from '@noema/types';

import { ValidationError } from './errors/base.errors.js';
import type { IExecutionContext } from './execution-context.js';
import type { IUpdateEdgeInput, IUpdateNodeInput } from './graph.repository.js';
import { SIGNIFICANT_CHANGE_THRESHOLD } from './policies/analysis-thresholds.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum traversal depth to prevent runaway queries. */
export const MAX_TRAVERSAL_DEPTH = 20;

/** Maximum number of items per page for list operations. */
export const MAX_PAGE_SIZE = 200;

// ============================================================================
// Authentication
// ============================================================================

/**
 * Assert that the execution context carries an authenticated userId.
 */
export function requireAuth(context: IExecutionContext): void {
  if (!context.userId) {
    throw new ValidationError('Authentication required', {
      userId: ['Must be authenticated to access knowledge graph operations'],
    });
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate input against a Zod schema, throwing ValidationError on failure.
 * Follows the content-service safeParse + throw pattern.
 */
export function validateInput<T>(
  schema: {
    safeParse: (data: unknown) => {
      success: boolean;
      data?: T;
      error?: { flatten: () => { fieldErrors: Record<string, string[]> } };
    };
  },
  input: unknown,
  schemaName: string
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    if (!result.error) {
      throw new ValidationError(`${schemaName} validation failed`, {});
    }
    const errors = result.error.flatten();
    throw new ValidationError(`${schemaName} validation failed`, errors.fieldErrors);
  }
  if (result.data === undefined) {
    throw new ValidationError(`${schemaName} validation returned no data`, {});
  }
  return result.data;
}

/**
 * Validate traversal depth against the maximum allowed.
 */
export function validateTraversalDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new ValidationError(`Traversal depth must be a positive integer, got ${String(depth)}`, {
      maxDepth: ['Must be a positive integer ≥ 1'],
    });
  }
  if (depth > MAX_TRAVERSAL_DEPTH) {
    throw new ValidationError(
      `Traversal depth ${String(depth)} exceeds maximum allowed ${String(MAX_TRAVERSAL_DEPTH)}`,
      { maxDepth: [`Must be ≤ ${String(MAX_TRAVERSAL_DEPTH)}`] }
    );
  }
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Compute changed fields with before/after values for a node update.
 */
export function computeNodeChangedFields(
  existing: IGraphNode,
  updates: IUpdateNodeInput
): readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[] {
  const changes: { field: string; before: unknown; after: unknown }[] = [];

  if (updates.label !== undefined && updates.label !== existing.label) {
    changes.push({ field: 'label', before: existing.label, after: updates.label });
  }
  if (updates.description !== undefined && updates.description !== existing.description) {
    changes.push({
      field: 'description',
      before: existing.description,
      after: updates.description,
    });
  }
  if (updates.domain !== undefined && updates.domain !== existing.domain) {
    changes.push({ field: 'domain', before: existing.domain, after: updates.domain });
  }
  if (updates.masteryLevel !== undefined && updates.masteryLevel !== existing.masteryLevel) {
    changes.push({
      field: 'masteryLevel',
      before: existing.masteryLevel,
      after: updates.masteryLevel,
    });
  }
  if (updates.properties !== undefined) {
    // Use deep equality to avoid recording no-op changes for object fields
    if (JSON.stringify(existing.properties) !== JSON.stringify(updates.properties)) {
      changes.push({
        field: 'properties',
        before: existing.properties,
        after: updates.properties,
      });
    }
  }

  return changes;
}

/**
 * Compute changed fields with before/after values for an edge update.
 */
export function computeEdgeChangedFields(
  existing: IGraphEdge,
  updates: IUpdateEdgeInput
): readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[] {
  const changes: { field: string; before: unknown; after: unknown }[] = [];

  if (updates.weight !== undefined && (updates.weight as number) !== (existing.weight as number)) {
    changes.push({ field: 'weight', before: existing.weight, after: updates.weight });
  }
  if (updates.properties !== undefined) {
    // Use deep equality to avoid recording no-op changes for object fields
    if (JSON.stringify(existing.properties) !== JSON.stringify(updates.properties)) {
      changes.push({
        field: 'properties',
        before: existing.properties,
        after: updates.properties,
      });
    }
  }

  return changes;
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Determines whether any metric changed significantly compared to a
 * previous snapshot. Returns true when there is no previous data (always
 * publish on first computation) or when any metric's absolute delta
 * exceeds `SIGNIFICANT_CHANGE_THRESHOLD`.
 */
export function detectSignificantMetricChange(
  current: IStructuralMetrics,
  previous: IStructuralMetrics | null
): boolean {
  if (!previous) return true; // first computation — always significant

  const fields: readonly (keyof IStructuralMetrics)[] = [
    'abstractionDrift',
    'depthCalibrationGradient',
    'scopeLeakageIndex',
    'siblingConfusionEntropy',
    'upwardLinkStrength',
    'traversalBreadthScore',
    'strategyDepthFit',
    'structuralStrategyEntropy',
    'structuralAttributionAccuracy',
    'structuralStabilityGain',
    'boundarySensitivityImprovement',
  ];

  return fields.some((f) => Math.abs(current[f] - previous[f]) > SIGNIFICANT_CHANGE_THRESHOLD);
}
