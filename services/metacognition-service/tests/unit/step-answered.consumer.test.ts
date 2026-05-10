import { describe, expect, it, vi } from 'vitest';
import { StepEventType } from '@noema/events';
import type { IStreamEventEnvelope } from '@noema/events/consumer';
import { StepAnsweredConsumer } from '../../src/events/consumers/step-answered.consumer.js';
import type { MetacognitionService } from '../../src/domain/metacognition-service/index.js';

class TestConsumer extends StepAnsweredConsumer {
  public process(envelope: IStreamEventEnvelope): Promise<boolean> {
    return this.handleEvent(envelope);
  }
}

describe('StepAnsweredConsumer', () => {
  it('delegates step.answered events to metacognition service', async () => {
    const recordEvaluation = vi.fn(async () => undefined);
    const consumer = new TestConsumer(
      {} as never,
      { child: () => ({ warn: vi.fn() }) } as never,
      'test-consumer',
      { recordEvaluation } as unknown as MetacognitionService
    );

    await consumer.process({
      id: 'event_123',
      eventType: StepEventType.STEP_ANSWERED,
      payload: {
        evaluationId: 'eval_123456789012345678901',
        stepId: 'step_123456789012345678901',
        lessonPlanId: 'lplan_123456789012345678901',
        sessionId: 'session_123456789012345678901',
        userId: 'user_123456789012345678901',
        conceptRefs: ['concept_123456789012345678901'],
        correct: true,
        selfRating: 'knew_it',
        trace: { frames: {} },
        studyMode: 'knowledge_gaining',
        epistemicMode: 'generative_retrieval',
        transformation: 'recall',
      },
      metadata: { correlationId: 'cor_123' },
    } as unknown as IStreamEventEnvelope);

    expect(recordEvaluation).toHaveBeenCalledWith(
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
    const recordEvaluation = vi.fn(async () => undefined);
    const consumer = new TestConsumer(
      {} as never,
      { child: () => ({ warn: vi.fn() }) } as never,
      'test-consumer',
      { recordEvaluation } as unknown as MetacognitionService
    );

    const handled = await consumer.process({
      id: 'event_124',
      eventType: 'session.started',
      payload: {},
      metadata: { correlationId: 'cor_124' },
    } as unknown as IStreamEventEnvelope);

    expect(handled).toBe(true);
    expect(recordEvaluation).not.toHaveBeenCalled();
  });
});
