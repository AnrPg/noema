/**
 * @noema/knowledge-graph-service — PKG Write Service
 *
 * Handles all Personal Knowledge Graph (PKG) node and edge CRUD operations.
 * Extracted from KnowledgeGraphService as part of Fix 4.3 (God-object decomposition).
 *
 * Responsibilities:
 * - Node CRUD: create, get, update, delete, list
 * - Edge CRUD: create, get, update, delete, list
 * - Operation log writing (resilient)
 * - Event publishing (resilient)
 * - Metrics staleness tracking (resilient)
 * - Edge policy enforcement
 */

import { KnowledgeGraphEventType } from '@noema/events';
import type { IAgentHints, IWarning } from '@noema/contracts';
import type {
  EdgeId,
  IGraphEdge,
  IGraphNode,
  IPaginatedResponse,
  NodeId,
  StudyMode,
  UserId,
} from '@noema/types';
import { EdgeWeight, GraphType } from '@noema/types';
import type { Logger } from 'pino';

import type { IEventPublisher } from '../shared/event-publisher.js';
import type { AgentHintsFactory } from './agent-hints.factory.js';
import { UnauthorizedError, ValidationError } from './errors/base.errors.js';
import {
  CyclicEdgeError,
  EdgeNotFoundError,
  GraphConsistencyError,
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
import type { IMetricsStalenessRepository } from './metrics-staleness.repository.js';
import { KG_COUNTERS, kgCounters } from './observability.js';
import type { IPkgPostWriteRecoveryService } from './post-write-recovery.service.js';
import { PkgAdvisoryService, serializeWarningsForEvent } from './pkg-advisories.js';
import type { IPkgOperationLogRepository } from './pkg-operation-log.repository.js';
import { getEdgePolicy } from './policies/edge-type-policies.js';
import {
  computeEdgeChangedFields,
  computeNodeChangedFields,
  MAX_PAGE_SIZE,
  requireAuth,
  validateInput,
} from './service-helpers.js';
import type { INodeFilter, IValidationOptions } from './value-objects/graph.value-objects.js';
import type {
  IPkgEdgeCreatedOp,
  IPkgEdgeDeletedOp,
  IPkgEdgeUpdatedOp,
  IPkgNodeCreatedOp,
  IPkgNodeDeletedOp,
  IPkgNodeUpdatedOp,
} from './value-objects/operation-log.js';
import { PkgOperationType } from './value-objects/operation-log.js';

function masteryPropertyKey(studyMode: StudyMode): string {
  return `studyModeMastery_${studyMode}`;
}

function masterySourcePropertyKey(studyMode: StudyMode): string {
  return `studyModeMasterySource_${studyMode}`;
}

function masteryUpdatedAtPropertyKey(studyMode: StudyMode): string {
  return `studyModeMasteryUpdatedAt_${studyMode}`;
}

function resolveMasteryWriteMode(
  explicitStudyMode: StudyMode | undefined,
  supportedStudyModes: readonly StudyMode[] | undefined
): StudyMode | undefined {
  if (explicitStudyMode !== undefined) {
    return explicitStudyMode;
  }
  return supportedStudyModes?.length === 1 ? supportedStudyModes[0] : undefined;
}

/**
 * PKG write operations sub-service.
 *
 * Encapsulates all PKG node/edge CRUD with resilient post-write
 * operations (log, publish, mark stale) that do not propagate failures.
 */
export class PkgWriteService {
  private readonly advisoryService: PkgAdvisoryService;

  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    private readonly metricsStalenessRepository: IMetricsStalenessRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly postWriteRecoveryService: IPkgPostWriteRecoveryService,
    private readonly hintsFactory: AgentHintsFactory,
    private readonly logger: Logger
  ) {
    this.advisoryService = new PkgAdvisoryService(graphRepository, logger);
  }

  // ========================================================================
  // PKG Node Operations
  // ========================================================================

  async createNode(
    userId: UserId,
    input: ICreateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    requireAuth(context);
    this.logger.info(
      { userId, nodeType: input.nodeType, domain: input.domain },
      'Creating PKG node'
    );

    // Validate input
    const validated = validateInput(CreateNodeInputSchema, input, 'CreateNodeInput');

    // Create node in Neo4j
    const node = await this.graphRepository.createNode(
      GraphType.PKG,
      validated as ICreateNodeInput,
      userId
    );

    // Post-write operations: log, publish, mark stale (parallel, resilient)
    const operation: IPkgNodeCreatedOp = {
      operationType: PkgOperationType.NODE_CREATED,
      sequenceNumber: 0, // Repository assigns the actual sequence number
      timestamp: new Date().toISOString(),
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      label: node.label,
      domain: node.domain,
    };
    const advisoryWarnings = await this.safeComputeAdvisories(
      { entityType: 'node', operation: 'create', entityId: node.nodeId as string },
      () => this.advisoryService.assessNodeWrite(userId, node)
    );
    const eventAdvisories = serializeWarningsForEvent(advisoryWarnings);

    await Promise.all([
      this.safeAppendOperation(userId, operation),
      this.safePublish({
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
          ...(eventAdvisories.length > 0 ? { advisories: eventAdvisories } : {}),
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      }),
      this.markMetricsStale(userId, node.domain, 'node_created'),
    ]);

    this.logger.info({ nodeId: node.nodeId, domain: node.domain }, 'PKG node created');
    kgCounters.increment(KG_COUNTERS.PKG_OPERATIONS, { operation: 'node_created' });

    return {
      data: node,
      agentHints: this.withWarnings(
        this.hintsFactory.createNodeHints('created', node),
        advisoryWarnings
      ),
    };
  }

  async getNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    requireAuth(context);
    this.logger.debug({ userId, nodeId }, 'Getting PKG node');

    const node = await this.graphRepository.getNode(nodeId, userId);
    if (!node) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    return {
      data: node,
      agentHints: this.hintsFactory.createNodeHints('retrieved', node),
    };
  }

  async updateNode(
    userId: UserId,
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    requireAuth(context);
    this.logger.info({ userId, nodeId }, 'Updating PKG node');

    // Validate input
    validateInput(UpdateNodeInputSchema, updates, 'UpdateNodeInput');

    // Fetch current node for before/after tracking (D3a)
    const existingNode = await this.graphRepository.getNode(nodeId, userId);
    if (!existingNode) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    const masteryWriteMode = resolveMasteryWriteMode(
      updates.studyMode,
      existingNode.supportedStudyModes
    );
    const normalizedUpdates: IUpdateNodeInput =
      updates.masteryLevel === undefined
        ? updates
        : {
            ...updates,
            properties: {
              ...(updates.properties ?? {}),
              ...(masteryWriteMode !== undefined
                ? {
                    [masteryPropertyKey(masteryWriteMode)]: updates.masteryLevel,
                    [masterySourcePropertyKey(masteryWriteMode)]:
                      updates.properties?.['lastMasterySource'] ??
                      existingNode.properties['lastMasterySource'] ??
                      'manual_update',
                    [masteryUpdatedAtPropertyKey(masteryWriteMode)]:
                      updates.properties?.['lastMasteryUpdate'] ?? new Date().toISOString(),
                  }
                : {}),
            },
          };

    // Compute changed fields with before/after values
    const changedFields = computeNodeChangedFields(existingNode, normalizedUpdates);

    // Update node in Neo4j
    const updatedNode = await this.graphRepository.updateNode(nodeId, normalizedUpdates, userId);
    const advisoryWarnings = await this.safeComputeAdvisories(
      { entityType: 'node', operation: 'update', entityId: nodeId as string },
      () => this.advisoryService.assessNodeWrite(userId, updatedNode)
    );
    const eventAdvisories = serializeWarningsForEvent(advisoryWarnings);

    // Log operation with before/after tracking
    if (changedFields.length > 0) {
      const operation: IPkgNodeUpdatedOp = {
        operationType: PkgOperationType.NODE_UPDATED,
        sequenceNumber: 0,
        timestamp: new Date().toISOString(),
        nodeId,
        changedFields,
      };

      const fieldNames = changedFields.map((cf) => cf.field);
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const cf of changedFields) {
        previousValues[cf.field] = cf.before;
        newValues[cf.field] = cf.after;
      }

      // Post-write operations: parallel, resilient
      const postWrites: Promise<void>[] = [
        this.safeAppendOperation(userId, operation),
        this.safePublish({
          eventType: KnowledgeGraphEventType.PKG_NODE_UPDATED,
          aggregateType: 'PersonalKnowledgeGraph',
          aggregateId: userId,
          payload: {
            nodeId,
            userId,
            changedFields: fieldNames,
            previousValues,
            newValues,
            ...(eventAdvisories.length > 0 ? { advisories: eventAdvisories } : {}),
          },
          metadata: { correlationId: context.correlationId, userId: context.userId },
        }),
        this.markMetricsStale(userId, updatedNode.domain, 'node_updated'),
      ];

      // If domain changed, also mark the old domain as stale
      if (
        normalizedUpdates.domain !== undefined &&
        normalizedUpdates.domain !== existingNode.domain
      ) {
        postWrites.push(this.markMetricsStale(userId, existingNode.domain, 'node_updated'));
      }

      await Promise.all(postWrites);
    }

    this.logger.info({ nodeId, changedFieldCount: changedFields.length }, 'PKG node updated');
    kgCounters.increment(KG_COUNTERS.PKG_OPERATIONS, { operation: 'node_updated' });

    return {
      data: updatedNode,
      agentHints: this.withWarnings(
        this.hintsFactory.createNodeHints('updated', updatedNode),
        advisoryWarnings
      ),
    };
  }

  async deleteNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    requireAuth(context);
    this.logger.info({ userId, nodeId }, 'Deleting PKG node');

    // Verify node exists before deletion
    const existingNode = await this.graphRepository.getNode(nodeId, userId);
    if (!existingNode) {
      throw new NodeNotFoundError(nodeId, GraphType.PKG);
    }

    // Soft-delete node (repository handles orphaned edges)
    await this.graphRepository.deleteNode(nodeId, userId);

    // Post-write operations: resilient & parallel (4.2)
    const operation: IPkgNodeDeletedOp = {
      operationType: PkgOperationType.NODE_DELETED,
      sequenceNumber: 0,
      timestamp: new Date().toISOString(),
      nodeId,
    };
    await Promise.all([
      this.safeAppendOperation(userId, operation),
      this.safePublish({
        eventType: KnowledgeGraphEventType.PKG_NODE_REMOVED,
        aggregateType: 'PersonalKnowledgeGraph',
        aggregateId: userId,
        payload: {
          nodeId,
          userId,
          reason: 'User-initiated deletion',
          snapshot: {
            nodeType: existingNode.nodeType,
            label: existingNode.label,
            domain: existingNode.domain,
            metadata: existingNode.properties,
          },
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      }),
      this.markMetricsStale(userId, existingNode.domain, 'node_deleted'),
    ]);

    this.logger.info({ nodeId, domain: existingNode.domain }, 'PKG node deleted');
    kgCounters.increment(KG_COUNTERS.PKG_OPERATIONS, { operation: 'node_deleted' });

    return {
      data: undefined,
      agentHints: this.hintsFactory.createDeleteHints('node', nodeId, existingNode.domain),
    };
  }

  async listNodes(
    userId: UserId,
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>> {
    requireAuth(context);
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
      agentHints: this.hintsFactory.createListHints('nodes', items.length, total),
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
    requireAuth(context);
    this.logger.info(
      { userId, edgeType: input.edgeType, source: input.sourceNodeId, target: input.targetNodeId },
      'Creating PKG edge'
    );

    // Validate input
    const validated = validateInput(CreateEdgeInputSchema, input, 'CreateEdgeInput');

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

    // Run custom validators (unless skipped)
    if (
      validationOptions?.validateCustomRules !== false &&
      (validationOptions?.customValidators?.length ?? 0) > 0
    ) {
      const validationContext = {
        sourceNode,
        targetNode,
        edgeType: input.edgeType,
        weight: input.weight,
        policy,
      };
      const validators = validationOptions?.customValidators ?? [];
      for (const validator of validators) {
        if (!validator(validationContext)) {
          throw new ValidationError('Custom edge validation rule failed', {
            edgeType: [input.edgeType],
            source: [input.sourceNodeId as string],
            target: [input.targetNodeId as string],
          });
        }
      }
    }

    // Acyclicity check (unless skipped)
    if (policy.requiresAcyclicity && validationOptions?.validateAcyclicity !== false) {
      // Self-loop guard: source === target is always a cycle
      if (input.sourceNodeId === input.targetNodeId) {
        throw new CyclicEdgeError(
          input.edgeType,
          input.sourceNodeId as string,
          input.targetNodeId as string,
          [input.sourceNodeId as string]
        );
      }

      // Check reachability: if target can reach source via this edge type,
      // adding source→target creates a cycle.
      const pathFromTargetToSource = await this.graphRepository.findFilteredShortestPath(
        input.targetNodeId,
        input.sourceNodeId,
        [input.edgeType],
        undefined,
        userId
      );

      if (pathFromTargetToSource.length > 0) {
        throw new CyclicEdgeError(
          input.edgeType,
          input.sourceNodeId as string,
          input.targetNodeId as string,
          pathFromTargetToSource.map((n) => n.nodeId as string)
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
    const advisoryWarnings = await this.safeComputeAdvisories(
      { entityType: 'edge', operation: 'create', entityId: edge.edgeId as string },
      () => this.advisoryService.assessEdgeWrite(userId, edge, sourceNode, targetNode)
    );
    const eventAdvisories = serializeWarningsForEvent(advisoryWarnings);

    // Post-write operations: resilient & parallel (4.2)
    await Promise.all([
      this.safeAppendOperation(userId, operation),
      this.safePublish({
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
          ...(eventAdvisories.length > 0 ? { advisories: eventAdvisories } : {}),
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      }),
      this.markMetricsStale(userId, sourceNode.domain, 'edge_created'),
    ]);

    this.logger.info({ edgeId: edge.edgeId, edgeType: edge.edgeType }, 'PKG edge created');
    kgCounters.increment(KG_COUNTERS.PKG_OPERATIONS, { operation: 'edge_created' });

    return {
      data: edge,
      agentHints: this.withWarnings(
        this.hintsFactory.createEdgeHints('created', edge, sourceNode, targetNode),
        advisoryWarnings
      ),
    };
  }

  async getEdge(
    userId: UserId,
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    requireAuth(context);
    this.logger.debug({ userId, edgeId }, 'Getting PKG edge');

    const edge = await this.graphRepository.getEdge(edgeId);
    if (!edge) {
      throw new EdgeNotFoundError(edgeId);
    }
    if (edge.userId !== userId) {
      throw new UnauthorizedError('Not authorized to access this edge', userId);
    }

    return {
      data: edge,
      agentHints: this.hintsFactory.createEdgeRetrievalHints(edge),
    };
  }

  async updateEdge(
    userId: UserId,
    edgeId: EdgeId,
    updates: IUpdateEdgeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    requireAuth(context);
    this.logger.info({ userId, edgeId }, 'Updating PKG edge');

    // Validate input
    validateInput(UpdateEdgeInputSchema, updates, 'UpdateEdgeInput');

    // Fetch current edge for before/after tracking (userId-scoped)
    const existingEdge = await this.graphRepository.getEdge(edgeId);
    if (!existingEdge) {
      throw new EdgeNotFoundError(edgeId);
    }
    if (existingEdge.userId !== userId) {
      throw new UnauthorizedError('Not authorized to update this edge', userId);
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
    const changedFields = computeEdgeChangedFields(existingEdge, updates);

    // Update edge in Neo4j
    const updatedEdge = await this.graphRepository.updateEdge(edgeId, updates);
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(existingEdge.sourceNodeId, userId),
      this.graphRepository.getNode(existingEdge.targetNodeId, userId),
    ]);
    const advisoryWarnings =
      sourceNode !== null && targetNode !== null
        ? await this.safeComputeAdvisories(
            { entityType: 'edge', operation: 'update', entityId: edgeId as string },
            () => this.advisoryService.assessEdgeWrite(userId, updatedEdge, sourceNode, targetNode)
          )
        : [];
    const eventAdvisories = serializeWarningsForEvent(advisoryWarnings);

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
      // Post-write operations: resilient & parallel (4.2)
      const fieldNames = changedFields.map((cf) => cf.field);
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const cf of changedFields) {
        previousValues[cf.field] = cf.before;
        newValues[cf.field] = cf.after;
      }

      const postWrites: Promise<void>[] = [
        this.safeAppendOperation(userId, edgeUpdateOp),
        this.safePublish({
          eventType: KnowledgeGraphEventType.PKG_EDGE_UPDATED,
          aggregateType: 'PersonalKnowledgeGraph',
          aggregateId: userId,
          payload: {
            edgeId: existingEdge.edgeId,
            userId,
            changedFields: fieldNames,
            previousValues,
            newValues,
            ...(eventAdvisories.length > 0 ? { advisories: eventAdvisories } : {}),
          },
          metadata: {
            correlationId: context.correlationId,
            userId: context.userId,
          },
        }),
      ];

      if (sourceNode) {
        postWrites.push(this.markMetricsStale(userId, sourceNode.domain, 'edge_updated'));
      }

      await Promise.all(postWrites);
    }

    this.logger.info({ edgeId, changedFieldCount: changedFields.length }, 'PKG edge updated');
    kgCounters.increment(KG_COUNTERS.PKG_OPERATIONS, { operation: 'edge_updated' });

    return {
      data: updatedEdge,
      agentHints: this.withWarnings(
        sourceNode !== null && targetNode !== null
          ? this.hintsFactory.createEdgeHints('updated', updatedEdge, sourceNode, targetNode)
          : this.hintsFactory.createEdgeRetrievalHints(updatedEdge),
        advisoryWarnings
      ),
    };
  }

  async deleteEdge(
    userId: UserId,
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    requireAuth(context);
    this.logger.info({ userId, edgeId }, 'Deleting PKG edge');

    // Verify edge exists and belongs to user (userId-scoped)
    const existingEdge = await this.graphRepository.getEdge(edgeId);
    if (!existingEdge) {
      throw new EdgeNotFoundError(edgeId);
    }
    if (existingEdge.userId !== userId) {
      throw new UnauthorizedError('Not authorized to delete this edge', userId);
    }

    // Capture source node domain before deletion to avoid race conditions
    const sourceNode = await this.graphRepository.getNode(existingEdge.sourceNodeId, userId);
    const domain = sourceNode?.domain ?? 'unknown';
    if (!sourceNode) {
      this.logger.warn(
        { edgeId, sourceNodeId: existingEdge.sourceNodeId },
        'Source node not found before edge deletion — using fallback domain'
      );
    }

    // Hard-delete edge (edges have no soft-delete semantics)
    await this.graphRepository.removeEdge(edgeId);

    // Post-write operations: resilient & parallel (4.2)
    const operation: IPkgEdgeDeletedOp = {
      operationType: PkgOperationType.EDGE_DELETED,
      sequenceNumber: 0,
      timestamp: new Date().toISOString(),
      edgeId: existingEdge.edgeId,
    };

    await Promise.all([
      this.safeAppendOperation(userId, operation),
      this.safePublish({
        eventType: KnowledgeGraphEventType.PKG_EDGE_REMOVED,
        aggregateType: 'PersonalKnowledgeGraph',
        aggregateId: userId,
        payload: {
          edgeId: existingEdge.edgeId,
          userId,
          reason: 'User-initiated deletion',
          snapshot: {
            sourceNodeId: existingEdge.sourceNodeId,
            targetNodeId: existingEdge.targetNodeId,
            edgeType: existingEdge.edgeType,
            weight: existingEdge.weight,
            metadata: existingEdge.properties,
          },
        },
        metadata: {
          correlationId: context.correlationId,
          userId: context.userId,
        },
      }),
      this.markMetricsStale(userId, domain, 'edge_deleted'),
    ]);

    this.logger.info({ edgeId, edgeType: existingEdge.edgeType }, 'PKG edge deleted');
    kgCounters.increment(KG_COUNTERS.PKG_OPERATIONS, { operation: 'edge_deleted' });

    return {
      data: undefined,
      agentHints: this.hintsFactory.createDeleteHints('edge', edgeId, domain),
    };
  }

  async listEdges(
    userId: UserId,
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>> {
    requireAuth(context);
    this.logger.debug({ userId, filters, pagination }, 'Listing PKG edges');

    // Enforce user scope
    const scopedFilter: IEdgeFilter = {
      ...filters,
      userId,
    };

    // Apply pagination limits
    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // Query edges and exact total in parallel

    const [edges, total] = await Promise.all([
      this.graphRepository.findEdges(scopedFilter, limit, offset),

      this.graphRepository.countEdges(scopedFilter),
    ]);

    const result: IPaginatedResponse<IGraphEdge> = {
      items: edges,
      total: total,
      hasMore: offset + edges.length < total,
    };

    return {
      data: result,
      agentHints: this.hintsFactory.createListHints('edges', edges.length, total),
    };
  }

  // ========================================================================
  // Private — Resilient Post-Write Operations (4.2)
  // ========================================================================

  /**
   * Append an operation log entry resiliently.
   * Non-blocking — failures are logged but do not propagate.
   */
  private async safeAppendOperation(
    userId: UserId,
    operation: Parameters<IPkgOperationLogRepository['appendOperation']>[1]
  ): Promise<void> {
    try {
      await this.operationLogRepository.appendOperation(userId, operation);
    } catch (error) {
      kgCounters.increment(KG_COUNTERS.OPERATION_LOG_FAILURES, {
        operationType: operation.operationType,
      });
      try {
        await this.postWriteRecoveryService.enqueueAppendOperation(userId, operation);
        this.logger.warn(
          { error, userId, operationType: operation.operationType },
          'Failed to append operation log immediately — queued durable recovery task'
        );
      } catch (recoveryError) {
        this.logger.error(
          { error, recoveryError, userId, operationType: operation.operationType },
          'Failed to append operation log and failed to queue recovery task'
        );
        throw new GraphConsistencyError(
          'pkg_post_write_operation_log',
          'PKG write completed but the operation log could not be recorded or queued for recovery.',
          { userId, operationType: operation.operationType }
        );
      }
    }
  }

  /**
   * Publish a domain event resiliently.
   * Non-blocking — failures are logged but do not propagate.
   */
  private async safePublish(event: Parameters<IEventPublisher['publish']>[0]): Promise<void> {
    try {
      await this.eventPublisher.publish(event);
    } catch (error) {
      kgCounters.increment(KG_COUNTERS.EVENT_PUBLISH_FAILURES, { eventType: event.eventType });
      try {
        await this.postWriteRecoveryService.enqueuePublish(event);
        this.logger.warn(
          { error, eventType: event.eventType, aggregateId: event.aggregateId },
          'Failed to publish domain event immediately — queued durable recovery task'
        );
      } catch (recoveryError) {
        this.logger.error(
          { error, recoveryError, eventType: event.eventType, aggregateId: event.aggregateId },
          'Failed to publish domain event and failed to queue recovery task'
        );
        throw new GraphConsistencyError(
          'pkg_post_write_event_publish',
          'PKG write completed but the resulting domain event could not be published or queued for recovery.',
          { eventType: event.eventType, aggregateId: event.aggregateId }
        );
      }
    }
  }

  private withWarnings(agentHints: IAgentHints, warnings: readonly IWarning[]): IAgentHints {
    if (warnings.length === 0) {
      return agentHints;
    }

    return {
      ...agentHints,
      warnings: [...(agentHints.warnings ?? []), ...warnings],
    };
  }

  private async safeComputeAdvisories(
    context: { entityType: 'node' | 'edge'; operation: 'create' | 'update'; entityId: string },
    compute: () => Promise<IWarning[]>
  ): Promise<IWarning[]> {
    try {
      return await compute();
    } catch (error) {
      this.logger.warn(
        {
          ...context,
          error,
        },
        'PKG advisory classification failed (non-blocking)'
      );
      return [];
    }
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
      kgCounters.increment(KG_COUNTERS.STALENESS_MARK_FAILURES, { domain, mutationType });
      try {
        await this.postWriteRecoveryService.enqueueMetricsStale(userId, domain, mutationType);
        this.logger.warn(
          { error, userId, domain, mutationType },
          'Failed to mark metrics as stale immediately — queued durable recovery task'
        );
      } catch (recoveryError) {
        this.logger.error(
          { error, recoveryError, userId, domain, mutationType },
          'Failed to mark metrics as stale and failed to queue recovery task'
        );
        throw new GraphConsistencyError(
          'pkg_post_write_metrics_staleness',
          'PKG write completed but metric staleness could not be recorded or queued for recovery.',
          { userId, domain, mutationType }
        );
      }
    }
  }
}
