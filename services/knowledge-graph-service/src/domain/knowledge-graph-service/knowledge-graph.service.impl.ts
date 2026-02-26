/**
 * @noema/knowledge-graph-service - KnowledgeGraphService Implementation
 *
 * Phase 5: PKG Operations & Service Layer Foundation.
 * Phase 6: CKG Mutation Pipeline (typestate-governed, async validation).
 * Phase 7: Structural Metrics & Misconception Detection.
 *
 * Concrete implementation of IKnowledgeGraphService. Orchestrates graph
 * repository calls, edge policy enforcement, event publishing, operation
 * logging, and agent hint generation.
 *
 * Design decisions:
 * - Constructor DI matching content-service pattern
 * - Every mutating method: validate → execute → log op → publish event → mark stale → return
 * - Full before/after tracking in operation log (D3a)
 * - Zod validation at service boundary (D2a)
 * - Metrics staleness via Prisma model (D4a)
 * - CKG mutations delegate to CkgMutationPipeline (Phase 6 D2a)
 * - Structural metrics via StructuralMetricsEngine (Phase 7 ADR-006 D1-B)
 * - Misconception detection via MisconceptionDetectionEngine (Phase 7 ADR-006 D3-C)
 *
 * @see ADR-0010 for edge policy architecture
 * @see ADR-005 for CKG mutation pipeline design
 * @see ADR-006 for structural metrics & misconception detection design
 * @see PHASE-5-PKG-OPERATIONS.md for requirements
 * @see PHASE-6-CKG-MUTATION-PIPELINE.md for CKG mutation requirements
 * @see PHASE-7-STRUCTURAL-METRICS.md for metrics & misconception requirements
 */

import type { IAgentHints } from '@noema/contracts';
import { KnowledgeGraphEventType } from '@noema/events';
import type {
  EdgeId,
  IGraphEdge,
  IGraphNode,
  IMetacognitiveStageAssessment,
  IMisconceptionDetection,
  IPaginatedResponse,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
  MisconceptionPatternId,
  MisconceptionStatus,
  MutationId,
  MutationState,
  NodeId,
  ProposerId,
  UserId,
} from '@noema/types';
import { ConfidenceScore as ConfidenceScoreFactory, EdgeWeight, GraphType } from '@noema/types';
import type { Logger } from 'pino';

import type { IEventPublisher } from '../shared/event-publisher.js';
import type {
  CkgMutationOperation,
  IMutationFilter,
  IMutationProposal,
} from './ckg-mutation-dsl.js';
import { MutationFilterSchema, MutationProposalSchema } from './ckg-mutation-dsl.js';
import type { CkgMutationPipeline } from './ckg-mutation-pipeline.js';
import { ValidationError } from './errors/base.errors.js';
import {
  CyclicEdgeError,
  EdgeNotFoundError,
  InvalidEdgeTypeError,
  NodeNotFoundError,
  OrphanEdgeError,
} from './errors/graph.errors.js';
import type { IExecutionContext, IServiceResult } from './execution-context.js';
import type {
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IGraphRepository,
  IUpdateEdgeInput,
  IUpdateNodeInput,
} from './graph.repository.js';
import {
  CreateEdgeInputSchema,
  CreateNodeInputSchema,
  UpdateEdgeInputSchema,
  UpdateNodeInputSchema,
} from './knowledge-graph.schemas.js';
import type { IKnowledgeGraphService, IOperationLogFilter, IPipelineHealthResult } from './knowledge-graph.service.js';
import type { IMetricsStalenessRepository } from './metrics-staleness.repository.js';
import type { IMetricsHistoryOptions, IMetricsRepository } from './metrics.repository.js';
import {
  assessMetacognitiveStage,
  buildGraphComparison,
  buildMetricComputationContext,
  buildStructuralHealthReport,
  StructuralMetricsEngine,
} from './metrics/index.js';
import type { IMisconceptionRepository } from './misconception.repository.js';
import type { IMisconceptionDetectionContext } from './misconception/index.js';
import { MisconceptionDetectionEngine } from './misconception/index.js';
import type { ICkgMutation, IMutationAuditEntry } from './mutation.repository.js';
import type { IPkgOperationLogEntry, IPkgOperationLogRepository } from './pkg-operation-log.repository.js';
import { getEdgePolicy } from './policies/edge-type-policies.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type {
  ICoParentsQuery,
  ICoParentsResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
  IValidationOptions,
} from './value-objects/graph.value-objects.js';
import type {
  IPkgEdgeCreatedOp,
  IPkgEdgeDeletedOp,
  IPkgEdgeUpdatedOp,
  IPkgNodeCreatedOp,
  IPkgNodeDeletedOp,
  IPkgNodeUpdatedOp,
} from './value-objects/operation-log.js';
import { PkgOperationType } from './value-objects/operation-log.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum traversal depth to prevent runaway queries. */
const MAX_TRAVERSAL_DEPTH = 20;

/** Maximum number of items per page for list operations. */
const MAX_PAGE_SIZE = 200;

// ============================================================================
// KnowledgeGraphService
// ============================================================================

/**
 * Concrete implementation of the knowledge-graph service layer.
 *
 * Responsibilities:
 * 1. Input validation (Zod schemas)
 * 2. Business rule enforcement (edge policies, node ownership)
 * 3. Repository delegation (Neo4j via IGraphRepository)
 * 4. Operation logging (append-only audit trail)
 * 5. Event publishing (domain events for downstream consumers)
 * 6. Metrics staleness tracking (Prisma-backed)
 * 7. Agent hint generation (actionable context bundles)
 */
export class KnowledgeGraphService implements IKnowledgeGraphService {
  private readonly logger: Logger;
  private readonly metricsEngine = new StructuralMetricsEngine();
  private readonly misconceptionEngine = new MisconceptionDetectionEngine();

  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    private readonly metricsStalenessRepository: IMetricsStalenessRepository,
    private readonly metricsRepository: IMetricsRepository,
    private readonly misconceptionRepository: IMisconceptionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly mutationPipeline: CkgMutationPipeline,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'KnowledgeGraphService' });
  }

  // ========================================================================
  // PKG Node Operations
  // ========================================================================

  async createNode(
    userId: UserId,
    input: ICreateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    this.requireAuth(context);
    this.logger.info(
      { userId, nodeType: input.nodeType, domain: input.domain },
      'Creating PKG node'
    );

    // Validate input
    const validated = this.validateInput(CreateNodeInputSchema, input, 'CreateNodeInput');

    // Create node in Neo4j
    const node = await this.graphRepository.createNode(
      GraphType.PKG,
      validated as ICreateNodeInput,
      userId
    );

    // Log operation
    const operation: IPkgNodeCreatedOp = {
      operationType: PkgOperationType.NODE_CREATED,
      sequenceNumber: 0, // Repository assigns the actual sequence number
      timestamp: new Date().toISOString(),
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      label: node.label,
      domain: node.domain,
    };
    await this.operationLogRepository.appendOperation(userId, operation);

    // Publish domain event
    await this.eventPublisher.publish({
      eventType: KnowledgeGraphEventType.PKG_NODE_CREATED,
      aggregateType: 'PersonalKnowledgeGraph',
      aggregateId: userId,
      payload: {
        nodeId: node.nodeId,
        userId,
        nodeType: node.nodeType,
        label: node.label,
        domain: node.domain,
        metadata: node.properties,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    // Mark metrics as stale
    await this.markMetricsStale(userId, node.domain, 'node_created');

    this.logger.info({ nodeId: node.nodeId, domain: node.domain }, 'PKG node created');

    return {
      data: node,
      agentHints: this.createNodeHints('created', node),
    };
  }

  async getNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    this.requireAuth(context);
    this.logger.debug({ userId, nodeId }, 'Getting PKG node');

    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    return {
      data: node,
      agentHints: this.createNodeHints('retrieved', node),
    };
  }

  async updateNode(
    userId: UserId,
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    this.requireAuth(context);
    this.logger.info({ userId, nodeId }, 'Updating PKG node');

    // Validate input
    this.validateInput(UpdateNodeInputSchema, updates, 'UpdateNodeInput');

    // Fetch current node for before/after tracking (D3a)
    const existingNode = await this.graphRepository.getNode(nodeId, userId);
    if (!existingNode) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    // Compute changed fields with before/after values
    const changedFields = this.computeNodeChangedFields(existingNode, updates);

    // Update node in Neo4j
    const updatedNode = await this.graphRepository.updateNode(nodeId, updates, userId);

    // Log operation with before/after tracking
    if (changedFields.length > 0) {
      const operation: IPkgNodeUpdatedOp = {
        operationType: PkgOperationType.NODE_UPDATED,
        sequenceNumber: 0,
        timestamp: new Date().toISOString(),
        nodeId,
        changedFields,
      };
      await this.operationLogRepository.appendOperation(userId, operation);

      // Publish domain event
      const fieldNames = changedFields.map((cf) => cf.field);
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const cf of changedFields) {
        previousValues[cf.field] = cf.before;
        newValues[cf.field] = cf.after;
      }

      await this.eventPublisher.publish({
        eventType: KnowledgeGraphEventType.PKG_NODE_UPDATED,
        aggregateType: 'PersonalKnowledgeGraph',
        aggregateId: userId,
        payload: {
          nodeId,
          userId,
          changedFields: fieldNames,
          previousValues,
          newValues,
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      });

      // Mark metrics as stale (use the updated domain or existing domain)
      const domain = updatedNode.domain;
      await this.markMetricsStale(userId, domain, 'node_updated');

      // If domain changed, also mark the old domain as stale
      if (updates.domain !== undefined && updates.domain !== existingNode.domain) {
        await this.markMetricsStale(userId, existingNode.domain, 'node_updated');
      }
    }

    this.logger.info({ nodeId, changedFieldCount: changedFields.length }, 'PKG node updated');

    return {
      data: updatedNode,
      agentHints: this.createNodeHints('updated', updatedNode),
    };
  }

  async deleteNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    this.requireAuth(context);
    this.logger.info({ userId, nodeId }, 'Deleting PKG node');

    // Verify node exists before deletion
    const existingNode = await this.graphRepository.getNode(nodeId, userId);
    if (!existingNode) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    // Soft-delete node (repository handles orphaned edges)
    await this.graphRepository.deleteNode(nodeId, userId);

    // Log operation
    const operation: IPkgNodeDeletedOp = {
      operationType: PkgOperationType.NODE_DELETED,
      sequenceNumber: 0,
      timestamp: new Date().toISOString(),
      nodeId,
    };
    await this.operationLogRepository.appendOperation(userId, operation);

    // Publish domain event
    await this.eventPublisher.publish({
      eventType: KnowledgeGraphEventType.PKG_NODE_REMOVED,
      aggregateType: 'PersonalKnowledgeGraph',
      aggregateId: userId,
      payload: {
        nodeId,
        userId,
        reason: 'User-initiated deletion',
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    // Mark metrics as stale
    await this.markMetricsStale(userId, existingNode.domain, 'node_deleted');

    this.logger.info({ nodeId, domain: existingNode.domain }, 'PKG node deleted');

    return {
      data: undefined,
      agentHints: this.createDeleteHints('node', nodeId, existingNode.domain),
    };
  }

  async listNodes(
    userId: UserId,
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>> {
    this.requireAuth(context);
    this.logger.debug({ userId, filters, pagination }, 'Listing PKG nodes');

    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // Ensure PKG scope — override graphType and userId in filter
    const pkgFilter: INodeFilter = {
      ...filters,
      userId,
      graphType: GraphType.PKG,
      includeDeleted: filters.includeDeleted,
    };

    const [items, total] = await Promise.all([
      this.graphRepository.findNodes(pkgFilter, limit, offset),
      this.graphRepository.countNodes(pkgFilter),
    ]);

    const result: IPaginatedResponse<IGraphNode> = {
      items,
      total,
      hasMore: offset + items.length < total,
    };

    return {
      data: result,
      agentHints: this.createListHints('nodes', items.length, total),
    };
  }

  // ========================================================================
  // PKG Edge Operations
  // ========================================================================

  async createEdge(
    userId: UserId,
    input: ICreateEdgeInput,
    context: IExecutionContext,
    validationOptions?: IValidationOptions
  ): Promise<IServiceResult<IGraphEdge>> {
    this.requireAuth(context);
    this.logger.info(
      { userId, edgeType: input.edgeType, source: input.sourceNodeId, target: input.targetNodeId },
      'Creating PKG edge'
    );

    // Validate input
    const validated = this.validateInput(CreateEdgeInputSchema, input, 'CreateEdgeInput');

    // Verify both endpoints exist in user's PKG
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(validated.sourceNodeId as NodeId, userId),
      this.graphRepository.getNode(validated.targetNodeId as NodeId, userId),
    ]);

    if (!sourceNode) {
      throw new OrphanEdgeError(validated.sourceNodeId, 'source');
    }
    if (!targetNode) {
      throw new OrphanEdgeError(validated.targetNodeId, 'target');
    }

    // Look up edge policy
    const policy = getEdgePolicy(input.edgeType);

    // Validate node types against policy (unless skipped)
    if (validationOptions?.validateNodeTypes !== false) {
      const sourceAllowed = policy.allowedSourceTypes.includes(sourceNode.nodeType);
      const targetAllowed = policy.allowedTargetTypes.includes(targetNode.nodeType);

      if (!sourceAllowed || !targetAllowed) {
        throw new InvalidEdgeTypeError(
          input.edgeType,
          sourceNode.nodeType,
          targetNode.nodeType,
          policy.allowedSourceTypes as string[],
          policy.allowedTargetTypes as string[]
        );
      }
    }

    // Validate weight against policy (unless skipped)
    if (validationOptions?.validateWeight !== false) {
      const weight = input.weight !== undefined ? (input.weight as number) : policy.defaultWeight;
      if (weight > policy.maxWeight) {
        throw new ValidationError(
          `Edge weight ${String(weight)} exceeds maximum ${String(policy.maxWeight)} for edge type ${input.edgeType}`,
          { weight: [`Must be ≤ ${String(policy.maxWeight)}`] }
        );
      }
    }

    // Acyclicity check (unless skipped)
    if (policy.requiresAcyclicity && validationOptions?.validateAcyclicity !== false) {
      const cyclePath = await this.graphRepository.detectCycles(
        input.targetNodeId,
        input.edgeType,
        userId
      );

      // If target can reach source, adding source→target creates a cycle
      if (cyclePath.length > 0) {
        throw new CyclicEdgeError(
          input.edgeType,
          input.sourceNodeId as string,
          input.targetNodeId as string,
          cyclePath as string[]
        );
      }
    }

    // Apply default weight from policy if not specified
    const edgeInput: ICreateEdgeInput = {
      ...(validated as ICreateEdgeInput),
      weight: input.weight ?? EdgeWeight.create(policy.defaultWeight),
    };

    // Create edge in Neo4j
    const edge = await this.graphRepository.createEdge(GraphType.PKG, edgeInput, userId);

    // Log operation
    const skippedValidations: string[] = [];
    if (validationOptions?.validateNodeTypes === false) skippedValidations.push('nodeTypes');
    if (validationOptions?.validateWeight === false) skippedValidations.push('weight');
    if (validationOptions?.validateAcyclicity === false) skippedValidations.push('acyclicity');

    const operation: IPkgEdgeCreatedOp = {
      operationType: PkgOperationType.EDGE_CREATED,
      sequenceNumber: 0,
      timestamp: new Date().toISOString(),
      edgeId: edge.edgeId,
      edgeType: edge.edgeType,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      weight: edge.weight,
      ...(skippedValidations.length > 0 ? { skippedValidations } : {}),
    };
    await this.operationLogRepository.appendOperation(userId, operation);

    // Publish domain event
    await this.eventPublisher.publish({
      eventType: KnowledgeGraphEventType.PKG_EDGE_CREATED,
      aggregateType: 'PersonalKnowledgeGraph',
      aggregateId: userId,
      payload: {
        edgeId: edge.edgeId,
        userId,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        edgeType: edge.edgeType,
        weight: edge.weight as number,
        metadata: edge.properties,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    // Mark metrics as stale (use source node's domain as representative)
    await this.markMetricsStale(userId, sourceNode.domain, 'edge_created');

    this.logger.info({ edgeId: edge.edgeId, edgeType: edge.edgeType }, 'PKG edge created');

    return {
      data: edge,
      agentHints: this.createEdgeHints('created', edge, sourceNode, targetNode),
    };
  }

  async getEdge(
    userId: UserId,
    edgeId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    this.requireAuth(context);
    this.logger.debug({ userId, edgeId }, 'Getting PKG edge');

    const edge = await this.graphRepository.getEdge(edgeId as EdgeId);
    if (edge?.userId !== userId) {
      throw new EdgeNotFoundError(edgeId);
    }

    return {
      data: edge,
      agentHints: this.createEdgeRetrievalHints(edge),
    };
  }

  async updateEdge(
    userId: UserId,
    edgeId: string,
    updates: IUpdateEdgeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    this.requireAuth(context);
    this.logger.info({ userId, edgeId }, 'Updating PKG edge');

    // Validate input
    this.validateInput(UpdateEdgeInputSchema, updates, 'UpdateEdgeInput');

    // Fetch current edge for before/after tracking
    const existingEdge = await this.graphRepository.getEdge(edgeId as EdgeId);
    if (existingEdge?.userId !== userId) {
      throw new EdgeNotFoundError(edgeId);
    }

    // Validate weight against policy if weight is being updated
    if (updates.weight !== undefined) {
      const policy = getEdgePolicy(existingEdge.edgeType);
      if ((updates.weight as number) > policy.maxWeight) {
        throw new ValidationError(
          `Edge weight ${String(updates.weight as number)} exceeds maximum ${String(policy.maxWeight)} for edge type ${existingEdge.edgeType}`,
          { weight: [`Must be ≤ ${String(policy.maxWeight)}`] }
        );
      }
    }

    // Compute changed fields
    const changedFields = this.computeEdgeChangedFields(existingEdge, updates);

    // Update edge in Neo4j
    const updatedEdge = await this.graphRepository.updateEdge(edgeId as EdgeId, updates);

    // Log & publish only if something actually changed
    if (changedFields.length > 0) {
      // Log operation for audit trail (D3a)
      const edgeUpdateOp: IPkgEdgeUpdatedOp = {
        operationType: PkgOperationType.EDGE_UPDATED,
        sequenceNumber: 0,
        timestamp: new Date().toISOString(),
        edgeId: existingEdge.edgeId,
        changedFields,
      };
      await this.operationLogRepository.appendOperation(userId, edgeUpdateOp);

      // Publish domain event
      const fieldNames = changedFields.map((cf) => cf.field);
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const cf of changedFields) {
        previousValues[cf.field] = cf.before;
        newValues[cf.field] = cf.after;
      }

      await this.eventPublisher.publish({
        eventType: KnowledgeGraphEventType.PKG_EDGE_UPDATED,
        aggregateType: 'PersonalKnowledgeGraph',
        aggregateId: userId,
        payload: {
          edgeId: existingEdge.edgeId,
          userId,
          changedFields: fieldNames,
          previousValues,
          newValues,
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      });

      // Determine domain for staleness — look up source node
      const sourceNode = await this.graphRepository.getNode(existingEdge.sourceNodeId, userId);
      if (sourceNode) {
        await this.markMetricsStale(userId, sourceNode.domain, 'edge_updated');
      }
    }

    this.logger.info({ edgeId, changedFieldCount: changedFields.length }, 'PKG edge updated');

    return {
      data: updatedEdge,
      agentHints: this.createEdgeRetrievalHints(updatedEdge),
    };
  }

  async deleteEdge(
    userId: UserId,
    edgeId: string,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    this.requireAuth(context);
    this.logger.info({ userId, edgeId }, 'Deleting PKG edge');

    // Verify edge exists and belongs to user
    const existingEdge = await this.graphRepository.getEdge(edgeId as EdgeId);
    if (existingEdge?.userId !== userId) {
      throw new EdgeNotFoundError(edgeId);
    }

    // Hard-delete edge (edges have no soft-delete semantics)
    await this.graphRepository.removeEdge(edgeId as EdgeId);

    // Log operation
    const operation: IPkgEdgeDeletedOp = {
      operationType: PkgOperationType.EDGE_DELETED,
      sequenceNumber: 0,
      timestamp: new Date().toISOString(),
      edgeId: existingEdge.edgeId,
    };
    await this.operationLogRepository.appendOperation(userId, operation);

    // Publish domain event
    await this.eventPublisher.publish({
      eventType: KnowledgeGraphEventType.PKG_EDGE_REMOVED,
      aggregateType: 'PersonalKnowledgeGraph',
      aggregateId: userId,
      payload: {
        edgeId: existingEdge.edgeId,
        userId,
        reason: 'User-initiated deletion',
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    // Mark metrics as stale — look up source node for domain
    const sourceNode = await this.graphRepository.getNode(existingEdge.sourceNodeId, userId);
    const sourceDomain = sourceNode?.domain ?? 'unknown';
    if (sourceNode) {
      await this.markMetricsStale(userId, sourceNode.domain, 'edge_deleted');
    }

    this.logger.info({ edgeId, edgeType: existingEdge.edgeType }, 'PKG edge deleted');

    return {
      data: undefined,
      agentHints: this.createDeleteHints('edge', edgeId, sourceDomain),
    };
  }

  async listEdges(
    userId: UserId,
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>> {
    this.requireAuth(context);
    this.logger.debug({ userId, filters, pagination }, 'Listing PKG edges');

    // Enforce user scope
    const scopedFilter: IEdgeFilter = {
      ...filters,
      userId,
    };

    // Apply pagination limits
    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // Push pagination to the repository (database-level SKIP/LIMIT)
    // Fetch limit+1 to know if there are more results without a separate count query
    const edges = await this.graphRepository.findEdges(scopedFilter, limit + 1, offset);

    const hasMore = edges.length > limit;
    const paginatedEdges = hasMore ? edges.slice(0, limit) : edges;

    const result: IPaginatedResponse<IGraphEdge> = {
      items: paginatedEdges,
      total: offset + edges.length, // Approximate total (exact count requires separate query)
      hasMore,
    };

    return {
      data: result,
      agentHints: this.createListHints('edges', paginatedEdges.length, result.total ?? 0),
    };
  }

  // ========================================================================
  // PKG Traversal Operations
  // ========================================================================

  async getSubgraph(
    userId: UserId,
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>> {
    this.requireAuth(context);
    this.logger.debug(
      { userId, rootNodeId, maxDepth: traversalOptions.maxDepth },
      'Getting PKG subgraph'
    );

    // Validate depth
    this.validateTraversalDepth(traversalOptions.maxDepth);

    // Verify root node exists
    const rootNode = await this.graphRepository.getNode(rootNodeId, userId);
    if (!rootNode) {
      throw new NodeNotFoundError(rootNodeId, GraphType.PKG);
    }

    const subgraph = await this.graphRepository.getSubgraph(rootNodeId, traversalOptions, userId);

    return {
      data: subgraph,
      agentHints: this.createSubgraphHints(subgraph, rootNode),
    };
  }

  async getAncestors(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    this.requireAuth(context);
    this.logger.debug({ userId, nodeId, maxDepth: options.maxDepth }, 'Getting PKG ancestors');

    this.validateTraversalDepth(options.maxDepth);

    // Verify node exists
    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    const ancestors = await this.graphRepository.getAncestors(nodeId, options, userId);

    return {
      data: ancestors,
      agentHints: this.createTraversalHints('ancestors', ancestors, node),
    };
  }

  async getDescendants(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    this.requireAuth(context);
    this.logger.debug({ userId, nodeId, maxDepth: options.maxDepth }, 'Getting PKG descendants');

    this.validateTraversalDepth(options.maxDepth);

    // Verify node exists
    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    const descendants = await this.graphRepository.getDescendants(nodeId, options, userId);

    return {
      data: descendants,
      agentHints: this.createTraversalHints('descendants', descendants, node),
    };
  }

  async findPath(
    userId: UserId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    this.requireAuth(context);
    this.logger.debug({ userId, fromNodeId, toNodeId }, 'Finding path in PKG');

    // Verify both nodes exist
    const [fromNode, toNode] = await Promise.all([
      this.graphRepository.getNode(fromNodeId, userId),
      this.graphRepository.getNode(toNodeId, userId),
    ]);

    if (!fromNode) {
      throw new NodeNotFoundError(fromNodeId, GraphType.PKG);
    }
    if (!toNode) {
      throw new NodeNotFoundError(toNodeId, GraphType.PKG);
    }

    const path = await this.graphRepository.findShortestPath(fromNodeId, toNodeId, userId);

    return {
      data: path,
      agentHints: this.createPathHints(path, fromNode, toNode),
    };
  }

  async getSiblings(
    userId: UserId,
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>> {
    this.requireAuth(context);
    this.logger.debug(
      { userId, nodeId, edgeType: query.edgeType, direction: query.direction },
      'Getting PKG siblings'
    );

    // Verify node exists
    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    const result = await this.graphRepository.getSiblings(nodeId, query, userId);

    return {
      data: result,
      agentHints: this.createSiblingsHints(result),
    };
  }

  async getCoParents(
    userId: UserId,
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>> {
    this.requireAuth(context);
    this.logger.debug(
      { userId, nodeId, edgeType: query.edgeType, direction: query.direction },
      'Getting PKG co-parents'
    );

    // Verify node exists
    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    const result = await this.graphRepository.getCoParents(nodeId, query, userId);

    return {
      data: result,
      agentHints: this.createCoParentsHints(result),
    };
  }

  async getNeighborhood(
    userId: UserId,
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>> {
    this.requireAuth(context);
    this.logger.debug(
      { userId, nodeId, hops: query.hops, filterMode: query.filterMode },
      'Getting PKG neighborhood'
    );

    // Verify node exists
    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    const result = await this.graphRepository.getNeighborhood(nodeId, query, userId);

    return {
      data: result,
      agentHints: this.createNeighborhoodHints(result),
    };
  }

  // ========================================================================
  // CKG Operations (read-only)
  // ========================================================================

  async getCkgNode(
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    this.requireAuth(context);
    this.logger.debug({ nodeId }, 'Getting CKG node');

    // CKG queries don't pass userId — nodes are shared
    const node = await this.graphRepository.getNode(nodeId);
    if (node?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(nodeId, GraphType.CKG);
    }

    return {
      data: node,
      agentHints: this.createCkgNodeHints(node),
    };
  }

  async getCkgSubgraph(
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>> {
    this.requireAuth(context);
    this.logger.debug({ rootNodeId, maxDepth: traversalOptions.maxDepth }, 'Getting CKG subgraph');

    this.validateTraversalDepth(traversalOptions.maxDepth);

    // Verify root exists in CKG — return empty subgraph if not found
    const rootNode = await this.graphRepository.getNode(rootNodeId);
    if (rootNode?.graphType !== GraphType.CKG) {
      this.logger.info(
        { rootNodeId },
        'CKG subgraph root node not found — returning empty subgraph'
      );
      const emptySubgraph: ISubgraph = { nodes: [], edges: [] };
      return {
        data: emptySubgraph,
        agentHints: {
          suggestedNextActions: [
            {
              action: 'verify_node_id',
              description: 'Verify the node ID belongs to the CKG',
              priority: 'high' as const,
              category: 'correction',
            },
            {
              action: 'check_ingestion',
              description: 'Check if the domain has been ingested',
              priority: 'medium' as const,
              category: 'exploration',
            },
          ],
          relatedResources: [],
          confidence: 0,
          sourceQuality: 'low' as const,
          validityPeriod: 'short' as const,
          contextNeeded: ['Valid CKG root node ID'],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
          preferenceAlignment: [],
          reasoning: 'No CKG data found for the requested root node.',
        },
      };
    }

    // CKG traversals don't pass userId
    const subgraph = await this.graphRepository.getSubgraph(rootNodeId, traversalOptions);

    return {
      data: subgraph,
      agentHints: this.createSubgraphHints(subgraph, rootNode),
    };
  }

  async listCkgNodes(
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>> {
    this.requireAuth(context);
    this.logger.debug({ filters, pagination }, 'Listing CKG nodes');

    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // Ensure CKG scope
    const ckgFilter: INodeFilter = {
      ...filters,
      graphType: GraphType.CKG,
      includeDeleted: filters.includeDeleted,
    };

    const [items, total] = await Promise.all([
      this.graphRepository.findNodes(ckgFilter, limit, offset),
      this.graphRepository.countNodes(ckgFilter),
    ]);

    const result: IPaginatedResponse<IGraphNode> = {
      items,
      total,
      hasMore: offset + items.length < total,
    };

    return {
      data: result,
      agentHints: this.createListHints('CKG nodes', items.length, total),
    };
  }

  async getCkgEdge(
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    this.requireAuth(context);
    this.logger.debug({ edgeId }, 'Getting CKG edge');

    const edge = await this.graphRepository.getEdge(edgeId);
    if (edge?.graphType !== GraphType.CKG) {
      throw new EdgeNotFoundError(edgeId as string);
    }

    return {
      data: edge,
      agentHints: this.createEdgeRetrievalHints(edge),
    };
  }

  async listCkgEdges(
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>> {
    this.requireAuth(context);
    this.logger.debug({ filters, pagination }, 'Listing CKG edges');

    // Apply pagination limits
    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // CKG edges have no userId — omit it from the filter
    const ckgFilter: IEdgeFilter = {
      ...(filters.edgeType != null ? { edgeType: filters.edgeType } : {}),
      ...(filters.sourceNodeId != null ? { sourceNodeId: filters.sourceNodeId } : {}),
      ...(filters.targetNodeId != null ? { targetNodeId: filters.targetNodeId } : {}),
    };

    // Fetch limit+1 to know if there are more results without a separate count query
    const edges = await this.graphRepository.findEdges(ckgFilter, limit + 1, offset);

    const hasMore = edges.length > limit;
    const paginatedEdges = hasMore ? edges.slice(0, limit) : edges;

    const result: IPaginatedResponse<IGraphEdge> = {
      items: paginatedEdges,
      total: offset + edges.length,
      hasMore,
    };

    return {
      data: result,
      agentHints: this.createListHints('CKG edges', paginatedEdges.length, result.total ?? 0),
    };
  }

  async getCkgAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    this.requireAuth(context);
    this.logger.debug({ nodeId, maxDepth: options.maxDepth }, 'Getting CKG ancestors');

    this.validateTraversalDepth(options.maxDepth);

    // Verify node exists in CKG
    const node = await this.graphRepository.getNode(nodeId);
    if (node?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(nodeId, GraphType.CKG);
    }

    // CKG traversals don't pass userId
    const ancestors = await this.graphRepository.getAncestors(nodeId, options);

    return {
      data: ancestors,
      agentHints: this.createTraversalHints('CKG ancestors', ancestors, node),
    };
  }

  async getCkgDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    this.requireAuth(context);
    this.logger.debug({ nodeId, maxDepth: options.maxDepth }, 'Getting CKG descendants');

    this.validateTraversalDepth(options.maxDepth);

    // Verify node exists in CKG
    const node = await this.graphRepository.getNode(nodeId);
    if (node?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(nodeId, GraphType.CKG);
    }

    // CKG traversals don't pass userId
    const descendants = await this.graphRepository.getDescendants(nodeId, options);

    return {
      data: descendants,
      agentHints: this.createTraversalHints('CKG descendants', descendants, node),
    };
  }

  async findCkgPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    this.requireAuth(context);
    this.logger.debug({ fromNodeId, toNodeId }, 'Finding path in CKG');

    // Verify both nodes exist in CKG
    const [fromNode, toNode] = await Promise.all([
      this.graphRepository.getNode(fromNodeId),
      this.graphRepository.getNode(toNodeId),
    ]);

    if (fromNode?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(fromNodeId, GraphType.CKG);
    }
    if (toNode?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(toNodeId, GraphType.CKG);
    }

    // CKG path finding — no userId scoping
    const path = await this.graphRepository.findShortestPath(fromNodeId, toNodeId);

    return {
      data: path,
      agentHints: this.createPathHints(path, fromNode, toNode),
    };
  }

  async getCkgSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>> {
    this.requireAuth(context);
    this.logger.debug(
      { nodeId, edgeType: query.edgeType, direction: query.direction },
      'Getting CKG siblings'
    );

    // Verify node exists in CKG
    const node = await this.graphRepository.getNode(nodeId);
    if (node?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(nodeId, GraphType.CKG);
    }

    // CKG traversals don't pass userId
    const result = await this.graphRepository.getSiblings(nodeId, query);

    return {
      data: result,
      agentHints: this.createSiblingsHints(result),
    };
  }

  async getCkgCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>> {
    this.requireAuth(context);
    this.logger.debug(
      { nodeId, edgeType: query.edgeType, direction: query.direction },
      'Getting CKG co-parents'
    );

    // Verify node exists in CKG
    const node = await this.graphRepository.getNode(nodeId);
    if (node?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(nodeId, GraphType.CKG);
    }

    // CKG traversals don't pass userId
    const result = await this.graphRepository.getCoParents(nodeId, query);

    return {
      data: result,
      agentHints: this.createCoParentsHints(result),
    };
  }

  async getCkgNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>> {
    this.requireAuth(context);
    this.logger.debug(
      { nodeId, hops: query.hops, filterMode: query.filterMode },
      'Getting CKG neighborhood'
    );

    // Verify node exists in CKG
    const node = await this.graphRepository.getNode(nodeId);
    if (node?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(nodeId, GraphType.CKG);
    }

    // CKG traversals don't pass userId
    const result = await this.graphRepository.getNeighborhood(nodeId, query);

    return {
      data: result,
      agentHints: this.createNeighborhoodHints(result),
    };
  }

  // ========================================================================
  // Phase 7 — Structural Metrics
  // ========================================================================

  async computeMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    this.requireAuth(context);
    this.logger.info({ userId, domain }, 'Computing structural metrics');

    // I-1: Staleness guard — return cached metrics if they are still fresh
    // (no structural changes since the last snapshot was computed).
    const existingSnapshot = await this.metricsRepository.getLatestSnapshot(userId, domain);
    if (existingSnapshot) {
      const isStale = await this.metricsStalenessRepository.isStale(
        userId,
        domain,
        existingSnapshot.computedAt
      );
      if (!isStale) {
        this.logger.debug({ userId, domain }, 'Metrics are fresh — returning cached snapshot');
        return {
          data: existingSnapshot.metrics,
          agentHints: this.createMetricsHints(existingSnapshot.metrics, domain),
        };
      }
    }

    // Fetch subgraphs in parallel
    const [pkgSubgraph, ckgSubgraph] = await Promise.all([
      this.fetchDomainSubgraph(GraphType.PKG, domain, userId),
      this.fetchDomainSubgraph(GraphType.CKG, domain),
    ]);

    // Detect CKG unavailability (empty CKG subgraph)
    const ckgUnavailable = ckgSubgraph.nodes.length === 0;
    if (ckgUnavailable) {
      this.logger.warn(
        { userId, domain },
        'CKG subgraph is empty — CKG-dependent metrics will default to 0.0'
      );
    }

    // Build comparison
    const comparison = buildGraphComparison(pkgSubgraph, ckgSubgraph);

    // Re-use the snapshot fetched during staleness check (or null for first run)
    const previousSnapshot = existingSnapshot;

    // Build computation context
    const ctx = buildMetricComputationContext(
      pkgSubgraph,
      ckgSubgraph,
      comparison,
      previousSnapshot,
      domain,
      userId
    );

    // Compute all 11 metrics
    const metrics = this.metricsEngine.computeAll(ctx);

    // Save snapshot
    await this.metricsRepository.saveSnapshot(userId, domain, metrics);

    // Publish event only when metrics changed significantly (>0.05 on any
    // metric or crossed a concerning threshold). Spec: Phase 7 L78-79.
    const hasSignificantChange = this.detectSignificantMetricChange(
      metrics,
      previousSnapshot?.metrics ?? null
    );

    if (hasSignificantChange) {
      await this.eventPublisher.publish({
        eventType: KnowledgeGraphEventType.PKG_STRUCTURAL_METRICS_UPDATED,
        aggregateType: 'PersonalKnowledgeGraph',
        aggregateId: userId,
        payload: { userId, domain, metrics },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      });
    }

    // Build hints — include CKG unavailability warning if applicable
    const hints = this.createMetricsHints(metrics, domain);
    if (ckgUnavailable) {
      hints.riskFactors.push({
        type: 'accuracy',
        severity: 'medium',
        description:
          'CKG unavailable for this domain — CKG-dependent metrics ' +
          '(AD, DCG, SLI, SCE, ULS) defaulted to 0.0. Results are partial.',
        probability: 1.0,
        impact: 0.6,
      });
      hints.assumptions.push('CKG subgraph was empty — CKG-dependent metrics are not meaningful');
    }

    return {
      data: metrics,
      agentHints: hints,
    };
  }

  async getMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    this.requireAuth(context);

    const snapshot = await this.metricsRepository.getLatestSnapshot(userId, domain);
    if (!snapshot) {
      // No cached snapshot — compute fresh
      return this.computeMetrics(userId, domain, context);
    }

    // Check staleness — compare snapshot.computedAt against last structural change
    const isStale = await this.metricsStalenessRepository.isStale(
      userId,
      domain,
      snapshot.computedAt
    );
    if (isStale) {
      return this.computeMetrics(userId, domain, context);
    }

    return {
      data: snapshot.metrics,
      agentHints: this.createMetricsHints(snapshot.metrics, domain),
    };
  }

  async getMetricsHistory(
    userId: UserId,
    domain: string,
    options: IMetricsHistoryOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics[]>> {
    this.requireAuth(context);

    const snapshots = await this.metricsRepository.getSnapshotHistory(userId, domain, options);
    const metricsList = snapshots.map((s) => s.metrics);

    return {
      data: metricsList,
      agentHints: this.createListHints('metric snapshots', metricsList.length, metricsList.length),
    };
  }

  // ========================================================================
  // Phase 7 — Misconception Detection
  // ========================================================================

  async detectMisconceptions(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    this.requireAuth(context);
    this.logger.info({ userId, domain }, 'Running misconception detection');

    // Fetch subgraphs
    const [pkgSubgraph, ckgSubgraph] = await Promise.all([
      this.fetchDomainSubgraph(GraphType.PKG, domain, userId),
      this.fetchDomainSubgraph(GraphType.CKG, domain),
    ]);

    const comparison = buildGraphComparison(pkgSubgraph, ckgSubgraph);

    // Get active patterns
    const patterns = await this.misconceptionRepository.getActivePatterns();

    // I-3: Fetch currently active misconceptions to deduplicate detections.
    // We skip re-recording a misconception if an active one already exists
    // for the same (userId, patternId) pair.
    const activeMisconceptions = await this.misconceptionRepository.getActiveMisconceptions(
      userId,
      domain
    );
    const activePatternIds = new Set(activeMisconceptions.map((m) => m.patternId));

    // Build detection context
    const detectionCtx: IMisconceptionDetectionContext = {
      pkgSubgraph,
      ckgSubgraph,
      comparison,
      patterns,
      domain,
      userId: userId as string,
    };

    // Run detection engine
    const rawResults = this.misconceptionEngine.detectAll(detectionCtx);

    // Persist detections
    const detections: IMisconceptionDetection[] = [];
    for (const result of rawResults) {
      if (result.confidence < 0.3) continue; // Filter very low confidence

      // Find the pattern to get the misconception type
      const pattern = patterns.find((p) => p.patternId === result.patternId);
      if (!pattern) continue;

      // I-3: Skip if an active detection already exists for this pattern
      if (activePatternIds.has(result.patternId as MisconceptionPatternId)) {
        this.logger.debug(
          { patternId: result.patternId },
          'Skipping duplicate misconception — active detection already exists'
        );
        continue;
      }

      const record = await this.misconceptionRepository.recordDetection({
        userId,
        patternId: result.patternId as MisconceptionPatternId,
        misconceptionType: pattern.misconceptionType,
        affectedNodeIds: result.affectedNodeIds,
        confidence: ConfidenceScoreFactory.clamp(result.confidence),
      });

      detections.push({
        userId: record.userId as string,
        misconceptionType: record.misconceptionType,
        status: record.status,
        affectedNodeIds: record.affectedNodeIds,
        confidence: record.confidence,
        patternId: record.patternId,
        detectedAt: record.detectedAt,
        resolvedAt: record.resolvedAt,
      });

      // Publish MisconceptionDetected event (Phase 7 spec requirement)
      await this.eventPublisher.publish({
        eventType: KnowledgeGraphEventType.MISCONCEPTION_DETECTED,
        aggregateType: 'PersonalKnowledgeGraph',
        aggregateId: userId,
        payload: {
          userId,
          misconceptionType: record.misconceptionType,
          affectedNodeIds: record.affectedNodeIds,
          confidence: record.confidence,
          patternId: record.patternId,
          evidence: {
            detectionMethod: pattern.kind,
            domain,
          } satisfies Record<string, string>,
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      });
    }

    return {
      data: detections,
      agentHints: this.createMisconceptionHints(detections),
    };
  }

  async getMisconceptions(
    userId: UserId,
    domain: string | undefined,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    this.requireAuth(context);

    const records = await this.misconceptionRepository.getActiveMisconceptions(userId, domain);

    const detections: IMisconceptionDetection[] = records.map((r) => ({
      userId: r.userId as string,
      misconceptionType: r.misconceptionType,
      status: r.status,
      affectedNodeIds: r.affectedNodeIds,
      confidence: r.confidence,
      patternId: r.patternId,
      detectedAt: r.detectedAt,
      resolvedAt: r.resolvedAt,
    }));

    return {
      data: detections,
      agentHints: this.createMisconceptionHints(detections),
    };
  }

  async updateMisconceptionStatus(
    detectionId: string,
    status: string,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    this.requireAuth(context);

    await this.misconceptionRepository.updateMisconceptionStatus(
      detectionId,
      status as MisconceptionStatus
    );

    return {
      data: undefined,
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
        preferenceAlignment: [],
        reasoning: `Misconception ${detectionId} status updated to "${status}"`,
      },
    };
  }

  // ========================================================================
  // Phase 7 — Structural Health & Metacognitive Stage
  // ========================================================================

  async getStructuralHealth(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralHealthReport>> {
    this.requireAuth(context);

    // Get or compute metrics
    const { data: metrics } = await this.getMetrics(userId, domain, context);

    // Get recent snapshots for trend
    const snapshots = await this.metricsRepository.getSnapshotHistory(userId, domain, { limit: 5 });

    // Get misconception count
    const misconceptions = await this.misconceptionRepository.getActiveMisconceptions(
      userId,
      domain
    );

    // Get metacognitive stage
    const previousSnapshot = snapshots.length > 1 ? snapshots[1] : undefined;
    const previousMetrics = previousSnapshot?.metrics ?? null;
    const stageAssessment = assessMetacognitiveStage(metrics, previousMetrics, domain);

    // Build health report
    const report = buildStructuralHealthReport(
      metrics,
      snapshots,
      misconceptions.length,
      stageAssessment.currentStage,
      domain
    );

    return {
      data: report,
      agentHints: this.createHealthHints(report),
    };
  }

  async getMetacognitiveStage(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IMetacognitiveStageAssessment>> {
    this.requireAuth(context);

    // Get or compute metrics
    const { data: metrics } = await this.getMetrics(userId, domain, context);

    // Get previous metrics for regression detection
    const snapshots = await this.metricsRepository.getSnapshotHistory(userId, domain, { limit: 2 });
    const prevSnapshot = snapshots.length > 1 ? snapshots[1] : undefined;
    const previousMetrics = prevSnapshot?.metrics ?? null;

    const assessment = assessMetacognitiveStage(metrics, previousMetrics, domain);

    return {
      data: assessment,
      agentHints: this.createStageHints(assessment),
    };
  }

  // ========================================================================
  // Phase 7 — PKG↔CKG Comparison
  // ========================================================================

  async compareWithCkg(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphComparison>> {
    this.requireAuth(context);
    this.logger.info({ userId, domain }, 'Comparing PKG with CKG');

    const [pkgSubgraph, ckgSubgraph] = await Promise.all([
      this.fetchDomainSubgraph(GraphType.PKG, domain, userId),
      this.fetchDomainSubgraph(GraphType.CKG, domain),
    ]);

    const comparison = buildGraphComparison(pkgSubgraph, ckgSubgraph);

    return {
      data: comparison,
      agentHints: this.createComparisonHints(comparison),
    };
  }

  // ========================================================================
  // CKG Mutation Pipeline (Phase 6)
  // ========================================================================

  async proposeMutation(
    proposal: IMutationProposal,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    this.requireAuth(context);

    // Validate proposal at service boundary
    const validated = this.validateInput(MutationProposalSchema, proposal, 'MutationProposal');

    // Derive proposerId from context: userId for admin users, agentId for agents.
    // The userId in the context represents whoever is authenticated — an agent
    // identity (agent_xxx) or a human admin (user_xxx). Both are valid proposers.
    const proposerId = (context.userId ?? 'agent_unknown') as ProposerId;

    const mutation = await this.mutationPipeline.proposeMutation(
      proposerId,
      validated.operations as unknown as CkgMutationOperation[],
      validated.rationale,
      validated.evidenceCount,
      validated.priority,
      context
    );

    this.logger.info(
      { mutationId: mutation.mutationId, state: mutation.state },
      'CKG mutation proposed'
    );

    return {
      data: mutation,
      agentHints: this.createMutationHints('proposed', mutation),
    };
  }

  async getMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    this.requireAuth(context);

    const mutation = await this.mutationPipeline.getMutation(mutationId);

    return {
      data: mutation,
      agentHints: this.createMutationHints('retrieved', mutation),
    };
  }

  async listMutations(
    filters: IMutationFilter,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation[]>> {
    this.requireAuth(context);

    // Validate filters at service boundary
    const validated = this.validateInput(MutationFilterSchema, filters, 'MutationFilter');

    const listFilters: {
      state?: MutationState;
      proposedBy?: ProposerId;
      createdAfter?: string;
      createdBefore?: string;
    } = {};
    if (validated.state !== undefined) listFilters.state = validated.state as MutationState;
    if (validated.proposedBy !== undefined)
      listFilters.proposedBy = validated.proposedBy as ProposerId;
    if (validated.createdAfter !== undefined) listFilters.createdAfter = validated.createdAfter;
    if (validated.createdBefore !== undefined) listFilters.createdBefore = validated.createdBefore;

    const mutations = await this.mutationPipeline.listMutations(listFilters);

    return {
      data: mutations,
      agentHints: this.createMutationListHints(mutations, validated),
    };
  }

  async cancelMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    this.requireAuth(context);

    const mutation = await this.mutationPipeline.cancelMutation(mutationId, context);

    this.logger.info({ mutationId, state: mutation.state }, 'CKG mutation cancelled');

    return {
      data: mutation,
      agentHints: this.createMutationHints('cancelled', mutation),
    };
  }

  async retryMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    this.requireAuth(context);

    const mutation = await this.mutationPipeline.retryMutation(mutationId, context);

    this.logger.info(
      { originalMutationId: mutationId, newMutationId: mutation.mutationId },
      'CKG mutation retried'
    );

    return {
      data: mutation,
      agentHints: this.createMutationHints('retried', mutation),
    };
  }

  async getMutationAuditLog(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationAuditEntry[]>> {
    this.requireAuth(context);

    const auditLog = await this.mutationPipeline.getAuditLog(mutationId);

    return {
      data: auditLog,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'get_mutation',
            description: 'View the current mutation state',
            priority: 'low',
            category: 'exploration',
          },
        ],
        relatedResources: [
          {
            type: 'CKGMutation',
            id: mutationId as string,
            label: `Mutation ${mutationId}`,
            relevance: 1.0,
          },
        ],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
        preferenceAlignment: [],
        reasoning: `Audit log contains ${String(auditLog.length)} entries for mutation ${mutationId}`,
      },
    };
  }

  async getMutationPipelineHealth(
    context: IExecutionContext
  ): Promise<IServiceResult<IPipelineHealthResult>> {
    this.requireAuth(context);
    this.logger.debug('Getting mutation pipeline health');

    const health = await this.mutationPipeline.getPipelineHealth();

    const totalCount =
      health.proposedCount +
      health.validatingCount +
      health.validatedCount +
      health.committedCount +
      health.rejectedCount;

    const result: IPipelineHealthResult = {
      proposedCount: health.proposedCount,
      validatingCount: health.validatingCount,
      validatedCount: health.validatedCount,
      committedCount: health.committedCount,
      rejectedCount: health.rejectedCount,
      stuckCount: health.stuckCount,
      totalCount,
    };

    const stuckWarning =
      health.stuckCount > 0
        ? [
            {
              factor: `${String(health.stuckCount)} mutations stuck in processing states`,
              severity: 'medium' as const,
              mitigation: 'Check pipeline logs — stuck mutations may need manual retry or cancellation',
            },
          ]
        : [];

    return {
      data: result,
      agentHints: {
        suggestedNextActions: [
          ...(health.stuckCount > 0
            ? [
                {
                  action: 'list_stuck_mutations',
                  description: 'List mutations in non-terminal processing states',
                  priority: 'high' as const,
                  category: 'investigation' as const,
                },
              ]
            : []),
          {
            action: 'list_mutations',
            description: 'List all mutations with state filter',
            priority: 'low' as const,
            category: 'exploration' as const,
          },
        ],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high' as const,
        validityPeriod: 'short' as const,
        contextNeeded: [],
        assumptions: [],
        riskFactors: stuckWarning,
        dependencies: [],
        estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
        preferenceAlignment: [],
        reasoning: `Pipeline has ${String(totalCount)} total mutations: ${String(health.proposedCount)} proposed, ${String(health.committedCount)} committed, ${String(health.rejectedCount)} rejected, ${String(health.stuckCount)} stuck.`,
      },
    };
  }

  // ========================================================================
  // PKG Operation Log
  // ========================================================================

  async getOperationLog(
    userId: UserId,
    filters: IOperationLogFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IPkgOperationLogEntry>>> {
    this.requireAuth(context);
    this.logger.debug({ userId, filters, pagination }, 'Getting PKG operation log');

    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // Dispatch to the most specific repository method based on filter type.
    // Precedence: nodeId → edgeId → operationType → since → default.
    let entries: IPkgOperationLogEntry[];
    let usedPagination = false;

    if (filters.nodeId != null) {
      entries = await this.operationLogRepository.getOperationsForNode(userId, filters.nodeId);
    } else if (filters.edgeId != null) {
      entries = await this.operationLogRepository.getOperationsForEdge(userId, filters.edgeId);
    } else if (filters.operationType != null) {
      const result = await this.operationLogRepository.getOperationsByType(
        userId,
        filters.operationType,
        limit,
        offset
      );
      entries = result.items;
      usedPagination = true;
    } else if (filters.since != null) {
      entries = await this.operationLogRepository.getOperationsSince(userId, filters.since);
    } else {
      const result = await this.operationLogRepository.getOperationHistory(userId, limit, offset);
      entries = result.items;
      usedPagination = true;
    }

    // For non-paginated repo methods, apply manual pagination
    let paginatedEntries: IPkgOperationLogEntry[];
    let total: number;
    let hasMore: boolean;

    if (usedPagination) {
      // The repository already paginated — use its results directly
      paginatedEntries = entries;
      // Approximate total (repo doesn't give us exact total for some queries)
      total = offset + entries.length + (entries.length === limit ? 1 : 0);
      hasMore = entries.length === limit;
    } else {
      // Manual pagination over the full list
      total = entries.length;
      paginatedEntries = entries.slice(offset, offset + limit);
      hasMore = offset + limit < total;
    }

    const paginatedResponse: IPaginatedResponse<IPkgOperationLogEntry> = {
      items: paginatedEntries,
      total,
      hasMore,
    };

    return {
      data: paginatedResponse,
      agentHints: this.createListHints('PKG operations', paginatedEntries.length, total),
    };
  }

  // ========================================================================
  // Private — Authorization
  // ========================================================================

  private requireAuth(context: IExecutionContext): void {
    if (!context.userId) {
      throw new ValidationError('Authentication required', {
        userId: ['Must be authenticated to access knowledge graph operations'],
      });
    }
  }

  // ========================================================================
  // Private — Validation
  // ========================================================================

  /**
   * Validate input against a Zod schema, throwing ValidationError on failure.
   * Follows the content-service safeParse + throw pattern.
   */
  private validateInput<T>(
    schema: {
      safeParse: (data: unknown) => {
        success: boolean;
        data?: T;
        error?: { flatten: () => { fieldErrors: Record<string, string[]> } };
      };
    },
    input: unknown,
    schemaName: string
  ): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      if (!result.error) {
        throw new ValidationError(`${schemaName} validation failed`, {});
      }
      const errors = result.error.flatten();
      throw new ValidationError(`${schemaName} validation failed`, errors.fieldErrors);
    }
    if (result.data === undefined) {
      throw new ValidationError(`${schemaName} validation returned no data`, {});
    }
    return result.data;
  }

  /**
   * Validate traversal depth against the maximum allowed.
   */
  private validateTraversalDepth(depth: number): void {
    if (depth > MAX_TRAVERSAL_DEPTH) {
      throw new ValidationError(
        `Traversal depth ${String(depth)} exceeds maximum allowed ${String(MAX_TRAVERSAL_DEPTH)}`,
        { maxDepth: [`Must be ≤ ${String(MAX_TRAVERSAL_DEPTH)}`] }
      );
    }
  }

  // ========================================================================
  // Private — Operation Log Helpers
  // ========================================================================

  /**
   * Compute changed fields with before/after values for a node update.
   */
  private computeNodeChangedFields(
    existing: IGraphNode,
    updates: IUpdateNodeInput
  ): readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[] {
    const changes: { field: string; before: unknown; after: unknown }[] = [];

    if (updates.label !== undefined && updates.label !== existing.label) {
      changes.push({ field: 'label', before: existing.label, after: updates.label });
    }
    if (updates.description !== undefined && updates.description !== existing.description) {
      changes.push({
        field: 'description',
        before: existing.description,
        after: updates.description,
      });
    }
    if (updates.domain !== undefined && updates.domain !== existing.domain) {
      changes.push({ field: 'domain', before: existing.domain, after: updates.domain });
    }
    if (updates.masteryLevel !== undefined && updates.masteryLevel !== existing.masteryLevel) {
      changes.push({
        field: 'masteryLevel',
        before: existing.masteryLevel,
        after: updates.masteryLevel,
      });
    }
    if (updates.properties !== undefined) {
      changes.push({ field: 'properties', before: existing.properties, after: updates.properties });
    }

    return changes;
  }

  /**
   * Compute changed fields with before/after values for an edge update.
   */
  private computeEdgeChangedFields(
    existing: IGraphEdge,
    updates: IUpdateEdgeInput
  ): readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[] {
    const changes: { field: string; before: unknown; after: unknown }[] = [];

    if (
      updates.weight !== undefined &&
      (updates.weight as number) !== (existing.weight as number)
    ) {
      changes.push({ field: 'weight', before: existing.weight, after: updates.weight });
    }
    if (updates.properties !== undefined) {
      changes.push({ field: 'properties', before: existing.properties, after: updates.properties });
    }

    return changes;
  }

  // ========================================================================
  // Private — Domain Subgraph Fetching (Phase 7)
  // ========================================================================

  /**
   * Fetch all nodes and intra-domain edges for a given graph type and domain.
   * Used by Phase 7 metrics and comparison operations.
   */
  private async fetchDomainSubgraph(
    graphType: GraphType,
    domain: string,
    userId?: UserId
  ): Promise<ISubgraph> {
    const filter: INodeFilter = {
      graphType,
      domain,
      ...(userId !== undefined && { userId: userId as string }),
      includeDeleted: false,
    };

    // Fetch all nodes in this domain — use a generous limit
    const nodes = await this.graphRepository.findNodes(filter, 10_000, 0);

    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Collect all node IDs for filtering edges
    const nodeIdSet = new Set<string>(nodes.map((n) => n.nodeId as string));

    // Get outbound edges for each node, filter to intra-domain
    const edgeArrays = await Promise.all(
      nodes.map((n) => this.graphRepository.getEdgesForNode(n.nodeId, 'outbound'))
    );

    const edges: IGraphEdge[] = [];
    for (const arr of edgeArrays) {
      for (const edge of arr) {
        // Only include edges where both endpoints are in our domain set
        if (nodeIdSet.has(edge.targetNodeId as string)) {
          edges.push(edge);
        }
      }
    }

    return { nodes, edges };
  }

  // ========================================================================
  // Private — Metrics Staleness
  // ========================================================================

  /**
   * Mark metrics as stale for a user+domain.
   * Non-blocking — failures are logged but do not propagate.
   */
  private async markMetricsStale(
    userId: UserId,
    domain: string,
    mutationType: string
  ): Promise<void> {
    try {
      await this.metricsStalenessRepository.markStale(userId, domain, mutationType);
    } catch (error) {
      this.logger.warn(
        { error, userId, domain, mutationType },
        'Failed to mark metrics as stale — continuing without it'
      );
    }
  }

  // ========================================================================
  // Private — Agent Hints
  // ========================================================================

  /**
   * Create agent hints for node operations.
   */
  private createNodeHints(action: string, node: IGraphNode): IAgentHints {
    const hints: IAgentHints = {
      suggestedNextActions: [],
      relatedResources: [
        {
          type: 'KGNode',
          id: node.nodeId as string,
          label: `${node.nodeType} — ${node.label}`,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.7, effort: 0.2, roi: 3.5 },
      preferenceAlignment: [],
      reasoning: `Node ${action} successfully in PKG`,
    };

    switch (action) {
      case 'created':
        hints.suggestedNextActions.push(
          {
            action: 'create_edges',
            description: `Connect "${node.label}" to related concepts via edges`,
            priority: 'high',
            category: 'exploration',
          },
          {
            action: 'create_cards',
            description: `Create flashcards for "${node.label}"`,
            priority: 'medium',
            category: 'learning',
          }
        );
        break;
      case 'retrieved':
        hints.suggestedNextActions.push(
          {
            action: 'get_subgraph',
            description: `Explore the neighborhood of "${node.label}"`,
            priority: 'medium',
            category: 'exploration',
          },
          {
            action: 'compare_with_ckg',
            description: `Compare your understanding against the canonical graph`,
            priority: 'low',
            category: 'optimization',
          }
        );
        break;
      case 'updated':
        hints.suggestedNextActions.push({
          action: 'verify_structure',
          description: `Verify edge consistency after updating "${node.label}"`,
          priority: 'medium',
          category: 'optimization',
        });
        break;
    }

    return hints;
  }

  /**
   * Create agent hints for edge creation.
   */
  private createEdgeHints(
    action: string,
    edge: IGraphEdge,
    sourceNode: IGraphNode,
    targetNode: IGraphNode
  ): IAgentHints {
    const hints: IAgentHints = {
      suggestedNextActions: [],
      relatedResources: [
        {
          type: 'KGEdge',
          id: edge.edgeId as string,
          label: `${edge.edgeType}: ${sourceNode.label} → ${targetNode.label}`,
          relevance: 1.0,
        },
        {
          type: 'KGNode',
          id: sourceNode.nodeId as string,
          label: sourceNode.label,
          relevance: 0.8,
        },
        {
          type: 'KGNode',
          id: targetNode.nodeId as string,
          label: targetNode.label,
          relevance: 0.8,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [
        `"${sourceNode.label}" genuinely ${edge.edgeType.replace(/_/g, ' ')}s "${targetNode.label}"`,
      ],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.1, roi: 6.0 },
      preferenceAlignment: [],
      reasoning: `Edge ${action} — ${edge.edgeType} from "${sourceNode.label}" to "${targetNode.label}"`,
    };

    if (action === 'created') {
      hints.suggestedNextActions.push(
        {
          action: 'get_subgraph',
          description: `Explore the updated neighborhood around "${sourceNode.label}"`,
          priority: 'medium',
          category: 'exploration',
        },
        {
          action: 'detect_misconceptions',
          description: `Check if this edge reveals any structural misconceptions`,
          priority: 'low',
          category: 'optimization',
        }
      );
    }

    return hints;
  }

  /**
   * Create agent hints for edge retrieval/update.
   */
  private createEdgeRetrievalHints(edge: IGraphEdge): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action: 'get_subgraph',
          description: 'Explore the source node neighborhood',
          priority: 'medium',
          category: 'exploration',
        },
      ],
      relatedResources: [
        {
          type: 'KGEdge',
          id: edge.edgeId as string,
          label: `${edge.edgeType}: ${edge.sourceNodeId as string} → ${edge.targetNodeId as string}`,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
      preferenceAlignment: [],
      reasoning: `Edge retrieved: ${edge.edgeType}`,
    };
  }

  /**
   * Create agent hints for delete operations.
   */
  private createDeleteHints(entityType: string, entityId: string, domain: string): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action: 'verify_structure',
          description: `Verify graph integrity in domain "${domain}" after deletion`,
          priority: 'high',
          category: 'optimization',
        },
      ],
      relatedResources: [],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [
        {
          type: 'accuracy',
          severity: 'low',
          description: `Deleted ${entityType} ${entityId} — may leave orphaned references`,
          probability: 0.3,
          impact: 0.4,
          mitigation: 'Run structural integrity check',
        },
      ],
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `${entityType} deleted from PKG`,
    };
  }

  /**
   * Create agent hints for list operations.
   */
  private createListHints(entityType: string, count: number, total: number): IAgentHints {
    return {
      suggestedNextActions:
        count < total
          ? [
              {
                action: 'paginate',
                description: `${String(total - count)} more ${entityType} available — adjust offset to see more`,
                priority: 'low',
                category: 'exploration',
              },
            ]
          : [],
      relatedResources: [],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
      preferenceAlignment: [],
      reasoning: `Listed ${String(count)} of ${String(total)} ${entityType}`,
    };
  }

  /**
   * Create agent hints for subgraph retrieval.
   */
  private createSubgraphHints(subgraph: ISubgraph, rootNode: IGraphNode): IAgentHints {
    const nodeCount = subgraph.nodes.length;
    const edgeCount = subgraph.edges.length;
    const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;

    const hints: IAgentHints = {
      suggestedNextActions: [],
      relatedResources: [
        {
          type: 'KGNode',
          id: rootNode.nodeId as string,
          label: `Root: ${rootNode.label}`,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `Subgraph from "${rootNode.label}": ${String(nodeCount)} nodes, ${String(edgeCount)} edges, density ${density.toFixed(2)}`,
    };

    if (density < 0.1 && nodeCount > 3) {
      hints.suggestedNextActions.push({
        action: 'create_edges',
        description: 'Subgraph is sparsely connected — consider adding relationships',
        priority: 'medium',
        category: 'optimization',
      });
    }

    if (nodeCount === 1) {
      hints.suggestedNextActions.push({
        action: 'create_nodes',
        description: `"${rootNode.label}" is isolated — add related concepts`,
        priority: 'high',
        category: 'exploration',
      });
    }

    return hints;
  }

  /**
   * Create agent hints for traversal results (ancestors/descendants).
   */
  private createTraversalHints(
    direction: string,
    results: IGraphNode[],
    originNode: IGraphNode
  ): IAgentHints {
    return {
      suggestedNextActions:
        results.length === 0
          ? [
              {
                action: 'create_edges',
                description: `No ${direction} found for "${originNode.label}" — consider adding structural edges`,
                priority: 'high',
                category: 'exploration',
              },
            ]
          : [
              {
                action: 'get_subgraph',
                description: `Explore the full neighborhood around "${originNode.label}"`,
                priority: 'medium',
                category: 'exploration',
              },
            ],
      relatedResources: results.map((node) => ({
        type: 'KGNode' as const,
        id: node.nodeId as string,
        label: node.label,
        relevance: 0.7,
      })),
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.4, effort: 0.1, roi: 4.0 },
      preferenceAlignment: [],
      reasoning: `Found ${String(results.length)} ${direction} of "${originNode.label}"`,
    };
  }

  /**
   * Create agent hints for path finding.
   */
  private createPathHints(
    path: IGraphNode[],
    fromNode: IGraphNode,
    toNode: IGraphNode
  ): IAgentHints {
    const pathExists = path.length > 0;

    return {
      suggestedNextActions: pathExists
        ? [
            {
              action: 'analyze_path',
              description: `Path has ${String(path.length)} nodes — review intermediate concepts`,
              priority: 'medium',
              category: 'exploration',
            },
          ]
        : [
            {
              action: 'create_edges',
              description: `No path from "${fromNode.label}" to "${toNode.label}" — consider adding connecting edges`,
              priority: 'high',
              category: 'optimization',
            },
          ],
      relatedResources: path.map((node) => ({
        type: 'KGNode' as const,
        id: node.nodeId as string,
        label: node.label,
        relevance: 0.8,
      })),
      confidence: pathExists ? 1.0 : 0.5,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: pathExists
        ? [`Path represents shortest connection between the two concepts`]
        : [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: {
        benefit: pathExists ? 0.5 : 0.3,
        effort: 0.1,
        roi: pathExists ? 5.0 : 3.0,
      },
      preferenceAlignment: [],
      reasoning: pathExists
        ? `Shortest path: "${fromNode.label}" → ${String(path.length - 2)} intermediates → "${toNode.label}"`
        : `No path exists between "${fromNode.label}" and "${toNode.label}"`,
    };
  }

  /**
   * Create agent hints for siblings query results.
   */
  private createSiblingsHints(result: ISiblingsResult): IAgentHints {
    const groupCount = result.groups.length;
    const largestGroup = result.groups.reduce(
      (max, g) => Math.max(max, g.totalInGroup),
      0
    );

    const actions: IAgentHints['suggestedNextActions'] = [];

    if (result.totalSiblingCount === 0) {
      actions.push({
        action: 'create_edges',
        description: `No siblings found for "${result.originNode.label}" via ${result.edgeType} — consider adding structural edges`,
        priority: 'high',
        category: 'exploration',
      });
    } else {
      actions.push({
        action: 'get_neighborhood',
        description: `Explore the full neighborhood around "${result.originNode.label}"`,
        priority: 'medium',
        category: 'exploration',
      });

      if (largestGroup > 10 && (result.edgeType === 'is_a' || result.edgeType === 'part_of')) {
        actions.push({
          action: 'review_sce',
          description: `Large sibling group (${String(largestGroup)} nodes) may indicate high sibling confusion entropy — review discrimination`,
          priority: 'medium',
          category: 'optimization',
        });
      }
    }

    return {
      suggestedNextActions: actions,
      relatedResources: result.groups.flatMap((g) =>
        g.siblings.slice(0, 3).map((node) => ({
          type: 'KGNode' as const,
          id: node.nodeId as string,
          label: node.label,
          relevance: 0.7,
        }))
      ),
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `Found ${String(result.totalSiblingCount)} sibling(s) across ${String(groupCount)} parent group(s) for "${result.originNode.label}" via ${result.edgeType}. Largest group: ${String(largestGroup)}.`,
    };
  }

  /**
   * Create agent hints for co-parents query results.
   */
  private createCoParentsHints(result: ICoParentsResult): IAgentHints {
    const groupCount = result.groups.length;
    const largestGroup = result.groups.reduce(
      (max, g) => Math.max(max, g.totalInGroup),
      0
    );

    const actions: IAgentHints['suggestedNextActions'] = [];

    if (result.totalCoParentCount === 0) {
      actions.push({
        action: 'create_edges',
        description: `No co-parents found for "${result.originNode.label}" via ${result.edgeType} — consider adding structural edges`,
        priority: 'high',
        category: 'exploration',
      });
    } else {
      actions.push({
        action: 'get_siblings',
        description: `Complement with a siblings query to see the full structural picture`,
        priority: 'medium',
        category: 'exploration',
      });

      if (largestGroup > 5) {
        actions.push({
          action: 'review_scope_overlap',
          description: `High co-parenting (${String(largestGroup)} co-parents for a single child) — potential scope overlap or redundancy`,
          priority: 'medium',
          category: 'optimization',
        });
      }
    }

    return {
      suggestedNextActions: actions,
      relatedResources: result.groups.flatMap((g) =>
        g.coParents.slice(0, 3).map((node) => ({
          type: 'KGNode' as const,
          id: node.nodeId as string,
          label: node.label,
          relevance: 0.7,
        }))
      ),
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `Found ${String(result.totalCoParentCount)} co-parent(s) across ${String(groupCount)} shared child group(s) for "${result.originNode.label}" via ${result.edgeType}. Largest group: ${String(largestGroup)}.`,
    };
  }

  /**
   * Create agent hints for neighborhood query results.
   */
  private createNeighborhoodHints(result: INeighborhoodResult): IAgentHints {
    const groupCount = result.groups.length;
    const edgeTypeDiversity = groupCount;

    // Find dominant edge type (most neighbors)
    const dominantGroup = result.groups.reduce<{ edgeType: string; total: number } | undefined>(
      (best, g) => {
        if (best === undefined || g.totalInGroup > best.total) {
          return { edgeType: g.edgeType, total: g.totalInGroup };
        }
        return best;
      },
      undefined
    );

    const actions: IAgentHints['suggestedNextActions'] = [];

    if (result.totalNeighborCount === 0) {
      actions.push({
        action: 'create_edges',
        description: `"${result.originNode.label}" is isolated — add relationships to build its neighborhood`,
        priority: 'high',
        category: 'exploration',
      });
    } else {
      if (edgeTypeDiversity >= 3) {
        actions.push({
          action: 'analyze_edge_distribution',
          description: `High edge-type diversity (${String(edgeTypeDiversity)} types) — node is a structural hub`,
          priority: 'medium',
          category: 'exploration',
        });
      }

      actions.push({
        action: 'get_subgraph',
        description: `Get the full subgraph for visualization around "${result.originNode.label}"`,
        priority: 'medium',
        category: 'exploration',
      });
    }

    return {
      suggestedNextActions: actions,
      relatedResources: result.groups.flatMap((g) =>
        g.neighbors.slice(0, 3).map((node) => ({
          type: 'KGNode' as const,
          id: node.nodeId as string,
          label: node.label,
          relevance: 0.7,
        }))
      ),
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.1, roi: 6.0 },
      preferenceAlignment: [],
      reasoning: `Neighborhood of "${result.originNode.label}": ${String(result.totalNeighborCount)} neighbor(s) across ${String(groupCount)} edge-type group(s).${dominantGroup !== undefined ? ` Dominant: ${dominantGroup.edgeType} (${String(dominantGroup.total)}).` : ''}`,
    };
  }

  /**
   * Create agent hints for CKG node retrieval.
   */
  private createCkgNodeHints(node: IGraphNode): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action: 'compare_with_pkg',
          description: `Compare this canonical node with your personal understanding`,
          priority: 'medium',
          category: 'optimization',
        },
        {
          action: 'get_ckg_subgraph',
          description: `Explore the canonical neighborhood of "${node.label}"`,
          priority: 'medium',
          category: 'exploration',
        },
      ],
      relatedResources: [
        {
          type: 'CKGNode',
          id: node.nodeId as string,
          label: `CKG: ${node.label}`,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'long',
      contextNeeded: [],
      assumptions: ['CKG represents expert-curated canonical knowledge'],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `CKG node "${node.label}" (${node.nodeType}) in domain "${node.domain}"`,
    };
  }

  // ========================================================================
  // Private — CKG Mutation Agent Hints
  // ========================================================================

  /**
   * Create agent hints for a CKG mutation operation.
   */
  private createMutationHints(action: string, mutation: ICkgMutation): IAgentHints {
    const isTerminal = mutation.state === 'committed' || mutation.state === 'rejected';

    const nextActions: IAgentHints['suggestedNextActions'] = [];

    if (action === 'proposed') {
      nextActions.push({
        action: 'get_mutation',
        description: 'Check the mutation status — it is processing asynchronously',
        priority: 'medium',
        category: 'exploration',
      });
    }

    if (mutation.state === 'rejected') {
      nextActions.push({
        action: 'retry_mutation',
        description: 'Retry this mutation if the rejection reason is resolvable',
        priority: 'medium',
        category: 'exploration',
      });
      nextActions.push({
        action: 'get_mutation_audit_log',
        description: 'Review the audit trail to understand why it was rejected',
        priority: 'high',
        category: 'exploration',
      });
    }

    if (!isTerminal && mutation.state !== 'proposed') {
      nextActions.push({
        action: 'cancel_mutation',
        description: 'Cancel this mutation if it should not proceed',
        priority: 'low',
        category: 'exploration',
      });
    }

    return {
      suggestedNextActions: nextActions,
      relatedResources: [
        {
          type: 'CKGMutation',
          id: mutation.mutationId as string,
          label: `Mutation ${mutation.mutationId} (${mutation.state})`,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: isTerminal ? [] : ['Mutation is processing asynchronously — state may change'],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3.0 },
      preferenceAlignment: [],
      reasoning: `CKG mutation ${action}: ${mutation.mutationId} is in state "${mutation.state}"`,
    };
  }

  /**
   * Create agent hints for a list of CKG mutations.
   */
  private createMutationListHints(
    mutations: ICkgMutation[],
    _filters: IMutationFilter
  ): IAgentHints {
    const stateCounts = new Map<string, number>();
    for (const m of mutations) {
      stateCounts.set(m.state, (stateCounts.get(m.state) ?? 0) + 1);
    }

    const stateBreakdown = [...stateCounts.entries()]
      .map(([state, count]) => `${state}: ${String(count)}`)
      .join(', ');

    return {
      suggestedNextActions: [
        {
          action: 'propose_mutation',
          description: 'Create a new CKG mutation proposal',
          priority: 'low',
          category: 'exploration',
        },
      ],
      relatedResources: mutations.slice(0, 5).map((m) => ({
        type: 'CKGMutation' as const,
        id: m.mutationId as string,
        label: `Mutation ${m.mutationId} (${m.state})`,
        relevance: 0.8,
      })),
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
      preferenceAlignment: [],
      reasoning: `Found ${String(mutations.length)} mutation(s): ${stateBreakdown}`,
    };
  }

  // ========================================================================
  // Private — Phase 7 Helpers
  // ========================================================================

  /**
   * Significant-change threshold for metric event publishing (Phase 7 spec).
   * An event is published only when *any* metric changes by more than this
   * absolute delta, or when there is no previous snapshot (first computation).
   */
  private static readonly SIGNIFICANT_CHANGE_THRESHOLD = 0.05;

  /**
   * Determines whether any metric changed significantly compared to a
   * previous snapshot. Returns true when there is no previous data (always
   * publish on first computation) or when any metric's absolute delta
   * exceeds `SIGNIFICANT_CHANGE_THRESHOLD`.
   */
  private detectSignificantMetricChange(
    current: IStructuralMetrics,
    previous: IStructuralMetrics | null
  ): boolean {
    if (!previous) return true; // first computation — always significant

    const fields: readonly (keyof IStructuralMetrics)[] = [
      'abstractionDrift',
      'depthCalibrationGradient',
      'scopeLeakageIndex',
      'siblingConfusionEntropy',
      'upwardLinkStrength',
      'traversalBreadthScore',
      'strategyDepthFit',
      'structuralStrategyEntropy',
      'structuralAttributionAccuracy',
      'structuralStabilityGain',
      'boundarySensitivityImprovement',
    ];

    return fields.some(
      (f) => Math.abs(current[f] - previous[f]) > KnowledgeGraphService.SIGNIFICANT_CHANGE_THRESHOLD
    );
  }

  // ========================================================================
  // Private — Phase 7 Agent Hints
  // ========================================================================

  /**
   * Create agent hints for structural metrics results.
   */
  private createMetricsHints(metrics: IStructuralMetrics, domain: string): IAgentHints {
    const warningMetrics: string[] = [];
    if (metrics.abstractionDrift > 0.6) warningMetrics.push('abstractionDrift');
    if (metrics.scopeLeakageIndex > 0.5) warningMetrics.push('scopeLeakageIndex');
    if (metrics.siblingConfusionEntropy > 0.6) warningMetrics.push('siblingConfusionEntropy');
    if (metrics.structuralAttributionAccuracy < 0.4)
      warningMetrics.push('structuralAttributionAccuracy');

    const actions: IAgentHints['suggestedNextActions'] = [
      {
        action: 'get_structural_health',
        description: 'Get full health report with trends',
        priority: 'medium',
        category: 'exploration',
      },
      {
        action: 'get_metacognitive_stage',
        description: 'Assess metacognitive development stage',
        priority: 'medium',
        category: 'exploration',
      },
    ];
    if (warningMetrics.length > 0) {
      actions.push({
        action: 'detect_misconceptions',
        description: `Run misconception detection — warning metrics: ${warningMetrics.join(', ')}`,
        priority: 'high',
        category: 'correction',
      });
    }

    const risks: IAgentHints['riskFactors'] =
      warningMetrics.length > 0
        ? [
            {
              type: 'accuracy',
              severity: 'medium',
              description: `${String(warningMetrics.length)} metric(s) in warning range`,
              probability: 0.7,
              impact: 0.5,
            },
          ]
        : [];

    return {
      suggestedNextActions: actions,
      relatedResources: [],
      confidence: 0.95,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: ['Metrics computed from current graph state'],
      riskFactors: risks,
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.1, roi: 6.0 },
      preferenceAlignment: [],
      reasoning: `Computed 11 structural metrics for domain "${domain}". ${warningMetrics.length > 0 ? `Warning metrics: ${warningMetrics.join(', ')}` : 'All metrics within healthy range.'}`,
    };
  }

  /**
   * Create agent hints for graph comparison results.
   */
  private createComparisonHints(comparison: IGraphComparison): IAgentHints {
    const risks: IAgentHints['riskFactors'] =
      comparison.structuralDivergences.length > 0
        ? [
            {
              type: 'accuracy',
              severity: 'medium',
              description: `${String(comparison.structuralDivergences.length)} divergence(s) found between PKG and CKG`,
              probability: 0.8,
              impact: 0.4,
            },
          ]
        : [];

    return {
      suggestedNextActions: [
        {
          action: 'compute_metrics',
          description: 'Compute structural metrics from this comparison',
          priority: 'medium',
          category: 'exploration',
        },
      ],
      relatedResources: [],
      confidence: 0.9,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: ['Comparison computed from current graph state'],
      riskFactors: risks,
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `Comparison: ${String(comparison.nodeAlignment.size)} aligned nodes, ${String(comparison.unmatchedPkgNodes.length)} PKG-only, ${String(comparison.unmatchedCkgNodes.length)} CKG-only, ${String(comparison.structuralDivergences.length)} divergences.`,
    };
  }

  /**
   * Create agent hints for misconception detection results.
   */
  private createMisconceptionHints(detections: IMisconceptionDetection[]): IAgentHints {
    const highConfidence = detections.filter((d) => (d.confidence as number) >= 0.7);

    const actions: IAgentHints['suggestedNextActions'] = [];
    if (highConfidence.length > 0) {
      actions.push({
        action: 'review_misconceptions',
        description: `Review ${String(highConfidence.length)} high-confidence misconception(s)`,
        priority: 'high',
        category: 'correction',
      });
    }
    actions.push({
      action: 'get_structural_health',
      description: 'Check overall structural health',
      priority: 'medium',
      category: 'exploration',
    });

    const risks: IAgentHints['riskFactors'] =
      highConfidence.length > 0
        ? [
            {
              type: 'accuracy',
              severity: 'high',
              description: `${String(highConfidence.length)} high-confidence misconception(s) requiring attention`,
              probability: 0.9,
              impact: 0.7,
            },
          ]
        : [];

    return {
      suggestedNextActions: actions,
      relatedResources: detections.slice(0, 5).map((d) => ({
        type: 'Misconception' as const,
        id: d.patternId as string,
        label: `${d.misconceptionType} (confidence: ${(d.confidence as number).toFixed(2)})`,
        relevance: d.confidence as number,
      })),
      confidence: 0.85,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: ['Detection run against current graph state'],
      riskFactors: risks,
      dependencies: [],
      estimatedImpact: { benefit: 0.7, effort: 0.3, roi: 2.3 },
      preferenceAlignment: [],
      reasoning: `Detected ${String(detections.length)} misconception(s): ${String(highConfidence.length)} high-confidence, ${String(detections.length - highConfidence.length)} low-confidence.`,
    };
  }

  /**
   * Create agent hints for structural health report.
   */
  private createHealthHints(report: IStructuralHealthReport): IAgentHints {
    const status =
      report.overallScore >= 0.7 ? 'healthy' : report.overallScore >= 0.4 ? 'warning' : 'critical';

    const actions: IAgentHints['suggestedNextActions'] = [
      {
        action: 'get_metacognitive_stage',
        description: 'Check metacognitive development stage',
        priority: 'medium',
        category: 'exploration',
      },
    ];
    if (status !== 'healthy') {
      actions.push({
        action: 'detect_misconceptions',
        description: 'Run misconception detection for unhealthy graph',
        priority: 'high',
        category: 'correction',
      });
    }

    const risks: IAgentHints['riskFactors'] =
      status === 'critical'
        ? [
            {
              type: 'accuracy',
              severity: 'critical',
              description: 'Graph health is critical — intervention recommended',
              probability: 0.9,
              impact: 0.9,
            },
          ]
        : [];

    return {
      suggestedNextActions: actions,
      relatedResources: [],
      confidence: 0.9,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: ['Health report computed from latest metrics'],
      riskFactors: risks,
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `Structural health: ${status} (score: ${report.overallScore.toFixed(2)}). Domain: ${report.domain}.`,
    };
  }

  /**
   * Create agent hints for metacognitive stage assessment.
   */
  private createStageHints(assessment: IMetacognitiveStageAssessment): IAgentHints {
    const actions: IAgentHints['suggestedNextActions'] = [
      {
        action: 'get_structural_health',
        description: 'Get full structural health report',
        priority: 'medium',
        category: 'exploration',
      },
    ];
    if (assessment.nextStageGaps.length > 0) {
      actions.push({
        action: 'address_stage_gaps',
        description: `Address ${String(assessment.nextStageGaps.length)} gap(s) to reach next stage`,
        priority: 'medium',
        category: 'optimization',
      });
    }

    const risks: IAgentHints['riskFactors'] = assessment.regressionDetected
      ? [
          {
            type: 'accuracy',
            severity: 'high',
            description: 'Stage regression detected — review recent changes',
            probability: 0.8,
            impact: 0.6,
          },
        ]
      : [];

    return {
      suggestedNextActions: actions,
      relatedResources: [],
      confidence: 0.85,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: ['Stage assessment from latest metrics'],
      riskFactors: risks,
      dependencies: [],
      estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
      preferenceAlignment: [],
      reasoning: `Metacognitive stage: ${assessment.currentStage}. ${assessment.regressionDetected ? 'Regression detected. ' : ''}${String(assessment.nextStageGaps.length)} gap(s) to next stage.`,
    };
  }
}
