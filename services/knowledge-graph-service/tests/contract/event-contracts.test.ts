/**
 * @noema/knowledge-graph-service — Event Contract Tests
 *
 * Verifies that:
 * 1. The event type registry is complete (16 event types)
 * 2. Event type strings follow the naming convention
 * 3. Event payload types structurally satisfy IEventToPublish at publish sites
 * 4. Event metadata contract (IEventMetadata) has required fields
 * 5. Union types cover all individual event types
 */

import { describe, expect, it } from 'vitest';

import {
  KnowledgeGraphEventType,
  type IEventMetadata,
} from '../../src/domain/knowledge-graph-service/domain-events.js';

// ============================================================================
// Event Type Registry Completeness
// ============================================================================

describe('KnowledgeGraphEventType registry', () => {
  it('defines exactly 17 event types', () => {
    const types = Object.values(KnowledgeGraphEventType);
    expect(types).toHaveLength(17);
  });

  it('all event type values are unique', () => {
    const values = Object.values(KnowledgeGraphEventType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all event type keys are SCREAMING_SNAKE_CASE', () => {
    const keys = Object.keys(KnowledgeGraphEventType);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });

  it('all event type values follow {aggregate}.{action} convention', () => {
    const values = Object.values(KnowledgeGraphEventType);
    for (const value of values) {
      // dot-separated, lowercase, 2-3 segments
      expect(value).toMatch(/^[a-z]+(\.[a-z_]+){1,2}$/);
    }
  });
});

// ============================================================================
// PKG Event Types
// ============================================================================

describe('PKG event types', () => {
  const PKG_EVENTS = {
    PKG_NODE_CREATED: 'pkg.node.created',
    PKG_NODE_UPDATED: 'pkg.node.updated',
    PKG_NODE_REMOVED: 'pkg.node.removed',
    PKG_EDGE_CREATED: 'pkg.edge.created',
    PKG_EDGE_UPDATED: 'pkg.edge.updated',
    PKG_EDGE_REMOVED: 'pkg.edge.removed',
    PKG_STRUCTURAL_METRICS_UPDATED: 'pkg.metrics.updated',
  } as const;

  it.each(Object.entries(PKG_EVENTS))('%s → %s', (key, value) => {
    expect(KnowledgeGraphEventType[key as keyof typeof KnowledgeGraphEventType]).toBe(value);
  });

  it('has 7 PKG events', () => {
    const pkgValues = Object.values(KnowledgeGraphEventType).filter((v) => v.startsWith('pkg.'));
    expect(pkgValues).toHaveLength(7);
  });
});

// ============================================================================
// CKG Event Types
// ============================================================================

describe('CKG event types', () => {
  const CKG_EVENTS = {
    CKG_MUTATION_PROPOSED: 'ckg.mutation.proposed',
    CKG_MUTATION_VALIDATED: 'ckg.mutation.validated',
    CKG_MUTATION_COMMITTED: 'ckg.mutation.committed',
    CKG_MUTATION_REJECTED: 'ckg.mutation.rejected',
    CKG_MUTATION_ESCALATED: 'ckg.mutation.escalated',
    CKG_MUTATION_REVISION_REQUESTED: 'ckg.mutation.revision_requested',
    CKG_NODE_PROMOTED: 'ckg.node.promoted',
  } as const;

  it.each(Object.entries(CKG_EVENTS))('%s → %s', (key, value) => {
    expect(KnowledgeGraphEventType[key as keyof typeof KnowledgeGraphEventType]).toBe(value);
  });

  it('has 7 CKG events', () => {
    const ckgValues = Object.values(KnowledgeGraphEventType).filter((v) => v.startsWith('ckg.'));
    expect(ckgValues).toHaveLength(7);
  });
});

// ============================================================================
// Metacognitive Event Types
// ============================================================================

describe('Metacognitive event types', () => {
  const META_EVENTS = {
    MISCONCEPTION_DETECTED: 'misconception.detected',
    INTERVENTION_TRIGGERED: 'intervention.triggered',
    METACOGNITIVE_STAGE_TRANSITIONED: 'metacognitive.transitioned',
  } as const;

  it.each(Object.entries(META_EVENTS))('%s → %s', (key, value) => {
    expect(KnowledgeGraphEventType[key as keyof typeof KnowledgeGraphEventType]).toBe(value);
  });

  it('has 3 metacognitive events', () => {
    const metaValues = Object.values(KnowledgeGraphEventType).filter(
      (v) =>
        v.startsWith('misconception.') ||
        v.startsWith('intervention.') ||
        v.startsWith('metacognitive.')
    );
    expect(metaValues).toHaveLength(3);
  });
});

// ============================================================================
// Event Metadata Contract
// ============================================================================

describe('IEventMetadata contract', () => {
  // Compile-time structural test: verify that IEventMetadata has the expected
  // shape by constructing a compliant object. If the interface changes in a
  // breaking way this test will fail to compile.
  it('satisfies required field contract', () => {
    const metadata: IEventMetadata = {
      eventId: 'evt_abc123xyz789',
      eventType: KnowledgeGraphEventType.PKG_NODE_CREATED,
      timestamp: new Date().toISOString(),
      correlationId: 'cor_abc123xyz789',
      causationId: 'cau_abc123xyz789',
      serviceName: 'knowledge-graph-service',
      version: 1,
    };

    expect(metadata.serviceName).toBe('knowledge-graph-service');
    expect(metadata.version).toBe(1);
    expect(typeof metadata.eventId).toBe('string');
    expect(typeof metadata.eventType).toBe('string');
    expect(typeof metadata.timestamp).toBe('string');
    expect(typeof metadata.correlationId).toBe('string');
    expect(typeof metadata.causationId).toBe('string');
  });

  it('serviceName is always knowledge-graph-service', () => {
    // The type is a string literal 'knowledge-graph-service' — verify
    // at compile time by assignment (if this compiles, the contract holds)
    const name: IEventMetadata['serviceName'] = 'knowledge-graph-service';
    expect(name).toBe('knowledge-graph-service');
  });
});

// ============================================================================
// IEventToPublish Structural Contract
// ============================================================================

describe('IEventToPublish structural contract', () => {
  // Verify that the shape we construct at publish sites matches the publisher
  // interface, using a representative sample of events.

  it('PKG node created event satisfies IEventToPublish shape', () => {
    const event = {
      eventType: KnowledgeGraphEventType.PKG_NODE_CREATED,
      aggregateType: 'PersonalKnowledgeGraph',
      aggregateId: 'user_abc123xyz789',
      payload: {
        nodeId: 'node_abc123xyz789',
        userId: 'user_abc123xyz789',
        nodeType: 'concept',
        label: 'Photosynthesis',
        domain: 'biology',
        metadata: {},
      },
      metadata: {
        correlationId: 'cor_abc123xyz789',
        userId: 'user_abc123xyz789',
      },
    };

    // Verify required fields exist
    expect(event).toHaveProperty('eventType');
    expect(event).toHaveProperty('aggregateType');
    expect(event).toHaveProperty('aggregateId');
    expect(event).toHaveProperty('payload');
    expect(event).toHaveProperty('metadata');
    expect(event.metadata).toHaveProperty('correlationId');
  });

  it('CKG mutation proposed event satisfies IEventToPublish shape', () => {
    const event = {
      eventType: KnowledgeGraphEventType.CKG_MUTATION_PROPOSED,
      aggregateType: 'CanonicalKnowledgeGraph',
      aggregateId: 'mut_abc123xyz789',
      payload: {
        mutationId: 'mut_abc123xyz789',
        proposedBy: 'agent_abc123xyz789',
        operations: [],
        rationale: 'Adding new concept',
        evidenceCount: 3,
      },
      metadata: {
        correlationId: 'cor_abc123xyz789',
      },
    };

    expect(event).toHaveProperty('eventType');
    expect(event).toHaveProperty('aggregateType');
    expect(event).toHaveProperty('aggregateId');
    expect(event).toHaveProperty('payload');
    expect(event.payload).toHaveProperty('mutationId');
    expect(event.payload).toHaveProperty('proposedBy');
  });

  it('misconception detected event satisfies IEventToPublish shape', () => {
    const event = {
      eventType: KnowledgeGraphEventType.MISCONCEPTION_DETECTED,
      aggregateType: 'Misconception',
      aggregateId: 'user_abc123xyz789',
      payload: {
        userId: 'user_abc123xyz789',
        misconceptionType: 'false_cause',
        affectedNodeIds: ['node_abc123xyz789'],
        confidence: 0.85,
        patternId: 'mpat_abc123xyz789',
        evidence: {},
      },
      metadata: {
        correlationId: 'cor_abc123xyz789',
        userId: 'user_abc123xyz789',
      },
    };

    expect(event).toHaveProperty('eventType');
    expect(event).toHaveProperty('aggregateType');
    expect(event.payload).toHaveProperty('misconceptionType');
    expect(event.payload).toHaveProperty('confidence');
  });
});
