/**
 * @noema/knowledge-graph-service — Test Mock Factories
 *
 * Manual mock factories for service and infrastructure dependencies.
 * Each factory returns an object with vi.fn() stubs for every interface
 * method, typed against the real interface for compile-time safety.
 *
 * Pattern follows content-service's tests/helpers/mocks.ts convention.
 */

import { vi } from 'vitest';
import type { IAggregationEvidenceRepository } from '../../src/domain/knowledge-graph-service/aggregation-evidence.repository.js';
import type { IKnowledgeGraphService } from '../../src/domain/knowledge-graph-service/knowledge-graph.service.js';
import type { IMetricsStalenessRepository } from '../../src/domain/knowledge-graph-service/metrics-staleness.repository.js';
import type { IMetricsRepository } from '../../src/domain/knowledge-graph-service/metrics.repository.js';
import type { IMisconceptionRepository } from '../../src/domain/knowledge-graph-service/misconception.repository.js';
import type { IMutationRepository } from '../../src/domain/knowledge-graph-service/mutation.repository.js';
import type { IPkgOperationLogRepository } from '../../src/domain/knowledge-graph-service/pkg-operation-log.repository.js';
import type { IEventPublisher, IEventToPublish } from '../../src/domain/shared/event-publisher.js';

// ============================================================================
// Service Mock
// ============================================================================

/**
 * Create a fully-stubbed IKnowledgeGraphService mock.
 * Every method is a vi.fn() that rejects with 'not configured' by default,
 * so tests that forget to configure a method get a clear failure.
 */
export function mockKnowledgeGraphService(): {
  [K in keyof IKnowledgeGraphService]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    // PKG Node/Edge CRUD
    createNode: vi.fn().mockImplementation(notConfigured),
    getNode: vi.fn().mockImplementation(notConfigured),
    updateNode: vi.fn().mockImplementation(notConfigured),
    deleteNode: vi.fn().mockImplementation(notConfigured),
    listNodes: vi.fn().mockImplementation(notConfigured),
    createEdge: vi.fn().mockImplementation(notConfigured),
    getEdge: vi.fn().mockImplementation(notConfigured),
    updateEdge: vi.fn().mockImplementation(notConfigured),
    deleteEdge: vi.fn().mockImplementation(notConfigured),
    listEdges: vi.fn().mockImplementation(notConfigured),

    // PKG Traversal
    getSubgraph: vi.fn().mockImplementation(notConfigured),
    getAncestors: vi.fn().mockImplementation(notConfigured),
    getDescendants: vi.fn().mockImplementation(notConfigured),
    findPath: vi.fn().mockImplementation(notConfigured),
    getSiblings: vi.fn().mockImplementation(notConfigured),
    getCoParents: vi.fn().mockImplementation(notConfigured),
    getNeighborhood: vi.fn().mockImplementation(notConfigured),
    getBridgeNodes: vi.fn().mockImplementation(notConfigured),
    getKnowledgeFrontier: vi.fn().mockImplementation(notConfigured),
    getCommonAncestors: vi.fn().mockImplementation(notConfigured),
    getPrerequisiteChain: vi.fn().mockImplementation(notConfigured),
    getCentralityRanking: vi.fn().mockImplementation(notConfigured),

    // CKG Read-Only
    getCkgNode: vi.fn().mockImplementation(notConfigured),
    getCkgSubgraph: vi.fn().mockImplementation(notConfigured),
    listCkgNodes: vi.fn().mockImplementation(notConfigured),
    getCkgEdge: vi.fn().mockImplementation(notConfigured),
    listCkgEdges: vi.fn().mockImplementation(notConfigured),
    getCkgAncestors: vi.fn().mockImplementation(notConfigured),
    getCkgDescendants: vi.fn().mockImplementation(notConfigured),
    findCkgPath: vi.fn().mockImplementation(notConfigured),
    getCkgSiblings: vi.fn().mockImplementation(notConfigured),
    getCkgCoParents: vi.fn().mockImplementation(notConfigured),
    getCkgNeighborhood: vi.fn().mockImplementation(notConfigured),
    getCkgBridgeNodes: vi.fn().mockImplementation(notConfigured),
    getCkgCommonAncestors: vi.fn().mockImplementation(notConfigured),
    getCkgPrerequisiteChain: vi.fn().mockImplementation(notConfigured),
    getCkgCentralityRanking: vi.fn().mockImplementation(notConfigured),

    // Metrics & Health
    computeMetrics: vi.fn().mockImplementation(notConfigured),
    getMetrics: vi.fn().mockImplementation(notConfigured),
    getMetricsHistory: vi.fn().mockImplementation(notConfigured),

    // Misconceptions
    detectMisconceptions: vi.fn().mockImplementation(notConfigured),
    getMisconceptions: vi.fn().mockImplementation(notConfigured),
    updateMisconceptionStatus: vi.fn().mockImplementation(notConfigured),

    // Structural Health
    getStructuralHealth: vi.fn().mockImplementation(notConfigured),
    getMetacognitiveStage: vi.fn().mockImplementation(notConfigured),

    // Comparison
    compareWithCkg: vi.fn().mockImplementation(notConfigured),

    // CKG Mutations
    proposeMutation: vi.fn().mockImplementation(notConfigured),
    getMutation: vi.fn().mockImplementation(notConfigured),
    listMutations: vi.fn().mockImplementation(notConfigured),
    cancelMutation: vi.fn().mockImplementation(notConfigured),
    retryMutation: vi.fn().mockImplementation(notConfigured),
    getMutationAuditLog: vi.fn().mockImplementation(notConfigured),
    getMutationPipelineHealth: vi.fn().mockImplementation(notConfigured),
    approveEscalatedMutation: vi.fn().mockImplementation(notConfigured),
    rejectEscalatedMutation: vi.fn().mockImplementation(notConfigured),

    // Operation Log
    getOperationLog: vi.fn().mockImplementation(notConfigured),
  };
}

// ============================================================================
// Logger Mock
// ============================================================================

/**
 * Create a pino-compatible mock logger.
 * `child()` returns the same instance for chainability.
 */
export function mockLogger(): Record<string, ReturnType<typeof vi.fn>> {
  const logger: Record<string, ReturnType<typeof vi.fn>> = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: vi.fn(),
    silent: vi.fn(),
  };
  const childMock = logger['child'];
  if (childMock !== undefined) {
    childMock.mockReturnValue(logger);
  }
  return logger;
}

// ============================================================================
// Repository Mocks
// ============================================================================

/**
 * Create a fully-stubbed IMutationRepository mock.
 */
export function mockMutationRepository(): {
  [K in keyof IMutationRepository]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    createMutation: vi.fn().mockImplementation(notConfigured),
    getMutation: vi.fn().mockImplementation(notConfigured),
    updateMutationState: vi.fn().mockImplementation(notConfigured),
    appendAuditEntry: vi.fn().mockImplementation(notConfigured),
    getAuditLog: vi.fn().mockImplementation(notConfigured),
    findMutationsByState: vi.fn().mockImplementation(notConfigured),
    findMutationsByProposer: vi.fn().mockImplementation(notConfigured),
    countMutationsByState: vi.fn().mockImplementation(notConfigured),
    findMutations: vi.fn().mockImplementation(notConfigured),
    transitionStateWithAudit: vi.fn().mockImplementation(notConfigured),
    incrementRecoveryAttempts: vi.fn().mockImplementation(notConfigured),
  };
}

/**
 * Create a fully-stubbed IMetricsRepository mock.
 */
export function mockMetricsRepository(): {
  [K in keyof IMetricsRepository]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    saveSnapshot: vi.fn().mockImplementation(notConfigured),
    getLatestSnapshot: vi.fn().mockImplementation(notConfigured),
    getSnapshotHistory: vi.fn().mockImplementation(notConfigured),
    deleteOldSnapshots: vi.fn().mockImplementation(notConfigured),
  };
}

/**
 * Create a fully-stubbed IMisconceptionRepository mock.
 */
export function mockMisconceptionRepository(): {
  [K in keyof IMisconceptionRepository]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    // Pattern operations
    getActivePatterns: vi.fn().mockImplementation(notConfigured),
    getPatternsByType: vi.fn().mockImplementation(notConfigured),
    getPatternById: vi.fn().mockImplementation(notConfigured),
    upsertPattern: vi.fn().mockImplementation(notConfigured),
    // Intervention templates
    getInterventionTemplatesByType: vi.fn().mockImplementation(notConfigured),
    getInterventionTemplateById: vi.fn().mockImplementation(notConfigured),
    upsertInterventionTemplate: vi.fn().mockImplementation(notConfigured),
    // Detection records
    recordDetection: vi.fn().mockImplementation(notConfigured),
    getActiveMisconceptions: vi.fn().mockImplementation(notConfigured),
    updateMisconceptionStatus: vi.fn().mockImplementation(notConfigured),
  };
}

/**
 * Create a fully-stubbed IPkgOperationLogRepository mock.
 */
export function mockOperationLogRepository(): {
  [K in keyof IPkgOperationLogRepository]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    appendOperation: vi.fn().mockImplementation(notConfigured),
    getOperationHistory: vi.fn().mockImplementation(notConfigured),
    getOperationsSince: vi.fn().mockImplementation(notConfigured),
    getOperationsByType: vi.fn().mockImplementation(notConfigured),
    getOperationsForNode: vi.fn().mockImplementation(notConfigured),
    getOperationsForEdge: vi.fn().mockImplementation(notConfigured),
  };
}

/**
 * Create a fully-stubbed IMetricsStalenessRepository mock.
 */
export function mockMetricsStalenessRepository(): {
  [K in keyof IMetricsStalenessRepository]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    markStale: vi.fn().mockImplementation(notConfigured),
    isStale: vi.fn().mockImplementation(notConfigured),
    getStalenessRecord: vi.fn().mockImplementation(notConfigured),
  };
}

/**
 * Create a fully-stubbed IAggregationEvidenceRepository mock.
 */
export function mockAggregationEvidenceRepository(): {
  [K in keyof IAggregationEvidenceRepository]: ReturnType<typeof vi.fn>;
} {
  const notConfigured = (): Promise<never> => Promise.reject(new Error('Mock not configured'));

  return {
    recordEvidence: vi.fn().mockImplementation(notConfigured),
    getEvidenceForTarget: vi.fn().mockImplementation(notConfigured),
    getEvidenceCountByBand: vi.fn().mockImplementation(notConfigured),
    getEvidenceByUser: vi.fn().mockImplementation(notConfigured),
    deleteStaleEvidence: vi.fn().mockImplementation(notConfigured),
    getEvidenceSummary: vi.fn().mockImplementation(notConfigured),
  };
}

// ============================================================================
// Event Publisher Mock
// ============================================================================

/**
 * Create a mock IEventPublisher that captures published events
 * in an array for assertion.
 *
 * ```
 * const { publisher, publishedEvents } = mockEventPublisher();
 * // ... service code publishes events ...
 * expect(publishedEvents).toHaveLength(1);
 * expect(publishedEvents[0].eventType).toBe('PkgNodeCreated');
 * ```
 */
export function mockEventPublisher(): {
  publisher: { [K in keyof IEventPublisher]: ReturnType<typeof vi.fn> };
  publishedEvents: IEventToPublish[];
} {
  const publishedEvents: IEventToPublish[] = [];

  const publisher = {
    publish: vi.fn().mockImplementation((event: IEventToPublish) => {
      publishedEvents.push(event);
      return Promise.resolve();
    }),
    publishBatch: vi.fn().mockImplementation((events: IEventToPublish[]) => {
      publishedEvents.push(...events);
      return Promise.resolve();
    }),
  };

  return { publisher, publishedEvents };
}
