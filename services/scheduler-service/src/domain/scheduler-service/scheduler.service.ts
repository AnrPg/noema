import type { IAgentHints } from '@noema/contracts';

import { randomUUID } from 'node:crypto';
import type {
  CardId,
  CorrelationId,
  IBatchScheduleCommitInput,
  IBatchScheduleCommitResult,
  ICandidateScore,
  ICardDetail,
  ICardScheduleCommitInput,
  ICardScheduleCommitResult,
  ICardScheduleDecision,
  IDualLanePlan,
  IDualLanePlanInput,
  IExecutionContext,
  IOrchestrationMetadata,
  IPolicyVersion,
  IRetentionPrediction,
  IRetentionPredictionInput,
  IRetentionPredictionResult,
  IReviewQueue,
  IReviewQueueInput,
  IReviewWindowProposal,
  IReviewWindowProposalInput,
  ISchedulerCard,
  ISchedulerLaneMix,
  IScoringBreakdown,
  ISessionAdjustmentInput,
  ISessionAdjustmentResult,
  ISessionCandidateCard,
  ISessionCandidateProposal,
  ISessionCandidateProposalInput,
  ISessionCandidateSimulation,
  ISessionCandidateSimulationInput,
  SchedulerLane,
  UserId,
} from '../../types/scheduler.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type {
  ICalibrationDataRepository,
  ICohortLineageInput,
  ICommitProvenanceInput,
  IProposalProvenanceInput,
  IReviewRepository,
  ISchedulerCardRepository,
  ISchedulerProvenanceRepository,
} from './scheduler.repository.js';
import {
  BatchScheduleCommitInputSchema,
  CardScheduleCommitInputSchema,
  DualLanePlanInputSchema,
  RetentionPredictionInputSchema,
  ReviewQueueInputSchema,
  ReviewWindowProposalInputSchema,
  SessionAdjustmentInputSchema,
  SessionCandidateProposalInputSchema,
  SessionCandidateSimulationInputSchema,
} from './scheduler.schemas.js';

export interface IServiceResult<T> {
  data: T;
  agentHints: IAgentHints;
}

export interface ISchedulerServiceRepositories {
  schedulerCardRepository: ISchedulerCardRepository;
  reviewRepository: IReviewRepository;
  calibrationDataRepository: ICalibrationDataRepository;
  provenanceRepository?: ISchedulerProvenanceRepository;
}

export class SchedulerService {
  private static readonly POLICY_VERSION: IPolicyVersion = {
    version: 'scheduler.policy.v1',
  };

  constructor(
    private readonly eventPublisher: IEventPublisher,
    private readonly repositories?: ISchedulerServiceRepositories
  ) {}

  async planDualLaneQueue(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IDualLanePlan>> {
    const parsed = DualLanePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid dual-lane plan input');
    }

    const data = parsed.data as IDualLanePlanInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }
    const laneMix = this.normalizeLaneMix(data.targetMix);
    const scores = data.cardPriorityScores ?? {};
    const interleave = data.interleave ?? true;

    const { selectedCardIds, cardDetails, retentionSpillover, calibrationSpillover } =
      this.selectByLaneMix(
        data.retentionCardIds,
        data.calibrationCardIds,
        laneMix,
        data.maxCards,
        scores,
        interleave
      );

    const retentionSelected = cardDetails.filter((d) => d.lane === 'retention').length;
    const calibrationSelected = cardDetails.filter((d) => d.lane === 'calibration').length;
    const orchestration = this.buildOrchestrationMetadata(ctx);

    const result: IDualLanePlan = {
      planVersion: 'v2',
      policyVersion: SchedulerService.POLICY_VERSION.version,
      laneMix,
      selectedCardIds,
      retentionSelected,
      calibrationSelected,
      retentionSpillover,
      calibrationSpillover,
      cardDetails,
      orchestration,
      rationale:
        `Dual-lane plan: ${String(retentionSelected)}R + ${String(calibrationSelected)}C` +
        ` (spillover: ${String(retentionSpillover)}R→C, ${String(calibrationSpillover)}C→R)` +
        `, interleave=${String(interleave)}`,
    };

    if (this.repositories !== undefined && data.commit === true) {
      await this.persistPlannedCards(
        data.userId,
        data.retentionCardIds,
        data.calibrationCardIds,
        selectedCardIds
      );
    }

    await this.recordProposalProvenance({
      proposalId: orchestration.proposalId,
      decisionId: orchestration.decisionId,
      userId: data.userId,
      policyVersion: SchedulerService.POLICY_VERSION.version,
      correlationId: ctx.correlationId,
      sessionId: orchestration.sessionId,
      sessionRevision: orchestration.sessionRevision,
      kind: 'dual-lane-plan',
      payload: {
        laneMix,
        selectedCardIds,
        retentionSelected,
        calibrationSelected,
        retentionSpillover,
        calibrationSpillover,
        interleaved: interleave,
        committed: data.commit === true,
      },
    });

    await this.recordCohortLineage({
      id: `lin_${randomUUID()}`,
      userId: data.userId,
      proposalId: orchestration.proposalId,
      decisionId: orchestration.decisionId,
      sessionId: orchestration.sessionId,
      sessionRevision: orchestration.sessionRevision,
      operationKind: 'dual-lane-plan',
      selectedCardIds,
      excludedCardIds: [],
      metadata: {
        policyVersion: SchedulerService.POLICY_VERSION.version,
        correlationId: ctx.correlationId,
      },
    });

    await this.eventPublisher.publish({
      eventType: 'schedule.dual_lane.planned',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        laneMix,
        selectedCount: selectedCardIds.length,
        policyVersion: SchedulerService.POLICY_VERSION.version,
        orchestration,
        retentionSelected,
        calibrationSelected,
        retentionSpillover,
        calibrationSpillover,
        interleaved: interleave,
        committed: data.commit === true,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'dual_lane_plan_ready',
        `Generated plan with ${String(selectedCardIds.length)} cards (${String(retentionSelected)}R/${String(calibrationSelected)}C)`
      ),
    };
  }

  async proposeReviewWindows(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IReviewWindowProposal>> {
    const parsed = ReviewWindowProposalInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid review-window proposal input');
    }

    const data = parsed.data as IReviewWindowProposalInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    const baseTime = data.asOf ?? new Date().toISOString();
    const decisions = data.cards.map((card) => {
      const intervalDays = this.deriveIntervalDays(card.algorithm, card.stability ?? undefined);
      const nextReviewAt = new Date(
        new Date(baseTime).getTime() + intervalDays * 24 * 60 * 60 * 1000
      ).toISOString();
      return {
        cardId: card.cardId,
        nextReviewAt,
        intervalDays,
        lane: card.algorithm === 'hlr' ? 'calibration' : 'retention',
        algorithm: card.algorithm,
        rationale: 'Deterministic review-window proposal',
      } as ICardScheduleDecision;
    });

    const orchestration = this.buildOrchestrationMetadata(ctx);

    const result: IReviewWindowProposal = {
      generatedAt: new Date().toISOString(),
      decisions,
      policyVersion: SchedulerService.POLICY_VERSION,
      orchestration,
    };

    await this.recordProposalProvenance({
      proposalId: orchestration.proposalId,
      decisionId: orchestration.decisionId,
      userId: data.userId,
      policyVersion: SchedulerService.POLICY_VERSION.version,
      correlationId: ctx.correlationId,
      sessionId: orchestration.sessionId,
      sessionRevision: orchestration.sessionRevision,
      kind: 'review-window-proposal',
      payload: {
        generatedAt: result.generatedAt,
        decisionCount: decisions.length,
        decisions,
      },
    });

    await this.recordCohortLineage({
      id: `lin_${randomUUID()}`,
      userId: data.userId,
      proposalId: orchestration.proposalId,
      decisionId: orchestration.decisionId,
      sessionId: orchestration.sessionId,
      sessionRevision: orchestration.sessionRevision,
      operationKind: 'review-window-proposal',
      selectedCardIds: decisions.map((decision) => decision.cardId),
      excludedCardIds: [],
      metadata: {
        policyVersion: SchedulerService.POLICY_VERSION.version,
        correlationId: ctx.correlationId,
      },
    });

    await this.eventPublisher.publish({
      eventType: 'schedule.proposal.generated',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        kind: 'review-windows',
        proposalSize: decisions.length,
        policyVersion: SchedulerService.POLICY_VERSION.version,
        orchestration,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'review_window_proposal_ready',
        `Generated ${String(decisions.length)} deterministic review-window proposals`
      ),
    };
  }

  async proposeSessionCandidates(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISessionCandidateProposal>> {
    const parsed = SessionCandidateProposalInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid session-candidate proposal input');
    }

    const data = parsed.data as ISessionCandidateProposalInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    const proposal = this.computeCandidateSelection(
      data.cards,
      data.constraints.targetCards,
      data.constraints.laneMix
    );

    const orchestration = this.buildOrchestrationMetadata(ctx);

    const result: ISessionCandidateProposal = {
      selectedCardIds: proposal.selectedCardIds,
      excludedCardIds: proposal.excludedCardIds,
      scores: proposal.scores,
      scoringBreakdown: proposal.scoringBreakdown,
      policyVersion: SchedulerService.POLICY_VERSION,
      orchestration,
      rationale: 'Highest deterministic composite score selected with stable tie-breaks',
    };

    await this.recordProposalProvenance({
      proposalId: orchestration.proposalId,
      decisionId: orchestration.decisionId,
      userId: data.userId,
      policyVersion: SchedulerService.POLICY_VERSION.version,
      correlationId: ctx.correlationId,
      sessionId: orchestration.sessionId,
      sessionRevision: orchestration.sessionRevision,
      kind: 'session-candidate-proposal',
      payload: {
        selectedCardIds: result.selectedCardIds,
        excludedCardIds: result.excludedCardIds,
        scoringBreakdown: result.scoringBreakdown,
        scores: result.scores,
      },
    });

    await this.recordCohortLineage({
      id: `lin_${randomUUID()}`,
      userId: data.userId,
      proposalId: orchestration.proposalId,
      decisionId: orchestration.decisionId,
      sessionId: orchestration.sessionId,
      sessionRevision: orchestration.sessionRevision,
      operationKind: 'session-candidate-proposal',
      selectedCardIds: result.selectedCardIds,
      excludedCardIds: result.excludedCardIds,
      metadata: {
        policyVersion: SchedulerService.POLICY_VERSION.version,
        correlationId: ctx.correlationId,
      },
    });

    await this.eventPublisher.publish({
      eventType: 'schedule.proposal.generated',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        kind: 'session-candidates',
        selectedCount: result.selectedCardIds.length,
        excludedCount: result.excludedCardIds.length,
        policyVersion: SchedulerService.POLICY_VERSION.version,
        orchestration,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'session_candidate_proposal_ready',
        `Computed deterministic scores for ${String(data.cards.length)} candidate cards`
      ),
    };
  }

  simulateSessionCandidates(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISessionCandidateSimulation>> {
    const parsed = SessionCandidateSimulationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid session-candidate simulation input');
    }

    const data = parsed.data as ISessionCandidateSimulationInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    const simulation = this.computeCandidateSelection(
      data.cards,
      data.constraints.targetCards,
      data.constraints.laneMix
    );

    return Promise.resolve({
      data: {
        selectedCardIds: simulation.selectedCardIds,
        excludedCardIds: simulation.excludedCardIds,
        scores: simulation.scores,
        scoringBreakdown: simulation.scoringBreakdown,
        policyVersion: SchedulerService.POLICY_VERSION,
        sideEffectFree: true,
      },
      agentHints: this.defaultHints(
        'session_candidate_simulation_ready',
        `Simulated deterministic candidate selection for ${String(data.cards.length)} cards (no persistence)`
      ),
    });
  }

  async commitCardSchedule(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ICardScheduleCommitResult>> {
    const parsed = CardScheduleCommitInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid single-card commit input');
    }

    const data = parsed.data as ICardScheduleCommitInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    await this.persistDecision(data.userId, data.decision);

    const commitId = `com_${randomUUID()}`;

    await this.eventPublisher.publish({
      eventType: 'schedule.commit.applied',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        commitId,
        decision: data.decision,
        policyVersion: data.policyVersion.version,
        orchestration: data.orchestration,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    await this.recordCommitProvenance({
      commitId,
      proposalId: data.orchestration.proposalId,
      decisionId: data.orchestration.decisionId,
      userId: data.userId,
      policyVersion: data.policyVersion.version,
      correlationId: ctx.correlationId,
      sessionId: data.orchestration.sessionId,
      sessionRevision: data.orchestration.sessionRevision,
      kind: 'single-card-commit',
      accepted: 1,
      rejected: 0,
      payload: {
        decision: data.decision,
      },
    });

    await this.recordCohortLineage({
      id: `lin_${randomUUID()}`,
      userId: data.userId,
      proposalId: data.orchestration.proposalId,
      decisionId: data.orchestration.decisionId,
      sessionId: data.orchestration.sessionId,
      sessionRevision: data.orchestration.sessionRevision,
      operationKind: 'single-card-commit',
      selectedCardIds: [data.decision.cardId],
      excludedCardIds: [],
      metadata: {
        policyVersion: data.policyVersion.version,
        correlationId: ctx.correlationId,
        commitId,
      },
    });

    return {
      data: {
        commitId,
        cardId: data.decision.cardId,
        status: 'committed',
        policyVersion: data.policyVersion,
        orchestration: {
          ...data.orchestration,
          correlationId: ctx.correlationId,
        },
      },
      agentHints: this.defaultHints(
        'schedule_commit_applied',
        'Single-card schedule commit persisted'
      ),
    };
  }

  async commitCardScheduleBatch(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IBatchScheduleCommitResult>> {
    const parsed = BatchScheduleCommitInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid batch schedule commit input');
    }

    const data = parsed.data as IBatchScheduleCommitInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    const updatedCardIds: CardId[] = [];
    let rejected = 0;

    for (const decision of data.decisions) {
      try {
        await this.persistDecision(data.userId, decision);
        updatedCardIds.push(decision.cardId);
      } catch {
        rejected += 1;
      }
    }

    const commitId = `com_${randomUUID()}`;

    await this.eventPublisher.publish({
      eventType: 'schedule.commit.applied',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        commitId,
        accepted: updatedCardIds.length,
        rejected,
        policyVersion: data.policyVersion.version,
        orchestration: data.orchestration,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    await this.recordCommitProvenance({
      commitId,
      proposalId: data.orchestration.proposalId,
      decisionId: data.orchestration.decisionId,
      userId: data.userId,
      policyVersion: data.policyVersion.version,
      correlationId: ctx.correlationId,
      sessionId: data.orchestration.sessionId,
      sessionRevision: data.orchestration.sessionRevision,
      kind: 'batch-card-commit',
      accepted: updatedCardIds.length,
      rejected,
      payload: {
        source: data.source,
        decisions: data.decisions,
        updatedCardIds,
      },
    });

    await this.recordCohortLineage({
      id: `lin_${randomUUID()}`,
      userId: data.userId,
      proposalId: data.orchestration.proposalId,
      decisionId: data.orchestration.decisionId,
      sessionId: data.orchestration.sessionId,
      sessionRevision: data.orchestration.sessionRevision,
      operationKind: 'batch-card-commit',
      selectedCardIds: updatedCardIds,
      excludedCardIds: data.decisions
        .map((decision) => decision.cardId)
        .filter((cardId) => !updatedCardIds.includes(cardId)),
      metadata: {
        policyVersion: data.policyVersion.version,
        correlationId: ctx.correlationId,
        commitId,
      },
    });

    return {
      data: {
        commitId,
        accepted: updatedCardIds.length,
        rejected,
        updatedCardIds,
        policyVersion: data.policyVersion,
        orchestration: {
          ...data.orchestration,
          correlationId: ctx.correlationId,
        },
      },
      agentHints: this.defaultHints(
        'schedule_batch_commit_applied',
        `Batch commit applied with ${String(updatedCardIds.length)} accepted and ${String(rejected)} rejected`
      ),
    };
  }

  // ============================================================================
  // Phase 4 Methods
  // ============================================================================

  /**
   * Retrieve review queue (cards due for review).
   * Implements get-srs-schedule tool (Phase 4, Gap #11).
   */
  async getReviewQueue(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IReviewQueue>> {
    const parsed = ReviewQueueInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid review queue input');
    }

    const data = parsed.data as IReviewQueueInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    const asOf = data.asOf ?? new Date().toISOString();
    const limit = data.limit ?? 500;

    if (!this.repositories) {
      throw new Error('Scheduler repositories not initialized');
    }

    const beforeDate = new Date(asOf);
    const cards = await this.repositories.schedulerCardRepository.findDueCards(
      data.userId,
      beforeDate,
      limit,
      data.lane
    );

    const retentionDue = cards.filter((card: ISchedulerCard) => card.lane === 'retention').length;
    const calibrationDue = cards.filter(
      (card: ISchedulerCard) => card.lane === 'calibration'
    ).length;

    const result: IReviewQueue = {
      cards,
      totalDue: cards.length,
      retentionDue,
      calibrationDue,
      asOf,
      policyVersion: SchedulerService.POLICY_VERSION,
    };

    await this.eventPublisher.publish({
      eventType: 'schedule.review_queue.retrieved',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        totalDue: cards.length,
        retentionDue,
        calibrationDue,
        lane: data.lane ?? 'all',
        limit,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'review_queue_retrieved',
        `Retrieved ${String(cards.length)} cards due for review (${String(retentionDue)}R/${String(calibrationDue)}C)`
      ),
    };
  }

  /**
   * Predict retention probability for cards.
   * Implements predict-retention tool (Phase 4, Gap #11).
   */
  async predictRetention(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<IRetentionPredictionResult>> {
    const parsed = RetentionPredictionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid retention prediction input');
    }

    const data = parsed.data as IRetentionPredictionInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    if (!this.repositories) {
      throw new Error('Scheduler repositories not initialized');
    }

    const predictions: IRetentionPrediction[] = [];
    const now = new Date();

    for (const req of data.cards) {
      const card = await this.repositories.schedulerCardRepository.findByCard(
        data.userId,
        req.cardId
      );

      if (!card) {
        predictions.push({
          cardId: req.cardId,
          algorithm: req.algorithm,
          retentionProbability: 0,
          daysUntilDue: 0,
          nextReviewAt: now.toISOString(),
          confidence: 0,
        });
        continue;
      }

      const stability = card.stability ?? 1.0;
      const intervalDays = this.deriveIntervalDays(req.algorithm, stability);
      const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

      // Simplified retention calculation (forgetting curve approximation)
      const retentionProbability = Math.exp(-intervalDays / (stability * 3));

      predictions.push({
        cardId: req.cardId,
        algorithm: req.algorithm,
        retentionProbability: this.clamp01(retentionProbability),
        daysUntilDue: intervalDays,
        nextReviewAt: nextReviewAt.toISOString(),
        confidence: 0.85,
      });
    }

    const result: IRetentionPredictionResult = {
      predictions,
      generatedAt: now.toISOString(),
      policyVersion: SchedulerService.POLICY_VERSION,
    };

    await this.eventPublisher.publish({
      eventType: 'schedule.retention.predicted',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        cardCount: data.cards.length,
        averageRetention:
          predictions.reduce((sum, p) => sum + p.retentionProbability, 0) / predictions.length,
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'retention_predictions_ready',
        `Generated retention predictions for ${String(predictions.length)} cards`
      ),
    };
  }

  /**
   * Apply runtime session adjustments (add/remove/reprioritize cards).
   * Implements apply-session-adjustments tool (Phase 4, Gap #11).
   */
  async applySessionAdjustments(
    input: unknown,
    ctx: IExecutionContext
  ): Promise<IServiceResult<ISessionAdjustmentResult>> {
    const parsed = SessionAdjustmentInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid session adjustment input');
    }

    const data = parsed.data as ISessionAdjustmentInput;
    if (data.userId !== ctx.userId) {
      throw new Error('userId in payload must match authenticated user');
    }

    // Session adjustments are typically stored in session-service,
    // scheduler-service just validates and emits the adjustment event
    const appliedCount = data.adjustments.length;

    const result: ISessionAdjustmentResult = {
      sessionId: data.sessionId,
      appliedCount,
      adjustments: data.adjustments,
      policyVersion: SchedulerService.POLICY_VERSION,
      orchestration: {
        ...data.orchestration,
        correlationId: ctx.correlationId,
      },
    };

    await this.eventPublisher.publish({
      eventType: 'schedule.session.adjustments_applied',
      aggregateType: 'Schedule',
      aggregateId: data.userId,
      payload: {
        sessionId: data.sessionId,
        appliedCount,
        actions: data.adjustments.map((adj) => adj.action),
      },
      metadata: {
        correlationId: ctx.correlationId,
        userId: ctx.userId,
      },
    });

    return {
      data: result,
      agentHints: this.defaultHints(
        'session_adjustments_applied',
        `Applied ${String(appliedCount)} session adjustments to session ${data.sessionId}`
      ),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private normalizeLaneMix(mix?: ISchedulerLaneMix): ISchedulerLaneMix {
    if (!mix) {
      return { retention: 0.8, calibration: 0.2 };
    }

    const sum = mix.retention + mix.calibration;
    if (sum <= 0) {
      return { retention: 0.8, calibration: 0.2 };
    }

    return {
      retention: mix.retention / sum,
      calibration: mix.calibration / sum,
    };
  }

  private clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private buildOrchestrationMetadata(
    ctx: IExecutionContext,
    partial?: Partial<IOrchestrationMetadata>
  ): IOrchestrationMetadata {
    const metadata: IOrchestrationMetadata = {
      proposalId: partial?.proposalId ?? `prop_${randomUUID()}`,
      decisionId: partial?.decisionId ?? `dec_${randomUUID()}`,
      sessionRevision: partial?.sessionRevision ?? 0,
      correlationId: partial?.correlationId ?? ctx.correlationId,
    };

    if (partial?.sessionId !== undefined) {
      metadata.sessionId = partial.sessionId;
    }

    return metadata;
  }

  private deriveIntervalDays(algorithm: 'fsrs' | 'hlr' | 'sm2', stability?: number): number {
    if (algorithm === 'hlr') {
      return Math.max(1, Math.round((stability ?? 2) * 0.75));
    }
    if (algorithm === 'sm2') {
      return Math.max(1, Math.round(stability ?? 2));
    }
    return Math.max(1, Math.round(stability ?? 3));
  }

  private scoreCandidate(card: ISessionCandidateCard): ICandidateScore {
    const nowMs = Date.now();
    const dueMs =
      card.dueAt !== null && card.dueAt !== undefined ? new Date(card.dueAt).getTime() : nowMs;
    const overdueHours = Math.max(0, (nowMs - dueMs) / (1000 * 60 * 60));
    const urgency = this.clamp01(overdueHours / 24);

    const retentionRisk = this.clamp01(1 - (card.retentionProbability ?? 0.5));
    const calibrationValue =
      card.lane === 'calibration' ? this.clamp01(1 - (card.retentionProbability ?? 0.5)) : 0;

    const composite = this.clamp01(0.5 * urgency + 0.35 * retentionRisk + 0.15 * calibrationValue);

    return {
      urgency,
      retentionRisk,
      calibrationValue,
      composite,
    };
  }

  private computeCandidateSelection(
    cards: ISessionCandidateCard[],
    targetCards: number,
    laneMix?: ISchedulerLaneMix
  ): {
    selectedCardIds: CardId[];
    excludedCardIds: CardId[];
    scores: { cardId: CardId; score: ICandidateScore }[];
    scoringBreakdown: IScoringBreakdown;
  } {
    const scored = cards.map((card) => ({
      cardId: card.cardId,
      lane: card.lane,
      score: this.scoreCandidate(card),
    }));

    scored.sort((a, b) => {
      if (b.score.composite !== a.score.composite) {
        return b.score.composite - a.score.composite;
      }
      return a.cardId.localeCompare(b.cardId);
    });

    const scoreMap: Record<string, number> = {};
    for (const entry of scored) {
      scoreMap[entry.cardId] = entry.score.composite;
    }

    const retention = scored
      .filter((entry) => entry.lane === 'retention')
      .map((entry) => entry.cardId);
    const calibration = scored
      .filter((entry) => entry.lane === 'calibration')
      .map((entry) => entry.cardId);

    const mix = this.normalizeLaneMix(laneMix);
    const selected = this.selectByLaneMix(
      retention,
      calibration,
      mix,
      targetCards,
      scoreMap,
      false
    );

    const selectedSet = new Set(selected.selectedCardIds);
    const excludedCardIds = scored
      .map((entry) => entry.cardId)
      .filter((cardId) => !selectedSet.has(cardId));

    const selectedScores = selected.selectedCardIds.map((cardId) => {
      const score = scored.find((entry) => entry.cardId === cardId)?.score;
      return {
        cardId,
        score: score ?? {
          urgency: 0,
          retentionRisk: 0,
          calibrationValue: 0,
          composite: 0,
        },
      };
    });

    const average = (values: number[]): number => {
      if (values.length === 0) return 0;
      return values.reduce((acc, value) => acc + value, 0) / values.length;
    };

    const scoringBreakdown: IScoringBreakdown = {
      urgency: this.clamp01(average(selectedScores.map((item) => item.score.urgency))),
      retentionRisk: this.clamp01(average(selectedScores.map((item) => item.score.retentionRisk))),
      calibrationValue: this.clamp01(
        average(selectedScores.map((item) => item.score.calibrationValue))
      ),
      composite: this.clamp01(average(selectedScores.map((item) => item.score.composite))),
    };

    return {
      selectedCardIds: selected.selectedCardIds,
      excludedCardIds,
      scores: selectedScores,
      scoringBreakdown,
    };
  }

  private async persistDecision(userId: UserId, decision: ICardScheduleDecision): Promise<void> {
    if (this.repositories === undefined) {
      return;
    }

    const existing = await this.repositories.schedulerCardRepository.findByCard(
      userId,
      decision.cardId
    );
    if (!existing) {
      await this.repositories.schedulerCardRepository.create({
        id: `sc_${randomUUID()}`,
        cardId: decision.cardId,
        userId,
        lane: decision.lane,
        stability: null,
        difficultyParameter: null,
        halfLife: null,
        interval: decision.intervalDays,
        nextReviewDate: decision.nextReviewAt,
        lastReviewedAt: null,
        reviewCount: 0,
        lapseCount: 0,
        consecutiveCorrect: 0,
        schedulingAlgorithm: decision.algorithm,
        cardType: null,
        difficulty: null,
        knowledgeNodeIds: [],
        state: 'review',
        suspendedUntil: null,
        suspendedReason: null,
        version: 1,
      });
      return;
    }

    await this.repositories.schedulerCardRepository.update(
      userId,
      decision.cardId,
      {
        lane: decision.lane,
        interval: decision.intervalDays,
        nextReviewDate: decision.nextReviewAt,
        schedulingAlgorithm: decision.algorithm,
      },
      existing.version
    );
  }

  private async recordProposalProvenance(input: IProposalProvenanceInput): Promise<void> {
    if (this.repositories?.provenanceRepository === undefined) {
      return;
    }

    await this.repositories.provenanceRepository.recordProposal(input);
  }

  private async recordCommitProvenance(input: ICommitProvenanceInput): Promise<void> {
    if (this.repositories?.provenanceRepository === undefined) {
      return;
    }

    await this.repositories.provenanceRepository.recordCommit(input);
  }

  private async recordCohortLineage(input: ICohortLineageInput): Promise<void> {
    if (this.repositories?.provenanceRepository === undefined) {
      return;
    }

    await this.repositories.provenanceRepository.recordCohortLineage(input);
  }

  /**
   * Sort card IDs by priority score (descending). Cards without a score
   * receive 0 and preserve their original relative order (stable sort).
   */
  private sortByPriority(cardIds: CardId[], scores: Record<string, number>): CardId[] {
    return [...cardIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  }

  /**
   * Select cards from retention and calibration pools, respecting the target
   * lane mix ratio. Supports priority-based selection, urgency-aware spillover,
   * and round-robin interleaving.
   */
  selectByLaneMix(
    retention: CardId[],
    calibration: CardId[],
    mix: ISchedulerLaneMix,
    maxCards: number,
    scores: Record<string, number> = {},
    interleave = true
  ): {
    selectedCardIds: CardId[];
    cardDetails: ICardDetail[];
    retentionSpillover: number;
    calibrationSpillover: number;
  } {
    const sortedRetention = this.sortByPriority(retention, scores);
    const sortedCalibration = this.sortByPriority(calibration, scores);

    const retentionTarget = Math.round(maxCards * mix.retention);
    const calibrationTarget = Math.max(0, maxCards - retentionTarget);

    // --- Primary selection (from own lane, by priority) ---
    const retainedPrimary = sortedRetention.slice(0, retentionTarget);
    const calibratedPrimary = sortedCalibration.slice(0, calibrationTarget);

    let retentionSpillover = 0;
    let calibrationSpillover = 0;
    const spilloverCards: { cardId: CardId; lane: SchedulerLane }[] = [];

    // --- Spillover: fill remaining slots from the other lane (by priority) ---
    const totalPrimary = retainedPrimary.length + calibratedPrimary.length;
    const remaining = maxCards - totalPrimary;

    if (remaining > 0) {
      const retentionRemainder = this.sortByPriority(
        sortedRetention.slice(retainedPrimary.length),
        scores
      );
      const calibrationRemainder = this.sortByPriority(
        sortedCalibration.slice(calibratedPrimary.length),
        scores
      );

      // Merge remainders by priority and take what we need
      const allRemainder = [
        ...retentionRemainder.map((id) => ({ cardId: id, lane: 'retention' as SchedulerLane })),
        ...calibrationRemainder.map((id) => ({
          cardId: id,
          lane: 'calibration' as SchedulerLane,
        })),
      ].sort((a, b) => (scores[b.cardId] ?? 0) - (scores[a.cardId] ?? 0));

      for (let i = 0; i < Math.min(remaining, allRemainder.length); i++) {
        const entry = allRemainder[i]!;
        spilloverCards.push(entry);

        // Count spillover direction: retention card filling calibration slots, or vice-versa
        if (retainedPrimary.length < retentionTarget && entry.lane === 'calibration') {
          // Calibration card spilling into retention slots
          calibrationSpillover++;
        } else if (calibratedPrimary.length < calibrationTarget && entry.lane === 'retention') {
          // Retention card spilling into calibration slots
          retentionSpillover++;
        } else if (entry.lane === 'retention') {
          retentionSpillover++;
        } else {
          calibrationSpillover++;
        }
      }
    }

    // --- Build detail records ---
    const retentionDetails: ICardDetail[] = retainedPrimary.map((cardId) => ({
      cardId,
      lane: 'retention' as SchedulerLane,
      score: scores[cardId] ?? 0,
      position: -1, // assigned after interleaving
      isSpillover: false,
    }));

    const calibrationDetails: ICardDetail[] = calibratedPrimary.map((cardId) => ({
      cardId,
      lane: 'calibration' as SchedulerLane,
      score: scores[cardId] ?? 0,
      position: -1,
      isSpillover: false,
    }));

    const spilloverDetails: ICardDetail[] = spilloverCards.map(({ cardId, lane }) => ({
      cardId,
      lane,
      score: scores[cardId] ?? 0,
      position: -1,
      isSpillover: true,
    }));

    // --- Interleave or block-order ---
    let orderedDetails: ICardDetail[];

    if (interleave) {
      orderedDetails = this.interleaveByRatio(
        retentionDetails,
        calibrationDetails,
        spilloverDetails,
        mix
      );
    } else {
      orderedDetails = [...retentionDetails, ...calibrationDetails, ...spilloverDetails];
    }

    // Assign final positions
    orderedDetails.forEach((d, i) => {
      d.position = i;
    });

    return {
      selectedCardIds: orderedDetails.map((d) => d.cardId),
      cardDetails: orderedDetails,
      retentionSpillover,
      calibrationSpillover,
    };
  }

  /**
   * Interleave retention and calibration cards using a ratio-based round-robin.
   * For an 80/20 mix this produces patterns like: R R R R C R R R R C ...
   * Spillover cards are appended in priority order at the end.
   */
  private interleaveByRatio(
    retentionDetails: ICardDetail[],
    calibrationDetails: ICardDetail[],
    spilloverDetails: ICardDetail[],
    mix: ISchedulerLaneMix
  ): ICardDetail[] {
    const result: ICardDetail[] = [];
    let ri = 0;
    let ci = 0;

    // retentionPerCalibration = retention / calibration. E.g. 0.8 / 0.2 = 4.
    // Insert a calibration card after every N retention cards.
    const retentionPerCalibration =
      mix.calibration > 0 ? mix.retention / mix.calibration : Infinity;

    // Count retention cards emitted since last calibration insertion
    let retentionCount = 0;

    while (ri < retentionDetails.length || ci < calibrationDetails.length) {
      if (ri < retentionDetails.length && ci < calibrationDetails.length) {
        // Both lanes have cards remaining
        if (retentionCount >= retentionPerCalibration) {
          // Time for a calibration card
          result.push(calibrationDetails[ci]!);
          ci++;
          retentionCount = 0;
        } else {
          result.push(retentionDetails[ri]!);
          ri++;
          retentionCount++;
        }
      } else if (ri < retentionDetails.length) {
        result.push(retentionDetails[ri]!);
        ri++;
      } else {
        result.push(calibrationDetails[ci]!);
        ci++;
      }
    }

    // Append spillover at the end (already sorted by priority)
    result.push(...spilloverDetails);

    return result;
  }

  private defaultHints(action: string, reasoning: string): IAgentHints {
    return {
      suggestedNextActions: [
        {
          action,
          description: reasoning,
          priority: 'high',
        },
      ],
      relatedResources: [],
      confidence: 1,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
      preferenceAlignment: [],
      reasoning,
    };
  }

  private async persistPlannedCards(
    userId: UserId,
    retentionCardIds: CardId[],
    calibrationCardIds: CardId[],
    selectedCardIds: CardId[]
  ): Promise<void> {
    if (this.repositories === undefined) {
      return;
    }

    const repositories = this.repositories;

    const retentionSet = new Set<CardId>(retentionCardIds);
    const calibrationSet = new Set<CardId>(calibrationCardIds);
    const now = new Date();

    await Promise.all(
      selectedCardIds.map(async (cardId) => {
        const lane: SchedulerLane = retentionSet.has(cardId)
          ? 'retention'
          : calibrationSet.has(cardId)
            ? 'calibration'
            : 'retention';

        const existing = await repositories.schedulerCardRepository.findByCard(userId, cardId);

        if (existing === null) {
          await repositories.schedulerCardRepository.create({
            id: `sc_${randomUUID()}`,
            cardId,
            userId,
            lane,
            stability: null,
            difficultyParameter: null,
            halfLife: null,
            interval: 0,
            nextReviewDate: now.toISOString(),
            lastReviewedAt: null,
            reviewCount: 0,
            lapseCount: 0,
            consecutiveCorrect: 0,
            schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
            cardType: null,
            difficulty: null,
            knowledgeNodeIds: [],
            state: 'new',
            suspendedUntil: null,
            suspendedReason: null,
            version: 1,
          });
          return;
        }

        await repositories.schedulerCardRepository.update(
          userId,
          cardId,
          {
            lane,
            nextReviewDate: now.toISOString(),
            schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
          },
          existing.version
        );
      })
    );
  }
}

export function buildExecutionContext(
  userId: UserId,
  correlationId: CorrelationId
): IExecutionContext {
  return { userId, correlationId };
}
