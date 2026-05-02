import { describe, expect, it, vi } from 'vitest';
import { EpistemicMode, StepSelfRating, StudyMode, TransformationType } from '@noema/types';
import type { IEventPublisher } from '@noema/events/publisher';
import { MetacognitionService } from '../../src/domain/metacognition-service/metacognition.service.js';
import { ValidationError } from '../../src/domain/metacognition-service/errors.js';
import type { IMetacognitionRepository } from '../../src/domain/metacognition-service/metacognition.repository.js';

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

function createService(): MetacognitionService {
  const repository: IMetacognitionRepository = {
    findEvaluationByStepId: vi.fn(() => Promise.resolve(null)),
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
          lessonPlanId: 'lplan_123456789012345678901',
          sessionId: 'session_123456789012345678901',
          conceptRefs: ['concept_123456789012345678901'],
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
        lessonPlanId: 'lplan_123456789012345678901',
        sessionId: 'session_123456789012345678901',
        conceptRefs: ['concept_123456789012345678901'],
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
});
