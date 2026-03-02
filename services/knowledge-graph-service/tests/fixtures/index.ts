/**
 * @noema/knowledge-graph-service — Test Fixtures
 *
 * Data factories for integration tests. Each factory returns a valid
 * default object that can be overridden via spread.
 *
 * Pattern follows content-service's tests/fixtures/index.ts convention.
 */

import type { IAgentHints } from '@noema/contracts';
import type {
  CorrelationId,
  EdgeId,
  EdgeWeight,
  IGraphEdge,
  IGraphNode,
  IMisconceptionDetection,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
  MutationId,
  NodeId,
  UserId,
} from '@noema/types';
import type {
  IExecutionContext,
  IServiceResult,
} from '../../src/domain/knowledge-graph-service/execution-context.js';
import type {
  ICkgMutation,
  IMutationAuditEntry,
} from '../../src/domain/knowledge-graph-service/mutation.repository.js';
import type { IPkgOperationLogEntry } from '../../src/domain/knowledge-graph-service/pkg-operation-log.repository.js';

// ============================================================================
// ID counter (deterministic)
// ============================================================================

let counter = 0;

export function resetIdCounter(): void {
  counter = 0;
}

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_test_${String(counter).padStart(4, '0')}`;
}

// ============================================================================
// Constants
// ============================================================================

export const TEST_USER_ID = 'user_test_owner' as UserId;
export const OTHER_USER_ID = 'user_test_other' as UserId;
export const ADMIN_USER_ID = 'user_test_admin' as UserId;
export const AGENT_USER_ID = 'user_test_agent' as UserId;
export const TEST_DOMAIN = 'mathematics';

/**
 * Properly formatted node IDs that satisfy NodeIdSchema (`^node_[a-zA-Z0-9]{21}$`).
 * Used in test requests where Zod schema validation is applied.
 */
export const VALID_NODE_ID_A = 'node_AAAAAAAAAA11111111111' as NodeId;
export const VALID_NODE_ID_B = 'node_BBBBBBBBBB22222222222' as NodeId;
export const VALID_NODE_ID_C = 'node_CCCCCCCCCC33333333333' as NodeId;

// ============================================================================
// Execution Context
// ============================================================================

export function executionContext(overrides?: Partial<IExecutionContext>): IExecutionContext {
  return {
    userId: TEST_USER_ID,
    correlationId: 'cor_test_0001' as CorrelationId,
    roles: [],
    clientIp: '127.0.0.1',
    ...overrides,
  };
}

// ============================================================================
// Agent Hints
// ============================================================================

export function defaultAgentHints(overrides?: Partial<IAgentHints>): IAgentHints {
  return {
    suggestedNextActions: [],
    relatedResources: [],
    confidence: 0.9,
    sourceQuality: 'high',
    validityPeriod: 'medium',
    contextNeeded: [],
    assumptions: [],
    riskFactors: [],
    dependencies: [],
    estimatedImpact: {
      benefit: 0.7,
      effort: 0.3,
      roi: 2.33,
    },
    preferenceAlignment: [],
    ...overrides,
  };
}

// ============================================================================
// Service Result
// ============================================================================

export function serviceResult<T>(data: T, agentHints?: Partial<IAgentHints>): IServiceResult<T> {
  return {
    data,
    agentHints: defaultAgentHints(agentHints),
  };
}

// ============================================================================
// Graph Node
// ============================================================================

export function graphNode(overrides?: Partial<IGraphNode>): IGraphNode {
  const id = nextId('node');
  return {
    nodeId: id as NodeId,
    graphType: 'pkg',
    nodeType: 'concept',
    label: `Test Node ${id}`,
    domain: TEST_DOMAIN,
    properties: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IGraphNode;
}

// ============================================================================
// Graph Edge
// ============================================================================

export function graphEdge(overrides?: Partial<IGraphEdge>): IGraphEdge {
  const id = nextId('edge');
  return {
    edgeId: id as EdgeId,
    graphType: 'pkg',
    edgeType: 'is_a',
    sourceNodeId: nextId('node') as NodeId,
    targetNodeId: nextId('node') as NodeId,
    weight: 1.0 as EdgeWeight,
    properties: {},
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IGraphEdge;
}

// ============================================================================
// Subgraph
// ============================================================================

export function subgraph(overrides?: Partial<ISubgraph>): ISubgraph {
  const node = graphNode();
  return {
    nodes: [node],
    edges: [],
    rootNodeId: node.nodeId,
    ...overrides,
  } as ISubgraph;
}

// ============================================================================
// CKG Mutation
// ============================================================================

export function ckgMutation(overrides?: Partial<ICkgMutation>): ICkgMutation {
  const id = nextId('mut');
  return {
    mutationId: id as MutationId,
    state: 'proposed',
    proposedBy: AGENT_USER_ID,
    version: 1,
    operations: [{ type: 'add_node', nodeType: 'concept', label: 'Test', domain: TEST_DOMAIN }],
    rationale: 'Test mutation',
    evidenceCount: 0,
    recoveryAttempts: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as ICkgMutation;
}

// ============================================================================
// Mutation Audit Entry
// ============================================================================

export function mutationAuditEntry(overrides?: Partial<IMutationAuditEntry>): IMutationAuditEntry {
  return {
    mutationId: 'mut_test_0001' as MutationId,
    fromState: 'proposed',
    toState: 'validating',
    performedBy: 'system',
    timestamp: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IMutationAuditEntry;
}

// ============================================================================
// Structural Metrics
// ============================================================================

export function structuralMetrics(overrides?: Partial<IStructuralMetrics>): IStructuralMetrics {
  return {
    abstractionDrift: 0.1,
    depthCalibrationGradient: 0.2,
    scopeLeakageIndex: 0.05,
    siblingConfusionEntropy: 0.3,
    upwardLinkStrength: 0.8,
    traversalBreadthScore: 0.6,
    strategyDepthFit: 0.7,
    structuralStrategyEntropy: 0.4,
    structuralAttributionAccuracy: 0.85,
    structuralStabilityGain: 0.5,
    boundarySensitivityImprovement: 0.15,
    ...overrides,
  } as IStructuralMetrics;
}

// ============================================================================
// Misconception Detection
// ============================================================================

export function misconceptionDetection(
  overrides?: Partial<IMisconceptionDetection>
): IMisconceptionDetection {
  return {
    userId: TEST_USER_ID,
    misconceptionType: 'structural_over_generalization',
    status: 'detected',
    affectedNodeIds: ['node_test_0001' as NodeId],
    confidence: 0.85 as never,
    patternId: 'pat_001' as never,
    detectedAt: '2025-01-01T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  } as IMisconceptionDetection;
}

// ============================================================================
// Structural Health Report
// ============================================================================

export function structuralHealthReport(
  overrides?: Partial<IStructuralHealthReport>
): IStructuralHealthReport {
  return {
    overallScore: 0.75,
    metricBreakdown: [],
    trend: 'stable',
    activeMisconceptionCount: 0,
    metacognitiveStage: 'developing',
    domain: TEST_DOMAIN,
    generatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IStructuralHealthReport;
}

// ============================================================================
// Operation Log Entry
// ============================================================================

export function operationLogEntry(
  overrides?: Partial<IPkgOperationLogEntry>
): IPkgOperationLogEntry {
  const id = nextId('oplog');
  return {
    id,
    userId: TEST_USER_ID,
    operation: {
      type: 'PkgNodeCreated',
      nodeId: 'node_test_0001' as NodeId,
      label: 'Test Node',
      nodeType: 'concept',
      domain: TEST_DOMAIN,
    },
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as IPkgOperationLogEntry;
}

// ============================================================================
// Convenience Aliases (Phase 10 spec naming)
// ============================================================================

/** Alias for `graphNode` — matches Phase 10 spec naming */
export const createTestNode = graphNode;

/** Alias for `graphEdge` — matches Phase 10 spec naming */
export const createTestEdge = graphEdge;

/** Alias for `ckgMutation` — matches Phase 10 spec naming */
export const createTestMutation = ckgMutation;

/** Alias for `structuralMetrics` — matches Phase 10 spec naming */
export const createTestMetrics = structuralMetrics;

/** Alias for `misconceptionDetection` — matches Phase 10 spec naming */
export const createTestMisconceptionDetection = misconceptionDetection;

/** Alias for `executionContext` — matches Phase 10 spec naming */
export const createTestExecutionContext = executionContext;
