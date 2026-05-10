import {
  ConceptState,
  type ConceptId,
  type EvaluationId,
  type StudyMode,
  type UserId,
} from '@noema/types';
import type { IEventPublisher } from '../shared/event-publisher.js';
import type {
  ConceptStateHistoryTrigger,
  IConceptStateHistoryEntry,
  IConceptStateProjection,
  IConceptStateRepository,
  IConceptStateSummaryEntry,
} from './concept-state.repository.js';

const DEFAULT_STUDY_MODE: StudyMode = 'knowledge_gaining';

export interface IConceptStateThresholds {
  readonly S_RET: number;
  readonly R_REAS: number;
  readonly N_REASONING_WINDOW: number;
}

export interface IConceptStateGraphPort {
  setConceptState(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly state: ConceptState;
  }): Promise<void>;

  getPrerequisiteConceptIds(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
  }): Promise<ConceptId[]>;

  getConceptDomains(input: {
    readonly userId: UserId;
    readonly conceptIds: readonly ConceptId[];
  }): Promise<Map<ConceptId, string>>;
}

export interface IConceptStateRecomputeInput {
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode?: StudyMode;
  readonly evaluationId?: EvaluationId;
  readonly fsrsStability?: number | null;
  readonly reasoningQuality?: number;
  readonly stepId?: string;
  readonly evaluatedAt?: string;
  readonly eventId?: string;
  readonly eventType?: string;
  readonly correlationId?: string;
}

export interface IConceptStateHistoryQuery {
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode: StudyMode;
  readonly limit: number;
}

export interface IConceptStateSummary {
  readonly userId: UserId;
  readonly studyMode: StudyMode;
  readonly totalConcepts: number;
  readonly stableConcepts: number;
  readonly unstableConcepts: number;
  readonly stabilityRatio: number;
  readonly averageReasoning: number | null;
  readonly averageFsrsStability: number | null;
  readonly domains: readonly IConceptStateSummaryEntry[];
}

export interface IConceptStateRecomputeStaleResult {
  readonly checked: number;
  readonly changed: number;
}

export class ConceptStateService {
  constructor(
    private readonly repository: IConceptStateRepository,
    private readonly graphPort: IConceptStateGraphPort,
    private readonly eventPublisher: IEventPublisher,
    private readonly thresholds: IConceptStateThresholds = {
      S_RET: 21,
      R_REAS: 0.6,
      N_REASONING_WINDOW: 10,
    }
  ) {}

  deriveState(input: {
    readonly fsrsStability: number | null;
    readonly reasoningAverage: number | null;
  }): ConceptState {
    const retentionPass =
      input.fsrsStability !== null && input.fsrsStability >= this.thresholds.S_RET;
    const reasoningPass =
      input.reasoningAverage !== null && input.reasoningAverage >= this.thresholds.R_REAS;
    return retentionPass && reasoningPass ? ConceptState.STABLE : ConceptState.UNSTABLE;
  }

  async recompute(input: IConceptStateRecomputeInput): Promise<IConceptStateProjection> {
    const studyMode = input.studyMode ?? DEFAULT_STUDY_MODE;
    const eventId = input.eventId;
    if (eventId !== undefined && input.eventType !== undefined) {
      const firstProcessing = await this.repository.markEventProcessed({
        eventId,
        eventType: input.eventType,
        userId: input.userId,
        conceptId: input.conceptId,
        studyMode,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      });
      if (!firstProcessing) {
        const existing = await this.repository.getProjection({
          userId: input.userId,
          conceptId: input.conceptId,
          studyMode,
        });
        if (existing !== null) return existing;
      }
    }

    if (
      input.evaluationId !== undefined &&
      input.reasoningQuality !== undefined &&
      input.stepId !== undefined
    ) {
      await this.repository.recordReasoningEvidence({
        userId: input.userId,
        conceptId: input.conceptId,
        studyMode,
        evaluationId: input.evaluationId,
        stepId: input.stepId,
        reasoningQuality: input.reasoningQuality,
        evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
      });
    }

    const existing = await this.repository.getProjection({
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode,
    });
    const reasoningAverage = await this.repository.getReasoningAverage({
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode,
      windowSize: this.thresholds.N_REASONING_WINDOW,
    });
    const fsrsStability = input.fsrsStability ?? existing?.fsrsStability ?? null;
    const state = this.deriveState({ fsrsStability, reasoningAverage });
    const computedAt = new Date().toISOString();
    const triggeredBy = historyTriggerFor(input);

    const result = await this.repository.upsertProjection({
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode,
      fsrsStability,
      reasoningAverage,
      evidenceWindow: this.thresholds.N_REASONING_WINDOW,
      lastEvaluationId: input.evaluationId ?? existing?.lastEvaluationId ?? null,
      computedAt,
      state,
    });

    await this.graphPort.setConceptState({
      userId: input.userId,
      conceptId: input.conceptId,
      studyMode,
      state,
    });

    if (result.changed) {
      await this.repository.appendHistory({
        userId: input.userId,
        conceptId: input.conceptId,
        studyMode,
        fromState: result.fromState,
        toState: state,
        triggeredBy,
        fsrsStability,
        reasoningAverage,
        evaluationId: input.evaluationId ?? null,
        changedAt: computedAt,
      });

      await this.eventPublisher.publish({
        eventType: 'knowledge_graph.concept_state.changed',
        aggregateType: 'ConceptStateProjection',
        aggregateId: `${input.userId}:${input.conceptId}:${studyMode}`,
        payload: {
          userId: input.userId,
          conceptId: input.conceptId,
          studyMode,
          fromState: result.fromState,
          toState: state,
          triggeredBy,
          changedAt: computedAt,
        },
        metadata: {
          correlationId: (input.correlationId ?? `cor_${Date.now().toString(36)}`) as never,
          userId: input.userId,
          ...(eventId !== undefined ? { causationId: eventId } : {}),
        },
      });
    }

    return result.projection;
  }

  getProjection(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection | null> {
    return this.repository.getProjection(input);
  }

  getHistory(input: IConceptStateHistoryQuery): Promise<IConceptStateHistoryEntry[]> {
    return this.repository.getHistory(input);
  }

  async getPrerequisiteGaps(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection[]> {
    const prerequisiteIds = await this.graphPort.getPrerequisiteConceptIds(input);
    const projections = await Promise.all(
      prerequisiteIds.map((conceptId) =>
        this.repository.getProjection({
          userId: input.userId,
          conceptId,
          studyMode: input.studyMode,
        })
      )
    );
    return projections.filter(
      (projection): projection is IConceptStateProjection =>
        projection !== null && projection.state === ConceptState.UNSTABLE
    );
  }

  async getStabilitySummary(input: {
    readonly userId: UserId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateSummary> {
    const projections = await this.repository.listProjections(input);
    const domains = await this.graphPort.getConceptDomains({
      userId: input.userId,
      conceptIds: projections.map((projection) => projection.conceptId),
    });
    const byDomain = new Map<string, IConceptStateProjection[]>();
    for (const projection of projections) {
      const domain = domains.get(projection.conceptId) ?? 'general';
      byDomain.set(domain, [...(byDomain.get(domain) ?? []), projection]);
    }

    const domainEntries = [...byDomain.entries()].map(([domain, entries]) => {
      const stableConcepts = entries.filter((entry) => entry.state === ConceptState.STABLE).length;
      return {
        domain,
        totalConcepts: entries.length,
        stableConcepts,
        unstableConcepts: entries.length - stableConcepts,
        stabilityRatio: entries.length > 0 ? stableConcepts / entries.length : 0,
        averageReasoning: averageNullable(entries.map((entry) => entry.reasoningAverage)),
        averageFsrsStability: averageNullable(entries.map((entry) => entry.fsrsStability)),
      };
    });
    const stableConcepts = projections.filter(
      (projection) => projection.state === ConceptState.STABLE
    ).length;

    return {
      userId: input.userId,
      studyMode: input.studyMode,
      totalConcepts: projections.length,
      stableConcepts,
      unstableConcepts: projections.length - stableConcepts,
      stabilityRatio: projections.length > 0 ? stableConcepts / projections.length : 0,
      averageReasoning: averageNullable(projections.map((entry) => entry.reasoningAverage)),
      averageFsrsStability: averageNullable(projections.map((entry) => entry.fsrsStability)),
      domains: domainEntries.sort((a, b) => b.stableConcepts - a.stableConcepts),
    };
  }

  async recomputeStale(input: {
    readonly staleBefore: string;
    readonly limit: number;
    readonly correlationId?: string;
  }): Promise<IConceptStateRecomputeStaleResult> {
    const candidates = await this.repository.listRecomputeCandidates(input);
    let changed = 0;

    for (const candidate of candidates) {
      const before = candidate.state;
      const projection = await this.recompute({
        userId: candidate.userId,
        conceptId: candidate.conceptId,
        studyMode: candidate.studyMode,
        fsrsStability: candidate.fsrsStability,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      });
      if (projection.state !== before) changed += 1;
    }

    return { checked: candidates.length, changed };
  }
}

function historyTriggerFor(input: IConceptStateRecomputeInput): ConceptStateHistoryTrigger {
  if (input.eventType === 'metacognition.evaluation.recorded') return 'evaluation';
  if (input.eventType === 'scheduler.concept_state.updated') return 'recompute';
  return input.evaluationId !== undefined ? 'evaluation' : 'recompute';
}

function averageNullable(values: readonly (number | null)[]): number | null {
  const finiteValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  if (finiteValues.length === 0) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}
