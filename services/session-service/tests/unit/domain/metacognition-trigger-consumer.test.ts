import { describe, expect, it, vi } from 'vitest';
import { MetacognitionEventType } from '@noema/events';
import { LearningInterventionType, TriggerType } from '@noema/types';
import type { IStreamEventEnvelope } from '@noema/events/consumer';
import { MetacognitionTriggerConsumer } from '../../../src/events/consumers/metacognition-trigger.consumer.js';
import type { StrategyService } from '../../../src/domain/strategy/index.js';

class TestConsumer extends MetacognitionTriggerConsumer {
  public process(envelope: IStreamEventEnvelope): Promise<boolean> {
    return this.handleEvent(envelope);
  }
}

describe('MetacognitionTriggerConsumer', () => {
  it('parses typed trigger events and delegates to strategy service', async () => {
    const handleTrigger = vi.fn(async () => ({
      lessonPlanId: 'lplan_123',
      sessionId: 'session_123',
      triggerIds: ['trigger_123'],
      scope: 'local',
      interventionType: LearningInterventionType.INSERT_REPAIR_STEP,
      supersededStepIds: [],
      insertedStepIds: [],
    }));
    const consumer = new TestConsumer(
      {} as never,
      { handleTrigger } as unknown as StrategyService,
      { child: () => ({ warn: vi.fn() }) } as never,
      'test-consumer'
    );

    await consumer.process({
      id: 'event_123',
      eventType: MetacognitionEventType.METACOGNITION_TRIGGER_FIRED,
      payload: {
        triggerId: 'trigger_123',
        userId: 'user_123',
        type: TriggerType.PREREQUISITE_GAP,
        severity: 0.9,
        conceptRefs: ['concept_123'],
        stepId: 'step_123',
        sessionId: 'session_123',
        recommendedIntervention: LearningInterventionType.BRANCH_TO_PREREQUISITE,
      },
      metadata: { correlationId: 'cor_123' },
    } as unknown as IStreamEventEnvelope);

    expect(handleTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerId: 'trigger_123',
        type: TriggerType.PREREQUISITE_GAP,
        recommendedIntervention: LearningInterventionType.BRANCH_TO_PREREQUISITE,
      }),
      { userId: 'user_123', correlationId: 'cor_123' }
    );
  });
});
