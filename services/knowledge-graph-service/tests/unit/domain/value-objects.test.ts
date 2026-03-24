/**
 * @noema/knowledge-graph-service — Value Object & Schema Unit Tests
 *
 * Tests for:
 * 1. Zod input validation schemas (node, edge, filter, pagination)
 * 2. Branded ID factories (KG-specific: MutationId, MisconceptionPatternId,
 *    InterventionId) — create, isValid, and prefix
 */

import { describe, expect, it } from 'vitest';

import {
  CreateEdgeInputSchema,
  CreateNodeInputSchema,
  EdgeFilterSchema,
  PaginationSchema,
  UpdateEdgeInputSchema,
  UpdateNodeInputSchema,
} from '../../../src/domain/knowledge-graph-service/knowledge-graph.schemas.js';

import { InterventionId, MisconceptionPatternId, MutationId } from '@noema/types';

// ============================================================================
// Helpers
// ============================================================================

const VALID_NODE_ID = 'node_aBcDeFgHiJkLmNoPqRsT1';
const OTHER_NODE_ID = 'node_uVwXyZ012345678901234';

// ============================================================================
// CreateNodeInputSchema
// ============================================================================

describe('CreateNodeInputSchema', () => {
  const validInput = {
    label: 'Photosynthesis',
    nodeType: 'concept',
    domain: 'biology',
  };

  it('accepts minimal valid input', () => {
    const result = CreateNodeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts full input with optional fields', () => {
    const result = CreateNodeInputSchema.safeParse({
      ...validInput,
      description: 'The process by which plants convert light energy',
      properties: { difficulty: 'intermediate' },
      masteryLevel: 0.75,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty label', () => {
    const result = CreateNodeInputSchema.safeParse({ ...validInput, label: '' });
    expect(result.success).toBe(false);
  });

  it('rejects label exceeding 500 characters', () => {
    const result = CreateNodeInputSchema.safeParse({
      ...validInput,
      label: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty nodeType', () => {
    const result = CreateNodeInputSchema.safeParse({ ...validInput, nodeType: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty domain', () => {
    const result = CreateNodeInputSchema.safeParse({ ...validInput, domain: '' });
    expect(result.success).toBe(false);
  });

  it('rejects domain exceeding 200 characters', () => {
    const result = CreateNodeInputSchema.safeParse({
      ...validInput,
      domain: 'd'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 2000 characters', () => {
    const result = CreateNodeInputSchema.safeParse({
      ...validInput,
      description: 'd'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects masteryLevel below 0', () => {
    const result = CreateNodeInputSchema.safeParse({
      ...validInput,
      masteryLevel: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects masteryLevel above 1', () => {
    const result = CreateNodeInputSchema.safeParse({
      ...validInput,
      masteryLevel: 1.01,
    });
    expect(result.success).toBe(false);
  });

  it('accepts masteryLevel at boundaries (0 and 1)', () => {
    expect(CreateNodeInputSchema.safeParse({ ...validInput, masteryLevel: 0 }).success).toBe(true);
    expect(CreateNodeInputSchema.safeParse({ ...validInput, masteryLevel: 1 }).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(CreateNodeInputSchema.safeParse({}).success).toBe(false);
    expect(CreateNodeInputSchema.safeParse({ label: 'x' }).success).toBe(false);
  });
});

// ============================================================================
// UpdateNodeInputSchema
// ============================================================================

describe('UpdateNodeInputSchema', () => {
  it('accepts single-field update', () => {
    expect(UpdateNodeInputSchema.safeParse({ label: 'NewLabel' }).success).toBe(true);
    expect(UpdateNodeInputSchema.safeParse({ domain: 'math' }).success).toBe(true);
    expect(UpdateNodeInputSchema.safeParse({ masteryLevel: 0.5 }).success).toBe(true);
  });

  it('accepts multi-field update', () => {
    const result = UpdateNodeInputSchema.safeParse({
      label: 'Updated',
      description: 'New desc',
      masteryLevel: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (at least one field required)', () => {
    const result = UpdateNodeInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects label with empty string', () => {
    const result = UpdateNodeInputSchema.safeParse({ label: '' });
    expect(result.success).toBe(false);
  });

  it('rejects masteryLevel out of range', () => {
    expect(UpdateNodeInputSchema.safeParse({ masteryLevel: -1 }).success).toBe(false);
    expect(UpdateNodeInputSchema.safeParse({ masteryLevel: 2 }).success).toBe(false);
  });
});

// ============================================================================
// CreateEdgeInputSchema
// ============================================================================

describe('CreateEdgeInputSchema', () => {
  const validEdge = {
    sourceNodeId: VALID_NODE_ID,
    targetNodeId: OTHER_NODE_ID,
    edgeType: 'is_a',
  };

  it('accepts minimal valid input', () => {
    const result = CreateEdgeInputSchema.safeParse(validEdge);
    expect(result.success).toBe(true);
  });

  it('accepts optional weight and properties', () => {
    const result = CreateEdgeInputSchema.safeParse({
      ...validEdge,
      weight: 0.85,
      properties: { source: 'manual' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid node IDs (wrong prefix)', () => {
    const result = CreateEdgeInputSchema.safeParse({
      ...validEdge,
      sourceNodeId: 'user_abc123xyz789',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid edge type', () => {
    const result = CreateEdgeInputSchema.safeParse({
      ...validEdge,
      edgeType: 'nonexistent_type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects weight below 0', () => {
    const result = CreateEdgeInputSchema.safeParse({
      ...validEdge,
      weight: -0.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects weight above 1', () => {
    const result = CreateEdgeInputSchema.safeParse({
      ...validEdge,
      weight: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts weight at boundaries', () => {
    expect(CreateEdgeInputSchema.safeParse({ ...validEdge, weight: 0 }).success).toBe(true);
    expect(CreateEdgeInputSchema.safeParse({ ...validEdge, weight: 1 }).success).toBe(true);
  });

  it('accepts all valid edge types', () => {
    const validTypes = [
      'is_a',
      'exemplifies',
      'part_of',
      'constituted_by',
      'equivalent_to',
      'entails',
      'disjoint_with',
      'contradicts',
      'causes',
      'precedes',
      'depends_on',
      'related_to',
      'analogous_to',
      'contrasts_with',
      'prerequisite',
      'derived_from',
      'has_property',
    ];
    for (const t of validTypes) {
      const result = CreateEdgeInputSchema.safeParse({ ...validEdge, edgeType: t });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================================================
// UpdateEdgeInputSchema
// ============================================================================

describe('UpdateEdgeInputSchema', () => {
  it('accepts weight-only update', () => {
    expect(UpdateEdgeInputSchema.safeParse({ weight: 0.9 }).success).toBe(true);
  });

  it('accepts properties-only update', () => {
    expect(UpdateEdgeInputSchema.safeParse({ properties: { verified: true } }).success).toBe(true);
  });

  it('accepts both weight and properties', () => {
    const result = UpdateEdgeInputSchema.safeParse({
      weight: 0.5,
      properties: { foo: 'bar' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (at least one field required)', () => {
    expect(UpdateEdgeInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects weight out of range', () => {
    expect(UpdateEdgeInputSchema.safeParse({ weight: -1 }).success).toBe(false);
    expect(UpdateEdgeInputSchema.safeParse({ weight: 2 }).success).toBe(false);
  });
});

// ============================================================================
// EdgeFilterSchema
// ============================================================================

describe('EdgeFilterSchema', () => {
  it('accepts empty filter (all optional)', () => {
    expect(EdgeFilterSchema.safeParse({}).success).toBe(true);
  });

  it('accepts filter by edgeType', () => {
    expect(EdgeFilterSchema.safeParse({ edgeType: 'is_a' }).success).toBe(true);
  });

  it('accepts filter by sourceNodeId', () => {
    expect(EdgeFilterSchema.safeParse({ sourceNodeId: VALID_NODE_ID }).success).toBe(true);
  });

  it('accepts filter by targetNodeId', () => {
    expect(EdgeFilterSchema.safeParse({ targetNodeId: OTHER_NODE_ID }).success).toBe(true);
  });

  it('accepts combined filters', () => {
    const result = EdgeFilterSchema.safeParse({
      edgeType: 'prerequisite',
      sourceNodeId: VALID_NODE_ID,
      userId: 'user_testuser12345',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid edgeType', () => {
    expect(EdgeFilterSchema.safeParse({ edgeType: 'bogus' }).success).toBe(false);
  });
});

// ============================================================================
// PaginationSchema
// ============================================================================

describe('PaginationSchema', () => {
  it('applies defaults when no input given', () => {
    const result = PaginationSchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('accepts custom limit and offset', () => {
    const result = PaginationSchema.parse({ limit: 50, offset: 100 });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(100);
  });

  it('rejects limit below 1', () => {
    expect(PaginationSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit above 200', () => {
    expect(PaginationSchema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it('rejects negative offset', () => {
    expect(PaginationSchema.safeParse({ offset: -1 }).success).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(PaginationSchema.safeParse({ limit: 10.5 }).success).toBe(false);
    expect(PaginationSchema.safeParse({ offset: 0.5 }).success).toBe(false);
  });
});

// ============================================================================
// Branded ID Factories — KG-Specific
// ============================================================================

describe('MutationId', () => {
  it('creates with valid prefix + 21-char nanoid suffix', () => {
    const id = MutationId.create('mut_abcdefghijklmnopqrstu');
    expect(id).toBe('mut_abcdefghijklmnopqrstu');
  });

  it('throws for missing prefix', () => {
    expect(() => MutationId.create('abcdefghijkl')).toThrow(/Invalid MutationId/);
  });

  it('throws for too-short suffix (< 6 chars)', () => {
    expect(() => MutationId.create('mut_abc')).toThrow(/Invalid MutationId/);
  });

  it('isValid accepts valid IDs', () => {
    expect(MutationId.isValid('mut_abcdefghijklmnopqrstu')).toBe(true);
  });

  it('isValid rejects wrong prefix', () => {
    expect(MutationId.isValid('node_abcdefghijkl')).toBe(false);
  });

  it('isValid rejects non-string', () => {
    expect(MutationId.isValid(42)).toBe(false);
    expect(MutationId.isValid(null)).toBe(false);
  });

  it('has correct prefix', () => {
    expect(MutationId.prefix).toBe('mut_');
  });
});

describe('MisconceptionPatternId', () => {
  it('creates with valid prefix + 21-char nanoid suffix', () => {
    const id = MisconceptionPatternId.create('mpat_abcdefghijklmnopqrstu');
    expect(id).toBe('mpat_abcdefghijklmnopqrstu');
  });

  it('throws for invalid format', () => {
    expect(() => MisconceptionPatternId.create('mpat_abc')).toThrow(
      /Invalid MisconceptionPatternId/
    );
  });

  it('isValid works correctly', () => {
    expect(MisconceptionPatternId.isValid('mpat_abcdefghijklmnopqrstu')).toBe(true);
    expect(MisconceptionPatternId.isValid('mut_abcdefghijklmnopqrstu')).toBe(false);
  });

  it('has correct prefix', () => {
    expect(MisconceptionPatternId.prefix).toBe('mpat_');
  });
});

describe('InterventionId', () => {
  it('creates with valid prefix + 21-char nanoid suffix', () => {
    const id = InterventionId.create('intv_abcdefghijklmnopqrstu');
    expect(id).toBe('intv_abcdefghijklmnopqrstu');
  });

  it('throws for invalid format', () => {
    expect(() => InterventionId.create('intv_ab')).toThrow(/Invalid InterventionId/);
  });

  it('isValid works correctly', () => {
    expect(InterventionId.isValid('intv_abcdefghijklmnopqrstu')).toBe(true);
    expect(InterventionId.isValid('node_abcdefghijklmnopqrstu')).toBe(false);
  });

  it('has correct prefix', () => {
    expect(InterventionId.prefix).toBe('intv_');
  });
});
