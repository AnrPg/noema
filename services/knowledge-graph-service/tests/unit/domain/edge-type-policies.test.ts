/**
 * @noema/knowledge-graph-service — Edge Type Policies Unit Tests
 *
 * Exhaustive coverage for the canonical 25-edge repertoire:
 * - Policy completeness
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

const ALL_EDGE_TYPES = Object.values(GraphEdgeType);

describe('EDGE_TYPE_POLICIES completeness', () => {
  it('defines a policy for every GraphEdgeType (25 total)', () => {
    expect(Object.keys(EDGE_TYPE_POLICIES)).toHaveLength(25);
    for (const edgeType of ALL_EDGE_TYPES) {
      expect(EDGE_TYPE_POLICIES[edgeType]).toBeDefined();
    }
  });

  it('is frozen (no accidental mutation)', () => {
    expect(Object.isFrozen(EDGE_TYPE_POLICIES)).toBe(true);
  });
});

describe('getEdgePolicy()', () => {
  it.each(ALL_EDGE_TYPES.map((edgeType) => [edgeType]))('returns a policy for %s', (edgeType) => {
    const policy = getEdgePolicy(edgeType);
    expect(policy).toBeDefined();
    expect(policy.edgeType).toBe(edgeType);
  });
});

describe('Acyclicity rules', () => {
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
    GraphEdgeType.SUBSKILL_OF,
    GraphEdgeType.HAS_SUBSKILL,
  ];

  const NON_ACYCLIC_TYPES = [
    GraphEdgeType.EQUIVALENT_TO,
    GraphEdgeType.DISJOINT_WITH,
    GraphEdgeType.CONTRADICTS,
    GraphEdgeType.RELATED_TO,
    GraphEdgeType.CONFUSABLE_WITH,
    GraphEdgeType.ANALOGOUS_TO,
    GraphEdgeType.CONTRASTS_WITH,
    GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
    GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
    GraphEdgeType.OPTIONAL_FOR_OCCUPATION,
    GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
    GraphEdgeType.TRANSFERABLE_TO,
  ];

  it.each(ACYCLIC_TYPES.map((edgeType) => [edgeType]))('%s requires acyclicity', (edgeType) => {
    expect(getEdgePolicy(edgeType).requiresAcyclicity).toBe(true);
  });

  it.each(NON_ACYCLIC_TYPES.map((edgeType) => [edgeType]))(
    '%s does NOT require acyclicity',
    (edgeType) => {
      expect(getEdgePolicy(edgeType).requiresAcyclicity).toBe(false);
    }
  );

  it('13 acyclic + 12 non-acyclic = 25 total', () => {
    expect(ACYCLIC_TYPES.length + NON_ACYCLIC_TYPES.length).toBe(25);
  });
});

describe('Symmetry properties', () => {
  const SYMMETRIC_TYPES = [
    GraphEdgeType.EQUIVALENT_TO,
    GraphEdgeType.DISJOINT_WITH,
    GraphEdgeType.CONTRADICTS,
    GraphEdgeType.RELATED_TO,
    GraphEdgeType.CONFUSABLE_WITH,
    GraphEdgeType.ANALOGOUS_TO,
    GraphEdgeType.CONTRASTS_WITH,
  ];

  it.each(SYMMETRIC_TYPES.map((edgeType) => [edgeType]))('%s is symmetric', (edgeType) => {
    expect(getEdgePolicy(edgeType).isSymmetric).toBe(true);
  });

  it('non-symmetric types are asymmetric', () => {
    const asymmetricTypes = ALL_EDGE_TYPES.filter(
      (edgeType) => !SYMMETRIC_TYPES.includes(edgeType)
    );
    expect(asymmetricTypes).toHaveLength(18);
    for (const edgeType of asymmetricTypes) {
      expect(getEdgePolicy(edgeType).isSymmetric).toBe(false);
    }
  });
});

describe('Ontological categories', () => {
  const CATEGORY_MAP: Record<string, GraphEdgeType[]> = {
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
      GraphEdgeType.CONFUSABLE_WITH,
      GraphEdgeType.ANALOGOUS_TO,
      GraphEdgeType.CONTRASTS_WITH,
    ],
    [EdgeOntologicalCategory.STRUCTURAL_PEDAGOGICAL]: [
      GraphEdgeType.PREREQUISITE,
      GraphEdgeType.DERIVED_FROM,
      GraphEdgeType.HAS_PROPERTY,
      GraphEdgeType.SUBSKILL_OF,
      GraphEdgeType.HAS_SUBSKILL,
      GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
      GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
      GraphEdgeType.OPTIONAL_FOR_OCCUPATION,
      GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
      GraphEdgeType.TRANSFERABLE_TO,
    ],
  };

  for (const [category, edgeTypes] of Object.entries(CATEGORY_MAP)) {
    it.each(edgeTypes.map((edgeType) => [edgeType]))(`%s belongs to ${category}`, (edgeType) => {
      expect(getEdgePolicy(edgeType).category).toBe(category);
    });
  }

  it('all 6 categories are covered', () => {
    expect(Object.keys(CATEGORY_MAP)).toHaveLength(6);
  });

  it('all 25 edge types are assigned to a category', () => {
    const totalMapped = Object.values(CATEGORY_MAP).reduce(
      (sum, edgeTypes) => sum + edgeTypes.length,
      0
    );
    expect(totalMapped).toBe(25);
  });
});

describe('Node type constraints', () => {
  it('is_a restricts to concept and occupation taxonomy nodes', () => {
    const policy = getEdgePolicy(GraphEdgeType.IS_A);
    expect(policy.allowedSourceTypes).toEqual([GraphNodeType.CONCEPT, GraphNodeType.OCCUPATION]);
    expect(policy.allowedTargetTypes).toEqual([GraphNodeType.CONCEPT, GraphNodeType.OCCUPATION]);
    expect(policy.allowedSourceTypes).not.toContain(GraphNodeType.SKILL);
  });

  it('exemplifies allows example, counterexample, and procedure sources', () => {
    const policy = getEdgePolicy(GraphEdgeType.EXEMPLIFIES);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.EXAMPLE);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.COUNTEREXAMPLE);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.PROCEDURE);
    expect(policy.allowedSourceTypes).not.toContain(GraphNodeType.CONCEPT);
  });

  it('exemplifies allows concept, skill, principle, and fact targets', () => {
    const policy = getEdgePolicy(GraphEdgeType.EXEMPLIFIES);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.CONCEPT);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.SKILL);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.PRINCIPLE);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.FACT);
  });

  it('prerequisite allows skill participation on both sides', () => {
    const policy = getEdgePolicy(GraphEdgeType.PREREQUISITE);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.SKILL);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.SKILL);
  });

  it('derived_from allows a skill as source and target', () => {
    const policy = getEdgePolicy(GraphEdgeType.DERIVED_FROM);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.SKILL);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.SKILL);
  });

  it('has_property allows a skill as source', () => {
    const policy = getEdgePolicy(GraphEdgeType.HAS_PROPERTY);
    expect(policy.allowedSourceTypes).toContain(GraphNodeType.SKILL);
    expect(policy.allowedTargetTypes).toContain(GraphNodeType.CONCEPT);
  });

  it('subskill_of and has_subskill are skill-only hierarchy edges', () => {
    const subskillPolicy = getEdgePolicy(GraphEdgeType.SUBSKILL_OF);
    const hasSubskillPolicy = getEdgePolicy(GraphEdgeType.HAS_SUBSKILL);

    expect(subskillPolicy.allowedSourceTypes).toEqual([GraphNodeType.SKILL]);
    expect(subskillPolicy.allowedTargetTypes).toEqual([GraphNodeType.SKILL]);
    expect(hasSubskillPolicy.allowedSourceTypes).toEqual([GraphNodeType.SKILL]);
    expect(hasSubskillPolicy.allowedTargetTypes).toEqual([GraphNodeType.SKILL]);
  });

  it('occupation-skill edges are directionally constrained', () => {
    const essentialPolicy = getEdgePolicy(GraphEdgeType.ESSENTIAL_FOR_OCCUPATION);
    const essentialInversePolicy = getEdgePolicy(GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL);
    const optionalPolicy = getEdgePolicy(GraphEdgeType.OPTIONAL_FOR_OCCUPATION);
    const optionalInversePolicy = getEdgePolicy(
      GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL
    );

    expect(essentialPolicy.allowedSourceTypes).toEqual([GraphNodeType.SKILL]);
    expect(essentialPolicy.allowedTargetTypes).toEqual([GraphNodeType.OCCUPATION]);
    expect(essentialInversePolicy.allowedSourceTypes).toEqual([GraphNodeType.OCCUPATION]);
    expect(essentialInversePolicy.allowedTargetTypes).toEqual([GraphNodeType.SKILL]);
    expect(optionalPolicy.allowedSourceTypes).toEqual([GraphNodeType.SKILL]);
    expect(optionalPolicy.allowedTargetTypes).toEqual([GraphNodeType.OCCUPATION]);
    expect(optionalInversePolicy.allowedSourceTypes).toEqual([GraphNodeType.OCCUPATION]);
    expect(optionalInversePolicy.allowedTargetTypes).toEqual([GraphNodeType.SKILL]);
  });

  it('transferable_to allows skill to skill, concept, or procedure targets', () => {
    const policy = getEdgePolicy(GraphEdgeType.TRANSFERABLE_TO);
    expect(policy.allowedSourceTypes).toEqual([GraphNodeType.SKILL]);
    expect(policy.allowedTargetTypes).toEqual([
      GraphNodeType.SKILL,
      GraphNodeType.CONCEPT,
      GraphNodeType.PROCEDURE,
    ]);
  });

  it('confusable_with is restricted to skill pairs', () => {
    const policy = getEdgePolicy(GraphEdgeType.CONFUSABLE_WITH);
    expect(policy.allowedSourceTypes).toEqual([GraphNodeType.SKILL]);
    expect(policy.allowedTargetTypes).toEqual([GraphNodeType.SKILL]);
  });

  it('related_to remains broadly permissive', () => {
    const policy = getEdgePolicy(GraphEdgeType.RELATED_TO);
    expect(policy.allowedSourceTypes.length).toBeGreaterThanOrEqual(5);
    expect(policy.allowedTargetTypes.length).toBeGreaterThanOrEqual(5);
  });
});

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

  it('assigns the expected defaults for the new skill-centric edges', () => {
    expect(getEdgePolicy(GraphEdgeType.SUBSKILL_OF).defaultWeight).toBe(1);
    expect(getEdgePolicy(GraphEdgeType.HAS_SUBSKILL).defaultWeight).toBe(1);
    expect(getEdgePolicy(GraphEdgeType.ESSENTIAL_FOR_OCCUPATION).defaultWeight).toBe(1);
    expect(getEdgePolicy(GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL).defaultWeight).toBe(1);
    expect(getEdgePolicy(GraphEdgeType.OPTIONAL_FOR_OCCUPATION).defaultWeight).toBe(0.8);
    expect(getEdgePolicy(GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL).defaultWeight).toBe(
      0.8
    );
    expect(getEdgePolicy(GraphEdgeType.TRANSFERABLE_TO).defaultWeight).toBe(0.8);
    expect(getEdgePolicy(GraphEdgeType.CONFUSABLE_WITH).defaultWeight).toBe(0.6);
  });
});

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
