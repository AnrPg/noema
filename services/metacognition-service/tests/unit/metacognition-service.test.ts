import { describe, expect, it, vi } from 'vitest';
import { EpistemicMode, StepSelfRating, StudyMode, TransformationType } from '@noema/types';
import type { IEventPublisher } from '@noema/events/publisher';
import { MetacognitionService } from '../../src/domain/metacognition-service/metacognition.service.js';
import {
  EvaluationConflictError,
  ValidationError,
} from '../../src/domain/metacognition-service/errors.js';
import type { IMetacognitionRepository } from '../../src/domain/metacognition-service/metacognition.repository.js';
import type { IEvaluation } from '../../src/domain/metacognition-service/types.js';

const trace = {
  frames: {
    f0: { score: 0.8, notes: 'prompt understood' },
    f1: { score: 0.8, notes: 'outcome clear' },
    f2: { score: 0.8, notes: 'mode used' },
    f3: { score: 0.8, notes: 'response grounded' },
    f4: { score: 0.8, notes: 'transform applied' },
    f5: { score: 0.8, notes: 'calibration plausible' },
    f6: { score: 0.8, notes: 'outcome checked' },
  },
};

function createService(existingEvaluation: IEvaluation | null = null): MetacognitionService {
  const repository: IMetacognitionRepository = {
    findEvaluationByStepId: vi.fn(() => Promise.resolve(existingEvaluation)),
    createEvaluationWithTriggers: vi.fn((evaluation, triggers) =>
      Promise.resolve({ evaluation, triggers })
    ),
    updateReasoningAverage: vi.fn(({ userId, conceptId, studyMode, evaluationId }) =>
      Promise.resolve({
        userId,
        conceptId,
        studyMode,
        averageReasoning: 0.8,
        sampleCount: 1,
        windowSize: 10,
        lastEvaluationAt: '2026-05-02T00:00:00.000Z',
        recentEvaluationIds: [evaluationId],
        updatedAt: '2026-05-02T00:00:00.000Z',
      })
    ),
    getReasoningAverage: vi.fn(() => Promise.resolve(null)),
    findRecentEvaluations: vi.fn(() => Promise.resolve([])),
  };
  const publisher: IEventPublisher = {
    publish: vi.fn(() => Promise.resolve(undefined)),
    publishBatch: vi.fn(() => Promise.resolve(undefined)),
  };
  return new MetacognitionService(repository, publisher, { info: vi.fn() } as never);
}

describe('MetacognitionService', () => {
  it('rejects evaluation payloads that omit studyMode', async () => {
    const service = createService();

    await expect(
      service.recordEvaluation(
        {
          stepId: 'step_123456789012345678901',
          lessonPlanId: 'lesson_123456789012345678901',
          sessionId: 'session_123456789012345678901',
          conceptRefs: ['concept_123456789012345678901'],
          selectedNodeIds: ['cnode_123456789012345678901'],
          correct: true,
          selfRating: StepSelfRating.KNEW_IT,
          trace,
          responseTimeMs: 1000,
          epistemicMode: EpistemicMode.TEACHING_TO_LEARN,
          transformation: TransformationType.EXPLANATION,
        },
        {
          userId: 'user_123456789012345678901' as never,
          correlationId: 'cor_123456789012345678901' as never,
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('records evaluations under the explicit studyMode', async () => {
    const service = createService();
    const result = await service.recordEvaluation(
      {
        stepId: 'step_223456789012345678901',
        lessonPlanId: 'lesson_123456789012345678901',
        sessionId: 'session_123456789012345678901',
        conceptRefs: ['concept_123456789012345678901'],
        selectedNodeIds: ['cnode_123456789012345678901'],
        correct: true,
        selfRating: StepSelfRating.KNEW_IT,
        trace,
        responseTimeMs: 1000,
        studyMode: StudyMode.LANGUAGE_LEARNING,
        epistemicMode: EpistemicMode.TEACHING_TO_LEARN,
        transformation: TransformationType.EXPLANATION,
      },
      {
        userId: 'user_123456789012345678901' as never,
        correlationId: 'cor_123456789012345678901' as never,
      }
    );

    expect(result.evaluation.studyMode).toBe(StudyMode.LANGUAGE_LEARNING);
    expect(result.reasoningAverages[0]?.studyMode).toBe(StudyMode.LANGUAGE_LEARNING);
  });

  it('projects a learner-safe seven-frame trace evidence pack', async () => {
    const evaluation: IEvaluation = {
      id: 'eval_trace_pack_1234567890' as never,
      stepId: 'step_trace_pack_1234567890' as never,
      lessonPlanId: 'lesson_123456789012345678901' as never,
      sessionId: 'session_123456789012345678901' as never,
      userId: 'user_123456789012345678901' as never,
      conceptRefs: ['concept_123456789012345678901'] as never,
      selectedNodeIds: ['cnode_123456789012345678901'] as never,
      correct: false,
      correctnessScore: 0,
      selfRating: StepSelfRating.KNEW_IT,
      reasoningQuality: 0.42,
      confidenceSignal: 1,
      combinedScore: 0.49,
      schedulerRating: 'hard' as never,
      trace: {
        frames: {
          f0: { score: 0.8, notes: 'understood the task' },
          f1: { score: 0.3, notes: 'used a surface cue' },
          f2: { score: 0.6, notes: 'retrieval was partial' },
          f3: { score: 0.6, notes: 'strategy was plausible' },
          f4: { score: 0.5, notes: 'execution was mixed' },
          f5: { score: 0.2, notes: 'skipped the check' },
          f6: { score: 0.7, notes: 'reflection was specific' },
        },
      },
      triggersFired: [],
      responseTimeMs: 1000,
      hintRequestCount: 0,
      revisionCount: 0,
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      epistemicMode: EpistemicMode.TEACHING_TO_LEARN,
      transformation: TransformationType.EXPLANATION,
      createdAt: '2026-05-04T00:00:00.000Z',
    };
    const service = createService(evaluation);

    const pack = await service.getTraceEvidencePack(evaluation.stepId, evaluation.userId);

    expect(pack?.frameEvidence).toHaveLength(7);
    expect(pack?.fragileFramesText.join(' ')).toContain('Cue selection');
    expect(pack?.traceSummaryText).toContain('overall trace quality is fragile');
    expect(pack?.traceCompleteness.state).toBe('complete');
  });

  it('rejects duplicate step evaluations with different selected nodes', async () => {
    const service = createService({
      id: 'eval_123456789012345678901' as never,
      stepId: 'step_323456789012345678901' as never,
      lessonPlanId: 'lesson_123456789012345678901' as never,
      sessionId: 'session_123456789012345678901' as never,
      userId: 'user_123456789012345678901' as never,
      conceptRefs: ['concept_123456789012345678901'] as never,
      selectedNodeIds: ['cnode_123456789012345678901'] as never,
      correct: true,
      correctnessScore: 1,
      selfRating: StepSelfRating.KNEW_IT,
      reasoningQuality: 0.8,
      confidenceSignal: 1,
      combinedScore: 0.9,
      schedulerRating: 'easy' as never,
      trace,
      triggersFired: [],
      responseTimeMs: 1000,
      hintRequestCount: 0,
      revisionCount: 0,
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      epistemicMode: EpistemicMode.TEACHING_TO_LEARN,
      transformation: TransformationType.EXPLANATION,
      createdAt: '2026-05-04T00:00:00.000Z',
    });

    await expect(
      service.recordEvaluation(
        {
          evaluationId: 'eval_123456789012345678901' as never,
          stepId: 'step_323456789012345678901' as never,
          lessonPlanId: 'lesson_123456789012345678901' as never,
          sessionId: 'session_123456789012345678901' as never,
          conceptRefs: ['concept_123456789012345678901'] as never,
          selectedNodeIds: ['cnode_223456789012345678901'] as never,
          correct: true,
          selfRating: StepSelfRating.KNEW_IT,
          trace,
          responseTimeMs: 1000,
          studyMode: StudyMode.KNOWLEDGE_GAINING,
          epistemicMode: EpistemicMode.TEACHING_TO_LEARN,
          transformation: TransformationType.EXPLANATION,
        },
        {
          userId: 'user_123456789012345678901' as never,
          correlationId: 'cor_123456789012345678901' as never,
        }
      )
    ).rejects.toBeInstanceOf(EvaluationConflictError);
  });

  it('summarizes repeated patterns and calibration trends from recent evaluations', async () => {
    const conceptId = 'concept_123456789012345678901' as never;
    const evaluation = (id: string, selfRating: StepSelfRating, reasoningQuality: number): IEvaluation => ({
      id: id as never,
      stepId: `step_${id}` as never,
      lessonPlanId: 'lesson_123456789012345678901' as never,
      sessionId: 'session_123456789012345678901' as never,
      userId: 'user_123456789012345678901' as never,
      conceptRefs: [conceptId],
      selectedNodeIds: ['cnode_123456789012345678901'] as never,
      correct: reasoningQuality >= 0.5,
      correctnessScore: reasoningQuality >= 0.5 ? 1 : 0,
      selfRating,
      reasoningQuality,
      confidenceSignal: selfRating === StepSelfRating.KNEW_IT ? 1 : selfRating === StepSelfRating.HESITATED ? 0.5 : 0,
      combinedScore: reasoningQuality,
      schedulerRating: 'hard' as never,
      trace: {
        frames: {
          ...trace.frames,
          f1: { score: 0.2, notes: 'selected a surface cue' },
          f5: { score: 0.2, notes: 'did not check the result' },
        },
      },
      triggersFired: [],
      responseTimeMs: 1000,
      hintRequestCount: 0,
      revisionCount: 0,
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      epistemicMode: EpistemicMode.TEACHING_TO_LEARN,
      transformation: TransformationType.EXPLANATION,
      createdAt: '2026-05-04T00:00:00.000Z',
    });
    const evaluations = [
      evaluation('eval_a', StepSelfRating.KNEW_IT, 0.4),
      evaluation('eval_b', StepSelfRating.DIDNT_KNOW, 0.8),
      evaluation('eval_c', StepSelfRating.HESITATED, 0.75),
    ];
    const repository: IMetacognitionRepository = {
      findEvaluationByStepId: vi.fn(() => Promise.resolve(null)),
      createEvaluationWithTriggers: vi.fn(),
      updateReasoningAverage: vi.fn(),
      getReasoningAverage: vi.fn(),
      findRecentEvaluations: vi.fn(() => Promise.resolve(evaluations)),
    } as never;
    const service = new MetacognitionService(
      repository,
      { publish: vi.fn(), publishBatch: vi.fn() } as never,
      { info: vi.fn() } as never
    );

    const patterns = await service.getRepeatedPatternHistory(
      'user_123456789012345678901' as never,
      [conceptId],
      StudyMode.KNOWLEDGE_GAINING
    );
    const trend = await service.getCalibrationTrendSummary(
      'user_123456789012345678901' as never,
      [conceptId],
      StudyMode.KNOWLEDGE_GAINING
    );
    const mismatch = await service.getConceptMismatchHistory(
      'user_123456789012345678901' as never,
      conceptId,
      StudyMode.KNOWLEDGE_GAINING
    );

    expect(patterns.patternSummaries[0]?.patternLabelText).toContain('Cue selection');
    expect(trend.overconfidenceCount).toBe(1);
    expect(trend.underconfidenceCount).toBe(1);
    expect(trend.hesitationWithQualityCount).toBe(1);
    expect(mismatch.reasoningVersusConfidenceText).toContain('overconfidence');
  });
});
