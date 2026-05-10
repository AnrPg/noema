import { describe, expect, it, vi } from 'vitest';
import { MetacognitionEventType } from '@noema/events';
import type { IStreamEventEnvelope } from '@noema/events/consumer';
import { MetacognitionEvaluationRecordedConsumer } from '../../../src/events/consumers/metacognition-evaluation-recorded.consumer.js';
import type { SessionService } from '../../../src/domain/session-service/session.service.js';

class TestConsumer extends MetacognitionEvaluationRecordedConsumer {
  public process(envelope: IStreamEventEnvelope): Promise<boolean> {
    return this.handleEvent(envelope);
  }
}

describe('MetacognitionEvaluationRecordedConsumer', () => {
  it('delegates evaluation-recorded events to session service finalization', async () => {
    const finalizeStepEvaluation = vi.fn(async () => null);
    const consumer = new TestConsumer(
      {} as never,
      { finalizeStepEvaluation } as unknown as SessionService,
      { child: () => ({ warn: vi.fn() }) } as never,
      'test-consumer'
    );

    await consumer.process({
      id: 'event_123',
      eventType: MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED,
      payload: {
        evaluationId: 'eval_123456789012345678901',
        stepId: 'step_123456789012345678901',
        sessionId: 'session_123456789012345678901',
        userId: 'user_123456789012345678901',
        conceptRefs: ['concept_123456789012345678901'],
        reasoningQuality: 0.8,
        confidenceSignal: 0.9,
        combinedScore: 0.85,
        correct: true,
        studyMode: 'knowledge_gaining',
        epistemicMode: 'generative_retrieval',
        transformation: 'recall',
      },
      metadata: { correlationId: 'cor_123' },
    } as unknown as IStreamEventEnvelope);

    expect(finalizeStepEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: 'step_123456789012345678901',
        evaluationId: 'eval_123456789012345678901',
      }),
      {
        userId: 'user_123456789012345678901',
        correlationId: 'cor_123',
      }
    );
  });

  it('ignores unrelated event types', async () => {
    const finalizeStepEvaluation = vi.fn(async () => null);
    const consumer = new TestConsumer(
      {} as never,
      { finalizeStepEvaluation } as unknown as SessionService,
      { child: () => ({ warn: vi.fn() }) } as never,
      'test-consumer'
    );

    const handled = await consumer.process({
      id: 'event_124',
      eventType: 'step.presented',
      payload: {},
      metadata: { correlationId: 'cor_124' },
    } as unknown as IStreamEventEnvelope);

    expect(handled).toBe(true);
    expect(finalizeStepEvaluation).not.toHaveBeenCalled();
  });
});
