import { KnowledgeGraphEventType } from '@noema/events';
import type {
  ICkgMutationRejectedPayload,
  IPkgEdgeCreatedPayload,
  IPkgEdgeRemovedPayload,
  IPkgEdgeUpdatedPayload,
  IPkgNodeCreatedPayload,
  IPkgNodeRemovedPayload,
  IPkgNodeUpdatedPayload,
} from '@noema/events';
import {
  CkgNodeStatus,
  GraphType,
  PromotionBand,
  type GraphEdgeType,
  type IGraphNode,
  type Metadata,
  type MutationId,
  type NodeId,
  type UserId,
} from '@noema/types';
import type { IAggregationEvidenceRepository } from '../../../domain/knowledge-graph-service/aggregation-evidence.repository.js';
import type { IEvidenceSummary } from '../../../domain/knowledge-graph-service/aggregation-evidence.repository.js';
import type { ICkgMutationPipeline } from '../../../domain/knowledge-graph-service/ckg-mutation-pipeline.interface.js';
import {
  CkgOperationType,
  type CkgMutationOperation,
} from '../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import { isTerminalState } from '../../../domain/knowledge-graph-service/ckg-typestate.js';
import type { IGraphCrdtStatsRepository } from '../../../domain/knowledge-graph-service/crdt-stats.repository.js';
import type { IExecutionContext } from '../../../domain/knowledge-graph-service/execution-context.js';
import type { IGraphRepository } from '../../../domain/knowledge-graph-service/graph.repository.js';
import { PromotionBandUtil } from '../../../domain/knowledge-graph-service/value-objects/promotion-band.js';
import type { IEventPublisher } from '../../../domain/shared/event-publisher.js';
import type { Logger } from 'pino';

const AUTO_PROPOSAL_BAND = PromotionBand.WEAK;
const AGGREGATION_PROPOSER_ID = 'agent_aggregation-pipeline';
const NODE_MATCH_EVIDENCE = 'node_match';
const NODE_CANDIDATE_EVIDENCE = 'node_candidate';
const EDGE_MATCH_EVIDENCE = 'edge_match';
const AGGREGATION_EVIDENCE_RECORDED_EVENT = 'aggregation.evidence.recorded';
const AGGREGATION_THRESHOLD_REACHED_EVENT = 'aggregation.threshold.reached';
const AGGREGATION_PROPOSAL_CREATED_EVENT = 'aggregation.proposal.created';
const AGGREGATION_PROPOSAL_SUPPRESSED_EVENT = 'aggregation.proposal.suppressed';
const AGGREGATION_PROPOSAL_REJECTED_EVENT = 'aggregation.proposal.rejected';
const EDGE_WEIGHT_SIGNAL_DELTA = 0.1;
const MIN_SUPPORT_CONSENSUS_RATIO = 0.6;

interface IEnvelopeInfo {
  eventId: string | undefined;
  correlationId: string | undefined;
  timestamp: string | undefined;
}

interface INodeAggregationCandidate {
  kind: 'node';
  key: string;
  displayLabel: string;
  rationale: string;
  operations: CkgMutationOperation[];
}

interface IEdgeAggregationCandidate {
  kind: 'edge';
  key: string;
  displayLabel: string;
  rationale: string;
  operations: CkgMutationOperation[];
}

type AggregationCandidate = INodeAggregationCandidate | IEdgeAggregationCandidate;
type AggregationDirection = 'support' | 'oppose' | 'neutral';

interface IAggregationSignalState {
  readonly threshold: {
    readonly count: number;
    readonly band: PromotionBand;
  };
  readonly evidenceSummary: IEvidenceSummary;
  readonly activeLinkedMutationId: MutationId | null;
}

interface IAggregationConsensusSnapshot {
  readonly supportContributors: number;
  readonly opposeContributors: number;
  readonly neutralContributors: number;
  readonly netSupportContributors: number;
  readonly supportConsensusRatio: number;
  readonly achievedBand: PromotionBand;
  readonly totalEvidence: number;
  readonly averageConfidence: number;
}

function normalizeAggregationLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createNodeCandidateKey(input: {
  label: string;
  nodeType: IGraphNode['nodeType'];
  domain: string;
}): string {
  return `node:${normalizeAggregationLabel(input.label)}:${input.nodeType}:${input.domain.trim().toLowerCase()}`;
}

export class PkgAggregationApplicationService {
  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly aggregationEvidenceRepository: IAggregationEvidenceRepository,
    private readonly graphCrdtStatsRepository: IGraphCrdtStatsRepository,
    private readonly crdtReplicaId: string,
    private readonly mutationPipeline: ICkgMutationPipeline,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: Logger
  ) {}

  async processPkgNodeCreated(
    payload: IPkgNodeCreatedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.processNodeSignal(
      {
        sourceUserId: payload.userId,
        sourcePkgObjectId: payload.nodeId,
        label: payload.label,
        nodeType: payload.nodeType,
        domain: payload.domain,
        metadata: payload.metadata,
        direction: 'support',
        envelope,
        aggregationSource: KnowledgeGraphEventType.PKG_NODE_CREATED,
      },
      true
    );
  }

  async processPkgNodeUpdated(
    payload: IPkgNodeUpdatedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    const affectsIdentity = payload.changedFields.some((field) =>
      ['label', 'domain', 'nodeType'].includes(field)
    );
    if (!affectsIdentity) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.nodeId,
          reason: 'update_not_semantically_relevant',
        },
        envelope
      );
      return;
    }

    const node = await this.graphRepository.getNode(payload.nodeId, payload.userId);
    if (node === null) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.nodeId,
          reason: 'pkg_node_not_found_after_update',
        },
        envelope
      );
      return;
    }

    const previousNodeType = payload.previousValues['nodeType'];
    const previousLabel = payload.previousValues['label'];
    const previousDomain = payload.previousValues['domain'];
    if (
      typeof previousNodeType === 'string' &&
      typeof previousLabel === 'string' &&
      typeof previousDomain === 'string'
    ) {
      await this.processNodeSignal(
        {
          sourceUserId: payload.userId,
          sourcePkgObjectId: payload.nodeId,
          label: previousLabel,
          nodeType: previousNodeType as IGraphNode['nodeType'],
          domain: previousDomain,
          metadata: payload.previousValues,
          direction: 'oppose',
          envelope,
          aggregationSource: KnowledgeGraphEventType.PKG_NODE_UPDATED,
        },
        false
      );
    }

    await this.processNodeSignal(
      {
        sourceUserId: payload.userId,
        sourcePkgObjectId: node.nodeId,
        label: node.label,
        nodeType: node.nodeType,
        domain: node.domain,
        metadata: node.properties,
        direction: 'support',
        envelope,
        aggregationSource: KnowledgeGraphEventType.PKG_NODE_UPDATED,
      },
      true
    );
  }

  async processPkgNodeRemoved(
    payload: IPkgNodeRemovedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    if (payload.snapshot === undefined) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.nodeId,
          reason: 'node_removal_missing_snapshot',
        },
        envelope
      );
      return;
    }

    await this.processNodeSignal(
      {
        sourceUserId: payload.userId,
        sourcePkgObjectId: payload.nodeId,
        label: payload.snapshot.label,
        nodeType: payload.snapshot.nodeType,
        domain: payload.snapshot.domain,
        metadata: payload.snapshot.metadata,
        direction: 'oppose',
        envelope,
        aggregationSource: KnowledgeGraphEventType.PKG_NODE_REMOVED,
      },
      false
    );
  }

  async processPkgEdgeCreated(
    payload: IPkgEdgeCreatedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.processEdgeSignal(
      {
        sourceUserId: payload.userId,
        sourcePkgObjectId: payload.edgeId as unknown as NodeId,
        sourceNodeId: payload.sourceNodeId,
        targetNodeId: payload.targetNodeId,
        edgeType: payload.edgeType,
        confidence: payload.weight,
        metadata: {
          aggregationSource: KnowledgeGraphEventType.PKG_EDGE_CREATED,
          ...payload.metadata,
        },
        direction: 'support',
        envelope,
      },
      true
    );
  }

  async processPkgEdgeUpdated(
    payload: IPkgEdgeUpdatedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    if (!payload.changedFields.includes('weight')) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.edgeId as unknown as NodeId,
          reason: 'edge_update_not_semantically_relevant',
        },
        envelope
      );
      return;
    }

    const previousWeight = payload.previousValues['weight'];
    const nextWeight = payload.newValues['weight'];
    if (typeof previousWeight !== 'number' || typeof nextWeight !== 'number') {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.edgeId as unknown as NodeId,
          reason: 'edge_weight_update_missing_numeric_weights',
        },
        envelope
      );
      return;
    }

    const delta = nextWeight - previousWeight;
    const direction: AggregationDirection =
      delta >= EDGE_WEIGHT_SIGNAL_DELTA
        ? 'support'
        : delta <= -EDGE_WEIGHT_SIGNAL_DELTA
          ? 'oppose'
          : 'neutral';

    const edge = await this.graphRepository.getEdge(payload.edgeId as never);
    if (edge === null) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.edgeId as unknown as NodeId,
          reason: 'edge_not_found_after_update',
        },
        envelope
      );
      return;
    }

    await this.processEdgeSignal(
      {
        sourceUserId: payload.userId,
        sourcePkgObjectId: edge.edgeId as unknown as NodeId,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        edgeType: edge.edgeType,
        confidence: nextWeight,
        metadata: {
          aggregationSource: KnowledgeGraphEventType.PKG_EDGE_UPDATED,
          previousWeight,
          nextWeight,
          delta,
          ...payload.newValues,
        },
        direction,
        envelope,
      },
      false
    );
  }

  async processPkgEdgeRemoved(
    payload: IPkgEdgeRemovedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    if (payload.snapshot === undefined) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.edgeId as unknown as NodeId,
          reason: 'edge_removal_missing_snapshot',
        },
        envelope
      );
      return;
    }

    await this.processEdgeSignal(
      {
        sourceUserId: payload.userId,
        sourcePkgObjectId: payload.edgeId as unknown as NodeId,
        sourceNodeId: payload.snapshot.sourceNodeId,
        targetNodeId: payload.snapshot.targetNodeId,
        edgeType: payload.snapshot.edgeType,
        confidence: payload.snapshot.weight,
        metadata: {
          aggregationSource: KnowledgeGraphEventType.PKG_EDGE_REMOVED,
          ...payload.snapshot.metadata,
        },
        direction: 'oppose',
        envelope,
      },
      false
    );
  }

  async processAggregationMutationRejected(
    payload: ICkgMutationRejectedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    const mutation = await this.mutationPipeline.getMutation(payload.mutationId);
    if (mutation.proposedBy !== AGGREGATION_PROPOSER_ID) {
      return;
    }

    await this.eventPublisher.publish({
      eventType: AGGREGATION_PROPOSAL_REJECTED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId: payload.mutationId,
      payload: {
        mutationId: payload.mutationId,
        failedStage: payload.failedStage,
        reason: payload.reason,
        rejectedBy: payload.rejectedBy,
      },
      metadata: buildEventMetadata(envelope),
    });
  }

  private async processNodeSignal(
    input: {
      sourceUserId: UserId;
      sourcePkgObjectId: NodeId;
      label: string;
      nodeType: IGraphNode['nodeType'];
      domain: string;
      metadata: Metadata;
      direction: AggregationDirection;
      envelope: IEnvelopeInfo;
      aggregationSource: KnowledgeGraphEventType;
    },
    allowProposal: boolean
  ): Promise<void> {
    const suppressionReason = this.getNodeSuppressionReason(input.label, input.metadata);
    if (suppressionReason !== null) {
      await this.publishSuppressed(
        {
          sourceUserId: input.sourceUserId,
          sourcePkgNodeId: input.sourcePkgObjectId,
          proposedLabel: input.label.trim(),
          reason: suppressionReason,
        },
        input.envelope
      );
      return;
    }

    const canonicalNode = await this.resolveCanonicalNode({
      label: input.label,
      nodeType: input.nodeType,
      domain: input.domain,
    });
    const candidateKey =
      canonicalNode === null
        ? createNodeCandidateKey({
            label: input.label,
            nodeType: input.nodeType,
            domain: input.domain,
          })
        : undefined;
    const candidate =
      allowProposal && input.direction === 'support' && canonicalNode === null
        ? this.createNodeCandidate({
            nodeId: input.sourcePkgObjectId,
            userId: input.sourceUserId,
            nodeType: input.nodeType,
            label: input.label,
            domain: input.domain,
            metadata: input.metadata,
          })
        : null;

    await this.recordEvidenceAndMaybePropose({
      sourceUserId: input.sourceUserId,
      sourcePkgObjectId: input.sourcePkgObjectId,
      evidenceType: canonicalNode === null ? NODE_CANDIDATE_EVIDENCE : NODE_MATCH_EVIDENCE,
      targetNodeId: canonicalNode?.nodeId,
      targetKey: candidate?.key ?? candidateKey,
      targetDisplayLabel: canonicalNode === null ? input.label.trim() : undefined,
      candidate,
      confidence: canonicalNode === null ? 0.7 : 0.85,
      direction: input.direction,
      metadata: {
        aggregationSource: input.aggregationSource,
        observedLabel: input.label,
        domain: input.domain,
        nodeType: input.nodeType,
        ...input.metadata,
      },
      envelope: input.envelope,
    });
  }

  private async processEdgeSignal(
    input: {
      sourceUserId: UserId;
      sourcePkgObjectId: NodeId;
      sourceNodeId: NodeId;
      targetNodeId: NodeId;
      edgeType: GraphEdgeType;
      confidence: number;
      metadata: Metadata;
      direction: AggregationDirection;
      envelope: IEnvelopeInfo;
    },
    allowProposal: boolean
  ): Promise<void> {
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(input.sourceNodeId, input.sourceUserId),
      this.graphRepository.getNode(input.targetNodeId, input.sourceUserId),
    ]);

    if (sourceNode === null || targetNode === null) {
      await this.publishSuppressed(
        {
          sourceUserId: input.sourceUserId,
          sourcePkgNodeId: input.sourcePkgObjectId,
          reason: 'edge_endpoints_not_found',
        },
        input.envelope
      );
      return;
    }

    const sourceCanonical = await this.resolveCanonicalNode(sourceNode);
    const targetCanonical = await this.resolveCanonicalNode(targetNode);

    if (sourceCanonical === null || targetCanonical === null) {
      await this.publishSuppressed(
        {
          sourceUserId: input.sourceUserId,
          sourcePkgNodeId: input.sourcePkgObjectId,
          reason: 'edge_requires_canonicalized_endpoints',
          proposedLabel: createEdgeCandidateDisplayLabel(
            sourceNode.label,
            input.edgeType,
            targetNode.label
          ),
        },
        input.envelope
      );
      return;
    }

    const candidate = allowProposal
      ? this.createEdgeCandidate(
          {
            edgeId: input.sourcePkgObjectId as never,
            userId: input.sourceUserId,
            sourceNodeId: input.sourceNodeId,
            targetNodeId: input.targetNodeId,
            edgeType: input.edgeType,
            weight: input.confidence,
            metadata: input.metadata,
          },
          sourceCanonical,
          targetCanonical,
          sourceNode,
          targetNode
        )
      : null;

    if (allowProposal) {
      const existingCanonicalEdges = await this.graphRepository.findEdges({
        sourceNodeId: sourceCanonical.nodeId,
        targetNodeId: targetCanonical.nodeId,
        edgeType: input.edgeType,
      });
      if (existingCanonicalEdges.length > 0) {
        const existingEdgeAggregateId = createEdgeCandidateKey(
          sourceCanonical.nodeId,
          input.edgeType,
          targetCanonical.nodeId
        );
        await this.publishSuppressed(
          {
            aggregateId: existingEdgeAggregateId,
            sourceUserId: input.sourceUserId,
            sourcePkgNodeId: input.sourcePkgObjectId,
            reason: 'canonical_edge_already_exists',
            ckgTargetNodeId: sourceCanonical.nodeId,
            proposedLabel: createEdgeCandidateDisplayLabel(
              sourceNode.label,
              input.edgeType,
              targetNode.label
            ),
          },
          input.envelope
        );
        return;
      }
    }

    const targetKey = createEdgeCandidateKey(
      sourceCanonical.nodeId,
      input.edgeType,
      targetCanonical.nodeId
    );

    await this.recordEvidenceAndMaybePropose({
      sourceUserId: input.sourceUserId,
      sourcePkgObjectId: input.sourcePkgObjectId,
      evidenceType: EDGE_MATCH_EVIDENCE,
      targetNodeId: undefined,
      targetKey,
      targetDisplayLabel: createEdgeCandidateDisplayLabel(
        sourceNode.label,
        input.edgeType,
        targetNode.label
      ),
      candidate,
      confidence: input.confidence,
      direction: input.direction,
      metadata: {
        sourceCanonicalNodeId: sourceCanonical.nodeId,
        targetCanonicalNodeId: targetCanonical.nodeId,
        sourcePkgNodeId: input.sourceNodeId,
        targetPkgNodeId: input.targetNodeId,
        edgeType: input.edgeType,
        ...input.metadata,
      },
      envelope: input.envelope,
    });
  }

  private async recordEvidenceAndMaybePropose(input: {
    sourceUserId: UserId;
    sourcePkgObjectId: NodeId;
    evidenceType: string;
    confidence: number;
    direction: AggregationDirection;
    metadata: Metadata;
    envelope: IEnvelopeInfo;
    targetNodeId: NodeId | undefined;
    targetKey: string | undefined;
    targetDisplayLabel: string | undefined;
    candidate: AggregationCandidate | null | undefined;
  }): Promise<void> {
    const latestEvidence = await this.aggregationEvidenceRepository.findLatestEvidenceSignal({
      sourceUserId: input.sourceUserId,
      sourcePkgNodeId: input.sourcePkgObjectId,
      evidenceType: input.evidenceType,
      ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
      ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
    });

    if (latestEvidence?.direction === input.direction) {
      this.logger.debug(
        {
          sourcePkgObjectId: input.sourcePkgObjectId,
          evidenceId: latestEvidence.id,
          evidenceType: input.evidenceType,
          direction: input.direction,
        },
        'Skipping duplicate PKG aggregation evidence'
      );
      return;
    }

    const evidence = await this.aggregationEvidenceRepository.recordEvidence({
      sourceUserId: input.sourceUserId,
      sourcePkgNodeId: input.sourcePkgObjectId,
      evidenceType: input.evidenceType,
      confidence: normalizeConfidence(input.confidence) as never,
      direction: input.direction,
      ...(input.envelope.eventId !== undefined ? { sourceEventId: input.envelope.eventId } : {}),
      ...(input.envelope.timestamp !== undefined
        ? { sourceObservedAt: input.envelope.timestamp }
        : {}),
      metadata: {
        ...input.metadata,
        eventId: input.envelope.eventId ?? null,
        observedAt: input.envelope.timestamp ?? new Date().toISOString(),
      },
      ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
      ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
    });

    await this.graphCrdtStatsRepository.applyEvidenceSignal({
      evidenceId: evidence.id,
      replicaId: this.crdtReplicaId,
      graphType: 'ckg',
      targetKind: input.targetNodeId !== undefined ? 'ckg_node' : 'proposed_label',
      ...(input.targetNodeId !== undefined ? { targetNodeId: input.targetNodeId } : {}),
      ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
      evidenceType: input.evidenceType,
      direction: evidence.direction,
      confidence: input.confidence,
      sourceUserId: input.sourceUserId,
      metadata: input.metadata,
    });

    const threshold =
      input.targetNodeId !== undefined
        ? await this.aggregationEvidenceRepository.getEvidenceCountByBand(input.targetNodeId)
        : await this.aggregationEvidenceRepository.getEvidenceCountByProposedLabel(
            input.targetKey ?? ''
          );
    const evidenceSummary =
      input.targetNodeId !== undefined
        ? await this.aggregationEvidenceRepository.getEvidenceSummary(input.targetNodeId)
        : await this.aggregationEvidenceRepository.getEvidenceSummaryByProposedLabel(
            input.targetKey ?? ''
          );
    const linkedMutationId = await this.findActiveLinkedAggregationMutationId(
      input.targetNodeId,
      input.targetKey
    );
    const aggregationState: IAggregationSignalState = {
      threshold,
      evidenceSummary,
      activeLinkedMutationId: linkedMutationId,
    };
    const aggregateId = input.targetNodeId ?? input.targetKey ?? input.sourcePkgObjectId;

    await this.publishEvidenceRecorded(
      {
        aggregateId,
        evidenceId: evidence.id,
        sourceUserId: input.sourceUserId,
        sourcePkgNodeId: input.sourcePkgObjectId,
        evidenceType: input.evidenceType,
        direction: input.direction,
        evidenceCount: threshold.count,
        promotionBand: threshold.band,
        consensus: this.toConsensusMetadata(this.buildConsensusMetadata(evidenceSummary)),
        ...(input.targetKey !== undefined ? { candidateKey: input.targetKey } : {}),
        ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
        ...(input.targetDisplayLabel !== undefined
          ? { proposedLabel: input.targetDisplayLabel }
          : {}),
      },
      input.envelope
    );

    const proposalSuppressionReason = this.getProposalSuppressionReason(evidenceSummary);
    if (linkedMutationId !== null && proposalSuppressionReason !== null) {
      await this.reconsiderLinkedAggregationMutation(
        linkedMutationId,
        proposalSuppressionReason,
        aggregationState,
        input
      );
    }

    if (input.candidate === null || input.candidate === undefined) {
      return;
    }

    if (proposalSuppressionReason !== null) {
      await this.publishSuppressed(
        {
          aggregateId,
          sourceUserId: input.sourceUserId,
          sourcePkgNodeId: input.sourcePkgObjectId,
          reason: proposalSuppressionReason,
          evidenceCount: threshold.count,
          consensus: this.toConsensusMetadata(this.buildConsensusMetadata(evidenceSummary)),
          ...(input.targetKey !== undefined ? { candidateKey: input.targetKey } : {}),
          ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
          ...(input.targetDisplayLabel !== undefined
            ? { proposedLabel: input.targetDisplayLabel }
            : {}),
        },
        input.envelope
      );
      return;
    }

    if (!PromotionBandUtil.meetsThreshold(AUTO_PROPOSAL_BAND, threshold.count)) {
      return;
    }

    await this.publishThresholdReached(
      {
        aggregateId,
        sourceUserId: input.sourceUserId,
        sourcePkgNodeId: input.sourcePkgObjectId,
        evidenceCount: threshold.count,
        promotionBand: threshold.band,
        consensus: this.toConsensusMetadata(this.buildConsensusMetadata(evidenceSummary)),
        ...(input.targetKey !== undefined ? { candidateKey: input.targetKey } : {}),
        ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
        ...(input.targetDisplayLabel !== undefined
          ? { proposedLabel: input.targetDisplayLabel }
          : {}),
      },
      input.envelope
    );

    if (linkedMutationId !== null) {
      this.logger.debug(
        { candidateKey: input.candidate.key, mutationId: linkedMutationId },
        'Skipping aggregation proposal because evidence already links to a mutation'
      );
      return;
    }

    const context: IExecutionContext = {
      userId: null,
      correlationId: (input.envelope.correlationId ??
        `corr_agg_${Date.now().toString(36)}`) as never,
      roles: ['system'],
    };

    try {
      const mutation = await this.mutationPipeline.proposeFromAggregation(
        input.candidate.operations,
        this.buildProposalRationale(input.candidate.rationale, evidenceSummary),
        threshold.count,
        context
      );

      await this.aggregationEvidenceRepository.linkEvidenceToMutation({
        mutationId: mutation.mutationId,
        ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
        ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
      });

      await this.publishProposalCreated(
        {
          aggregateId,
          mutationId: mutation.mutationId,
          sourceUserId: input.sourceUserId,
          sourcePkgNodeId: input.sourcePkgObjectId,
          evidenceCount: threshold.count,
          operationCount: input.candidate.operations.length,
          consensus: this.toConsensusMetadata(this.buildConsensusMetadata(evidenceSummary)),
          ...(input.targetKey !== undefined ? { candidateKey: input.targetKey } : {}),
          ...(input.targetDisplayLabel !== undefined
            ? { proposedLabel: input.targetDisplayLabel }
            : {}),
        },
        input.envelope
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { reason, candidateKey: input.candidate.key },
        'Aggregation proposal creation failed'
      );
      await this.eventPublisher.publish({
        eventType: AGGREGATION_PROPOSAL_REJECTED_EVENT,
        aggregateType: 'KnowledgeAggregation',
        aggregateId: input.candidate.key,
        payload: {
          mutationId: null,
          failedStage: 'proposed',
          reason,
          rejectedBy: AGGREGATION_PROPOSER_ID,
        },
        metadata: buildEventMetadata(input.envelope, input.sourceUserId),
      });
    }
  }

  private buildProposalRationale(baseRationale: string, summary: IEvidenceSummary): string {
    const consensus = this.buildConsensusMetadata(summary);
    return (
      `${baseRationale} ` +
      `Consensus snapshot: support=${String(consensus.supportContributors)}, ` +
      `oppose=${String(consensus.opposeContributors)}, ` +
      `neutral=${String(consensus.neutralContributors)}, ` +
      `net=${String(consensus.netSupportContributors)}, ` +
      `supportRatio=${consensus.supportConsensusRatio.toFixed(2)}.`
    );
  }

  private buildConsensusMetadata(summary: IEvidenceSummary): IAggregationConsensusSnapshot {
    const support = summary.directionalContributorCount.support;
    const oppose = summary.directionalContributorCount.oppose;
    const neutral = summary.directionalContributorCount.neutral;
    const contestedContributorTotal = support + oppose;
    const supportConsensusRatio =
      contestedContributorTotal === 0 ? 1 : support / contestedContributorTotal;

    return {
      supportContributors: support,
      opposeContributors: oppose,
      neutralContributors: neutral,
      netSupportContributors: summary.netSupportContributorCount,
      supportConsensusRatio,
      achievedBand: summary.achievedBand,
      totalEvidence: summary.totalCount,
      averageConfidence: summary.averageConfidence,
    };
  }

  private toConsensusMetadata(consensus: IAggregationConsensusSnapshot): Metadata {
    return {
      supportContributors: consensus.supportContributors,
      opposeContributors: consensus.opposeContributors,
      neutralContributors: consensus.neutralContributors,
      netSupportContributors: consensus.netSupportContributors,
      supportConsensusRatio: consensus.supportConsensusRatio,
      achievedBand: consensus.achievedBand,
      totalEvidence: consensus.totalEvidence,
      averageConfidence: consensus.averageConfidence,
    };
  }

  private async findActiveLinkedAggregationMutationId(
    targetNodeId: NodeId | undefined,
    targetKey: string | undefined
  ): Promise<MutationId | null> {
    const evidenceRecords = await this.aggregationEvidenceRepository.getLinkedMutationIds(
      targetNodeId !== undefined
        ? { ckgTargetNodeId: targetNodeId }
        : { proposedLabel: targetKey ?? '' }
    );
    const mutationIds = [...evidenceRecords];

    if (mutationIds.length === 0) {
      return null;
    }

    const activeMutations = await this.mutationPipeline.listActiveMutationsByIds(mutationIds);
    const activeById = new Map(
      activeMutations.map((mutation) => [mutation.mutationId, mutation] as const)
    );
    for (const mutationId of mutationIds) {
      const mutation = activeById.get(mutationId);
      if (mutation?.proposedBy === AGGREGATION_PROPOSER_ID && !isTerminalState(mutation.state)) {
        return mutation.mutationId;
      }
    }

    return null;
  }

  private async reconsiderLinkedAggregationMutation(
    mutationId: MutationId,
    suppressionReason: string,
    state: IAggregationSignalState,
    input: {
      sourceUserId: UserId;
      sourcePkgObjectId: NodeId;
      envelope: IEnvelopeInfo;
      targetNodeId: NodeId | undefined;
      targetKey: string | undefined;
      candidate: AggregationCandidate | null | undefined;
    }
  ): Promise<void> {
    const mutation = await this.mutationPipeline.getMutation(mutationId);
    if (mutation.proposedBy !== AGGREGATION_PROPOSER_ID || isTerminalState(mutation.state)) {
      return;
    }

    const context: IExecutionContext = {
      userId: null,
      correlationId: (input.envelope.correlationId ??
        `corr_agg_reconsider_${Date.now().toString(36)}`) as never,
      roles: ['system'],
    };
    const reviewReason =
      `Aggregation proposal reconsidered after counter-evidence. ` +
      `Reason=${suppressionReason}; support=${String(state.evidenceSummary.directionalContributorCount.support)}; ` +
      `oppose=${String(state.evidenceSummary.directionalContributorCount.oppose)}; ` +
      `net=${String(state.evidenceSummary.netSupportContributorCount)}.`;

    if (mutation.state === 'pending_review') {
      await this.mutationPipeline.rejectEscalatedMutation(
        mutationId,
        AGGREGATION_PROPOSER_ID,
        reviewReason,
        context
      );
    } else if (mutation.state === 'proposed' || mutation.state === 'validating') {
      await this.mutationPipeline.cancelMutation(mutationId, context);
    } else {
      await this.mutationPipeline.rejectStuckMutation(
        mutationId,
        AGGREGATION_PROPOSER_ID,
        reviewReason,
        context
      );
    }

    await this.publishSuppressed(
      {
        aggregateId: input.targetNodeId ?? input.targetKey ?? mutationId,
        sourceUserId: input.sourceUserId,
        sourcePkgNodeId: input.sourcePkgObjectId,
        reason: `reconsidered_${suppressionReason}`,
        evidenceCount: state.threshold.count,
        mutationId,
        consensus: this.toConsensusMetadata(this.buildConsensusMetadata(state.evidenceSummary)),
        ...(input.targetKey !== undefined ? { candidateKey: input.targetKey } : {}),
        ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
        ...(input.candidate?.displayLabel !== undefined
          ? { proposedLabel: input.candidate.displayLabel }
          : {}),
      },
      input.envelope
    );
  }

  private createNodeCandidate(payload: IPkgNodeCreatedPayload): INodeAggregationCandidate {
    return {
      kind: 'node',
      key: createNodeCandidateKey({
        label: payload.label,
        nodeType: payload.nodeType,
        domain: payload.domain,
      }),
      displayLabel: payload.label.trim(),
      rationale: `Promote "${payload.label}" into the canonical graph from convergent PKG node signals.`,
      operations: [
        {
          type: CkgOperationType.ADD_NODE,
          nodeType: payload.nodeType,
          label: payload.label.trim(),
          description:
            typeof payload.metadata['description'] === 'string'
              ? payload.metadata['description']
              : `Aggregated canonical concept promoted from learner PKGs.`,
          domain: payload.domain,
          status: CkgNodeStatus.ACTIVE,
          aliases: [],
          languages: [],
          tags: ['aggregated-from-pkg'],
          semanticHints: [],
          canonicalExternalRefs: [],
          ontologyMappings: [],
          provenance: [],
          reviewMetadata: null,
          sourceCoverage: null,
          properties: {
            aggregation: {
              source: 'pkg_aggregation',
            },
          },
        },
      ],
    };
  }

  private createEdgeCandidate(
    payload: IPkgEdgeCreatedPayload,
    sourceCanonical: IGraphNode,
    targetCanonical: IGraphNode,
    sourceNode: IGraphNode,
    targetNode: IGraphNode
  ): IEdgeAggregationCandidate {
    const key = createEdgeCandidateKey(
      sourceCanonical.nodeId,
      payload.edgeType,
      targetCanonical.nodeId
    );
    return {
      kind: 'edge',
      key,
      displayLabel: createEdgeCandidateDisplayLabel(
        sourceNode.label,
        payload.edgeType,
        targetNode.label
      ),
      rationale:
        `Promote relation ${payload.edgeType} between "${sourceCanonical.label}" and ` +
        `"${targetCanonical.label}" from convergent PKG edge signals.`,
      operations: [
        {
          type: CkgOperationType.ADD_EDGE,
          edgeType: payload.edgeType,
          sourceNodeId: sourceCanonical.nodeId,
          targetNodeId: targetCanonical.nodeId,
          weight: payload.weight,
          rationale:
            `Observed stable ${payload.edgeType} relation across learner PKGs ` +
            `between "${sourceNode.label}" and "${targetNode.label}".`,
        },
      ],
    };
  }

  private async resolveCanonicalNode(
    input: IGraphNode | { label: string; nodeType: IGraphNode['nodeType']; domain: string }
  ): Promise<IGraphNode | null> {
    const normalizedTarget = normalizeAggregationLabel(input.label);
    const pageSize = 100;
    for (let offset = 0; offset < 1000; offset += pageSize) {
      const candidates = await this.graphRepository.findNodes(
        {
          graphType: GraphType.CKG,
          includeDeleted: false,
          labelContains: input.label.trim(),
          nodeType: input.nodeType,
          domain: input.domain,
        },
        pageSize,
        offset
      );

      const exactMatch =
        candidates.find(
          (candidate) =>
            normalizeAggregationLabel(candidate.label) === normalizedTarget &&
            candidate.nodeType === input.nodeType &&
            candidate.domain === input.domain
        ) ?? null;
      if (exactMatch !== null) {
        return exactMatch;
      }

      if (candidates.length < pageSize) {
        break;
      }
    }

    return null;
  }

  private getNodeSuppressionReason(label: string, metadata: Metadata): string | null {
    if (label.trim().length < 3) {
      return 'label_too_short';
    }

    if (metadata['personalOnly'] === true) {
      return 'personal_only_signal';
    }

    if (metadata['isMnemonic'] === true) {
      return 'local_mnemonic_signal';
    }

    return null;
  }

  private getProposalSuppressionReason(summary: IEvidenceSummary): string | null {
    const support = summary.directionalContributorCount.support;
    const oppose = summary.directionalContributorCount.oppose;
    const contestedContributorTotal = support + oppose;
    const supportConsensusRatio =
      contestedContributorTotal === 0 ? 1 : support / contestedContributorTotal;

    if (summary.netSupportContributorCount <= 0) {
      return 'counter_evidence_outweighs_support';
    }

    if (oppose > 0 && supportConsensusRatio < MIN_SUPPORT_CONSENSUS_RATIO) {
      return 'support_consensus_too_weak';
    }

    return null;
  }

  private async publishEvidenceRecorded(
    input: {
      aggregateId?: string;
      evidenceId: string;
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      evidenceType: string;
      direction: AggregationDirection;
      evidenceCount: number;
      promotionBand: PromotionBand;
      consensus?: Metadata;
      ckgTargetNodeId?: NodeId;
      candidateKey?: string;
      proposedLabel?: string;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_EVIDENCE_RECORDED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId:
        input.aggregateId ?? input.ckgTargetNodeId ?? input.proposedLabel ?? input.evidenceId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }

  private async publishThresholdReached(
    input: {
      aggregateId?: string;
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      evidenceCount: number;
      promotionBand: PromotionBand;
      consensus?: Metadata;
      ckgTargetNodeId?: NodeId;
      candidateKey?: string;
      proposedLabel?: string;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_THRESHOLD_REACHED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId:
        input.aggregateId ?? input.ckgTargetNodeId ?? input.proposedLabel ?? input.sourcePkgNodeId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }

  private async publishProposalCreated(
    input: {
      aggregateId?: string;
      mutationId: string;
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      evidenceCount: number;
      operationCount: number;
      consensus?: Metadata;
      candidateKey?: string;
      proposedLabel?: string;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_PROPOSAL_CREATED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId: input.aggregateId ?? input.proposedLabel ?? input.mutationId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }

  private async publishSuppressed(
    input: {
      aggregateId?: string;
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      reason: string;
      ckgTargetNodeId?: NodeId;
      candidateKey?: string;
      proposedLabel?: string;
      evidenceCount?: number;
      mutationId?: MutationId;
      consensus?: Metadata;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_PROPOSAL_SUPPRESSED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId:
        input.aggregateId ?? input.ckgTargetNodeId ?? input.proposedLabel ?? input.sourcePkgNodeId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }
}

function buildEventMetadata(
  envelope: IEnvelopeInfo,
  userId?: UserId | null
): {
  correlationId: IExecutionContext['correlationId'];
  userId?: UserId | null;
  causationId?: string;
} {
  return {
    correlationId: (envelope.correlationId ?? `corr_agg_${Date.now().toString(36)}`) as never,
    ...(userId !== undefined ? { userId } : {}),
    ...(envelope.eventId !== undefined ? { causationId: envelope.eventId } : {}),
  };
}

function createEdgeCandidateKey(
  sourceCanonicalNodeId: NodeId,
  edgeType: GraphEdgeType,
  targetCanonicalNodeId: NodeId
): string {
  return `edge:${sourceCanonicalNodeId}:${edgeType}:${targetCanonicalNodeId}`;
}

function createEdgeCandidateDisplayLabel(
  sourceLabel: string,
  edgeType: GraphEdgeType,
  targetLabel: string
): string {
  return `${sourceLabel.trim()} ${edgeType} ${targetLabel.trim()}`;
}

function normalizeConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0.5;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
