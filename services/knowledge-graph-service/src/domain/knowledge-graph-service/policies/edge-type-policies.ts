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

import { EdgeOntologicalCategory, GraphEdgeType, GraphNodeType } from '@noema/types';

import { EdgePolicy, type IEdgePolicy } from '../value-objects/graph.value-objects.js';

// ============================================================================
// All GraphNodeType values (for "all types allowed" shorthand)
// ============================================================================

const ALL_NODE_TYPES: readonly GraphNodeType[] = [
  GraphNodeType.CONCEPT,
  GraphNodeType.SKILL,
  GraphNodeType.FACT,
  GraphNodeType.PROCEDURE,
  GraphNodeType.PRINCIPLE,
  GraphNodeType.EXAMPLE,
  GraphNodeType.COUNTEREXAMPLE,
  GraphNodeType.MISCONCEPTION,
] as const;

/** Concept-bearing node types (excludes examples/counterexamples/misconceptions) */
const CONCEPT_BEARING_TYPES: readonly GraphNodeType[] = [
  GraphNodeType.CONCEPT,
  GraphNodeType.SKILL,
  GraphNodeType.FACT,
  GraphNodeType.PROCEDURE,
  GraphNodeType.PRINCIPLE,
] as const;

// ============================================================================
// EDGE_TYPE_POLICIES — 17 epistemological edge types
// ============================================================================

/**
 * Policy configuration for every `GraphEdgeType`.
 *
 * Keyed by the edge type's string value (e.g. `'prerequisite'`).
 * Values are deeply frozen `IEdgePolicy` instances carrying ontological
 * metadata (category, symmetry, description) in addition to structural
 * validation rules (acyclicity, node type constraints, weight).
 *
 * The 17 edge types span 6 ontological categories:
 *
 * | Category               | Edge Types                                                 |
 * |------------------------|------------------------------------------------------------|
 * | Taxonomic              | is_a, exemplifies                                          |
 * | Mereological           | part_of, constituted_by                                    |
 * | Logical                | equivalent_to, entails, disjoint_with, contradicts         |
 * | Causal/Temporal        | causes, precedes, depends_on                               |
 * | Associative            | related_to, analogous_to, contrasts_with                   |
 * | Structural/Pedagogical | prerequisite, derived_from, has_property                   |
 */
export const EDGE_TYPE_POLICIES: Readonly<Record<GraphEdgeType, IEdgePolicy>> = Object.freeze({
  // ═══════════════════════════════════════════════════════════════════════════
  // TAXONOMIC
  // ═══════════════════════════════════════════════════════════════════════════

  // ── is_a ────────────────────────────────────────────────────────────────
  // Acyclic: YES — taxonomic inheritance cannot be circular.
  // Restricted to concept → concept.
  [GraphEdgeType.IS_A]: EdgePolicy.create({
    edgeType: GraphEdgeType.IS_A,
    category: EdgeOntologicalCategory.TAXONOMIC,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.SKILL],
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.SKILL],
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Taxonomic subsumption (genus–species): "A is a kind of B". ' +
      'The source inherits the defining properties of the target as a specialisation. ' +
      'Use when A is a sub-category or sub-type of B.',
  }),

  // ── exemplifies ─────────────────────────────────────────────────────────
  // Acyclic: YES — "X exemplifies Y" is a type-instance relationship;
  // an example can't exemplify itself.
  [GraphEdgeType.EXEMPLIFIES]: EdgePolicy.create({
    edgeType: GraphEdgeType.EXEMPLIFIES,
    category: EdgeOntologicalCategory.TAXONOMIC,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: [GraphNodeType.EXAMPLE, GraphNodeType.COUNTEREXAMPLE],
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.PRINCIPLE, GraphNodeType.FACT],
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Type-instance exemplification: "A is an example of B". ' +
      'Links concrete examples or counterexamples to the abstract concept, ' +
      'principle, or fact they illustrate.',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // MEREOLOGICAL
  // ═══════════════════════════════════════════════════════════════════════════

  // ── part_of ─────────────────────────────────────────────────────────────
  // Acyclic: YES — "A is part of B is part of A" violates the compositional
  // hierarchy. This edge creates a strict containment structure.
  [GraphEdgeType.PART_OF]: EdgePolicy.create({
    edgeType: GraphEdgeType.PART_OF,
    category: EdgeOntologicalCategory.MEREOLOGICAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.PRINCIPLE],
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Part-whole composition: "A is a component/part of B". ' +
      'A is structurally contained within B. Use for domain decomposition — ' +
      'e.g., "Derivative PART_OF Calculus".',
  }),

  // ── constituted_by ──────────────────────────────────────────────────────
  // Acyclic: YES — constitution is a one-way material dependency.
  // Different from part_of: the statue is constituted by clay, but clay is
  // not a "part" of the statue in the compositional sense.
  [GraphEdgeType.CONSTITUTED_BY]: EdgePolicy.create({
    edgeType: GraphEdgeType.CONSTITUTED_BY,
    category: EdgeOntologicalCategory.MEREOLOGICAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.PROCEDURE, GraphNodeType.PRINCIPLE],
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.FACT, GraphNodeType.PRINCIPLE],
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Material constitution without identity: "A is constituted by B". ' +
      'A is made of or built from B, but they are not identical — ' +
      'e.g., "Algorithm constituted_by Data Structures + Control Flow".',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGICAL
  // ═══════════════════════════════════════════════════════════════════════════

  // ── equivalent_to ───────────────────────────────────────────────────────
  // Acyclic: NO — equivalence is symmetric and reflexive by definition.
  // "A ≡ B" implies "B ≡ A".
  [GraphEdgeType.EQUIVALENT_TO]: EdgePolicy.create({
    edgeType: GraphEdgeType.EQUIVALENT_TO,
    category: EdgeOntologicalCategory.LOGICAL,
    requiresAcyclicity: false,
    isSymmetric: true,
    allowedSourceTypes: CONCEPT_BEARING_TYPES,
    allowedTargetTypes: CONCEPT_BEARING_TYPES,
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Mutual entailment / co-extensionality: "A is equivalent to B". ' +
      'Both concepts necessarily imply each other and are interchangeable in all contexts. ' +
      'Use sparingly — most seemingly equivalent concepts differ in some framing.',
  }),

  // ── entails ─────────────────────────────────────────────────────────────
  // Acyclic: YES — if A entails B and B entails A, they are equivalent (use
  // equivalent_to instead). Asymmetric entailment must be acyclic.
  [GraphEdgeType.ENTAILS]: EdgePolicy.create({
    edgeType: GraphEdgeType.ENTAILS,
    category: EdgeOntologicalCategory.LOGICAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: CONCEPT_BEARING_TYPES,
    allowedTargetTypes: CONCEPT_BEARING_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.9,
    description:
      'Asymmetric logical entailment: "A necessarily implies B". ' +
      'Knowing/understanding A guarantees knowledge of B, but not vice versa. ' +
      'Different from prerequisite (learning order) — entailment is a logical, ' +
      'not pedagogical, relationship.',
  }),

  // ── disjoint_with ──────────────────────────────────────────────────────
  // Acyclic: NO — disjointness is symmetric. "A ⊥ B" iff "B ⊥ A".
  [GraphEdgeType.DISJOINT_WITH]: EdgePolicy.create({
    edgeType: GraphEdgeType.DISJOINT_WITH,
    category: EdgeOntologicalCategory.LOGICAL,
    requiresAcyclicity: false,
    isSymmetric: true,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.SKILL],
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.SKILL],
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Mutual exclusion: "A and B cannot both apply to the same entity". ' +
      'Stronger than contradicts — disjointness is absolute. ' +
      'Use for formally exclusive categories, e.g., "Rational disjoint_with Irrational".',
  }),

  // ── contradicts ─────────────────────────────────────────────────────────
  // Acyclic: NO — contradiction is symmetric. Mutual contradiction cycles
  // can naturally exist when concepts are in tension.
  [GraphEdgeType.CONTRADICTS]: EdgePolicy.create({
    edgeType: GraphEdgeType.CONTRADICTS,
    category: EdgeOntologicalCategory.LOGICAL,
    requiresAcyclicity: false,
    isSymmetric: true,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Contradiction or tension: "A conflicts with or challenges B". ' +
      'Weaker than disjoint_with — contradictions may be context-dependent ' +
      'or resolvable at a higher level of abstraction. ' +
      'Use for competing theories, conflicting heuristics, or misconception linkages.',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CAUSAL / TEMPORAL
  // ═══════════════════════════════════════════════════════════════════════════

  // ── causes ──────────────────────────────────────────────────────────────
  // Acyclic: YES — causal cycles in a pedagogical graph indicate modelling
  // errors (real-world feedback loops should be modelled differently).
  [GraphEdgeType.CAUSES]: EdgePolicy.create({
    edgeType: GraphEdgeType.CAUSES,
    category: EdgeOntologicalCategory.CAUSAL_TEMPORAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.8,
    description:
      'Causal dependence: "A causes, produces, or gives rise to B". ' +
      'Use for mechanistic or explanatory links where A is a cause ' +
      'and B is an effect.',
  }),

  // ── precedes ────────────────────────────────────────────────────────────
  // Acyclic: YES — temporal/logical ordering is a strict partial order.
  [GraphEdgeType.PRECEDES]: EdgePolicy.create({
    edgeType: GraphEdgeType.PRECEDES,
    category: EdgeOntologicalCategory.CAUSAL_TEMPORAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: CONCEPT_BEARING_TYPES,
    allowedTargetTypes: CONCEPT_BEARING_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.8,
    description:
      'Temporal or logical ordering: "A precedes B". ' +
      'Use for historical development ("Newtonian Mechanics precedes Relativity"), ' +
      'conceptual ordering, or logical sequence. Different from prerequisite — ' +
      'precedes captures domain chronology, not learning order.',
  }),

  // ── depends_on ──────────────────────────────────────────────────────────
  // Acyclic: YES — existential/definitional dependence must bottom out.
  // If A depends on B, B is needed for A to exist or be well-defined.
  [GraphEdgeType.DEPENDS_ON]: EdgePolicy.create({
    edgeType: GraphEdgeType.DEPENDS_ON,
    category: EdgeOntologicalCategory.CAUSAL_TEMPORAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.9,
    description:
      'Existential or generic dependence: "A depends on B for its existence or definition". ' +
      'Use when A cannot exist, be defined, or function without B — ' +
      'e.g., "Color depends_on Surface", "Velocity depends_on Reference Frame". ' +
      'Different from prerequisite (learning) and entails (logical implication).',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSOCIATIVE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── related_to ──────────────────────────────────────────────────────────
  // Acyclic: NO — symmetric association; "A relates to B" and "B relates
  // to A" are both valid. Cycles are natural.
  [GraphEdgeType.RELATED_TO]: EdgePolicy.create({
    edgeType: GraphEdgeType.RELATED_TO,
    category: EdgeOntologicalCategory.ASSOCIATIVE,
    requiresAcyclicity: false,
    isSymmetric: true,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.5,
    description:
      'Generic associative link with the weakest semantic commitment. ' +
      '"A is related to B" — use only when no more specific edge type applies. ' +
      'Prefer a precise relation (analogous_to, contrasts_with, depends_on, etc.) ' +
      'whenever the nature of the relationship is known.',
  }),

  // ── analogous_to ────────────────────────────────────────────────────────
  // Acyclic: NO — analogy is symmetric. "A ~ B" implies "B ~ A".
  [GraphEdgeType.ANALOGOUS_TO]: EdgePolicy.create({
    edgeType: GraphEdgeType.ANALOGOUS_TO,
    category: EdgeOntologicalCategory.ASSOCIATIVE,
    requiresAcyclicity: false,
    isSymmetric: true,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.6,
    description:
      'Structural or functional analogy: "A is analogous to B". ' +
      'A and B share structural resemblance across different domains or contexts — ' +
      'e.g., "Electric current analogous_to Water flow", ' +
      '"Thermodynamic Entropy analogous_to Information Entropy".',
  }),

  // ── contrasts_with ──────────────────────────────────────────────────────
  // Acyclic: NO — contrast is symmetric. Gradable opposition is natural.
  [GraphEdgeType.CONTRASTS_WITH]: EdgePolicy.create({
    edgeType: GraphEdgeType.CONTRASTS_WITH,
    category: EdgeOntologicalCategory.ASSOCIATIVE,
    requiresAcyclicity: false,
    isSymmetric: true,
    allowedSourceTypes: ALL_NODE_TYPES,
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 0.7,
    description:
      'Opposition without contradiction: "A contrasts with B". ' +
      'Use for gradable antonyms, complementary pairs, or concepts that are ' +
      'best understood in opposition — e.g., "Acid contrasts_with Base", ' +
      '"Static Typing contrasts_with Dynamic Typing". ' +
      'Weaker than contradicts or disjoint_with.',
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURAL / PEDAGOGICAL
  // ═══════════════════════════════════════════════════════════════════════════

  // ── prerequisite ────────────────────────────────────────────────────────
  // Acyclic: YES — "A requires B requires A" is a logical impossibility.
  [GraphEdgeType.PREREQUISITE]: EdgePolicy.create({
    edgeType: GraphEdgeType.PREREQUISITE,
    category: EdgeOntologicalCategory.STRUCTURAL_PEDAGOGICAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.PROCEDURE, GraphNodeType.PRINCIPLE],
    allowedTargetTypes: [
      GraphNodeType.CONCEPT,
      GraphNodeType.PROCEDURE,
      GraphNodeType.PRINCIPLE,
      GraphNodeType.FACT,
    ],
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Learning dependency: "A requires B to be learned/understood first". ' +
      'This is a pedagogical ordering, not a logical one. ' +
      'Use for curriculum sequencing — e.g., "Integration prerequisite Differentiation".',
  }),

  // ── derived_from ────────────────────────────────────────────────────────
  // Acyclic: YES — derivation chains must have a foundation. If A is
  // derived from B which is derived from A, neither has independent
  // justification.
  [GraphEdgeType.DERIVED_FROM]: EdgePolicy.create({
    edgeType: GraphEdgeType.DERIVED_FROM,
    category: EdgeOntologicalCategory.STRUCTURAL_PEDAGOGICAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.PROCEDURE, GraphNodeType.PRINCIPLE],
    allowedTargetTypes: ALL_NODE_TYPES,
    maxWeight: 1.0,
    defaultWeight: 1.0,
    description:
      'Derivation chain: "A is logically or mathematically derived from B". ' +
      "The source's validity depends on the target's — e.g., " +
      '"Quadratic Formula derived_from Completing the Square".',
  }),

  // ── has_property ────────────────────────────────────────────────────────
  // Acyclic: YES — properties inhere in bearers, not vice versa.
  [GraphEdgeType.HAS_PROPERTY]: EdgePolicy.create({
    edgeType: GraphEdgeType.HAS_PROPERTY,
    category: EdgeOntologicalCategory.STRUCTURAL_PEDAGOGICAL,
    requiresAcyclicity: true,
    isSymmetric: false,
    allowedSourceTypes: [GraphNodeType.CONCEPT, GraphNodeType.PROCEDURE, GraphNodeType.PRINCIPLE],
    allowedTargetTypes: [GraphNodeType.CONCEPT, GraphNodeType.FACT, GraphNodeType.PRINCIPLE],
    maxWeight: 1.0,
    defaultWeight: 0.8,
    description:
      'Inherence: "A has property/quality B". ' +
      'A quality or attribute inheres in its bearer — e.g., ' +
      '"Bubble Sort has_property O(n²) Time Complexity", ' +
      '"Photon has_property Wave–Particle Duality".',
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
 */
export function getEdgePolicy(edgeType: GraphEdgeType): IEdgePolicy {
  // Record<GraphEdgeType, IEdgePolicy> guarantees all edge types have policies.
  // If a new type is added without updating policies, TypeScript catches it
  // at compile time.
  return EDGE_TYPE_POLICIES[edgeType];
}
