/**
 * @noema/knowledge-graph-service — Edge Type Policies Unit Tests
 *
 * Exhaustive tests for the 17 epistemological edge-type policies:
 * - Policy completeness (every GraphEdgeType has a policy)
 * - Acyclicity rules
 * - Symmetry properties
 * - Ontological category assignment
 * - Node type constraints
 * - Weight constraints
 * - getEdgePolicy() lookup
 */

import { describe, expect, it } from 'vitest';

import { EdgeOntologicalCategory, GraphEdgeType, GraphNodeType } from '@noema/types';

import {
  EDGE_TYPE_POLICIES,
  getEdgePolicy,
} from '../../../src/domain/knowledge-graph-service/policies/edge-type-policies.js';

// ============================================================================
// All 17 edge types
// ============================================================================

const ALL_EDGE_TYPES = Object.values(GraphEdgeType);

// ============================================================================
// Completeness
// ============================================================================

describe('EDGE_TYPE_POLICIES completeness', () => {
  it('defines a policy for every GraphEdgeType (17 total)', () => {
    expect(Object.keys(EDGE_TYPE_POLICIES)).toHaveLength(17);
    for (const edgeType of ALL_EDGE_TYPES) {
      expect(EDGE_TYPE_POLICIES[edgeType]).toBeDefined();
    }
  });

  it('is frozen (no accidental mutation)', () => {
    expect(Object.isFrozen(EDGE_TYPE_POLICIES)).toBe(true);
  });
});

// ============================================================================
// getEdgePolicy() Lookup
// ============================================================================

describe('getEdgePolicy()', () => {
  it.each(ALL_EDGE_TYPES.map((t) => [t]))('returns a policy for %s', (edgeType) => {
    const policy = getEdgePolicy(edgeType);
    expect(policy).toBeDefined();
    expect(policy.edgeType).toBe(edgeType);
  });
});

// ============================================================================
// Acyclicity Rules
// ============================================================================

describe('Acyclicity rules', () => {
  // 11 edge types that require acyclicity
  const ACYCLIC_TYPES = [
    GraphEdgeType.IS_A,
    GraphEdgeType.EXEMPLIFIES,
    GraphEdgeType.PART_OF,
    GraphEdgeType.CONSTITUTED_BY,
    GraphEdgeType.ENTAILS,
    GraphEdgeType.CAUSES,
    GraphEdgeType.PRECEDES,
    GraphEdgeType.DEPENDS_ON,
    GraphEdgeType.PREREQUISITE,
    GraphEdgeType.DERIVED_FROM,
    GraphEdgeType.HAS_PROPERTY,
  ];

  // 6 edge types that allow cycles
  const NON_ACYCLIC_TYPES = [
    GraphEdgeType.EQUIVALENT_TO,
    GraphEdgeType.DISJOINT_WITH,
    GraphEdgeType.CONTRADICTS,
    GraphEdgeType.RELATED_TO,
    GraphEdgeType.ANALOGOUS_TO,
    GraphEdgeType.CONTRASTS_WITH,
  ];

  it.each(ACYCLIC_TYPES.map((t) => [t]))('%s requires acyclicity', (edgeType) => {
    expect(getEdgePolicy(edgeType).requiresAcyclicity).toBe(true);
  });

  it.each(NON_ACYCLIC_TYPES.map((t) => [t]))('%s does NOT require acyclicity', (edgeType) => {
    expect(getEdgePolicy(edgeType).requiresAcyclicity).toBe(false);
  });

  it('11 acyclic + 6 non-acyclic = 17 total', () => {
    expect(ACYCLIC_TYPES.length + NON_ACYCLIC_TYPES.length).toBe(17);
  });
});

// ============================================================================
// Symmetry Properties
// ============================================================================

describe('Symmetry properties', () => {
  // 6 symmetric edge types
  const SYMMETRIC_TYPES = [
    GraphEdgeType.EQUIVALENT_TO,
    GraphEdgeType.DISJOINT_WITH,
    GraphEdgeType.CONTRADICTS,
    GraphEdgeType.RELATED_TO,
    GraphEdgeType.ANALOGOUS_TO,
    GraphEdgeType.CONTRASTS_WITH,
  ];

  it.each(SYMMETRIC_TYPES.map((t) => [t]))('%s is symmetric', (edgeType) => {
    expect(getEdgePolicy(edgeType).isSymmetric).toBe(true);
  });

  it('non-symmetric types are asymmetric', () => {
    const asymmetric = ALL_EDGE_TYPES.filter((t) => !SYMMETRIC_TYPES.includes(t));
    expect(asymmetric).toHaveLength(11);
    for (const t of asymmetric) {
      expect(getEdgePolicy(t).isSymmetric).toBe(false);
    }
  });
});

// ============================================================================
// Ontological Categories
// ============================================================================

describe('Ontological categories', () => {
  const CATEGORY_MAP: Record<string, string[]> = {
    [EdgeOntologicalCategory.TAXONOMIC]: [GraphEdgeType.IS_A, GraphEdgeType.EXEMPLIFIES],
    [EdgeOntologicalCategory.MEREOLOGICAL]: [GraphEdgeType.PART_OF, GraphEdgeType.CONSTITUTED_BY],
    [EdgeOntologicalCategory.LOGICAL]: [
      GraphEdgeType.EQUIVALENT_TO,
      GraphEdgeType.ENTAILS,
      GraphEdgeType.DISJOINT_WITH,
      GraphEdgeType.CONTRADICTS,
    ],
    [EdgeOntologicalCategory.CAUSAL_TEMPORAL]: [
      GraphEdgeType.CAUSES,
      GraphEdgeType.PRECEDES,
      GraphEdgeType.DEPENDS_ON,
    ],
    [EdgeOntologicalCategory.ASSOCIATIVE]: [
      GraphEdgeType.RELATED_TO,
      GraphEdgeType.ANALOGOUS_TO,
      GraphEdgeType.CONTRASTS_WITH,
    ],
    [EdgeOntologicalCategory.STRUCTURAL_PEDAGOGICAL]: [
      GraphEdgeType.PREREQUISITE,
      GraphEdgeType.DERIVED_FROM,
      GraphEdgeType.HAS_PROPERTY,
    ],
  };

  for (const [category, edgeTypes] of Object.entries(CATEGORY_MAP)) {
    it.each(edgeTypes.map((t) => [t]))(`%s belongs to ${category}`, (edgeType) => {
      expect(getEdgePolicy(edgeType as GraphEdgeType).category).toBe(category);
    });
  }

  it('all 6 categories are covered', () => {
    expect(Object.keys(CATEGORY_MAP)).toHaveLength(6);
  });

  it('all 17 edge types are assigned to a category', () => {
    const totalMapped = Object.values(CATEGORY_MAP).reduce((sum, arr) => sum + arr.length, 0);
    expect(totalMapped).toBe(17);
  });
});

// ============================================================================
// Node Type Constraints
// ============================================================================

describe('Node type constraints', () => {
  it('is_a restricts to concept → concept', () => {
    const policy = getEdgePolicy(GraphEdgeType.IS_A);
    expect(policy.allowedSourceTypes).toEqual([GraphNodeType.CONCEPT]);
    expect(policy.allowedTargetTypes).toEqual([GraphNodeType.CONCEPT]);
  });

  it('exemplifies restricts source to example/counterexample', () => {
    const policy = getEdgePolicy(GraphEdgeType.EXEMPLIFIES);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.EXAMPLE);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.COUNTEREXAMPLE);
    expect(policy.allowedSourceTypes).not.toContain(GraphNodeType.CONCEPT);
  });

  it('exemplifies restricts target to concept/principle/fact', () => {
    const policy = getEdgePolicy(GraphEdgeType.EXEMPLIFIES);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.CONCEPT);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.PRINCIPLE);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.FACT);
  });

  it('prerequisite allows concept-bearing source and target types', () => {
    const policy = getEdgePolicy(GraphEdgeType.PREREQUISITE);
    // At minimum, concepts should be in both source and target
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.CONCEPT);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.CONCEPT);
  });

  it('related_to allows broad node types', () => {
    const policy = getEdgePolicy(GraphEdgeType.RELATED_TO);
    // Associative links are the broadest — all types
    expect(policy.allowedSourceTypes.length).toBeGreaterThanOrEqual(4);
    expect(policy.allowedTargetTypes.length).toBeGreaterThanOrEqual(4);
  });

  it('disjoint_with allows concept → concept at minimum', () => {
    const policy = getEdgePolicy(GraphEdgeType.DISJOINT_WITH);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.CONCEPT);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.CONCEPT);
  });
});

// ============================================================================
// Weight Constraints
// ============================================================================

describe('Weight constraints', () => {
  it('all policies have maxWeight in range (0, 1]', () => {
    for (const edgeType of ALL_EDGE_TYPES) {
      const policy = getEdgePolicy(edgeType);
      expect(policy.maxWeight).toBeGreaterThan(0);
      expect(policy.maxWeight).toBeLessThanOrEqual(1);
    }
  });

  it('all policies have defaultWeight in range [0, maxWeight]', () => {
    for (const edgeType of ALL_EDGE_TYPES) {
      const policy = getEdgePolicy(edgeType);
      expect(policy.defaultWeight).toBeGreaterThanOrEqual(0);
      expect(policy.defaultWeight).toBeLessThanOrEqual(policy.maxWeight);
    }
  });
});

// ============================================================================
// Descriptions & Metadata
// ============================================================================

describe('Policy descriptions', () => {
  it('every policy has a non-empty description', () => {
    for (const edgeType of ALL_EDGE_TYPES) {
      const policy = getEdgePolicy(edgeType);
      expect(policy.description).toBeTruthy();
      expect(policy.description.length).toBeGreaterThan(20);
    }
  });

  it('every policy has a non-empty edgeType matching its key', () => {
    for (const edgeType of ALL_EDGE_TYPES) {
      const policy = getEdgePolicy(edgeType);
      expect(policy.edgeType).toBe(edgeType);
    }
  });
});
