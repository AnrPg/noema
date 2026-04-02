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
  type NodeId,
  type UserId,
} from '@noema/types';
import type { IAggregationEvidenceRepository } from '../../../domain/knowledge-graph-service/aggregation-evidence.repository.js';
import type { ICkgMutationPipeline } from '../../../domain/knowledge-graph-service/ckg-mutation-pipeline.interface.js';
import {
  CkgOperationType,
  type CkgMutationOperation,
} from '../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
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

export class PkgAggregationApplicationService {
  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly aggregationEvidenceRepository: IAggregationEvidenceRepository,
    private readonly mutationPipeline: ICkgMutationPipeline,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: Logger
  ) {}

  async processPkgNodeCreated(
    payload: IPkgNodeCreatedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    const suppressionReason = this.getNodeSuppressionReason(payload.label, payload.metadata);
    if (suppressionReason !== null) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.nodeId,
          proposedLabel: payload.label.trim(),
          reason: suppressionReason,
        },
        envelope
      );
      return;
    }

    const canonicalNode = await this.resolveCanonicalNode({
      label: payload.label,
      nodeType: payload.nodeType,
      domain: payload.domain,
    });
    const candidate = canonicalNode === null ? this.createNodeCandidate(payload) : null;

    await this.recordEvidenceAndMaybePropose({
      sourceUserId: payload.userId,
      sourcePkgObjectId: payload.nodeId,
      evidenceType: canonicalNode === null ? NODE_CANDIDATE_EVIDENCE : NODE_MATCH_EVIDENCE,
      targetNodeId: canonicalNode?.nodeId,
      targetKey: candidate?.key,
      candidate,
      confidence: canonicalNode === null ? 0.7 : 0.85,
      metadata: {
        aggregationSource: KnowledgeGraphEventType.PKG_NODE_CREATED,
        observedLabel: payload.label,
        domain: payload.domain,
        nodeType: payload.nodeType,
      },
      envelope,
    });
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

    await this.processPkgNodeCreated(
      {
        nodeId: node.nodeId,
        userId: payload.userId,
        nodeType: node.nodeType,
        label: node.label,
        domain: node.domain,
        metadata: node.properties,
      },
      envelope
    );
  }

  async processPkgNodeRemoved(
    payload: IPkgNodeRemovedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.publishSuppressed(
      {
        sourceUserId: payload.userId,
        sourcePkgNodeId: payload.nodeId,
        reason: 'removal_does_not_create_positive_aggregation_evidence',
      },
      envelope
    );
  }

  async processPkgEdgeCreated(
    payload: IPkgEdgeCreatedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(payload.sourceNodeId, payload.userId),
      this.graphRepository.getNode(payload.targetNodeId, payload.userId),
    ]);

    if (sourceNode === null || targetNode === null) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.sourceNodeId,
          reason: 'edge_endpoints_not_found',
        },
        envelope
      );
      return;
    }

    const sourceCanonical = await this.resolveCanonicalNode(sourceNode);
    const targetCanonical = await this.resolveCanonicalNode(targetNode);

    if (sourceCanonical === null || targetCanonical === null) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.sourceNodeId,
          reason: 'edge_requires_canonicalized_endpoints',
          proposedLabel: createEdgeCandidateDisplayLabel(
            sourceNode.label,
            payload.edgeType,
            targetNode.label
          ),
        },
        envelope
      );
      return;
    }

    const existingCanonicalEdges = await this.graphRepository.findEdges({
      sourceNodeId: sourceCanonical.nodeId,
      targetNodeId: targetCanonical.nodeId,
      edgeType: payload.edgeType,
    });
    if (existingCanonicalEdges.length > 0) {
      await this.publishSuppressed(
        {
          sourceUserId: payload.userId,
          sourcePkgNodeId: payload.sourceNodeId,
          reason: 'canonical_edge_already_exists',
          ckgTargetNodeId: sourceCanonical.nodeId,
          proposedLabel: createEdgeCandidateKey(
            sourceCanonical.nodeId,
            payload.edgeType,
            targetCanonical.nodeId
          ),
        },
        envelope
      );
      return;
    }

    const candidate = this.createEdgeCandidate(
      payload,
      sourceCanonical,
      targetCanonical,
      sourceNode,
      targetNode
    );

    await this.recordEvidenceAndMaybePropose({
      sourceUserId: payload.userId,
      sourcePkgObjectId: payload.sourceNodeId,
      evidenceType: EDGE_MATCH_EVIDENCE,
      targetNodeId: undefined,
      targetKey: candidate.key,
      candidate,
      confidence: payload.weight,
      metadata: {
        aggregationSource: KnowledgeGraphEventType.PKG_EDGE_CREATED,
        edgeType: payload.edgeType,
        sourceCanonicalNodeId: sourceCanonical.nodeId,
        targetCanonicalNodeId: targetCanonical.nodeId,
        sourcePkgNodeId: payload.sourceNodeId,
        targetPkgNodeId: payload.targetNodeId,
      },
      envelope,
    });
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

    await this.publishSuppressed(
      {
        sourceUserId: payload.userId,
        sourcePkgNodeId: payload.edgeId as unknown as NodeId,
        reason: 'edge_weight_updates_do_not_create_new_relation_candidates',
      },
      envelope
    );
  }

  async processPkgEdgeRemoved(
    payload: IPkgEdgeRemovedPayload,
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.publishSuppressed(
      {
        sourceUserId: payload.userId,
        sourcePkgNodeId: payload.edgeId as unknown as NodeId,
        reason: 'edge_removal_does_not_create_positive_aggregation_evidence',
      },
      envelope
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

  private async recordEvidenceAndMaybePropose(input: {
    sourceUserId: UserId;
    sourcePkgObjectId: NodeId;
    evidenceType: string;
    confidence: number;
    metadata: Metadata;
    envelope: IEnvelopeInfo;
    targetNodeId: NodeId | undefined;
    targetKey: string | undefined;
    candidate: AggregationCandidate | null | undefined;
  }): Promise<void> {
    const existingEvidence = await this.aggregationEvidenceRepository.findEvidence({
      sourceUserId: input.sourceUserId,
      sourcePkgNodeId: input.sourcePkgObjectId,
      evidenceType: input.evidenceType,
      ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
      ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
    });

    if (existingEvidence !== null) {
      this.logger.debug(
        {
          sourcePkgObjectId: input.sourcePkgObjectId,
          evidenceId: existingEvidence.id,
          evidenceType: input.evidenceType,
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
      metadata: {
        ...input.metadata,
        eventId: input.envelope.eventId ?? null,
        observedAt: input.envelope.timestamp ?? new Date().toISOString(),
      },
      ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
      ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
    });

    const threshold =
      input.targetNodeId !== undefined
        ? await this.aggregationEvidenceRepository.getEvidenceCountByBand(input.targetNodeId)
        : await this.aggregationEvidenceRepository.getEvidenceCountByProposedLabel(
            input.targetKey ?? ''
          );

    await this.publishEvidenceRecorded(
      {
        evidenceId: evidence.id,
        sourceUserId: input.sourceUserId,
        sourcePkgNodeId: input.sourcePkgObjectId,
        evidenceType: input.evidenceType,
        evidenceCount: threshold.count,
        promotionBand: threshold.band,
        ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
        ...(input.targetKey !== undefined ? { proposedLabel: input.targetKey } : {}),
      },
      input.envelope
    );

    if (input.candidate === null || input.candidate === undefined) {
      return;
    }

    if (!PromotionBandUtil.meetsThreshold(AUTO_PROPOSAL_BAND, threshold.count)) {
      return;
    }

    await this.publishThresholdReached(
      {
        sourceUserId: input.sourceUserId,
        sourcePkgNodeId: input.sourcePkgObjectId,
        evidenceCount: threshold.count,
        promotionBand: threshold.band,
        ...(input.targetNodeId !== undefined ? { ckgTargetNodeId: input.targetNodeId } : {}),
        proposedLabel: input.candidate.displayLabel,
      },
      input.envelope
    );

    const evidenceRecords = await this.aggregationEvidenceRepository.getEvidenceForProposedLabel(
      input.candidate.key
    );
    const linkedMutation = evidenceRecords.find((record) => record.mutationId !== null)?.mutationId;
    if (linkedMutation !== undefined && linkedMutation !== null) {
      this.logger.debug(
        { candidateKey: input.candidate.key, mutationId: linkedMutation },
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
        input.candidate.rationale,
        threshold.count,
        context
      );

      await this.aggregationEvidenceRepository.linkEvidenceToMutation({
        mutationId: mutation.mutationId,
        proposedLabel: input.candidate.key,
      });

      await this.publishProposalCreated(
        {
          mutationId: mutation.mutationId,
          sourceUserId: input.sourceUserId,
          sourcePkgNodeId: input.sourcePkgObjectId,
          evidenceCount: threshold.count,
          operationCount: input.candidate.operations.length,
          proposedLabel: input.candidate.displayLabel,
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

  private createNodeCandidate(payload: IPkgNodeCreatedPayload): INodeAggregationCandidate {
    return {
      kind: 'node',
      key: payload.label.trim(),
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
    const candidates = await this.graphRepository.findNodes(
      {
        graphType: GraphType.CKG,
        includeDeleted: false,
        labelContains: input.label,
        nodeType: input.nodeType,
        domain: input.domain,
      },
      20,
      0
    );

    const normalizedTarget = normalizeLabel(input.label);
    return (
      candidates.find(
        (candidate) =>
          normalizeLabel(candidate.label) === normalizedTarget &&
          candidate.nodeType === input.nodeType &&
          candidate.domain === input.domain
      ) ?? null
    );
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

  private async publishEvidenceRecorded(
    input: {
      evidenceId: string;
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      evidenceType: string;
      evidenceCount: number;
      promotionBand: PromotionBand;
      ckgTargetNodeId?: NodeId;
      proposedLabel?: string;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_EVIDENCE_RECORDED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId: input.ckgTargetNodeId ?? input.proposedLabel ?? input.evidenceId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }

  private async publishThresholdReached(
    input: {
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      evidenceCount: number;
      promotionBand: PromotionBand;
      ckgTargetNodeId?: NodeId;
      proposedLabel?: string;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_THRESHOLD_REACHED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId: input.ckgTargetNodeId ?? input.proposedLabel ?? input.sourcePkgNodeId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }

  private async publishProposalCreated(
    input: {
      mutationId: string;
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      evidenceCount: number;
      operationCount: number;
      proposedLabel?: string;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_PROPOSAL_CREATED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId: input.proposedLabel ?? input.mutationId,
      payload: input,
      metadata: buildEventMetadata(envelope, input.sourceUserId),
    });
  }

  private async publishSuppressed(
    input: {
      sourceUserId: UserId;
      sourcePkgNodeId: NodeId;
      reason: string;
      ckgTargetNodeId?: NodeId;
      proposedLabel?: string;
      evidenceCount?: number;
    },
    envelope: IEnvelopeInfo
  ): Promise<void> {
    await this.eventPublisher.publish({
      eventType: AGGREGATION_PROPOSAL_SUPPRESSED_EVENT,
      aggregateType: 'KnowledgeAggregation',
      aggregateId: input.ckgTargetNodeId ?? input.proposedLabel ?? input.sourcePkgNodeId,
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

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
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
