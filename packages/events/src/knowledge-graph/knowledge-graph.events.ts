/**
 * @noema/events - Knowledge Graph Domain Events
 *
 * Event definitions for the knowledge-graph-service covering:
 * - PKG (Personal Knowledge Graph) lifecycle events
 * - CKG (Canonical Knowledge Graph) mutation pipeline events
 * - Metacognitive events (misconceptions, interventions, stage transitions)
 *
 * Payload types are self-contained so that event consumers in any service
 * can use them without importing knowledge-graph-service internals.
 *
 * Aggregate type naming:
 * - PKG events → PersonalKnowledgeGraph (aggregateId = userId)
 * - CKG events → CanonicalKnowledgeGraph (aggregateId = mutationId or nodeId)
 * - Misconception → Misconception (aggregateId = userId)
 * - Intervention → Intervention (aggregateId = interventionId)
 * - MetacognitiveStage → MetacognitiveStage (aggregateId = userId)
 *
 * @module @noema/events/knowledge-graph
 */

import type {
  AgentId,
  EdgeId,
  GraphEdgeType,
  GraphNodeType,
  InterventionId,
  InterventionType,
  IStructuralMetrics,
  MetacognitiveStage,
  Metadata,
  MisconceptionPatternId,
  MisconceptionType,
  MutationId,
  MutationState,
  NodeId,
  PromotionBand,
  UserId,
} from '@noema/types';
import type { ITypedEvent } from '../types.js';

// ============================================================================
// Event Types Registry
// ============================================================================

/**
 * All knowledge-graph domain event types.
 *
 * Follows the {aggregate}.{action} or {aggregate}.{subresource}.{action}
 * naming convention with lowercase, dot-separated parts.
 */
export const KnowledgeGraphEventType = {
  // ── PKG Events ──────────────────────────────────────────────────────────
  PKG_NODE_CREATED: 'pkg.node.created',
  PKG_NODE_UPDATED: 'pkg.node.updated',
  PKG_NODE_REMOVED: 'pkg.node.removed',
  PKG_EDGE_CREATED: 'pkg.edge.created',
  PKG_EDGE_UPDATED: 'pkg.edge.updated',
  PKG_EDGE_REMOVED: 'pkg.edge.removed',
  PKG_STRUCTURAL_METRICS_UPDATED: 'pkg.metrics.updated',

  // ── CKG Events ─────────────────────────────────────────────────────────
  CKG_MUTATION_PROPOSED: 'ckg.mutation.proposed',
  CKG_MUTATION_VALIDATED: 'ckg.mutation.validated',
  CKG_MUTATION_COMMITTED: 'ckg.mutation.committed',
  CKG_MUTATION_REJECTED: 'ckg.mutation.rejected',
  CKG_MUTATION_ESCALATED: 'ckg.mutation.escalated',
  CKG_NODE_PROMOTED: 'ckg.node.promoted',

  // ── Metacognitive Events ───────────────────────────────────────────────
  MISCONCEPTION_DETECTED: 'misconception.detected',
  INTERVENTION_TRIGGERED: 'intervention.triggered',
  METACOGNITIVE_STAGE_TRANSITIONED: 'metacognitive.transitioned',
} as const;

export type KnowledgeGraphEventType =
  (typeof KnowledgeGraphEventType)[keyof typeof KnowledgeGraphEventType];

// ============================================================================
// PKG Event Payloads
// ============================================================================

/**
 * Payload for pkg.node.created — a node was added to a user's PKG.
 */
export interface IPkgNodeCreatedPayload {
  /** The created node's ID */
  nodeId: NodeId;
  /** Owner of the PKG */
  userId: UserId;
  /** Semantic type of the node */
  nodeType: GraphNodeType;
  /** Human-readable label */
  label: string;
  /** Knowledge domain */
  domain: string;
  /** Additional node metadata */
  metadata: Metadata;
}

/**
 * Payload for pkg.node.updated — a node's attributes changed.
 */
export interface IPkgNodeUpdatedPayload {
  /** The updated node's ID */
  nodeId: NodeId;
  /** Owner of the PKG */
  userId: UserId;
  /** List of field names that changed */
  changedFields: string[];
  /** Previous values of changed fields */
  previousValues: Metadata;
  /** New values of changed fields */
  newValues: Metadata;
}

/**
 * Payload for pkg.node.removed — a node was soft-deleted from a user's PKG.
 */
export interface IPkgNodeRemovedPayload {
  /** The removed node's ID */
  nodeId: NodeId;
  /** Owner of the PKG */
  userId: UserId;
  /** Reason for removal */
  reason: string;
}

/**
 * Payload for pkg.edge.created — an edge was added between two PKG nodes.
 */
export interface IPkgEdgeCreatedPayload {
  /** The created edge's ID */
  edgeId: EdgeId;
  /** Owner of the PKG */
  userId: UserId;
  /** Source node of the directed edge */
  sourceNodeId: NodeId;
  /** Target node of the directed edge */
  targetNodeId: NodeId;
  /** Semantic type of the relationship */
  edgeType: GraphEdgeType;
  /** Relationship weight (0-1) */
  weight: number;
  /** Additional edge metadata */
  metadata: Metadata;
}

/**
 * Payload for pkg.edge.removed — an edge was removed from a user's PKG.
 */
export interface IPkgEdgeRemovedPayload {
  /** The removed edge's ID */
  edgeId: EdgeId;
  /** Owner of the PKG */
  userId: UserId;
  /** Reason for removal */
  reason: string;
}

/**
 * Payload for pkg.edge.updated — an edge's weight or properties changed.
 */
export interface IPkgEdgeUpdatedPayload {
  /** The updated edge's ID */
  edgeId: EdgeId;
  /** Owner of the PKG */
  userId: UserId;
  /** List of field names that changed */
  changedFields: string[];
  /** Previous values of changed fields */
  previousValues: Metadata;
  /** New values of changed fields */
  newValues: Metadata;
}

/**
 * Payload for pkg.metrics.updated — structural metrics were recalculated.
 */
export interface IPkgStructuralMetricsUpdatedPayload {
  /** Owner of the PKG */
  userId: UserId;
  /** Knowledge domain the metrics apply to */
  domain: string;
  /** Current structural metrics snapshot */
  metrics: IStructuralMetrics;
  /** Previous metrics snapshot (for delta computation) */
  previousMetrics: IStructuralMetrics;
  /** When the metrics were computed (ISO 8601) */
  computedAt: string;
}

// ============================================================================
// CKG Event Payloads
// ============================================================================

/**
 * Payload for ckg.mutation.proposed — an agent proposed a CKG change.
 */
export interface ICkgMutationProposedPayload {
  /** Unique mutation lifecycle ID */
  mutationId: MutationId;
  /** Agent that proposed the mutation */
  proposedBy: AgentId;
  /** The mutation DSL operations */
  operations: Metadata[];
  /** Human-readable justification */
  rationale: string;
  /** Number of supporting evidence items */
  evidenceCount: number;
}

/**
 * Payload for ckg.mutation.validated — a mutation passed validation.
 */
export interface ICkgMutationValidatedPayload {
  /** Mutation lifecycle ID */
  mutationId: MutationId;
  /** Per-stage validation results */
  validationResults: Metadata;
}

/**
 * Payload for ckg.mutation.committed — a mutation was applied to the CKG.
 */
export interface ICkgMutationCommittedPayload {
  /** Mutation lifecycle ID */
  mutationId: MutationId;
  /** Operations that were applied */
  appliedOperations: Metadata[];
  /** Node IDs affected by the mutation */
  affectedNodeIds: NodeId[];
  /** Edge IDs affected by the mutation */
  affectedEdgeIds: EdgeId[];
}

/**
 * Payload for ckg.mutation.rejected — a mutation failed or was rejected.
 */
export interface ICkgMutationRejectedPayload {
  /** Mutation lifecycle ID */
  mutationId: MutationId;
  /** Reason for rejection */
  reason: string;
  /** Stage where the mutation failed */
  failedStage: MutationState;
  /** Entity that rejected (agent ID or system) */
  rejectedBy: string;
}

/**
 * Payload for ckg.mutation.escalated — a mutation was escalated for human review
 * due to ontological conflicts detected by the OntologicalConsistencyStage.
 */
export interface ICkgMutationEscalatedPayload {
  /** Mutation lifecycle ID */
  mutationId: MutationId;
  /** Agent that proposed the mutation */
  proposedBy: AgentId;
  /** Ontological conflict details */
  conflicts: Array<{
    /** Edge type being added */
    proposedEdgeType: GraphEdgeType;
    /** Conflicting edge type already present or in batch */
    conflictingEdgeType: GraphEdgeType;
    /** Source node of the proposed edge */
    sourceNodeId: NodeId;
    /** Target node of the proposed edge */
    targetNodeId: NodeId;
    /** Human-readable conflict explanation */
    reason: string;
  }>;
  /** Total number of ontological violations */
  violationCount: number;
  /** Human-readable escalation reason */
  reason: string;
}

/**
 * Payload for ckg.node.promoted — a concept was promoted from PKGs to CKG.
 */
export interface ICkgNodePromotedPayload {
  /** The promoted node's ID in the CKG */
  nodeId: NodeId;
  /** Confidence band of the promotion */
  promotionBand: PromotionBand;
  /** Number of evidence items supporting promotion */
  evidenceCount: number;
  /** Number of users who contributed to this promotion */
  contributingUserCount: number;
  /** ID of the aggregation run that triggered promotion */
  aggregationRunId: string;
}

// ============================================================================
// Metacognitive Event Payloads
// ============================================================================

/**
 * Payload for misconception.detected — a misconception was found in a PKG.
 */
export interface IMisconceptionDetectedPayload {
  /** User whose PKG contains the misconception */
  userId: UserId;
  /** Type from the misconception taxonomy */
  misconceptionType: MisconceptionType;
  /** Node IDs affected by the misconception */
  affectedNodeIds: NodeId[];
  /** Detection confidence (0-1) */
  confidence: number;
  /** Pattern that detected the misconception */
  patternId: MisconceptionPatternId;
  /** Supporting evidence for the detection */
  evidence: Metadata;
}

/**
 * Payload for intervention.triggered — a remediation was initiated.
 */
export interface IInterventionTriggeredPayload {
  /** Unique intervention ID */
  interventionId: InterventionId;
  /** Target user */
  userId: UserId;
  /** Misconception type being addressed */
  misconceptionType: MisconceptionType;
  /** Type of remediation action */
  interventionType: InterventionType;
  /** Nodes targeted by the intervention */
  targetNodeIds: NodeId[];
  /** Optional generated content for the intervention */
  content?: Metadata;
}

/**
 * Payload for metacognitive.transitioned — user progressed/regressed in stages.
 */
export interface IMetacognitiveStageTransitionedPayload {
  /** User whose stage changed */
  userId: UserId;
  /** Knowledge domain of the transition */
  domain: string;
  /** Stage before the transition */
  previousStage: MetacognitiveStage;
  /** Stage after the transition */
  newStage: MetacognitiveStage;
  /** Metrics that triggered the transition */
  triggeringMetrics: IStructuralMetrics;
  /** Human-readable rationale for the transition */
  rationale: string;
}

// ============================================================================
// Typed Events
// ============================================================================

// PKG Events
export type PkgNodeCreatedEvent = ITypedEvent<
  'pkg.node.created',
  'PersonalKnowledgeGraph',
  IPkgNodeCreatedPayload
>;
export type PkgNodeUpdatedEvent = ITypedEvent<
  'pkg.node.updated',
  'PersonalKnowledgeGraph',
  IPkgNodeUpdatedPayload
>;
export type PkgNodeRemovedEvent = ITypedEvent<
  'pkg.node.removed',
  'PersonalKnowledgeGraph',
  IPkgNodeRemovedPayload
>;
export type PkgEdgeCreatedEvent = ITypedEvent<
  'pkg.edge.created',
  'PersonalKnowledgeGraph',
  IPkgEdgeCreatedPayload
>;
export type PkgEdgeUpdatedEvent = ITypedEvent<
  'pkg.edge.updated',
  'PersonalKnowledgeGraph',
  IPkgEdgeUpdatedPayload
>;
export type PkgEdgeRemovedEvent = ITypedEvent<
  'pkg.edge.removed',
  'PersonalKnowledgeGraph',
  IPkgEdgeRemovedPayload
>;
export type PkgStructuralMetricsUpdatedEvent = ITypedEvent<
  'pkg.metrics.updated',
  'PersonalKnowledgeGraph',
  IPkgStructuralMetricsUpdatedPayload
>;

// CKG Events
export type CkgMutationProposedEvent = ITypedEvent<
  'ckg.mutation.proposed',
  'CanonicalKnowledgeGraph',
  ICkgMutationProposedPayload
>;
export type CkgMutationValidatedEvent = ITypedEvent<
  'ckg.mutation.validated',
  'CanonicalKnowledgeGraph',
  ICkgMutationValidatedPayload
>;
export type CkgMutationCommittedEvent = ITypedEvent<
  'ckg.mutation.committed',
  'CanonicalKnowledgeGraph',
  ICkgMutationCommittedPayload
>;
export type CkgMutationRejectedEvent = ITypedEvent<
  'ckg.mutation.rejected',
  'CanonicalKnowledgeGraph',
  ICkgMutationRejectedPayload
>;
export type CkgMutationEscalatedEvent = ITypedEvent<
  'ckg.mutation.escalated',
  'CanonicalKnowledgeGraph',
  ICkgMutationEscalatedPayload
>;
export type CkgNodePromotedEvent = ITypedEvent<
  'ckg.node.promoted',
  'CanonicalKnowledgeGraph',
  ICkgNodePromotedPayload
>;

// Metacognitive Events
export type MisconceptionDetectedEvent = ITypedEvent<
  'misconception.detected',
  'Misconception',
  IMisconceptionDetectedPayload
>;
export type InterventionTriggeredEvent = ITypedEvent<
  'intervention.triggered',
  'Intervention',
  IInterventionTriggeredPayload
>;
export type MetacognitiveStageTransitionedEvent = ITypedEvent<
  'metacognitive.transitioned',
  'MetacognitiveStage',
  IMetacognitiveStageTransitionedPayload
>;

// ============================================================================
// Union Types
// ============================================================================

/**
 * Union of all PKG domain events.
 */
export type PkgDomainEvent =
  | PkgNodeCreatedEvent
  | PkgNodeUpdatedEvent
  | PkgNodeRemovedEvent
  | PkgEdgeCreatedEvent
  | PkgEdgeUpdatedEvent
  | PkgEdgeRemovedEvent
  | PkgStructuralMetricsUpdatedEvent;

/**
 * Union of all CKG domain events.
 */
export type CkgDomainEvent =
  | CkgMutationProposedEvent
  | CkgMutationValidatedEvent
  | CkgMutationCommittedEvent
  | CkgMutationRejectedEvent
  | CkgMutationEscalatedEvent
  | CkgNodePromotedEvent;

/**
 * Union of all metacognitive domain events.
 */
export type MetacognitiveDomainEvent =
  | MisconceptionDetectedEvent
  | InterventionTriggeredEvent
  | MetacognitiveStageTransitionedEvent;

/**
 * Union of all knowledge-graph domain events.
 */
export type KnowledgeGraphDomainEvent = PkgDomainEvent | CkgDomainEvent | MetacognitiveDomainEvent;
