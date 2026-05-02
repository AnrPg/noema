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
  ID_PREFIXES,
  RevisionChangeState,
} from '@noema/types';
import type {
  CurriculumId,
  CurriculumNodeId,
  CurriculumVersionId,
  RevisionChangeId,
  RevisionProposalId,
  UserId,
} from '@noema/types';
import { nanoid } from 'nanoid';
import {
  composeSessionSlice,
  computeFrontier,
  CURRICULUM_TRIGGER_POLICY,
  shouldGenerateRevisionProposal,
  updateProgressFromEvaluation,
  validateCurriculumDag,
} from './index.js';
import type { CurriculumRepository } from './curriculum.repository.js';
import type { CurriculumNode } from './curriculum.types.js';
import type { CurriculumEventPublisher } from '../../infrastructure/events/redis-event-publisher.js';
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
    private readonly eventPublisher?: CurriculumEventPublisher,
    private readonly knowledgeGraphClient?: IKnowledgeGraphClient,
    private readonly pedagogyGuardianClient?: IPedagogyGuardianClient,
    private readonly curriculumDesignAgentClient?: ICurriculumDesignAgentClient
  ) {}

  listCurricula(userId: UserId): Promise<ICurriculum[]> {
    return this.repository.listByUser(userId, false);
  }

  async createCurriculum(userId: UserId, input: ICreateCurriculumInput): Promise<ICurriculum> {
    const curriculum = await this.repository.create(userId, input);
    await this.eventPublisher?.publish('curriculum.created', {
      curriculumId: curriculum.id,
      userId,
    });
    return curriculum;
  }

  async generateCurriculum(
    userId: UserId,
    input: IGenerateCurriculumInput & { title?: string; sourceDocumentIds?: string[] }
  ): Promise<ICurriculum> {
    const curriculum = await this.repository.create(userId, {
      title: input.title ?? input.goal.slice(0, 120),
      goal: input.goal,
      domain: input.domain,
      originMode: CurriculumOriginMode.DOCUMENT_DERIVED,
    });
    const versionId = `${ID_PREFIXES.CurriculumVersionId}${nanoid(21)}` as CurriculumVersionId;
    const rootConceptIds = input.rootConceptIds ?? [];
    const nodes = rootConceptIds;
    const graph = {
      id: versionId,
      nodes: nodes.map((conceptId, index) => ({
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
    const draftVersionId = await this.repository.saveDraftVersion({
      curriculumId: curriculum.id,
      graph: fallbackGraph,
      agentRunId: 'ingestion-service',
    });
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
    await this.repository.finalizeVersion({
      userId,
      curriculumId: curriculum.id,
      curriculumVersionId: draftVersionId,
      guardianValidationId: guardianOutcome.validationId,
    });
    await this.eventPublisher?.publish('curriculum.generated', {
      curriculumId: curriculum.id,
      userId,
      rootConceptIds,
      sourceDocumentIds: input.sourceDocumentIds ?? [],
    });
    const generated = await this.repository.getById(userId, curriculum.id);
    if (generated === undefined) throw new Error('Generated curriculum could not be loaded.');
    return generated;
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
    input: IRecordCurriculumEvaluationInput
  ): Promise<ICurriculumProgress> {
    const graph = await this.repository.getActiveVersionForUser(userId, curriculumId);
    if (graph === undefined) throw new Error('No active curriculum version exists.');
    const node = graph.nodes.find((item) => item.stableNodeKey === input.stableNodeKey);
    if (node === undefined) throw new Error('Curriculum node not found.');
    const existing = (await this.repository.listProgress(userId, curriculumId)).find(
      (progress) => progress.stableNodeKey === input.stableNodeKey
    );
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
    const saved = await this.repository.upsertProgress(persistInput);
    await this.eventPublisher?.publish('curriculum.progress.updated', {
      curriculumId,
      userId,
      stableNodeKey: saved.stableNodeKey,
      runtimeState: saved.runtimeState,
    });
    return saved;
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
    request: ISessionSliceRequest
  ): Promise<ISessionSlice> {
    const graph = await this.repository.getActiveVersion(curriculumId);
    if (graph === undefined) {
      throw new Error('No active curriculum version exists.');
    }
    validateCurriculumDag(graph);
    const progress = await this.repository.listProgress(userId, curriculumId);
    const frontier = computeFrontier(graph, progress);
    const conceptIds = frontier
      .map((node) => node.ckgConceptId)
      .filter((conceptId): conceptId is NonNullable<typeof conceptId> => conceptId !== undefined);
    const schedules = await this.schedulerClient.getConceptStates(userId, conceptIds);
    const { selectedNodes, rationale } = composeSessionSlice(frontier, progress, schedules, {
      maxNewNodes: request.maxNewNodes ?? 2,
      maxNodes: request.maxNodes ?? 8,
    });
    const selectedConceptIds = selectedNodes
      .map((node) => node.ckgConceptId)
      .filter((conceptId): conceptId is NonNullable<typeof conceptId> => conceptId !== undefined);

    await this.eventPublisher?.publish('session.curriculum_slice.selected', {
      curriculumId,
      curriculumVersionId: graph.id,
      userId,
      selectedNodeIds: selectedNodes.map((node) => node.id),
      conceptIds: selectedConceptIds,
    });

    return {
      curriculumVersionId: graph.id,
      selectedNodeIds: selectedNodes.map((node) => node.id),
      conceptIds: selectedConceptIds,
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
    const unsupportedEdges = graph.edges.filter(
      (edge) => edge.type !== CurriculumEdgeType.PREREQUISITE
    );
    void unsupportedEdges;
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
  }): Promise<ICurriculumRevisionProposal> {
    const proposal = await this.repository.applyRevisionProposal(input);
    await this.eventPublisher?.publish('curriculum.revision_proposal.applied', {
      curriculumId: input.curriculumId,
      proposalId: input.proposalId,
      userId: input.userId,
      appliedVersionId: proposal.appliedVersionId,
    });
    return proposal;
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
    input: IRecordRealignmentEvidenceInput
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
    const evidence = await this.repository.accumulateRealignmentEvidence({
      userId,
      curriculumId,
      stableNodeKey: input.stableNodeKey,
      triggerType: input.triggerType,
      sessionId: input.sessionId,
      weight: input.weight ?? policy.weight,
      threshold: input.threshold ?? policy.threshold,
    });
    const proposalEligible = shouldGenerateRevisionProposal(evidence);
    if (proposalEligible && this.curriculumDesignAgentClient !== undefined) {
      await this.curriculumDesignAgentClient.proposeRevision({
        curriculumId,
        userId,
        evidence,
      });
    }
    await this.eventPublisher?.publish('curriculum.realignment_evidence.accumulated', {
      curriculumId,
      userId,
      stableNodeKey: evidence.stableNodeKey,
      triggerType: evidence.triggerType,
      proposalEligible,
    });
    return { evidence, proposalEligible };
  }
}
