import type { ConceptId, ConceptState, EvaluationId, StudyMode, UserId } from '@noema/types';

export type ConceptStateHistoryTrigger = 'evaluation' | 'recompute' | 'manual';

export interface IConceptStateProjection {
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode: StudyMode;
  readonly state: ConceptState;
  readonly fsrsStability: number | null;
  readonly reasoningAverage: number | null;
  readonly evidenceWindow: number;
  readonly lastEvaluationId: EvaluationId | null;
  readonly lastChangedAt: string | null;
  readonly attemptsSinceStable: number;
  readonly computedAt: string;
  readonly updatedAt: string;
}

export interface IConceptStateHistoryEntry {
  readonly id: string;
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode: StudyMode;
  readonly fromState: ConceptState;
  readonly toState: ConceptState;
  readonly triggeredBy: ConceptStateHistoryTrigger;
  readonly fsrsStability: number | null;
  readonly reasoningAverage: number | null;
  readonly evaluationId: EvaluationId | null;
  readonly changedAt: string;
  readonly createdAt: string;
}

export interface IConceptReasoningEvidenceInput {
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode: StudyMode;
  readonly evaluationId: EvaluationId;
  readonly stepId: string;
  readonly reasoningQuality: number;
  readonly evaluatedAt: string;
}

export interface IConceptStateUpsertInput {
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode: StudyMode;
  readonly fsrsStability: number | null;
  readonly reasoningAverage: number | null;
  readonly evidenceWindow: number;
  readonly lastEvaluationId: EvaluationId | null;
  readonly computedAt: string;
}

export interface IConceptStateHistoryInput {
  readonly userId: UserId;
  readonly conceptId: ConceptId;
  readonly studyMode: StudyMode;
  readonly fromState: ConceptState;
  readonly toState: ConceptState;
  readonly triggeredBy: ConceptStateHistoryTrigger;
  readonly fsrsStability: number | null;
  readonly reasoningAverage: number | null;
  readonly evaluationId: EvaluationId | null;
  readonly changedAt: string;
}

export interface IConceptStateSummaryEntry {
  readonly domain: string;
  readonly totalConcepts: number;
  readonly stableConcepts: number;
  readonly unstableConcepts: number;
  readonly stabilityRatio: number;
  readonly averageReasoning: number | null;
  readonly averageFsrsStability: number | null;
}

export interface IConceptStateRepository {
  markEventProcessed(input: {
    readonly eventId: string;
    readonly eventType: string;
    readonly userId?: UserId;
    readonly conceptId?: ConceptId;
    readonly studyMode?: StudyMode;
    readonly correlationId?: string;
  }): Promise<boolean>;

  recordReasoningEvidence(input: IConceptReasoningEvidenceInput): Promise<void>;

  getReasoningAverage(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly windowSize: number;
  }): Promise<number | null>;

  getProjection(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection | null>;

  listProjections(input: {
    readonly userId: UserId;
    readonly studyMode: StudyMode;
  }): Promise<IConceptStateProjection[]>;

  listRecomputeCandidates(input: {
    readonly staleBefore: string;
    readonly limit: number;
  }): Promise<IConceptStateProjection[]>;

  upsertProjection(input: IConceptStateUpsertInput & { readonly state: ConceptState }): Promise<{
    readonly projection: IConceptStateProjection;
    readonly fromState: ConceptState;
    readonly changed: boolean;
  }>;

  appendHistory(input: IConceptStateHistoryInput): Promise<IConceptStateHistoryEntry>;

  getHistory(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly limit: number;
  }): Promise<IConceptStateHistoryEntry[]>;
}
