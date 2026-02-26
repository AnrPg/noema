/**
 * @noema/knowledge-graph-service - KnowledgeGraphService Implementation
 *
 * Phase 5: PKG Operations & Service Layer Foundation.
 * Phase 6: CKG Mutation Pipeline (typestate-governed, async validation).
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
 * - Phase 7 methods (metrics, misconception, comparison) throw NotImplementedError
 *
 * @see ADR-0010 for edge policy architecture
 * @see ADR-005 for CKG mutation pipeline design
 * @see PHASE-5-PKG-OPERATIONS.md for requirements
 * @see PHASE-6-CKG-MUTATION-PIPELINE.md for CKG mutation requirements
 */

import type { IAgentHints } from '@noema/contracts';
import { KnowledgeGraphEventType } from '@noema/events';
import type {
  AgentId,
  EdgeId,
  IGraphEdge,
  IGraphNode,
  IMisconceptionDetection,
  IPaginatedResponse,
  IStructuralMetrics,
  ISubgraph,
  MutationId,
  MutationState,
  NodeId,
  UserId,
} from '@noema/types';
import { EdgeWeight, GraphType } from '@noema/types';
import type { Logger } from 'pino';

import type { IEventPublisher } from '../shared/event-publisher.js';
import type { CkgMutationOperation, IMutationFilter, IMutationProposal } from './ckg-mutation-dsl.js';
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
import type { IKnowledgeGraphService } from './knowledge-graph.service.js';
import type { IMetricsStalenessRepository } from './metrics-staleness.repository.js';
import type { IMetricsHistoryOptions } from './metrics.repository.js';
import type { ICkgMutation, IMutationAuditEntry } from './mutation.repository.js';
import type { IPkgOperationLogRepository } from './pkg-operation-log.repository.js';
import { getEdgePolicy } from './policies/edge-type-policies.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type {
  INodeFilter,
  ITraversalOptions,
  IValidationOptions,
} from './value-objects/graph.value-objects.js';
import type {
  IPkgEdgeCreatedOp,
  IPkgEdgeDeletedOp,
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

  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    private readonly metricsStalenessRepository: IMetricsStalenessRepository,
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
    this.logger.info({ userId, nodeType: input.nodeType, domain: input.domain }, 'Creating PKG node');

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

    this.logger.info(
      { nodeId, changedFieldCount: changedFields.length },
      'PKG node updated'
    );

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
      ...validated as ICreateEdgeInput,
      weight: input.weight ?? EdgeWeight.create(policy.defaultWeight),
    };

    // Create edge in Neo4j
    const edge = await this.graphRepository.createEdge(GraphType.PKG, edgeInput, userId);

    // Log operation
    const operation: IPkgEdgeCreatedOp = {
      operationType: PkgOperationType.EDGE_CREATED,
      sequenceNumber: 0,
      timestamp: new Date().toISOString(),
      edgeId: edge.edgeId,
      edgeType: edge.edgeType,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      weight: edge.weight,
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

    this.logger.info(
      { edgeId: edge.edgeId, edgeType: edge.edgeType },
      'PKG edge created'
    );

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

    this.logger.info(
      { edgeId, changedFieldCount: changedFields.length },
      'PKG edge updated'
    );

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

    this.logger.info(
      { edgeId, edgeType: existingEdge.edgeType },
      'PKG edge deleted'
    );

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
    const _limit = Math.min(pagination.limit, MAX_PAGE_SIZE);

    const edges = await this.graphRepository.findEdges(scopedFilter);

    // Apply manual pagination since findEdges doesn't support it natively
    const offset = Math.max(pagination.offset, 0);
    const paginatedEdges = edges.slice(offset, offset + _limit);

    const result: IPaginatedResponse<IGraphEdge> = {
      items: paginatedEdges,
      total: edges.length,
      hasMore: offset + paginatedEdges.length < edges.length,
    };

    return {
      data: result,
      agentHints: this.createListHints('edges', paginatedEdges.length, edges.length),
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
    this.logger.debug({ userId, rootNodeId, maxDepth: traversalOptions.maxDepth }, 'Getting PKG subgraph');

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

    // Verify root exists in CKG
    const rootNode = await this.graphRepository.getNode(rootNodeId);
    if (rootNode?.graphType !== GraphType.CKG) {
      throw new NodeNotFoundError(rootNodeId, GraphType.CKG);
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

  // ========================================================================
  // Phase 7 Stubs — Structural Metrics
  // ========================================================================

  computeMetrics(
    _userId: UserId,
    _domain: string,
    _context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    throw new Error('Not implemented: computeMetrics is Phase 7');
  }

  getMetrics(
    _userId: UserId,
    _domain: string,
    _context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    throw new Error('Not implemented: getMetrics is Phase 7');
  }

  getMetricsHistory(
    _userId: UserId,
    _domain: string,
    _options: IMetricsHistoryOptions,
    _context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics[]>> {
    throw new Error('Not implemented: getMetricsHistory is Phase 7');
  }

  // ========================================================================
  // Phase 7 Stubs — Misconception Detection
  // ========================================================================

  detectMisconceptions(
    _userId: UserId,
    _domain: string,
    _context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    throw new Error('Not implemented: detectMisconceptions is Phase 7');
  }

  getMisconceptions(
    _userId: UserId,
    _domain: string | undefined,
    _context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    throw new Error('Not implemented: getMisconceptions is Phase 7');
  }

  updateMisconceptionStatus(
    _detectionId: string,
    _status: string,
    _context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    throw new Error('Not implemented: updateMisconceptionStatus is Phase 7');
  }

  // ========================================================================
  // Phase 7 Stub — PKG↔CKG Comparison
  // ========================================================================

  compareWithCkg(
    _userId: UserId,
    _domain: string,
    _context: IExecutionContext
  ): Promise<IServiceResult<IGraphComparison>> {
    throw new Error('Not implemented: compareWithCkg is Phase 7');
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
    const validated = this.validateInput(
      MutationProposalSchema,
      proposal,
      'MutationProposal'
    );

    // Infer agentId from context (userId acts as proposer at the service level)
    const agentId = (context.userId ?? 'agent_unknown') as AgentId;

    const mutation = await this.mutationPipeline.proposeMutation(
      agentId,
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
    const validated = this.validateInput(
      MutationFilterSchema,
      filters,
      'MutationFilter'
    );

    const listFilters: { state?: MutationState; proposedBy?: AgentId } = {};
    if (validated.state !== undefined) listFilters.state = validated.state as MutationState;
    if (validated.proposedBy !== undefined) listFilters.proposedBy = validated.proposedBy as AgentId;

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
    schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { flatten: () => { fieldErrors: Record<string, string[]> } } } },
    input: unknown,
    schemaName: string
  ): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      if (!result.error) {
        throw new ValidationError(`${schemaName} validation failed`, {});
      }
      const errors = result.error.flatten();
      throw new ValidationError(
        `${schemaName} validation failed`,
        errors.fieldErrors
      );
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
      changes.push({ field: 'description', before: existing.description, after: updates.description });
    }
    if (updates.domain !== undefined && updates.domain !== existing.domain) {
      changes.push({ field: 'domain', before: existing.domain, after: updates.domain });
    }
    if (updates.masteryLevel !== undefined && updates.masteryLevel !== existing.masteryLevel) {
      changes.push({ field: 'masteryLevel', before: existing.masteryLevel, after: updates.masteryLevel });
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

    if (updates.weight !== undefined && (updates.weight as number) !== (existing.weight as number)) {
      changes.push({ field: 'weight', before: existing.weight, after: updates.weight });
    }
    if (updates.properties !== undefined) {
      changes.push({ field: 'properties', before: existing.properties, after: updates.properties });
    }

    return changes;
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
      assumptions: isTerminal
        ? []
        : ['Mutation is processing asynchronously — state may change'],
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
}
