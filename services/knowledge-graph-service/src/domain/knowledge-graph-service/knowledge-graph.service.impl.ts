/**
 * @noema/knowledge-graph-service - KnowledgeGraphService Facade
 *
 * Phase 5: PKG Operations & Service Layer Foundation.
 * Phase 6: CKG Mutation Pipeline (typestate-governed, async validation).
 * Phase 7: Structural Metrics & Misconception Detection.
 *
 * Thin facade implementing IKnowledgeGraphService. Delegates to focused
 * sub-services for each domain area:
 *
 * - PkgWriteService: node/edge CRUD with resilient post-write operations
 * - GraphReadService: traversal, structural analysis, ordering (PKG & CKG)
 * - MetricsOrchestrator: metrics computation, misconceptions, health, comparison
 *
 * CKG mutation pipeline and operation log methods are kept inline as they
 * are thin delegation to the mutation pipeline or operation log repository.
 *
 * @see ADR-0010 for edge policy architecture
 * @see ADR-005 for CKG mutation pipeline design
 * @see ADR-006 for structural metrics & misconception detection design
 * @see ADR-013 for God-object decomposition (Fix 4.3)
 */

import type { IRiskFactor } from '@noema/contracts';
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
  MutationId,
  MutationState,
  NodeId,
  ProposerId,
  UserId,
} from '@noema/types';
import type { Logger } from 'pino';

import type { IEventPublisher } from '../shared/event-publisher.js';
import type { AgentHintsFactory } from './agent-hints.factory.js';
import { AgentHintsBuilder } from './agent-hints.factory.js';
import type {
  CkgMutationOperation,
  IAddNodeOperation,
  IMutationFilter,
  IMutationProposal,
} from './ckg-mutation-dsl.js';
import { CkgOperationType } from './ckg-mutation-dsl.js';
import { MutationFilterSchema, MutationProposalSchema } from './ckg-mutation-dsl.js';
import type { CkgMutationPipeline } from './ckg-mutation-pipeline.js';
import type { IExecutionContext, IServiceResult } from './execution-context.js';
import { GraphReadService } from './graph-read.service.js';
import type {
  ICreateEdgeInput,
  ICreateNodeInput,
  IEdgeFilter,
  IGraphRepository,
  IUpdateEdgeInput,
  IUpdateNodeInput,
} from './graph.repository.js';
import type {
  IKnowledgeGraphService,
  IMutationRecoveryCheckResult,
  IOperationLogFilter,
  IPipelineHealthResult,
} from './knowledge-graph.service.js';
import { MetricsOrchestrator } from './metrics-orchestrator.service.js';
import type { IMetricsStalenessRepository } from './metrics-staleness.repository.js';
import type { IMetricsHistoryOptions, IMetricsRepository } from './metrics.repository.js';
import type { IMisconceptionRepository } from './misconception.repository.js';
import type { ICkgMutation, IMutationAuditEntry } from './mutation.repository.js';
import type {
  IPkgOperationLogEntry,
  IPkgOperationLogRepository,
} from './pkg-operation-log.repository.js';
import { PkgWriteService } from './pkg-write.service.js';
import { MAX_PAGE_SIZE, requireAuth, validateInput } from './service-helpers.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type {
  IBridgeNodesResult,
  IBridgeQuery,
  ICentralityQuery,
  ICentralityResult,
  ICommonAncestorsQuery,
  ICommonAncestorsResult,
  ICoParentsQuery,
  ICoParentsResult,
  IFrontierQuery,
  IKnowledgeFrontierResult,
  INeighborhoodQuery,
  INeighborhoodResult,
  INodeFilter,
  IPrerequisiteChainQuery,
  IPrerequisiteChainResult,
  ISiblingsQuery,
  ISiblingsResult,
  ITraversalOptions,
  IValidationOptions,
} from './value-objects/graph.value-objects.js';

/**
 * Facade implementing the full IKnowledgeGraphService contract.
 *
 * Composes three focused sub-services:
 * - PkgWriteService: PKG node/edge CRUD
 * - GraphReadService: all read-only traversals, analysis, ordering (PKG & CKG)
 * - MetricsOrchestrator: Phase 7 metrics, misconceptions, health, comparison
 *
 * CKG mutation pipeline delegation + operation log are inline (thin).
 */
export class KnowledgeGraphService implements IKnowledgeGraphService {
  private readonly logger: Logger;
  private readonly pkgWrite: PkgWriteService;
  private readonly graphRead: GraphReadService;
  private readonly metricsOrch: MetricsOrchestrator;

  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly operationLogRepository: IPkgOperationLogRepository,
    metricsStalenessRepository: IMetricsStalenessRepository,
    metricsRepository: IMetricsRepository,
    misconceptionRepository: IMisconceptionRepository,
    eventPublisher: IEventPublisher,
    private readonly mutationPipeline: CkgMutationPipeline,
    private readonly hintsFactory: AgentHintsFactory,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'KnowledgeGraphService' });

    // Compose sub-services with their specific dependencies
    this.pkgWrite = new PkgWriteService(
      graphRepository,
      operationLogRepository,
      metricsStalenessRepository,
      eventPublisher,
      hintsFactory,
      this.logger
    );
    this.graphRead = new GraphReadService(graphRepository, hintsFactory, this.logger);
    this.metricsOrch = new MetricsOrchestrator(
      graphRepository,
      metricsRepository,
      metricsStalenessRepository,
      misconceptionRepository,
      eventPublisher,
      hintsFactory,
      this.logger
    );
  }

  // ========================================================================
  // PKG Node Operations → PkgWriteService
  // ========================================================================

  createNode(
    userId: UserId,
    input: ICreateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    return this.pkgWrite.createNode(userId, input, context);
  }

  getNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    return this.pkgWrite.getNode(userId, nodeId, context);
  }

  updateNode(
    userId: UserId,
    nodeId: NodeId,
    updates: IUpdateNodeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode>> {
    return this.pkgWrite.updateNode(userId, nodeId, updates, context);
  }

  deleteNode(
    userId: UserId,
    nodeId: NodeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    return this.pkgWrite.deleteNode(userId, nodeId, context);
  }

  listNodes(
    userId: UserId,
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>> {
    return this.pkgWrite.listNodes(userId, filters, pagination, context);
  }

  // ========================================================================
  // PKG Edge Operations → PkgWriteService
  // ========================================================================

  createEdge(
    userId: UserId,
    input: ICreateEdgeInput,
    context: IExecutionContext,
    validationOptions?: IValidationOptions
  ): Promise<IServiceResult<IGraphEdge>> {
    return this.pkgWrite.createEdge(userId, input, context, validationOptions);
  }

  getEdge(
    userId: UserId,
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    return this.pkgWrite.getEdge(userId, edgeId, context);
  }

  updateEdge(
    userId: UserId,
    edgeId: EdgeId,
    updates: IUpdateEdgeInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphEdge>> {
    return this.pkgWrite.updateEdge(userId, edgeId, updates, context);
  }

  deleteEdge(
    userId: UserId,
    edgeId: EdgeId,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    return this.pkgWrite.deleteEdge(userId, edgeId, context);
  }

  listEdges(
    userId: UserId,
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>> {
    return this.pkgWrite.listEdges(userId, filters, pagination, context);
  }

  // ========================================================================
  // PKG Traversal Operations → GraphReadService
  // ========================================================================

  getSubgraph(
    userId: UserId,
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>> {
    return this.graphRead.getSubgraph(userId, rootNodeId, traversalOptions, context);
  }

  getAncestors(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.graphRead.getAncestors(userId, nodeId, options, context);
  }

  getDescendants(
    userId: UserId,
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.graphRead.getDescendants(userId, nodeId, options, context);
  }

  findPath(
    userId: UserId,
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.graphRead.findPath(userId, fromNodeId, toNodeId, context, maxDepth);
  }

  getSiblings(
    userId: UserId,
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>> {
    return this.graphRead.getSiblings(userId, nodeId, query, context);
  }

  getCoParents(
    userId: UserId,
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>> {
    return this.graphRead.getCoParents(userId, nodeId, query, context);
  }

  getNeighborhood(
    userId: UserId,
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>> {
    return this.graphRead.getNeighborhood(userId, nodeId, query, context);
  }

  // ========================================================================
  // Phase 8c — PKG Structural Analysis → GraphReadService
  // ========================================================================

  getBridgeNodes(
    userId: UserId,
    query: IBridgeQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IBridgeNodesResult>> {
    return this.graphRead.getBridgeNodes(userId, query, context);
  }

  getKnowledgeFrontier(
    userId: UserId,
    query: IFrontierQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IKnowledgeFrontierResult>> {
    return this.graphRead.getKnowledgeFrontier(userId, query, context);
  }

  getCommonAncestors(
    userId: UserId,
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICommonAncestorsResult>> {
    return this.graphRead.getCommonAncestors(userId, nodeIdA, nodeIdB, query, context);
  }

  // ========================================================================
  // PKG Ordering & Ranking (Phase 8d) → GraphReadService
  // ========================================================================

  getPrerequisiteChain(
    userId: UserId,
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPrerequisiteChainResult>> {
    return this.graphRead.getPrerequisiteChain(userId, nodeId, query, context);
  }

  getCentralityRanking(
    userId: UserId,
    query: ICentralityQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICentralityResult>> {
    return this.graphRead.getCentralityRanking(userId, query, context);
  }

  // ========================================================================
  // CKG Operations (read-only) → GraphReadService
  // ========================================================================

  getCkgNode(nodeId: NodeId, context: IExecutionContext): Promise<IServiceResult<IGraphNode>> {
    return this.graphRead.getCkgNode(nodeId, context);
  }

  getCkgSubgraph(
    rootNodeId: NodeId,
    traversalOptions: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<ISubgraph>> {
    return this.graphRead.getCkgSubgraph(rootNodeId, traversalOptions, context);
  }

  listCkgNodes(
    filters: INodeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphNode>>> {
    return this.graphRead.listCkgNodes(filters, pagination, context);
  }

  getCkgEdge(edgeId: EdgeId, context: IExecutionContext): Promise<IServiceResult<IGraphEdge>> {
    return this.graphRead.getCkgEdge(edgeId, context);
  }

  listCkgEdges(
    filters: IEdgeFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IGraphEdge>>> {
    return this.graphRead.listCkgEdges(filters, pagination, context);
  }

  getCkgAncestors(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.graphRead.getCkgAncestors(nodeId, options, context);
  }

  getCkgDescendants(
    nodeId: NodeId,
    options: ITraversalOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.graphRead.getCkgDescendants(nodeId, options, context);
  }

  findCkgPath(
    fromNodeId: NodeId,
    toNodeId: NodeId,
    context: IExecutionContext,
    maxDepth?: number
  ): Promise<IServiceResult<IGraphNode[]>> {
    return this.graphRead.findCkgPath(fromNodeId, toNodeId, context, maxDepth);
  }

  getCkgSiblings(
    nodeId: NodeId,
    query: ISiblingsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ISiblingsResult>> {
    return this.graphRead.getCkgSiblings(nodeId, query, context);
  }

  getCkgCoParents(
    nodeId: NodeId,
    query: ICoParentsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICoParentsResult>> {
    return this.graphRead.getCkgCoParents(nodeId, query, context);
  }

  getCkgNeighborhood(
    nodeId: NodeId,
    query: INeighborhoodQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<INeighborhoodResult>> {
    return this.graphRead.getCkgNeighborhood(nodeId, query, context);
  }

  // ========================================================================
  // Phase 8c — CKG Structural Analysis → GraphReadService
  // ========================================================================

  getCkgBridgeNodes(
    query: IBridgeQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IBridgeNodesResult>> {
    return this.graphRead.getCkgBridgeNodes(query, context);
  }

  getCkgCommonAncestors(
    nodeIdA: NodeId,
    nodeIdB: NodeId,
    query: ICommonAncestorsQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICommonAncestorsResult>> {
    return this.graphRead.getCkgCommonAncestors(nodeIdA, nodeIdB, query, context);
  }

  // ========================================================================
  // Phase 8d — CKG Ordering & Ranking → GraphReadService
  // ========================================================================

  getCkgPrerequisiteChain(
    nodeId: NodeId,
    query: IPrerequisiteChainQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<IPrerequisiteChainResult>> {
    return this.graphRead.getCkgPrerequisiteChain(nodeId, query, context);
  }

  getCkgCentralityRanking(
    query: ICentralityQuery,
    context: IExecutionContext
  ): Promise<IServiceResult<ICentralityResult>> {
    return this.graphRead.getCkgCentralityRanking(query, context);
  }

  // ========================================================================
  // Phase 7 — Structural Metrics → MetricsOrchestrator
  // ========================================================================

  computeMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    return this.metricsOrch.computeMetrics(userId, domain, context);
  }

  getMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    return this.metricsOrch.getMetrics(userId, domain, context);
  }

  getMetricsHistory(
    userId: UserId,
    domain: string,
    options: IMetricsHistoryOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics[]>> {
    return this.metricsOrch.getMetricsHistory(userId, domain, options, context);
  }

  // ========================================================================
  // Phase 7 — Misconception Detection → MetricsOrchestrator
  // ========================================================================

  detectMisconceptions(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    return this.metricsOrch.detectMisconceptions(userId, domain, context);
  }

  getMisconceptions(
    userId: UserId,
    domain: string | undefined,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    return this.metricsOrch.getMisconceptions(userId, domain, context);
  }

  updateMisconceptionStatus(
    detectionId: string,
    status: string,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    return this.metricsOrch.updateMisconceptionStatus(detectionId, status, context);
  }

  // ========================================================================
  // Phase 7 — Structural Health → MetricsOrchestrator
  // ========================================================================

  getStructuralHealth(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralHealthReport>> {
    return this.metricsOrch.getStructuralHealth(userId, domain, context);
  }

  getMetacognitiveStage(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IMetacognitiveStageAssessment>> {
    return this.metricsOrch.getMetacognitiveStage(userId, domain, context);
  }

  // ========================================================================
  // Phase 7 — PKG↔CKG Comparison → MetricsOrchestrator
  // ========================================================================

  compareWithCkg(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphComparison>> {
    return this.metricsOrch.compareWithCkg(userId, domain, context);
  }

  // ========================================================================
  // CKG Mutation Pipeline (Phase 6) — inline delegation
  // ========================================================================

  async proposeMutation(
    proposal: IMutationProposal,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    // Validate proposal at service boundary
    const validated = validateInput(MutationProposalSchema, proposal, 'MutationProposal');

    // Derive proposerId from context: userId for admin users, agentId for agents.
    // The userId in the context represents whoever is authenticated — an agent
    // identity (agent_xxx) or a human admin (user_xxx). Both are valid proposers.
    const proposerId = (context.userId ?? 'agent_unknown') as ProposerId;

    const mutation = await this.mutationPipeline.proposeMutation(
      proposerId,
      // Narrow assertion: Zod has already validated the operations via
      // MutationProposalSchema (which uses CkgMutationOperationSchema).
      // The type mismatch is purely structural: Zod infers Record<string, unknown>
      // for properties, while CkgMutationOperation uses Metadata (Record<string, JsonValue>).
      validated.operations as CkgMutationOperation[],
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
      agentHints: this.hintsFactory.createMutationHints('proposed', mutation),
    };
  }

  async getMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const mutation = await this.mutationPipeline.getMutation(mutationId);

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('retrieved', mutation),
    };
  }

  async listMutations(
    filters: IMutationFilter,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation[]>> {
    requireAuth(context);

    // Validate filters at service boundary
    const validated = validateInput(MutationFilterSchema, filters, 'MutationFilter');

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
      agentHints: this.hintsFactory.createMutationListHints(mutations, validated),
    };
  }

  async cancelMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const mutation = await this.mutationPipeline.cancelMutation(mutationId, context);

    this.logger.info({ mutationId, state: mutation.state }, 'CKG mutation cancelled');

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('cancelled', mutation),
    };
  }

  async retryMutation(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const mutation = await this.mutationPipeline.retryMutation(mutationId, context);

    this.logger.info(
      { originalMutationId: mutationId, newMutationId: mutation.mutationId },
      'CKG mutation retried'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('retried', mutation),
    };
  }

  async getMutationAuditLog(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationAuditEntry[]>> {
    requireAuth(context);

    const auditLog = await this.mutationPipeline.getAuditLog(mutationId);

    return {
      data: auditLog,
      agentHints: AgentHintsBuilder.create()
        .addAction({
          action: 'get_mutation',
          description: 'View the current mutation state',
          priority: 'low',
          category: 'exploration',
        })
        .addResource({
          type: 'CKGMutation',
          id: mutationId as string,
          label: `Mutation ${mutationId}`,
          relevance: 1.0,
        })
        .withValidityPeriod('short')
        .withEstimatedImpact(0.3, 0.1, 3.0)
        .withReasoning(
          `Audit log contains ${String(auditLog.length)} entries for mutation ${mutationId}`
        )
        .build(),
    };
  }

  async getMutationPipelineHealth(
    context: IExecutionContext
  ): Promise<IServiceResult<IPipelineHealthResult>> {
    requireAuth(context);
    this.logger.debug('Getting mutation pipeline health');

    const health = await this.mutationPipeline.getPipelineHealth();

    const totalCount =
      health.proposedCount +
      health.validatingCount +
      health.validatedCount +
      health.pendingReviewCount +
      health.revisionRequestedCount +
      health.committedCount +
      health.rejectedCount;

    const result: IPipelineHealthResult = {
      proposedCount: health.proposedCount,
      validatingCount: health.validatingCount,
      validatedCount: health.validatedCount,
      pendingReviewCount: health.pendingReviewCount,
      revisionRequestedCount: health.revisionRequestedCount,
      committedCount: health.committedCount,
      rejectedCount: health.rejectedCount,
      stuckCount: health.stuckCount,
      totalCount,
    };

    const stuckWarning: IRiskFactor[] =
      health.stuckCount > 0
        ? [
            {
              type: 'performance' as const,
              severity: 'medium' as const,
              description: `${String(health.stuckCount)} mutation(s) appear stuck in non-terminal state`,
              probability: 0.8,
              impact: 0.6,
              mitigation:
                'Check pipeline logs — stuck mutations may need manual retry or cancellation',
            },
          ]
        : [];

    const builder = AgentHintsBuilder.create()
      .withValidityPeriod('short')
      .withRiskFactors(stuckWarning)
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .addAction({
        action: 'list_mutations',
        description: 'List all mutations with state filter',
        priority: 'low',
        category: 'exploration',
      })
      .withReasoning(
        `Pipeline has ${String(totalCount)} total mutations: ${String(health.proposedCount)} proposed, ${String(health.committedCount)} committed, ${String(health.rejectedCount)} rejected, ${String(health.pendingReviewCount)} pending review, ${String(health.stuckCount)} stuck.`
      );

    if (health.stuckCount > 0) {
      builder.addAction({
        action: 'list_stuck_mutations',
        description: 'List mutations in non-terminal processing states',
        priority: 'high',
        category: 'correction',
      });
    }

    return {
      data: result,
      agentHints: builder.build(),
    };
  }

  // ========================================================================
  // CKG Mutation Escalation Review (Phase 8e) — inline delegation
  // ========================================================================

  async approveEscalatedMutation(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const reviewerId = (context.userId as string | undefined) ?? 'system';

    const mutation = await this.mutationPipeline.approveMutation(
      mutationId,
      reviewerId,
      reason,
      context
    );

    this.logger.info(
      { mutationId, reviewerId, state: mutation.state },
      'Escalated mutation approved — pipeline resumed'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('approved', mutation),
    };
  }

  async rejectEscalatedMutation(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const reviewerId = (context.userId as string | undefined) ?? 'system';

    const mutation = await this.mutationPipeline.rejectEscalatedMutation(
      mutationId,
      reviewerId,
      reason,
      context
    );

    this.logger.info(
      { mutationId, reviewerId, state: mutation.state },
      'Escalated mutation rejected — ontological conflicts confirmed'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('rejected', mutation),
    };
  }

  async requestMutationRevision(
    mutationId: MutationId,
    feedback: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const reviewerId = (context.userId as string | undefined) ?? 'system';

    const mutation = await this.mutationPipeline.requestRevision(
      mutationId,
      reviewerId,
      feedback,
      context
    );

    this.logger.info(
      { mutationId, reviewerId, state: mutation.state, revisionCount: mutation.revisionCount },
      'Revision requested for escalated mutation'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('revision_requested', mutation),
    };
  }

  async resubmitMutation(
    mutationId: MutationId,
    updatedOperations: CkgMutationOperation[],
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const submitterId = (context.userId as string | undefined) ?? 'system';

    const mutation = await this.mutationPipeline.resubmitMutation(
      mutationId,
      updatedOperations,
      submitterId,
      context
    );

    this.logger.info(
      { mutationId, submitterId, state: mutation.state, revisionCount: mutation.revisionCount },
      'Mutation resubmitted after revision — re-entering pipeline'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('resubmitted', mutation),
    };
  }

  async rejectStuckMutation(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const actorId = (context.userId as string | undefined) ?? 'system';
    const mutation = await this.mutationPipeline.rejectStuckMutation(
      mutationId,
      actorId,
      reason,
      context
    );

    this.logger.warn(
      { mutationId, actorId, state: mutation.state },
      'Stuck mutation manually rejected by operator'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('rejected', mutation),
    };
  }

  async reconcileMutationCommit(
    mutationId: MutationId,
    reason: string,
    context: IExecutionContext
  ): Promise<IServiceResult<ICkgMutation>> {
    requireAuth(context);

    const actorId = (context.userId as string | undefined) ?? 'system';
    const mutation = await this.mutationPipeline.reconcileMutationCommit(
      mutationId,
      actorId,
      reason,
      context
    );

    this.logger.warn(
      { mutationId, actorId, state: mutation.state },
      'Stuck mutation manually reconciled by operator'
    );

    return {
      data: mutation,
      agentHints: this.hintsFactory.createMutationHints('approved', mutation),
    };
  }

  async checkMutationSafeRetry(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationRecoveryCheckResult>> {
    requireAuth(context);

    const result = await this.inspectMutationRecoveryState(mutationId, 'safe_retry');

    return {
      data: result,
      agentHints: AgentHintsBuilder.create()
        .withValidityPeriod('short')
        .withReasoning(result.summary)
        .build(),
    };
  }

  async checkMutationReconcileCommit(
    mutationId: MutationId,
    context: IExecutionContext
  ): Promise<IServiceResult<IMutationRecoveryCheckResult>> {
    requireAuth(context);

    const result = await this.inspectMutationRecoveryState(mutationId, 'reconcile_commit');

    return {
      data: result,
      agentHints: AgentHintsBuilder.create()
        .withValidityPeriod('short')
        .withReasoning(result.summary)
        .build(),
    };
  }

  // ========================================================================
  // PKG Operation Log — inline delegation
  // ========================================================================

  async getOperationLog(
    userId: UserId,
    filters: IOperationLogFilter,
    pagination: { limit: number; offset: number },
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IPkgOperationLogEntry>>> {
    requireAuth(context);
    this.logger.debug({ userId, filters, pagination }, 'Getting PKG operation log');

    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE);
    const offset = Math.max(pagination.offset, 0);

    // Dispatch to the most specific repository method based on filter type.
    // Precedence: nodeId → edgeId → operationType → since → default.
    let entries: IPkgOperationLogEntry[];
    let usedPagination = false;

    if (filters.nodeId !== undefined) {
      entries = await this.operationLogRepository.getOperationsForNode(userId, filters.nodeId);
    } else if (filters.edgeId !== undefined) {
      entries = await this.operationLogRepository.getOperationsForEdge(userId, filters.edgeId);
    } else if (filters.operationType !== undefined) {
      const result = await this.operationLogRepository.getOperationsByType(
        userId,
        filters.operationType,
        limit,
        offset
      );
      entries = result.items;
      usedPagination = true;
    } else if (filters.since !== undefined) {
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
      // The repository already paginated — use exact count from countOperations
      paginatedEntries = entries;
      const countFilter =
        filters.operationType !== undefined ? { operationType: filters.operationType } : undefined;

      total = await this.operationLogRepository.countOperations(userId, countFilter);
      hasMore = offset + paginatedEntries.length < total;
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
      agentHints: this.hintsFactory.createListHints(
        'PKG operations',
        paginatedEntries.length,
        total
      ),
    };
  }

  private async inspectMutationRecoveryState(
    mutationId: MutationId,
    check: IMutationRecoveryCheckResult['check']
  ): Promise<IMutationRecoveryCheckResult> {
    const mutation = await this.mutationPipeline.getMutation(mutationId);
    const evidence = await this.collectGraphWriteEvidence(
      mutation.operations as unknown as readonly CkgMutationOperation[]
    );
    const checkedAt = new Date().toISOString();

    if (check === 'safe_retry') {
      const eligible = !evidence.writeDetected;
      return {
        mutationId,
        check,
        eligible,
        recommendedAction: eligible ? 'recover_reject' : 'none',
        mutationState: mutation.state,
        summary: eligible
          ? 'No canonical graph write was detected for this mutation. Reject As Stuck is the safer recovery action.'
          : 'Canonical graph evidence was detected for this mutation. Do not use Reject As Stuck unless you verify the evidence is a false positive.',
        details: buildRecoveryDetails(mutation.state, evidence),
        checkedAt,
        graphEvidence: evidence,
      };
    }

    const eligible = mutation.state === 'committing' && evidence.writeDetected;

    return {
      mutationId,
      check,
      eligible,
      recommendedAction:
        mutation.state !== 'committing'
          ? 'none'
          : eligible
            ? 'reconcile_commit'
            : 'wait',
      mutationState: mutation.state,
      summary:
        mutation.state !== 'committing'
          ? `This mutation is in ${mutation.state}, so Reconcile Commit is not the right recovery action.`
          : eligible
            ? 'Canonical graph evidence was detected while the mutation is still COMMITTING. Reconcile Commit is appropriate if Postgres state is what got stuck.'
            : 'No canonical graph write was detected yet. Reconcile Commit would be risky right now.',
      details: buildRecoveryDetails(mutation.state, evidence),
      checkedAt,
      graphEvidence: evidence,
    };
  }

  private async collectGraphWriteEvidence(
    operations: readonly CkgMutationOperation[]
  ): Promise<IMutationRecoveryCheckResult['graphEvidence']> {
    const matchedNodeIds = new Set<NodeId>();
    const matchedEdgeIds = new Set<EdgeId>();

    for (const operation of operations) {
      if (operation.type === CkgOperationType.ADD_NODE) {
        const nodes = await this.findMatchingCanonicalNodes(operation);
        for (const node of nodes) {
          matchedNodeIds.add(node.nodeId);
        }
      }

      if (operation.type === CkgOperationType.ADD_EDGE) {
        const edges = await this.graphRepository.findEdges(
          {
            edgeType: operation.edgeType,
            sourceNodeId: operation.sourceNodeId as NodeId,
            targetNodeId: operation.targetNodeId as NodeId,
          },
          10,
          0
        );
        for (const edge of edges) {
          matchedEdgeIds.add(edge.edgeId);
        }
      }
    }

    return {
      writeDetected: matchedNodeIds.size > 0 || matchedEdgeIds.size > 0,
      matchedNodeIds: [...matchedNodeIds],
      matchedEdgeIds: [...matchedEdgeIds],
    };
  }

  private async findMatchingCanonicalNodes(operation: IAddNodeOperation): Promise<IGraphNode[]> {
    const candidates = await this.graphRepository.findNodes(
      {
        graphType: 'ckg',
        includeDeleted: false,
        labelContains: operation.label,
        nodeType: operation.nodeType,
        domain: operation.domain,
      },
      25,
      0
    );

    return candidates.filter((candidate) => nodeMatchesAddNodeOperation(candidate, operation));
  }
}

function buildRecoveryDetails(
  mutationState: string,
  evidence: IMutationRecoveryCheckResult['graphEvidence']
): string[] {
  const details = [`Current mutation state: ${mutationState}.`];

  if (evidence.matchedNodeIds.length > 0) {
    details.push(
      `Matched canonical node ids: ${evidence.matchedNodeIds.map(String).join(', ')}.`
    );
  }

  if (evidence.matchedEdgeIds.length > 0) {
    details.push(
      `Matched canonical edge ids: ${evidence.matchedEdgeIds.map(String).join(', ')}.`
    );
  }

  if (!evidence.writeDetected) {
    details.push(
      'No canonical node or edge matches were found for the mutation payload during this check.'
    );
  }

  return details;
}

function nodeMatchesAddNodeOperation(node: IGraphNode, operation: IAddNodeOperation): boolean {
  if (
    normalizeText(node.label) !== normalizeText(operation.label) ||
    node.nodeType !== operation.nodeType ||
    node.domain !== operation.domain
  ) {
    return false;
  }

  const identityMatches = extractIdentityEntries(operation.properties).filter(([key, value]) =>
    propertyValueMatches(node.properties[key], value)
  );

  return identityMatches.length > 0 || extractIdentityEntries(operation.properties).length === 0;
}

function extractIdentityEntries(properties: Record<string, unknown>): Array<[string, unknown]> {
  const identityKeys = ['uri', 'externalId', 'iri', 'code', 'ontologyImport'];
  return identityKeys
    .filter((key) => key in properties)
    .map((key) => [key, properties[key]] as [string, unknown]);
}

function propertyValueMatches(left: unknown, right: unknown): boolean {
  return normalizePropertyValue(left) === normalizePropertyValue(right);
}

function normalizePropertyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    Array.isArray(value) ||
    typeof value === 'object'
  ) {
    return JSON.stringify(value);
  }

  return '';
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
