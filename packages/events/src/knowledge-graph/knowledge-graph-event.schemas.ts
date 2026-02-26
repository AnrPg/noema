/**
 * @noema/events - Knowledge Graph Event Zod Schemas
 *
 * Runtime validation schemas for knowledge-graph domain events.
 * Uses `createEventSchema()` from @noema/events for the envelope
 * and defines typed payload schemas for each event.
 *
 * These schemas are used by event consumers to validate incoming events
 * and by the publisher to assert outbound event structure.
 *
 * @module @noema/events/knowledge-graph
 */

import {
  AgentIdSchema,
  EdgeIdSchema,
  GraphEdgeTypeSchema,
  GraphNodeTypeSchema,
  InterventionIdSchema,
  InterventionTypeSchema,
  MetacognitiveStageSchema,
  MetadataSchema,
  MisconceptionPatternIdSchema,
  MisconceptionTypeSchema,
  MutationIdSchema,
  MutationStateSchema,
  NodeIdSchema,
  PromotionBandSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

// ============================================================================
// Shared Sub-Schemas
// ============================================================================

/**
 * Schema for the 11 structural health metrics.
 * All fields are numeric values.
 */
export const StructuralMetricsSchema = z.object({
  abstractionDrift: z.number(),
  depthCalibrationGradient: z.number(),
  scopeLeakageIndex: z.number(),
  siblingConfusionEntropy: z.number(),
  upwardLinkStrength: z.number(),
  traversalBreadthScore: z.number(),
  strategyDepthFit: z.number(),
  structuralStrategyEntropy: z.number(),
  structuralAttributionAccuracy: z.number(),
  structuralStabilityGain: z.number(),
  boundarySensitivityImprovement: z.number(),
});

// ============================================================================
// PKG Event Payload Schemas
// ============================================================================

/**
 * Payload schema for `pkg.node.created` event.
 */
export const PkgNodeCreatedPayloadSchema = z.object({
  nodeId: NodeIdSchema,
  userId: UserIdSchema,
  nodeType: GraphNodeTypeSchema,
  label: z.string().min(1),
  domain: z.string().min(1),
  metadata: MetadataSchema,
});

/**
 * Payload schema for `pkg.node.updated` event.
 */
export const PkgNodeUpdatedPayloadSchema = z.object({
  nodeId: NodeIdSchema,
  userId: UserIdSchema,
  changedFields: z.array(z.string().min(1)).min(1),
  previousValues: MetadataSchema,
  newValues: MetadataSchema,
});

/**
 * Payload schema for `pkg.node.removed` event.
 */
export const PkgNodeRemovedPayloadSchema = z.object({
  nodeId: NodeIdSchema,
  userId: UserIdSchema,
  reason: z.string().min(1),
});

/**
 * Payload schema for `pkg.edge.created` event.
 */
export const PkgEdgeCreatedPayloadSchema = z.object({
  edgeId: EdgeIdSchema,
  userId: UserIdSchema,
  sourceNodeId: NodeIdSchema,
  targetNodeId: NodeIdSchema,
  edgeType: GraphEdgeTypeSchema,
  weight: z.number().min(0).max(1),
  metadata: MetadataSchema,
});

/**
 * Payload schema for `pkg.edge.removed` event.
 */
export const PkgEdgeRemovedPayloadSchema = z.object({
  edgeId: EdgeIdSchema,
  userId: UserIdSchema,
  reason: z.string().min(1),
});

/**
 * Payload schema for `pkg.edge.updated` event.
 */
export const PkgEdgeUpdatedPayloadSchema = z.object({
  edgeId: EdgeIdSchema,
  userId: UserIdSchema,
  changedFields: z.array(z.string().min(1)).min(1),
  previousValues: MetadataSchema,
  newValues: MetadataSchema,
});

/**
 * Payload schema for `pkg.metrics.updated` event.
 */
export const PkgStructuralMetricsUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  domain: z.string().min(1),
  metrics: StructuralMetricsSchema,
  previousMetrics: StructuralMetricsSchema,
  computedAt: z.string().datetime(),
});

// ============================================================================
// CKG Event Payload Schemas
// ============================================================================

/**
 * Payload schema for `ckg.mutation.proposed` event.
 */
export const CkgMutationProposedPayloadSchema = z.object({
  mutationId: MutationIdSchema,
  proposedBy: AgentIdSchema,
  operations: z.array(MetadataSchema).min(1),
  rationale: z.string().min(1),
  evidenceCount: z.number().int().nonnegative(),
});

/**
 * Payload schema for `ckg.mutation.validated` event.
 */
export const CkgMutationValidatedPayloadSchema = z.object({
  mutationId: MutationIdSchema,
  validationResults: MetadataSchema,
});

/**
 * Payload schema for `ckg.mutation.committed` event.
 */
export const CkgMutationCommittedPayloadSchema = z.object({
  mutationId: MutationIdSchema,
  appliedOperations: z.array(MetadataSchema).min(1),
  affectedNodeIds: z.array(NodeIdSchema),
  affectedEdgeIds: z.array(EdgeIdSchema),
});

/**
 * Payload schema for `ckg.mutation.rejected` event.
 */
export const CkgMutationRejectedPayloadSchema = z.object({
  mutationId: MutationIdSchema,
  reason: z.string().min(1),
  failedStage: MutationStateSchema,
  rejectedBy: z.string().min(1),
});

/**
 * Payload schema for `ckg.node.promoted` event.
 */
export const CkgNodePromotedPayloadSchema = z.object({
  nodeId: NodeIdSchema,
  promotionBand: PromotionBandSchema,
  evidenceCount: z.number().int().positive(),
  contributingUserCount: z.number().int().positive(),
  aggregationRunId: z.string().min(1),
});

// ============================================================================
// Metacognitive Event Payload Schemas
// ============================================================================

/**
 * Payload schema for `misconception.detected` event.
 */
export const MisconceptionDetectedPayloadSchema = z.object({
  userId: UserIdSchema,
  misconceptionType: MisconceptionTypeSchema,
  affectedNodeIds: z.array(NodeIdSchema).min(1),
  confidence: z.number().min(0).max(1),
  patternId: MisconceptionPatternIdSchema,
  evidence: MetadataSchema,
});

/**
 * Payload schema for `intervention.triggered` event.
 */
export const InterventionTriggeredPayloadSchema = z.object({
  interventionId: InterventionIdSchema,
  userId: UserIdSchema,
  misconceptionType: MisconceptionTypeSchema,
  interventionType: InterventionTypeSchema,
  targetNodeIds: z.array(NodeIdSchema).min(1),
  content: MetadataSchema.optional(),
});

/**
 * Payload schema for `metacognitive.transitioned` event.
 */
export const MetacognitiveStageTransitionedPayloadSchema = z.object({
  userId: UserIdSchema,
  domain: z.string().min(1),
  previousStage: MetacognitiveStageSchema,
  newStage: MetacognitiveStageSchema,
  triggeringMetrics: StructuralMetricsSchema,
  rationale: z.string().min(1),
});

// ============================================================================
// Full Event Schemas (envelope + typed payload)
// ============================================================================

// PKG Events
export const PkgNodeCreatedEventSchema = createEventSchema(
  'pkg.node.created',
  'PersonalKnowledgeGraph',
  PkgNodeCreatedPayloadSchema
);

export const PkgNodeUpdatedEventSchema = createEventSchema(
  'pkg.node.updated',
  'PersonalKnowledgeGraph',
  PkgNodeUpdatedPayloadSchema
);

export const PkgNodeRemovedEventSchema = createEventSchema(
  'pkg.node.removed',
  'PersonalKnowledgeGraph',
  PkgNodeRemovedPayloadSchema
);

export const PkgEdgeCreatedEventSchema = createEventSchema(
  'pkg.edge.created',
  'PersonalKnowledgeGraph',
  PkgEdgeCreatedPayloadSchema
);

export const PkgEdgeRemovedEventSchema = createEventSchema(
  'pkg.edge.removed',
  'PersonalKnowledgeGraph',
  PkgEdgeRemovedPayloadSchema
);

export const PkgEdgeUpdatedEventSchema = createEventSchema(
  'pkg.edge.updated',
  'PersonalKnowledgeGraph',
  PkgEdgeUpdatedPayloadSchema
);

export const PkgStructuralMetricsUpdatedEventSchema = createEventSchema(
  'pkg.metrics.updated',
  'PersonalKnowledgeGraph',
  PkgStructuralMetricsUpdatedPayloadSchema
);

// CKG Events
export const CkgMutationProposedEventSchema = createEventSchema(
  'ckg.mutation.proposed',
  'CanonicalKnowledgeGraph',
  CkgMutationProposedPayloadSchema
);

export const CkgMutationValidatedEventSchema = createEventSchema(
  'ckg.mutation.validated',
  'CanonicalKnowledgeGraph',
  CkgMutationValidatedPayloadSchema
);

export const CkgMutationCommittedEventSchema = createEventSchema(
  'ckg.mutation.committed',
  'CanonicalKnowledgeGraph',
  CkgMutationCommittedPayloadSchema
);

export const CkgMutationRejectedEventSchema = createEventSchema(
  'ckg.mutation.rejected',
  'CanonicalKnowledgeGraph',
  CkgMutationRejectedPayloadSchema
);

export const CkgNodePromotedEventSchema = createEventSchema(
  'ckg.node.promoted',
  'CanonicalKnowledgeGraph',
  CkgNodePromotedPayloadSchema
);

// Metacognitive Events
export const MisconceptionDetectedEventSchema = createEventSchema(
  'misconception.detected',
  'Misconception',
  MisconceptionDetectedPayloadSchema
);

export const InterventionTriggeredEventSchema = createEventSchema(
  'intervention.triggered',
  'Intervention',
  InterventionTriggeredPayloadSchema
);

export const MetacognitiveStageTransitionedEventSchema = createEventSchema(
  'metacognitive.transitioned',
  'MetacognitiveStage',
  MetacognitiveStageTransitionedPayloadSchema
);

// ============================================================================
// Type Inference
// ============================================================================

// PKG
export type PkgNodeCreatedEventInput = z.input<typeof PkgNodeCreatedEventSchema>;
export type PkgNodeUpdatedEventInput = z.input<typeof PkgNodeUpdatedEventSchema>;
export type PkgNodeRemovedEventInput = z.input<typeof PkgNodeRemovedEventSchema>;
export type PkgEdgeCreatedEventInput = z.input<typeof PkgEdgeCreatedEventSchema>;
export type PkgEdgeRemovedEventInput = z.input<typeof PkgEdgeRemovedEventSchema>;
export type PkgStructuralMetricsUpdatedEventInput = z.input<
  typeof PkgStructuralMetricsUpdatedEventSchema
>;

// CKG
export type CkgMutationProposedEventInput = z.input<typeof CkgMutationProposedEventSchema>;
export type CkgMutationValidatedEventInput = z.input<typeof CkgMutationValidatedEventSchema>;
export type CkgMutationCommittedEventInput = z.input<typeof CkgMutationCommittedEventSchema>;
export type CkgMutationRejectedEventInput = z.input<typeof CkgMutationRejectedEventSchema>;
export type CkgNodePromotedEventInput = z.input<typeof CkgNodePromotedEventSchema>;

// Metacognitive
export type MisconceptionDetectedEventInput = z.input<typeof MisconceptionDetectedEventSchema>;
export type InterventionTriggeredEventInput = z.input<typeof InterventionTriggeredEventSchema>;
export type MetacognitiveStageTransitionedEventInput = z.input<
  typeof MetacognitiveStageTransitionedEventSchema
>;
