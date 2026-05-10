import type { IEventPublisher } from '@noema/events/publisher';
import type {
  IEvidenceCompletenessDto,
  ICalibrationTrendSummaryDto,
  IConceptMismatchHistoryDto,
  IRepeatedPatternHistoryDto,
  ITraceEvidencePackDto,
  ITraceFrameEvidenceDto,
  ISevenFrameTraceDto,
} from '@noema/contracts';
import {
  MetacognitionEventType,
  type IMetacognitionEvaluationRecordedPayload,
  type IMetacognitionTriggerFiredPayload,
  type IReasoningAverageUpdatedPayload,
} from '@noema/events';
import {
  SELF_RATING_TO_CONFIDENCE,
  StepSelfRating,
  StudyMode,
  TriggerStatus,
  type ConceptId,
  type CorrelationId,
  type EvaluationId,
  type SchedulerRating,
  type StepId,
  type TriggerId,
  type UserId,
} from '@noema/types';
import { customAlphabet } from 'nanoid';
import type pino from 'pino';

import { combineSignals, DEFAULT_COMBINE_SIGNAL_CONFIG } from './combine-signals.js';
import { EvaluationConflictError, ValidationError } from './errors.js';
import { ratingFromCombinedScore } from './fsrs-rating.js';
import type { IMetacognitionRepository } from './metacognition.repository.js';
import { RecordEvaluationInputSchema } from './metacognition.schemas.js';
import { scoreReasoningQuality } from './reasoning-quality.js';
import { evaluateTriggerRules } from './triggers/index.js';
import type {
  IEvaluation,
  IRecordEvaluationInput,
  IRecordEvaluationResult,
  ITrigger,
} from './types.js';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21);

export interface IExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
}

export interface IMetacognitionServiceConfig {
  reasoningAverageWindowSize: number;
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = sortedStrings(left);
  const sortedRight = sortedStrings(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function isSameEvaluationInput(existing: IEvaluation, input: IRecordEvaluationInput): boolean {
  return (
    (input.evaluationId === undefined || input.evaluationId === existing.id) &&
    input.userId === existing.userId &&
    input.sessionId === existing.sessionId &&
    input.lessonPlanId === existing.lessonPlanId &&
    input.correct === existing.correct &&
    input.selfRating === existing.selfRating &&
    input.studyMode === existing.studyMode &&
    input.epistemicMode === existing.epistemicMode &&
    (input.transformation ?? undefined) === (existing.transformation ?? undefined) &&
    sameStringSet(input.conceptRefs, existing.conceptRefs) &&
    sameStringSet(input.selectedNodeIds, existing.selectedNodeIds)
  );
}

const TRACE_FRAME_METADATA: Array<{
  key: keyof ISevenFrameTraceDto['frames'];
  label: string;
  meaning: string;
}> = [
  { key: 'f0', label: 'Framing', meaning: 'How the task was understood.' },
  { key: 'f1', label: 'Cue selection', meaning: 'Which features or cues received attention.' },
  { key: 'f2', label: 'Retrieval', meaning: 'Which prior concept or pattern was brought in.' },
  { key: 'f3', label: 'Strategy', meaning: 'Which method or reasoning move was chosen.' },
  { key: 'f4', label: 'Execution', meaning: 'How the chosen move was carried out.' },
  { key: 'f5', label: 'Monitoring', meaning: 'Whether the result was checked.' },
  { key: 'f6', label: 'Reflection', meaning: 'What the learner inferred afterward.' },
];

function signalLabel(score: number | null): ITraceFrameEvidenceDto['signalLabel'] {
  if (score === null) return 'missing';
  if (score >= 0.7) return 'strong';
  if (score >= 0.45) return 'mixed';
  return 'fragile';
}

function confidenceNote(label: ITraceFrameEvidenceDto['signalLabel']): string {
  switch (label) {
    case 'strong':
      return 'This frame has enough recorded evidence to treat it as a relative strength.';
    case 'mixed':
      return 'This frame has partial evidence and should be described cautiously.';
    case 'fragile':
      return 'This frame is a useful fragile-point signal, not a stable trait claim.';
    case 'missing':
      return 'This frame is missing usable evidence, so no conclusion should be drawn from it.';
    default:
      return 'This frame should be described cautiously.';
  }
}

function buildFrameEvidence(trace: ISevenFrameTraceDto): ITraceFrameEvidenceDto[] {
  return TRACE_FRAME_METADATA.map((metadata) => {
    const frame = trace.frames[metadata.key];
    const score = typeof frame?.score === 'number' ? frame.score : null;
    const label = signalLabel(score);
    const notes = typeof frame?.notes === 'string' && frame.notes.trim().length > 0
      ? frame.notes.trim()
      : 'No frame notes were recorded.';
    return {
      frameKey: metadata.key,
      frameLabel: metadata.label,
      learnerReadableMeaning: metadata.meaning,
      score,
      signalLabel: label,
      evidenceText: notes,
      confidenceNoteText: confidenceNote(label),
      privacyClass: 'prompt_safe_summary',
      authority: 'detected_signal',
    };
  });
}

function traceCompletenessFor(frames: ITraceFrameEvidenceDto[]): IEvidenceCompletenessDto {
  const missing = frames
    .filter((frame) => frame.signalLabel === 'missing')
    .map((frame) => `frameEvidence.${frame.frameKey}`);
  return {
    state: missing.length === 0 ? 'complete' : 'missing_required',
    missingRequiredFields: missing,
    missingOptionalFields: [],
    notes:
      missing.length === 0
        ? ['All seven trace frames include score evidence.']
        : ['One or more trace frames are missing score evidence.'],
  };
}

function summarizeTrace(frames: ITraceFrameEvidenceDto[], reasoningQuality: number): string {
  const strongest = frames.filter((frame) => frame.signalLabel === 'strong').map((frame) => frame.frameLabel);
  const fragile = frames.filter((frame) => frame.signalLabel === 'fragile').map((frame) => frame.frameLabel);
  const qualityText =
    reasoningQuality >= 0.7 ? 'overall trace quality is strong'
    : reasoningQuality >= 0.45 ? 'overall trace quality is mixed'
    : 'overall trace quality is fragile';
  const strengthText = strongest.length > 0 ? ` Strongest frames: ${strongest.join(', ')}.` : '';
  const fragileText = fragile.length > 0 ? ` Fragile frames: ${fragile.join(', ')}.` : '';
  return `The ${qualityText}.${strengthText}${fragileText}`;
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function weakFrameLabels(evaluation: IEvaluation): string[] {
  return buildFrameEvidence(evaluation.trace)
    .filter((frame) => frame.signalLabel === 'fragile' || frame.signalLabel === 'missing')
    .map((frame) => frame.frameLabel);
}

function calibrationBucket(evaluation: IEvaluation): 'aligned' | 'overconfident' | 'underconfident' | 'hesitation_with_quality' {
  if (evaluation.selfRating === StepSelfRating.KNEW_IT && evaluation.reasoningQuality < 0.55) {
    return 'overconfident';
  }
  if (evaluation.selfRating === StepSelfRating.DIDNT_KNOW && evaluation.reasoningQuality >= 0.7) {
    return 'underconfident';
  }
  if (evaluation.selfRating === StepSelfRating.HESITATED && evaluation.reasoningQuality >= 0.7) {
    return 'hesitation_with_quality';
  }
  return 'aligned';
}

function conceptLabelFallback(conceptId: ConceptId): string {
  return conceptId.replace(/^concept[_:-]?/, '').replace(/[_-]+/g, ' ') || conceptId;
}

export class MetacognitionService {
  public constructor(
    private readonly repository: IMetacognitionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: pino.Logger,
    private readonly config: IMetacognitionServiceConfig = { reasoningAverageWindowSize: 10 }
  ) {}

  public async recordEvaluation(
    rawInput: unknown,
    context: IExecutionContext
  ): Promise<IRecordEvaluationResult> {
    const parsed = RecordEvaluationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError('Invalid evaluation payload', parsed.error.flatten());
    }

    const input = {
      ...parsed.data,
      userId: parsed.data.userId ?? context.userId,
    } as IRecordEvaluationInput;

    const existing = await this.repository.findEvaluationByStepId(input.stepId);
    if (existing !== null) {
      if (!isSameEvaluationInput(existing, input)) {
        throw new EvaluationConflictError(input.stepId);
      }
      const studyMode = existing.studyMode;
      const reasoningAverages = await Promise.all(
        existing.conceptRefs.map((conceptId) =>
          this.repository.getReasoningAverage(existing.userId, conceptId, studyMode)
        )
      );
      return {
        evaluation: existing,
        triggers: [],
        reasoningAverages: reasoningAverages.filter((average) => average !== null),
      };
    }

    const evaluationId = input.evaluationId ?? (`eval_${nanoid()}` as EvaluationId);
    const reasoningResult = scoreReasoningQuality(input.trace);
    const confidenceSignal = SELF_RATING_TO_CONFIDENCE[input.selfRating];
    const combinedScore = combineSignals(
      reasoningResult.reasoningQuality,
      confidenceSignal,
      DEFAULT_COMBINE_SIGNAL_CONFIG
    );
    const schedulerRating = ratingFromCombinedScore(combinedScore);

    const triggerCandidates = evaluateTriggerRules({
      evaluationId,
      userId: input.userId,
      stepId: input.stepId,
      sessionId: input.sessionId,
      conceptRefs: input.conceptRefs,
      correct: input.correct,
      selfRating: input.selfRating,
      reasoningQuality: reasoningResult.reasoningQuality,
      confidenceSignal,
      combinedScore,
      ...(input.errorType !== undefined ? { errorType: input.errorType } : {}),
      ...(input.misconceptionRef !== undefined ? { misconceptionRef: input.misconceptionRef } : {}),
      ...(input.responseTimeMs !== undefined ? { responseTimeMs: input.responseTimeMs } : {}),
      recentFailures: input.recentFailures ?? 0,
      prerequisiteGapConceptIds: input.prerequisiteGapConceptIds ?? [],
    });

    const now = new Date().toISOString();
    const studyMode = input.studyMode;
    const triggers: ITrigger[] = triggerCandidates.map((candidate) => ({
      id: `trigger_${nanoid()}` as TriggerId,
      evaluationId,
      userId: input.userId,
      type: candidate.type,
      severity: candidate.severity,
      detectedFromFrames: candidate.detectedFrom,
      conceptRefs: candidate.conceptRefs,
      selectedNodeIds: input.selectedNodeIds,
      studyMode,
      stepId: input.stepId,
      sessionId: input.sessionId,
      misconceptionRef: input.misconceptionRef ?? `trigger:${candidate.type}`,
      recommendedIntervention: candidate.recommendedIntervention,
      status: TriggerStatus.OPEN,
      createdAt: now,
      updatedAt: now,
    }));

    const evaluation: IEvaluation = {
      id: evaluationId,
      stepId: input.stepId,
      lessonPlanId: input.lessonPlanId,
      sessionId: input.sessionId,
      userId: input.userId,
      conceptRefs: input.conceptRefs,
      selectedNodeIds: input.selectedNodeIds,
      correct: input.correct,
      correctnessScore: input.correct ? 1 : 0,
      selfRating: input.selfRating,
      reasoningQuality: reasoningResult.reasoningQuality,
      confidenceSignal,
      combinedScore,
      schedulerRating,
      trace: input.trace,
      ...(input.errorType !== undefined ? { errorType: input.errorType } : {}),
      ...(input.misconceptionRef !== undefined ? { misconceptionRef: input.misconceptionRef } : {}),
      triggersFired: triggers.map((trigger) => trigger.id),
      recommendedAction: this.recommendAction(triggers),
      responseTimeMs: input.responseTimeMs ?? 0,
      hintRequestCount: input.hintRequestCount ?? 0,
      revisionCount: input.revisionCount ?? 0,
      studyMode,
      epistemicMode: input.epistemicMode,
      ...(input.transformation !== undefined ? { transformation: input.transformation } : {}),
      createdAt: now,
    };

    const persisted = await this.repository.createEvaluationWithTriggers(evaluation, triggers);
    const reasoningAverages = await Promise.all(
      input.conceptRefs.map((conceptId) =>
        this.repository.updateReasoningAverage({
          userId: input.userId,
          conceptId,
          studyMode,
          evaluationId,
          windowSize: this.config.reasoningAverageWindowSize,
        })
      )
    );

    await this.publishEvents(persisted.evaluation, persisted.triggers, reasoningAverages, context);
    this.logger.info(
      {
        evaluationId,
        triggerCount: triggers.length,
        conceptCount: input.conceptRefs.length,
      },
      'Recorded metacognition evaluation'
    );

    return { ...persisted, reasoningAverages };
  }

  public async getReasoningAverage(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING
  ): Promise<ReturnType<IMetacognitionRepository['getReasoningAverage']>> {
    return this.repository.getReasoningAverage(userId, conceptId, studyMode);
  }

  public async getEvaluationByStepId(stepId: string, userId?: UserId): Promise<IEvaluation | null> {
    const evaluation = await this.repository.findEvaluationByStepId(stepId);
    if (evaluation === null) return null;
    if (userId !== undefined && evaluation.userId !== userId) return null;
    return evaluation;
  }

  public async getAgentSafeDiagnosticBrief(
    stepId: string,
    userId?: UserId
  ): Promise<{
    stepId: StepId;
    evaluationId: EvaluationId;
    conceptRefs: ConceptId[];
    selectedNodeIds: IEvaluation['selectedNodeIds'];
    reasoningQuality: number;
    confidenceSignal: number;
    combinedScore: number;
    schedulerRating: SchedulerRating;
    recommendedAction?: string;
    riskLevel: 'low' | 'medium' | 'high';
  } | null> {
    const evaluation = await this.getEvaluationByStepId(stepId, userId);
    if (evaluation === null) return null;

    const riskLevel =
      evaluation.combinedScore < 0.4 || evaluation.reasoningQuality < 0.4
        ? 'high'
        : evaluation.combinedScore < 0.7 || evaluation.reasoningQuality < 0.7
          ? 'medium'
          : 'low';

    return {
      stepId: evaluation.stepId,
      evaluationId: evaluation.id,
      conceptRefs: evaluation.conceptRefs,
      selectedNodeIds: evaluation.selectedNodeIds,
      reasoningQuality: evaluation.reasoningQuality,
      confidenceSignal: evaluation.confidenceSignal,
      combinedScore: evaluation.combinedScore,
      schedulerRating: evaluation.schedulerRating,
      ...(evaluation.recommendedAction !== undefined
        ? { recommendedAction: evaluation.recommendedAction }
        : {}),
      riskLevel,
    };
  }

  public async getRemediationBrief(
    stepId: string,
    userId?: UserId
  ): Promise<{
    stepId: StepId;
    evaluationId: EvaluationId;
    recommendedAction: string;
    conceptRefs: ConceptId[];
    riskLevel: 'low' | 'medium' | 'high';
    triggersFired: TriggerId[];
  } | null> {
    const diagnostic = await this.getAgentSafeDiagnosticBrief(stepId, userId);
    const evaluation = await this.getEvaluationByStepId(stepId, userId);
    if (diagnostic === null || evaluation === null) return null;

    return {
      stepId: evaluation.stepId,
      evaluationId: evaluation.id,
      recommendedAction: evaluation.recommendedAction ?? 'continue',
      conceptRefs: evaluation.conceptRefs,
      riskLevel: diagnostic.riskLevel,
      triggersFired: evaluation.triggersFired,
    };
  }

  public async getTraceEvidencePack(
    stepId: string,
    userId?: UserId
  ): Promise<ITraceEvidencePackDto | null> {
    const evaluation = await this.getEvaluationByStepId(stepId, userId);
    if (evaluation === null) return null;
    const frameEvidence = buildFrameEvidence(evaluation.trace);
    const missingFramesText = frameEvidence
      .filter((frame) => frame.signalLabel === 'missing')
      .map((frame) => `${frame.frameLabel}: no usable frame evidence was recorded.`);
    const strongestFramesText = frameEvidence
      .filter((frame) => frame.signalLabel === 'strong')
      .map((frame) => `${frame.frameLabel}: ${frame.evidenceText}`);
    const fragileFramesText = frameEvidence
      .filter((frame) => frame.signalLabel === 'fragile')
      .map((frame) => `${frame.frameLabel}: ${frame.evidenceText}`);
    const traceCompleteness = traceCompletenessFor(frameEvidence);
    return {
      stepId: evaluation.stepId,
      evaluationId: evaluation.id,
      traceVersion: 'seven-frame-trace.v1',
      overallReasoningQuality: evaluation.reasoningQuality,
      frameEvidence,
      strongestFramesText,
      fragileFramesText,
      missingFramesText,
      traceSummaryText: summarizeTrace(frameEvidence, evaluation.reasoningQuality),
      traceCompleteness,
      serviceReferences: {
        stepId: evaluation.stepId,
        sessionId: evaluation.sessionId,
        lessonPlanId: evaluation.lessonPlanId,
        evaluationId: evaluation.id,
        conceptRefs: evaluation.conceptRefs,
      },
    };
  }

  public async getRepeatedPatternHistory(
    userId: UserId,
    conceptIds: ConceptId[],
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING,
    windowDays = 30
  ): Promise<IRepeatedPatternHistoryDto> {
    const evaluations = await this.repository.findRecentEvaluations({
      userId,
      conceptIds,
      studyMode,
      since: isoDaysAgo(windowDays),
      limit: 25,
    });
    const frameCounts = new Map<string, { count: number; lastSeen: string }>();
    for (const evaluation of evaluations) {
      for (const label of weakFrameLabels(evaluation)) {
        const existing = frameCounts.get(label);
        frameCounts.set(label, {
          count: (existing?.count ?? 0) + 1,
          lastSeen: existing?.lastSeen ?? evaluation.createdAt,
        });
      }
    }
    const patternSummaries = [...frameCounts.entries()]
      .filter(([, value]) => value.count >= 2)
      .sort((left, right) => right[1].count - left[1].count)
      .map(([label, value]) => ({
        patternLabelText: `${label} fragility repeated`,
        learnerSafeDescriptionText: `${label} has appeared as a fragile or missing reasoning frame in more than one recent Step.`,
        evidenceCount: value.count,
        affectedConceptLabelsText: conceptIds.map(conceptLabelFallback),
        typicalFragileFramesText: [label],
        lastSeenText: value.lastSeen,
        recommendedInterpretationText: 'Treat this as a repeated Step-local pattern, not as a stable learner trait.',
      }));
    return {
      userId,
      conceptIds,
      windowLabelText: `Last ${windowDays} days`,
      patternSummaries,
      singleSignalWarningText:
        evaluations.length === 0
          ? 'No prior similar Step evidence yet.'
          : 'Single fragile frames should be phrased as one-off evidence unless repeated here.',
      mostRecentSimilarStepsText:
        evaluations.length > 0
          ? evaluations.slice(0, 5).map((evaluation) => `Step ${evaluation.stepId}: reasoning quality ${evaluation.reasoningQuality.toFixed(2)}.`)
          : ['No prior similar Step evidence yet.'],
      trendDirectionText:
        evaluations.length < 2
          ? 'Not enough prior evidence to estimate a trend.'
          : evaluations[0]!.reasoningQuality >= evaluations[evaluations.length - 1]!.reasoningQuality
            ? 'Recent reasoning quality is steady or improving in this window.'
            : 'Recent reasoning quality is softer than earlier evidence in this window.',
      confidenceNoteText:
        evaluations.length >= 5
          ? 'Moderate confidence: several recent evaluations are available.'
          : 'Low confidence: this summary is based on a small recent sample.',
      serviceReferences: {
        evaluationIds: evaluations.map((evaluation) => evaluation.id),
        stepIds: evaluations.map((evaluation) => evaluation.stepId),
      },
    };
  }

  public async getCalibrationTrendSummary(
    userId: UserId,
    conceptIds: ConceptId[],
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING,
    windowDays = 30
  ): Promise<ICalibrationTrendSummaryDto> {
    const evaluations = await this.repository.findRecentEvaluations({
      userId,
      conceptIds,
      studyMode,
      since: isoDaysAgo(windowDays),
      limit: 30,
    });
    const buckets = evaluations.map(calibrationBucket);
    const alignedCount = buckets.filter((bucket) => bucket === 'aligned').length;
    const overconfidenceCount = buckets.filter((bucket) => bucket === 'overconfident').length;
    const underconfidenceCount = buckets.filter((bucket) => bucket === 'underconfident').length;
    const hesitationWithQualityCount = buckets.filter((bucket) => bucket === 'hesitation_with_quality').length;
    const sampleCount = evaluations.length;
    const alignmentRate = sampleCount === 0 ? 0 : Number((alignedCount / sampleCount).toFixed(4));
    return {
      userId,
      conceptIds,
      recentCalibrationTrendText:
        sampleCount === 0
          ? 'No recent calibration trend recorded yet.'
          : `Recent calibration: ${alignedCount}/${sampleCount} aligned, ${overconfidenceCount} overconfident, ${underconfidenceCount} underconfident.`,
      alignmentRate,
      overconfidenceCount,
      underconfidenceCount,
      hesitationWithQualityCount,
      trendWindow: {
        windowLabelText: `Last ${windowDays} days`,
        sampleCount,
      },
      evidenceExamplesText:
        sampleCount > 0
          ? evaluations.slice(0, 5).map((evaluation) => `Step ${evaluation.stepId}: self-rating ${evaluation.selfRating}, reasoning ${evaluation.reasoningQuality.toFixed(2)}.`)
          : ['No recent calibration examples recorded yet.'],
      confidenceInTrendText:
        sampleCount >= 6
          ? 'Moderate confidence: enough recent examples exist to coach gently.'
          : 'Low confidence: use this as a prompt-safe hint, not a strong conclusion.',
      serviceReferences: { evaluationIds: evaluations.map((evaluation) => evaluation.id) },
    };
  }

  public async getConceptMismatchHistory(
    userId: UserId,
    conceptId: ConceptId,
    studyMode: StudyMode = StudyMode.KNOWLEDGE_GAINING,
    windowDays = 30
  ): Promise<IConceptMismatchHistoryDto> {
    const evaluations = await this.repository.findRecentEvaluations({
      userId,
      conceptIds: [conceptId],
      studyMode,
      since: isoDaysAgo(windowDays),
      limit: 20,
    });
    const buckets = evaluations.map(calibrationBucket);
    const overconfidenceCount = buckets.filter((bucket) => bucket === 'overconfident').length;
    const underconfidenceCount = buckets.filter((bucket) => bucket === 'underconfident').length;
    const highQualityHesitationCount = buckets.filter((bucket) => bucket === 'hesitation_with_quality').length;
    const mismatchPatternText =
      evaluations.length === 0
        ? 'No concept-specific confidence/reasoning mismatch history recorded yet.'
        : overconfidenceCount > underconfidenceCount
          ? 'Recent evidence leans toward confidence running ahead of reasoning evidence.'
          : underconfidenceCount + highQualityHesitationCount > overconfidenceCount
            ? 'Recent evidence leans toward the learner underrating usable reasoning.'
            : 'Recent confidence and reasoning evidence are mostly aligned.';
    return {
      userId,
      conceptId,
      conceptLabelText: conceptLabelFallback(conceptId),
      mismatchPatternText,
      reasoningVersusConfidenceText:
        evaluations.length === 0
          ? 'No recent examples are available for this concept.'
          : `Across ${evaluations.length} recent example(s): ${overconfidenceCount} overconfidence signal(s), ${underconfidenceCount} underconfidence signal(s), ${highQualityHesitationCount} hesitation-with-quality signal(s).`,
      recentExamplesText:
        evaluations.length > 0
          ? evaluations.slice(0, 5).map((evaluation) => `Step ${evaluation.stepId}: ${calibrationBucket(evaluation).replace(/_/g, ' ')}, reasoning ${evaluation.reasoningQuality.toFixed(2)}.`)
          : ['No recent concept-specific mismatch examples recorded yet.'],
      recommendedCalibrationMoveText:
        overconfidenceCount > underconfidenceCount
          ? 'Ask for one evidence check before confidence is accepted.'
          : underconfidenceCount + highQualityHesitationCount > overconfidenceCount
            ? 'Reflect back the concrete evidence the learner already used well.'
            : 'Use light-touch calibration; do not over-coach.',
      serviceReferences: {
        conceptId,
        evaluationIds: evaluations.map((evaluation) => evaluation.id),
      },
    };
  }

  private recommendAction(triggers: ITrigger[]): string {
    if (triggers.length === 0) return 'continue';
    const highest = [...triggers].sort((a, b) => b.severity - a.severity)[0];
    return highest?.recommendedIntervention ?? 'continue';
  }

  private async publishEvents(
    evaluation: IEvaluation,
    triggers: ITrigger[],
    reasoningAverages: IRecordEvaluationResult['reasoningAverages'],
    context: IExecutionContext
  ): Promise<void> {
    const evaluationPayload: IMetacognitionEvaluationRecordedPayload = {
      evaluationId: evaluation.id,
      stepId: evaluation.stepId,
      sessionId: evaluation.sessionId,
      userId: evaluation.userId,
      conceptRefs: evaluation.conceptRefs,
      selectedNodeIds: evaluation.selectedNodeIds,
      reasoningQuality: evaluation.reasoningQuality,
      confidenceSignal: evaluation.confidenceSignal,
      combinedScore: evaluation.combinedScore,
      correct: evaluation.correct,
      studyMode: evaluation.studyMode,
      epistemicMode: evaluation.epistemicMode,
      ...(evaluation.transformation !== undefined
        ? { transformation: evaluation.transformation }
        : {}),
    };

    const events = [
      {
        eventType: MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED,
        aggregateType: 'Evaluation',
        aggregateId: evaluation.id,
        payload: evaluationPayload,
        metadata: { correlationId: context.correlationId, userId: evaluation.userId },
      },
      ...reasoningAverages.map((average) => {
        const payload: IReasoningAverageUpdatedPayload = {
          userId: average.userId,
          conceptId: average.conceptId,
          studyMode: average.studyMode,
          newAverage: average.averageReasoning,
          windowSize: average.windowSize,
        };
        return {
          eventType: MetacognitionEventType.REASONING_AVERAGE_UPDATED,
          aggregateType: 'ConceptReasoningRollup',
          aggregateId: `${average.userId}:${average.conceptId}:${average.studyMode}`,
          payload,
          metadata: { correlationId: context.correlationId, userId: average.userId },
        };
      }),
      ...triggers.map((trigger) => {
        const payload: IMetacognitionTriggerFiredPayload = {
          triggerId: trigger.id,
          userId: trigger.userId,
          type: trigger.type,
          severity: trigger.severity,
          conceptRefs: trigger.conceptRefs,
          selectedNodeIds: evaluation.selectedNodeIds,
          stepId: trigger.stepId as NonNullable<typeof trigger.stepId>,
          sessionId: trigger.sessionId as NonNullable<typeof trigger.sessionId>,
          studyMode: evaluation.studyMode,
          recommendedIntervention: trigger.recommendedIntervention,
        };
        return {
          eventType: MetacognitionEventType.METACOGNITION_TRIGGER_FIRED,
          aggregateType: 'Trigger',
          aggregateId: trigger.id,
          payload,
          metadata: { correlationId: context.correlationId, userId: trigger.userId },
        };
      }),
    ];

    await this.eventPublisher.publishBatch(events);
  }
}
