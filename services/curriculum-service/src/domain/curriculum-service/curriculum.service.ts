import type {
  ICurriculum,
  ICurriculumProgress,
  ICurriculumRevisionProposal,
  ICreateCurriculumInput,
  IGenerateCurriculumInput,
  IRealignmentEvidence,
  IRecordCurriculumEvaluationInput,
  IRecordRealignmentEvidenceInput,
  ISessionSlice,
  ISessionSliceRequest,
} from '@noema/contracts';
import {
  CurriculumEdgeType,
  CurriculumOriginMode,
  CurriculumRevisionReason,
  ID_PREFIXES,
  RevisionChangeKind,
  RevisionChangeState,
} from '@noema/types';
import type {
  CorrelationId,
  CurriculumEdgeId,
  CurriculumId,
  CurriculumNodeId,
  CurriculumVersionId,
  RevisionChangeId,
  RevisionProposalId,
  UserId,
} from '@noema/types';
import type { PrismaClient, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import type {
  CurriculumEvidenceAccumulatedPayload,
  CurriculumFrontierUpdatedPayload,
  CurriculumLifecyclePayload,
  CurriculumNodeRuntimePayload,
  CurriculumProgressUpdatedPayload,
  CurriculumRevisionPayload,
  SessionCurriculumSliceSelectedPayload,
} from '@noema/events';
import {
  branchInfoForNode,
  branchStatesFromCurriculum,
  curriculumMetadataWithBranchStates,
  composeSessionSlice,
  computeFrontier,
  CURRICULUM_TRIGGER_POLICY,
  mapContractNodeBranchInfo,
  shouldGenerateRevisionProposal,
  updateProgressFromEvaluation,
  validateCurriculumDag,
} from './index.js';
import type { CurriculumRepository } from './curriculum.repository.js';
import type {
  CurriculumBranchState,
  CurriculumNode,
  CurriculumVersionGraph,
} from './curriculum.types.js';
import type { CurriculumEventPublisherPort } from './event-publisher.port.js';
import type {
  ICurriculumDesignAgentClient,
  IKnowledgeGraphClient,
  IPedagogyGuardianClient,
  ISchedulerClient,
} from './external-ports.js';

export class CurriculumService {
  constructor(
    private readonly repository: CurriculumRepository,
    private readonly schedulerClient: ISchedulerClient,
    private readonly eventPublisher: CurriculumEventPublisherPort | undefined,
    private readonly prisma: PrismaClient,
    private readonly knowledgeGraphClient?: IKnowledgeGraphClient,
    private readonly pedagogyGuardianClient?: IPedagogyGuardianClient,
    private readonly curriculumDesignAgentClient?: ICurriculumDesignAgentClient
  ) {}

  private correlationId(userId: UserId, correlationId?: CorrelationId): CorrelationId {
    return (
      correlationId ?? (`cor_curriculum_${userId}_${Date.now().toString(36)}` as CorrelationId)
    );
  }

  private branchStatesAfterProgress(
    currentStates: CurriculumBranchState[],
    node: CurriculumNode,
    runtimeState: string
  ): CurriculumBranchState[] {
    const branchInfo = branchInfoForNode(node);
    if (branchInfo?.branchGroupKey === undefined) return currentStates;
    const driftState =
      branchInfo.pathRole === 'diversion'
        ? 'exploring_diversion'
        : branchInfo.pathRole === 'remediation'
          ? 'remediation_loop'
          : runtimeState === 'completed'
            ? 'rejoined'
            : 'on_path';
    return mergeBranchStates(currentStates, {
      branchGroupKey: branchInfo.branchGroupKey,
      selectedPathRole: branchInfo.pathRole,
      selectedNodeKey: node.stableNodeKey,
      selectionSource: 'learner_progress',
      selectedAt: nowIso(),
      lastConfirmedAt: nowIso(),
      driftState: driftState as CurriculumBranchState['driftState'],
    });
  }

  listCurricula(userId: UserId): Promise<ICurriculum[]> {
    return this.repository.listByUser(userId, false);
  }

  async createCurriculum(
    userId: UserId,
    input: ICreateCurriculumInput,
    correlationId?: CorrelationId
  ): Promise<ICurriculum> {
    const payload: CurriculumLifecyclePayload = {
      userId,
      curriculumId: '' as CurriculumId,
    };
    const resolvedCorrelationId = this.correlationId(userId, correlationId);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const curriculum = await this.repository.create(userId, input, tx);
      payload.curriculumId = curriculum.id;
      await this.eventPublisher?.publish('curriculum.created', payload, {
        correlationId: resolvedCorrelationId,
        tx,
      });
      return curriculum;
    });
  }

  async generateCurriculum(
    userId: UserId,
    input: IGenerateCurriculumInput & { title?: string; sourceDocumentIds?: string[] },
    correlationId?: CorrelationId
  ): Promise<ICurriculum> {
    const resolvedCorrelationId = this.correlationId(userId, correlationId);
    const curriculum = await this.createCurriculum(
      userId,
      {
        title: input.title ?? input.goal.slice(0, 120),
        goal: input.goal,
        domain: input.domain,
        originMode: CurriculumOriginMode.DOCUMENT_DERIVED,
      },
      resolvedCorrelationId
    );
    const versionId = `${ID_PREFIXES.CurriculumVersionId}${nanoid(21)}` as CurriculumVersionId;
    const rootConceptIds = input.rootConceptIds ?? [];
    const agentDraft =
      this.curriculumDesignAgentClient !== undefined
        ? await this.curriculumDesignAgentClient.generateDraft({
            userId,
            goal: input.goal,
            domain: input.domain,
            conceptIds: rootConceptIds,
            documentIds: input.sourceDocumentIds ?? [],
            studyMode: (input as unknown as Record<string, unknown>)['studyMode'],
            executionPreference: 'realtime',
          })
        : undefined;
    const graph =
      agentDraft !== undefined
        ? normalizeAgentDraftGraph(agentDraft, versionId, input.sourceDocumentIds ?? [])
        : {
            id: versionId,
            nodes: rootConceptIds.map((conceptId, index) => ({
              id: `${ID_PREFIXES.CurriculumNodeId}${nanoid(21)}` as CurriculumNodeId,
              curriculumVersionId: versionId,
              stableNodeKey: `doc-root-${String(index)}-${conceptId}`,
              ckgConceptId: conceptId,
              label: `Document concept ${String(index + 1)}`,
              learningObjective: `Understand and apply concept ${String(index + 1)} from ${curriculum.title}.`,
              stabilityThreshold: 0.8,
              estimatedSessions: 1,
              traversalWeight: index + 1,
              metadata: { sourceDocumentIds: input.sourceDocumentIds ?? [] },
            })),
            edges: [],
          };
    const fallbackGraph =
      graph.nodes.length > 0
        ? graph
        : {
            id: versionId,
            nodes: [
              {
                id: `${ID_PREFIXES.CurriculumNodeId}${nanoid(21)}` as CurriculumNodeId,
                curriculumVersionId: versionId,
                stableNodeKey: 'document-overview',
                proposedConcept: {
                  label: curriculum.title,
                  sourceDocumentIds: input.sourceDocumentIds ?? [],
                },
                label: curriculum.title,
                learningObjective: input.goal,
                stabilityThreshold: 0.8,
                estimatedSessions: 1,
                traversalWeight: 1,
                metadata: { sourceDocumentIds: input.sourceDocumentIds ?? [] },
              },
            ],
            edges: [],
          };
    if (this.pedagogyGuardianClient === undefined) {
      throw new Error('Pedagogy Guardian client is required before curriculum publication.');
    }
    const guardianOutcome =
      await this.pedagogyGuardianClient.validateCurriculumVersion(fallbackGraph);
    if (!guardianOutcome.accepted) {
      throw new Error(
        `Pedagogy Guardian rejected curriculum version ${guardianOutcome.validationId}.`
      );
    }
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const draftVersionId = await this.repository.saveDraftVersion(
        {
          curriculumId: curriculum.id,
          graph: fallbackGraph,
          agentRunId: agentDraft?.agentRunId ?? 'ingestion-service',
        },
        tx
      );
      await this.repository.finalizeVersion(
        {
          userId,
          curriculumId: curriculum.id,
          curriculumVersionId: draftVersionId,
          guardianValidationId: guardianOutcome.validationId,
        },
        tx
      );
      const activatedPayload: CurriculumLifecyclePayload = {
        curriculumId: curriculum.id,
        userId,
        curriculumVersionId: draftVersionId,
      };
      await this.eventPublisher?.publish('curriculum.version.activated', activatedPayload, {
        correlationId: resolvedCorrelationId,
        tx,
      });
    });
    const generated = await this.repository.getById(userId, curriculum.id);
    if (generated === undefined) throw new Error('Generated curriculum could not be loaded.');
    return generated;
  }

  async importAgentResult(
    userId: UserId,
    input: {
      agentName?: string;
      agentRunId?: string;
      jobId?: string;
      artifactKind?: string;
      request?: Record<string, unknown>;
      result?: Record<string, unknown>;
    },
    correlationId?: CorrelationId
  ): Promise<Record<string, unknown>> {
    const result = input.result ?? {};
    const artifactKind = input.artifactKind ?? result['artifactKind'];
    if (artifactKind === 'curriculum_revision') {
      return this.importRevisionAgentResult(userId, input, correlationId);
    }
    return this.importDraftAgentResult(userId, input, correlationId);
  }

  private async importDraftAgentResult(
    userId: UserId,
    input: {
      agentRunId?: string;
      jobId?: string;
      request?: Record<string, unknown>;
      result?: Record<string, unknown>;
    },
    correlationId?: CorrelationId
  ): Promise<Record<string, unknown>> {
    const request = input.request ?? {};
    const result = input.result ?? {};
    const existingCurriculumId = readString(request['curriculumId']);
    const curriculum =
      existingCurriculumId !== undefined
        ? await this.repository.getById(userId, existingCurriculumId as CurriculumId)
        : await this.createCurriculum(
            userId,
            {
              title: readString(result['goal']) ?? readString(requestPayload(request, 'goal')) ?? 'Agent curriculum draft',
              goal: readString(result['goal']) ?? readString(requestPayload(request, 'goal')),
              originMode: CurriculumOriginMode.AGENT_GENERATED,
            },
            correlationId
          );
    if (curriculum === undefined) throw new Error('Curriculum not found for agent draft import.');
    const versionId = `${ID_PREFIXES.CurriculumVersionId}${nanoid(21)}` as CurriculumVersionId;
    const graph = normalizeAgentDraftGraph(
      {
        agentRunId: input.agentRunId ?? readString(result['agentRunId']) ?? 'agent_import',
        nodes: readArray(result['nodes']) as CurriculumNode[],
        edges: readArray(result['edges']) as CurriculumVersionGraph['edges'],
        rationale: readString(result['rationale']) ?? 'Imported agent-authored curriculum draft.',
      },
      versionId,
      readStringArray(request['documentIds'])
    );
    if (graph.nodes.length === 0) {
      throw new Error('Cannot import curriculum draft without nodes.');
    }
    validateCurriculumDag(graph);
    const saveInput: Parameters<CurriculumRepository['saveDraftVersion']>[0] = {
      curriculumId: curriculum.id,
      graph,
    };
    if (curriculum.activeVersionId !== undefined) saveInput.parentVersionId = curriculum.activeVersionId;
    const agentRunId = input.agentRunId ?? readString(result['agentRunId']) ?? input.jobId;
    if (agentRunId !== undefined) saveInput.agentRunId = agentRunId;
    const draftVersionId = await this.repository.saveDraftVersion(saveInput);
    return {
      artifactKind: 'curriculum_draft',
      curriculumId: curriculum.id,
      curriculumVersionId: draftVersionId,
      state: 'draft',
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    };
  }

  private async importRevisionAgentResult(
    userId: UserId,
    input: {
      agentRunId?: string;
      jobId?: string;
      request?: Record<string, unknown>;
      result?: Record<string, unknown>;
    },
    correlationId?: CorrelationId
  ): Promise<Record<string, unknown>> {
    const request = input.request ?? {};
    const result = input.result ?? {};
    const curriculumId = readString(request['curriculumId']) ?? readString(result['curriculumId']);
    if (curriculumId === undefined) throw new Error('Revision import requires curriculumId.');
    const graph = await this.repository.getActiveVersionForUser(userId, curriculumId as CurriculumId);
    if (graph === undefined) throw new Error('No active curriculum version exists.');
    const changes = normalizeRevisionChanges(result);
    if (changes.length === 0) {
      return {
        artifactKind: 'curriculum_revision',
        curriculumId,
        status: 'ignored_no_changes',
        proposalCreated: false,
      };
    }
    const proposal = await this.repository.createRevisionProposal({
      userId,
      curriculumId: curriculumId as CurriculumId,
      proposedFromVersionId: graph.id,
      reason: normalizeRevisionReason(
        result['revisionReason'],
        readString(requestPayload(request, 'revisionReason')) ??
          CurriculumRevisionReason.MISCONCEPTION
      ),
      evidence: {
        requestEvidence: requestPayload(request, 'evidence'),
        resultEvidence: result['evidence'],
        agentRunId: input.agentRunId ?? readString(result['agentRunId']),
        jobId: input.jobId,
      },
      rationale:
        readString(result['rationale']) ??
        'Curriculum revision imported from agent batch result.',
      changes,
    });
    const payload: CurriculumRevisionPayload = {
      curriculumId: curriculumId as CurriculumId,
      proposalId: proposal.id,
      userId,
    };
    await this.eventPublisher?.publish('curriculum.revision.proposed', payload, {
      correlationId: this.correlationId(userId, correlationId),
    });
    return {
      artifactKind: 'curriculum_revision',
      curriculumId,
      proposalId: proposal.id,
      proposalCreated: true,
      changeCount: proposal.changes.length,
    };
  }

  getCurriculum(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculum | undefined> {
    return this.repository.getById(userId, curriculumId);
  }

  getActiveVersion(userId: UserId, curriculumId: CurriculumId): Promise<unknown> {
    return this.repository.getActiveVersionForUser(userId, curriculumId);
  }

  listProgress(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculumProgress[]> {
    return this.repository.listProgress(userId, curriculumId);
  }

  async recordEvaluation(
    userId: UserId,
    curriculumId: CurriculumId,
    input: IRecordCurriculumEvaluationInput,
    correlationId?: CorrelationId
  ): Promise<ICurriculumProgress> {
    const graph = await this.repository.getActiveVersionForUser(userId, curriculumId);
    if (graph === undefined) throw new Error('No active curriculum version exists.');
    const curriculum = await this.repository.getById(userId, curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    const node = graph.nodes.find((item) => item.stableNodeKey === input.stableNodeKey);
    if (node === undefined) throw new Error('Curriculum node not found.');
    const resolvedCorrelationId = this.correlationId(userId, correlationId);
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const progressBefore = await this.repository.listProgress(userId, curriculumId, tx);
        const existing = progressBefore.find(
          (progress) => progress.stableNodeKey === input.stableNodeKey
        );
        if (input.evaluationId !== undefined) {
          const claimed = await this.repository.markEvaluationEventProcessed(
            {
              userId,
              curriculumId,
              stableNodeKey: input.stableNodeKey,
              evaluationId: input.evaluationId,
              ...(input.sourceEventId !== undefined ? { sourceEventId: input.sourceEventId } : {}),
              sessionId: input.sessionId,
            },
            tx
          );
          if (!claimed) {
            if (existing !== undefined) return existing;
            throw new Error('Duplicate evaluation event has no persisted curriculum progress.');
          }
        }
        const progressInput: Parameters<typeof updateProgressFromEvaluation>[0] = {
          node,
          correct: input.correct,
          sessionId: input.sessionId,
          policy: {
            minExposureSessions: input.minExposureSessions ?? 3,
            minCorrectStreak: input.minCorrectStreak ?? 2,
          },
        };
        if (input.stabilitySnapshot !== undefined)
          progressInput.stabilitySnapshot = input.stabilitySnapshot;
        if (existing !== undefined) progressInput.existing = existing;
        const next = updateProgressFromEvaluation(progressInput);

        const persistInput: Parameters<CurriculumRepository['upsertProgress']>[0] = {
          userId,
          curriculumId,
          stableNodeKey: next.stableNodeKey,
          runtimeState: next.runtimeState,
          sessionId: input.sessionId,
          evaluationCount: next.evaluationCount,
          correctStreak: next.correctStreak,
        };
        if (next.stabilitySnapshot !== undefined)
          persistInput.stabilitySnapshot = next.stabilitySnapshot;
        if (next.completedAt !== undefined) persistInput.completedAt = next.completedAt;
        const saved = await this.repository.upsertProgress(persistInput, tx);
        const nextBranchStates = this.branchStatesAfterProgress(
          branchStatesFromCurriculum(curriculum),
          node,
          saved.runtimeState
        );
        if (nextBranchStates.length > 0) {
          await this.repository.updateCurriculumMetadata(
            {
              userId,
              curriculumId,
              metadata: curriculumMetadataWithBranchStates(curriculum, nextBranchStates),
            },
            tx
          );
        }
        const payload: CurriculumProgressUpdatedPayload = {
          curriculumId,
          curriculumVersionId: graph.id,
          userId,
          stableNodeKey: saved.stableNodeKey,
          evaluationCount: saved.evaluationCount,
          correctStreak: saved.correctStreak,
          ...(saved.stabilitySnapshot !== undefined
            ? { stabilitySnapshot: saved.stabilitySnapshot }
            : {}),
        };
        await this.eventPublisher?.publish('curriculum.progress.updated', payload, {
          correlationId: resolvedCorrelationId,
          tx,
        });
        if (saved.runtimeState === 'completed' && existing?.runtimeState !== 'completed') {
          const nodeCompletedPayload: CurriculumNodeRuntimePayload = {
            curriculumId,
            curriculumVersionId: graph.id,
            userId,
            nodeId: node.id,
            stableNodeKey: saved.stableNodeKey,
            runtimeState: saved.runtimeState,
          };
          await this.eventPublisher?.publish('curriculum.node.completed', nodeCompletedPayload, {
            correlationId: resolvedCorrelationId,
            tx,
          });
          const progressAfter = [
            ...progressBefore.filter((item) => item.stableNodeKey !== saved.stableNodeKey),
            saved,
          ];
          const frontierPayload: CurriculumFrontierUpdatedPayload = {
            curriculumId,
            curriculumVersionId: graph.id,
            userId,
            frontierNodeIds: computeFrontier(graph, progressAfter).map(
              (frontierNode) => frontierNode.id
            ),
          };
          await this.eventPublisher?.publish('curriculum.frontier.updated', frontierPayload, {
            correlationId: resolvedCorrelationId,
            tx,
          });
        }
        return saved;
      },
      { isolationLevel: 'Serializable' }
    );
  }

  async getFrontier(userId: UserId, curriculumId: CurriculumId): Promise<CurriculumNode[]> {
    const graph = await this.repository.getActiveVersion(curriculumId);
    if (graph === undefined) return [];
    validateCurriculumDag(graph);
    const progress = await this.repository.listProgress(userId, curriculumId);
    return computeFrontier(graph, progress);
  }

  async getSessionSlice(
    userId: UserId,
    curriculumId: CurriculumId,
    request: ISessionSliceRequest,
    correlationId?: CorrelationId
  ): Promise<ISessionSlice> {
    const graph = await this.repository.getActiveVersion(curriculumId);
    if (graph === undefined) {
      throw new Error('No active curriculum version exists.');
    }
    const curriculum = await this.repository.getById(userId, curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    validateCurriculumDag(graph);
    const progress = await this.repository.listProgress(userId, curriculumId);
    const frontier = computeFrontier(graph, progress);
    const conceptIds = frontier
      .map((node) => node.ckgConceptId)
      .filter((conceptId): conceptId is NonNullable<typeof conceptId> => conceptId !== undefined);
    const schedules = await this.schedulerClient.getConceptStates(userId, conceptIds);
    const branchStates = branchStatesFromCurriculum(curriculum);
    const decision = composeSessionSlice(
      frontier,
      progress,
      schedules,
      {
        maxNewNodes: request.maxNewNodes ?? 2,
        maxNodes: request.maxNodes ?? 8,
        preferredBranchGroupKeys: request.preferredBranchGroupKeys ?? [],
      },
      branchStates
    );
    const { selectedNodes, rationale } = decision;
    const selectedConceptIds = selectedNodes
      .map((node) => node.ckgConceptId)
      .filter((conceptId): conceptId is NonNullable<typeof conceptId> => conceptId !== undefined);

    if (decision.nextBranchStates.length > 0) {
      await this.repository.updateCurriculumMetadata({
        userId,
        curriculumId,
        metadata: curriculumMetadataWithBranchStates(curriculum, decision.nextBranchStates),
      });
    }

    const payload: SessionCurriculumSliceSelectedPayload = {
      sessionId: request.sessionId,
      curriculumId,
      curriculumVersionId: graph.id,
      userId,
      selectedNodeIds: selectedNodes.map((node) => node.id),
      conceptIds: selectedConceptIds,
    };
    await this.eventPublisher?.publish('session.curriculum_slice.selected', payload, {
      correlationId: this.correlationId(userId, correlationId),
    });

    return {
      curriculumVersionId: graph.id,
      selectedNodeIds: selectedNodes.map((node) => node.id),
      conceptIds: selectedConceptIds,
      selectedBranchGroupKeys: decision.selectedBranchGroupKeys,
      selectionReason: decision.selectionReason,
      branchDecisionState: decision.branchDecisionState,
      blockedMainPathNodeKeys: decision.blockedMainPathNodeKeys,
      rejoinPlan: decision.rejoinPlan,
      rationale,
    };
  }

  async validateActiveVersion(curriculumId: CurriculumId): Promise<void> {
    const graph = await this.repository.getActiveVersion(curriculumId);
    if (graph === undefined) throw new Error('No active curriculum version exists.');
    validateCurriculumDag(graph);
    const conceptIds = graph.nodes
      .map((node) => node.ckgConceptId)
      .filter((conceptId): conceptId is NonNullable<typeof conceptId> => conceptId !== undefined);
    if (
      conceptIds.length > 0 &&
      this.knowledgeGraphClient !== undefined &&
      !(await this.knowledgeGraphClient.validateConceptAnchors(conceptIds))
    ) {
      throw new Error('Curriculum contains CKG concept anchors that failed validation.');
    }
    if (this.pedagogyGuardianClient !== undefined) {
      const outcome = await this.pedagogyGuardianClient.validateCurriculumVersion(graph);
      if (!outcome.accepted) {
        throw new Error(`Pedagogy Guardian rejected curriculum version ${outcome.validationId}.`);
      }
    }
  }

  listRevisionProposals(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<ICurriculumRevisionProposal[]> {
    return this.repository.listRevisionProposals(userId, curriculumId);
  }

  async applyRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    guardianValidationId?: string;
    correlationId?: CorrelationId;
  }): Promise<ICurriculumRevisionProposal> {
    const resolvedCorrelationId = this.correlationId(input.userId, input.correlationId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const proposal = await this.repository.applyRevisionProposal(input, tx);
      const payload: CurriculumRevisionPayload = {
        curriculumId: input.curriculumId,
        proposalId: input.proposalId,
        userId: input.userId,
        appliedVersionId: proposal.appliedVersionId,
      };
      await this.eventPublisher?.publish('curriculum.revision.applied', payload, {
        correlationId: resolvedCorrelationId,
        tx,
      });
      return proposal;
    });
  }

  decideRevisionChange(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    changeId: RevisionChangeId;
    state: 'approved' | 'rejected';
  }): Promise<ICurriculumRevisionProposal> {
    return this.repository.decideRevisionChange({
      ...input,
      state:
        input.state === 'approved' ? RevisionChangeState.APPROVED : RevisionChangeState.REJECTED,
    });
  }

  freezeNode(userId: UserId, curriculumId: CurriculumId, stableNodeKey: string): Promise<void> {
    return this.repository.setFrozenNode({ userId, curriculumId, stableNodeKey, frozen: true });
  }

  unfreezeNode(userId: UserId, curriculumId: CurriculumId, stableNodeKey: string): Promise<void> {
    return this.repository.setFrozenNode({ userId, curriculumId, stableNodeKey, frozen: false });
  }

  listRealignmentEvidence(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<IRealignmentEvidence[]> {
    return this.repository.listRealignmentEvidence(userId, curriculumId);
  }

  async recordRealignmentEvidence(
    userId: UserId,
    curriculumId: CurriculumId,
    input: IRecordRealignmentEvidenceInput,
    correlationId?: CorrelationId
  ): Promise<{ evidence: IRealignmentEvidence; proposalEligible: boolean }> {
    const policy = CURRICULUM_TRIGGER_POLICY[input.triggerType];
    if (policy?.eligible !== true) {
      return {
        evidence: {
          id: 'ignored',
          curriculumId,
          stableNodeKey: input.stableNodeKey,
          triggerType: input.triggerType,
          sessionIds: [input.sessionId],
          accumulatedWeight: 0,
          threshold: input.threshold ?? 0,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        proposalEligible: false,
      };
    }
    const resolvedCorrelationId = this.correlationId(userId, correlationId);
    const { evidence, proposalEligible } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const evidence = await this.repository.accumulateRealignmentEvidence(
          {
            userId,
            curriculumId,
            stableNodeKey: input.stableNodeKey,
            triggerType: input.triggerType,
            sessionId: input.sessionId,
            weight: input.weight ?? policy.weight,
            threshold: input.threshold ?? policy.threshold,
          },
          tx
        );
        const payload: CurriculumEvidenceAccumulatedPayload = {
          curriculumId,
          userId,
          stableNodeKey: evidence.stableNodeKey,
          triggerType: evidence.triggerType,
          accumulatedWeight: evidence.accumulatedWeight,
          threshold: evidence.threshold,
        };
        await this.eventPublisher?.publish('curriculum.realignment.evidence_accumulated', payload, {
          correlationId: resolvedCorrelationId,
          tx,
        });
        return { evidence, proposalEligible: shouldGenerateRevisionProposal(evidence) };
      }
    );
    if (proposalEligible && this.curriculumDesignAgentClient !== undefined) {
      const graph = await this.repository.getActiveVersionForUser(userId, curriculumId);
      if (graph === undefined) return { evidence, proposalEligible };
      const progress = await this.repository.listProgress(userId, curriculumId);
      const allEvidence = await this.repository.listRealignmentEvidence(userId, curriculumId);
      const agentResult = await this.curriculumDesignAgentClient.proposeRevision({
        curriculumId,
        userId,
        curriculumVersionId: graph.id,
        currentNodes: graph.nodes,
        currentEdges: graph.edges,
        progress,
        evidence,
        realignmentEvidence: allEvidence,
        revisionReason: revisionReasonFromTrigger(evidence.triggerType),
        executionPreference: 'realtime',
      });
      const changes = normalizeRevisionChanges(agentResult);
      if (changes.length > 0) {
        const proposal = await this.repository.createRevisionProposal({
          userId,
          curriculumId,
          proposedFromVersionId: graph.id,
          reason: normalizeRevisionReason(
            agentResult['revisionReason'],
            revisionReasonFromTrigger(evidence.triggerType)
          ),
          evidence: {
            triggeringEvidence: evidence,
            realignmentEvidence: allEvidence,
            agentRunId: typeof agentResult['agentRunId'] === 'string' ? agentResult['agentRunId'] : undefined,
          },
          rationale:
            typeof agentResult['rationale'] === 'string' && agentResult['rationale'].length > 0
              ? agentResult['rationale']
              : 'Curriculum revision proposed from accumulated metacognition evidence.',
          changes,
        });
        const payload: CurriculumRevisionPayload = {
          curriculumId,
          proposalId: proposal.id,
          userId,
        };
        await this.eventPublisher?.publish('curriculum.revision.proposed', payload, {
          correlationId: resolvedCorrelationId,
        });
      }
    }
    return { evidence, proposalEligible };
  }
}

function revisionReasonFromTrigger(triggerType: string): string {
  if (triggerType === 'prerequisite_gap') return CurriculumRevisionReason.PREREQUISITE_GAP;
  if (triggerType === 'concept_confusion') return CurriculumRevisionReason.CONFUSION;
  if (triggerType === 'zero_retention') return CurriculumRevisionReason.ZERO_RETENTION;
  if (triggerType === 'structural_invalidation') return CurriculumRevisionReason.STRUCTURAL_INVALIDATION;
  return CurriculumRevisionReason.MISCONCEPTION;
}

function normalizeAgentDraftGraph(
  draft: {
    agentRunId: string;
    nodes: CurriculumNode[];
    edges: CurriculumVersionGraph['edges'];
    rationale: string;
  },
  versionId: CurriculumVersionId,
  sourceDocumentIds: string[]
): CurriculumVersionGraph {
  const nodeIdMap = new Map<string, CurriculumNodeId>();
  const nodes = draft.nodes.map((node, index) => {
    const nextId = `${ID_PREFIXES.CurriculumNodeId}${nanoid(21)}` as CurriculumNodeId;
    nodeIdMap.set(node.id, nextId);
    const branchInfo = mapContractNodeBranchInfo(node);
    return {
      ...node,
      id: nextId,
      curriculumVersionId: versionId,
      stableNodeKey: node.stableNodeKey || `agent-node-${String(index)}`,
      stabilityThreshold: node.stabilityThreshold,
      estimatedSessions: Math.max(1, node.estimatedSessions),
      traversalWeight: node.traversalWeight || index + 1,
      branchInfo,
      metadata: {
        ...(node.metadata ?? {}),
        ...(branchInfo !== undefined
          ? {
              branch: {
                ...(branchInfo.pathRole !== undefined ? { pathRole: branchInfo.pathRole } : {}),
                ...(branchInfo.branchGroupKey !== undefined ? { branchGroupKey: branchInfo.branchGroupKey } : {}),
                ...(branchInfo.branchEntryStrategy !== undefined
                  ? { branchEntryStrategy: branchInfo.branchEntryStrategy }
                  : {}),
                ...(branchInfo.branchExitTargets !== undefined
                  ? { branchExitTargets: branchInfo.branchExitTargets }
                  : {}),
                ...(branchInfo.focusTags !== undefined ? { focusTags: branchInfo.focusTags } : {}),
                ...(branchInfo.isMainPath !== undefined ? { isMainPath: branchInfo.isMainPath } : {}),
              },
            }
          : {}),
        sourceDocumentIds,
        agentRunId: draft.agentRunId,
        generationRationale: draft.rationale,
      },
    };
  });
  const edges = draft.edges.flatMap((edge, index) => {
    const fromNodeId = nodeIdMap.get(edge.fromNodeId);
    const toNodeId = nodeIdMap.get(edge.toNodeId);
    if (fromNodeId === undefined || toNodeId === undefined) return [];
    return [
      {
        ...edge,
        id: `${ID_PREFIXES.CurriculumEdgeId}${nanoid(21)}` as CurriculumEdgeId,
        curriculumVersionId: versionId,
        fromNodeId,
        toNodeId,
        type: edge.type ?? CurriculumEdgeType.PREREQUISITE,
        orderingWeight: edge.orderingWeight || index,
      },
    ];
  });
  return { id: versionId, nodes, edges };
}

function nowIso(): string {
  return new Date().toISOString();
}

function mergeBranchStates(
  current: CurriculumBranchState[],
  next: CurriculumBranchState
): CurriculumBranchState[] {
  const merged = new Map(current.map((item) => [item.branchGroupKey, item]));
  merged.set(next.branchGroupKey, next);
  return [...merged.values()].sort((left, right) =>
    left.branchGroupKey.localeCompare(right.branchGroupKey)
  );
}

function normalizeRevisionReason(value: unknown, fallback: string): typeof CurriculumRevisionReason[keyof typeof CurriculumRevisionReason] {
  const allowed = new Set<string>(Object.values(CurriculumRevisionReason));
  return (typeof value === 'string' && allowed.has(value) ? value : fallback) as typeof CurriculumRevisionReason[keyof typeof CurriculumRevisionReason];
}

function requestPayload(request: Record<string, unknown>, key: string): unknown {
  const payload = request['payload'];
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as Record<string, unknown>)[key];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeRevisionChanges(result: Record<string, unknown>): Array<{
  kind: typeof RevisionChangeKind[keyof typeof RevisionChangeKind];
  payload: Record<string, unknown>;
  rationale?: string;
}> {
  const rawChanges = Array.isArray(result['changes']) ? result['changes'] : [];
  const allowed = new Set<string>(Object.values(RevisionChangeKind));
  return rawChanges.flatMap((rawChange) => {
    if (typeof rawChange !== 'object' || rawChange === null) return [];
    const change = rawChange as Record<string, unknown>;
    const kind = change['kind'];
    if (typeof kind !== 'string' || !allowed.has(kind)) return [];
    const payload = change['payload'];
    return [
      {
        kind: kind as typeof RevisionChangeKind[keyof typeof RevisionChangeKind],
        payload:
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>)
            : {},
        ...(typeof change['rationale'] === 'string' ? { rationale: change['rationale'] } : {}),
      },
    ];
  });
}
