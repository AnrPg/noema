/**
 * @noema/knowledge-graph-service - Edge Type Policies
 *
 * Central, frozen configuration mapping each `GraphEdgeType` to its
 * structural validation rules. This is the cornerstone of the
 * policy-driven edge validation system described in ADR-0010.
 *
 * Instead of scattering business rules across conditionals:
 *   if (edgeType === 'prerequisite') { checkAcyclicity(); }
 *
 * ...we centralise them in a data-driven lookup:
 *   const policy = getEdgePolicy(edgeType);
 *   if (policy.requiresAcyclicity) { checkAcyclicity(); }
 *
 * Policies are deeply frozen — no caller can accidentally mutate
 * the global configuration.
 */

import { GraphEdgeType, GraphNodeType } from '@noema/types';

import { InvalidEdgeTypeError } from '../errors/graph.errors.js';
import { EdgePolicy, type IEdgePolicy } from '../value-objects/graph.value-objects.js';

// ============================================================================
// All GraphNodeType values (for "all types allowed" shorthand)
// ============================================================================

const ALL_NODE_TYPES: readonly GraphNodeType[] = [
  GraphNodeType.CONCEPT,
  GraphNodeType.FACT,
  GraphNodeType.PROCEDURE,
  GraphNodeType.PRINCIPLE,
  GraphNodeType.EXAMPLE,
  GraphNodeType.COUNTEREXAMPLE,
  GraphNodeType.MISCONCEPTION,
] as const;

// ============================================================================
// EDGE_TYPE_POLICIES
// ============================================================================

/**
 * Policy configuration for every `GraphEdgeType`.
 *
 * Keyed by the edge type's string value (e.g. `'prerequisite'`).
 * Values are deeply frozen `IEdgePolicy` instances.
 */
export const EDGE_TYPE_POLICIES: Readonly<Record<GraphEdgeType, IEdgePolicy>> = Object.freeze({
  // ── prerequisite ────────────────────────────────────────────────────────
  // Acyclic: YES — "A requires B requires A" is a logical impossibility.
  [GraphEdgeType.PREREQUISITE]: EdgePolicy.create({
    edgeType: GraphEdgeType.PREREQUISITE,
    requiresAcyclicity: true,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.PROCEDURE, GraphNodeType.PRINCIPLE],
    allowedTargetTypes: [
      GraphNodeType.CONCEPT,
      GraphNodeType.PROCEDURE,
      GraphNodeType.PRINCIPLE,
      GraphNodeType.FACT,
    ],
    maxWeight: 1.0,
    defaultWeight: 1.0,
  }),

  // ── part_of ─────────────────────────────────────────────────────────────
  // Acyclic: YES — "A is part of B is part of A" violates the compositional
  // hierarchy. This edge creates a strict containment structure.
  [GraphEdgeType.PART_OF]: EdgePolicy.create({
    edgeType: GraphEdgeType.PART_OF,
    requiresAcyclicity: true,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.PRINCIPLE],
    maxWeight: 1.0,
    defaultWeight: 1.0,
  }),

  // ── is_a ────────────────────────────────────────────────────────────────
  // Acyclic: YES — taxonomic inheritance cannot be circular.
  // Restricted to concept → concept.
  [GraphEdgeType.IS_A]: EdgePolicy.create({
    edgeType: GraphEdgeType.IS_A,
    requiresAcyclicity: true,
    allowedSourceTypes: [GraphNodeType.CONCEPT],
    allowedTargetTypes: [GraphNodeType.CONCEPT],
    maxWeight: 1.0,
    defaultWeight: 1.0,
  }),

  // ── related_to ──────────────────────────────────────────────────────────
  // Acyclic: NO — symmetric association; "A relates to B" and "B relates
  // to A" are both valid. Cycles are natural.
  [GraphEdgeType.RELATED_TO]: EdgePolicy.create({
    edgeType: GraphEdgeType.RELATED_TO,
    requiresAcyclicity: false,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.5,
  }),

  // ── contradicts ─────────────────────────────────────────────────────────
  // Acyclic: NO — contradiction is symmetric. Mutual contradiction cycles
  // can naturally exist when concepts are in tension.
  [GraphEdgeType.CONTRADICTS]: EdgePolicy.create({
    edgeType: GraphEdgeType.CONTRADICTS,
    requiresAcyclicity: false,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 1.0,
  }),

  // ── exemplifies ─────────────────────────────────────────────────────────
  // Acyclic: YES — "X exemplifies Y" is a type-instance relationship;
  // an example can't exemplify itself.
  [GraphEdgeType.EXEMPLIFIES]: EdgePolicy.create({
    edgeType: GraphEdgeType.EXEMPLIFIES,
    requiresAcyclicity: true,
    allowedSourceTypes: [GraphNodeType.EXAMPLE, GraphNodeType.COUNTEREXAMPLE],
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.PRINCIPLE, GraphNodeType.FACT],
    maxWeight: 1.0,
    defaultWeight: 1.0,
  }),

  // ── causes ──────────────────────────────────────────────────────────────
  // Acyclic: YES — causal cycles in a pedagogical graph indicate modelling
  // errors (real-world feedback loops should be modelled differently).
  [GraphEdgeType.CAUSES]: EdgePolicy.create({
    edgeType: GraphEdgeType.CAUSES,
    requiresAcyclicity: true,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.8,
  }),

  // ── derived_from ────────────────────────────────────────────────────────
  // Acyclic: YES — derivation chains must have a foundation. If A is
  // derived from B which is derived from A, neither has independent
  // justification.
  [GraphEdgeType.DERIVED_FROM]: EdgePolicy.create({
    edgeType: GraphEdgeType.DERIVED_FROM,
    requiresAcyclicity: true,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.PROCEDURE, GraphNodeType.PRINCIPLE],
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 1.0,
  }),
});

// ============================================================================
// Lookup Function
// ============================================================================

/**
 * Retrieve the validation policy for a given edge type.
 *
 * @param edgeType The edge type to look up.
 * @returns The frozen `IEdgePolicy` for the edge type.
 * @throws InvalidEdgeTypeError if the edge type has no policy defined.
 */
export function getEdgePolicy(edgeType: GraphEdgeType): IEdgePolicy {
  const policy = EDGE_TYPE_POLICIES[edgeType];
  if (!policy) {
    // This is a defensive check — if all GraphEdgeType values have policies
    // (enforced by the Record<GraphEdgeType, IEdgePolicy> type) this should
    // never fire. It exists for forward-compatibility if someone adds a new
    // edge type without updating policies.
    throw new InvalidEdgeTypeError(edgeType, 'unknown', 'unknown', Object.keys(EDGE_TYPE_POLICIES));
  }
  return policy;
}
