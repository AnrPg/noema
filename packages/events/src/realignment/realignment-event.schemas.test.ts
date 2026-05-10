import { describe, expect, it } from 'vitest';
import { Environment } from '@noema/types';
import {
  MetacognitionEventType,
  MetacognitionEvaluationRecordedEventSchema,
  PedagogyEventType,
  PedagogyValidationRejectedEventSchema,
  StrategyReplanProposedEventSchema,
} from './index.js';

const ids = {
  eventId: 'event_ABCDEFGHIJKLMNOPQRSTU',
  correlationId: 'correlation_ABCDEFGHIJKLMNOPQRSTU',
  userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
  sessionId: 'session_ABCDEFGHIJKLMNOPQRSTU',
  lessonPlanId: 'lesson_ABCDEFGHIJKLMNOPQRSTU',
  stepId: 'step_ABCDEFGHIJKLMNOPQRSTU',
  evaluationId: 'eval_ABCDEFGHIJKLMNOPQRSTU',
  triggerId: 'trigger_ABCDEFGHIJKLMNOPQRSTU',
  conceptId: 'concept_ABCDEFGHIJKLMNOPQRSTU',
  curriculumNodeId: 'cnode_ABCDEFGHIJKLMNOPQRSTU',
};

const metadata = {
  serviceName: 'metacognition-service',
  serviceVersion: '0.1.0',
  environment: Environment.TEST,
  userId: ids.userId,
  sessionId: ids.sessionId,
  correlationId: ids.correlationId,
};

describe('realignment event schemas', () => {
  it('validates metacognition evaluation events', () => {
    const parsed = MetacognitionEvaluationRecordedEventSchema.parse({
      eventId: ids.eventId,
      eventType: MetacognitionEventType.METACOGNITION_EVALUATION_RECORDED,
      aggregateType: 'Evaluation',
      aggregateId: ids.evaluationId,
      version: 1,
      timestamp: '2026-05-01T00:00:00.000Z',
      metadata,
      payload: {
        evaluationId: ids.evaluationId,
        stepId: ids.stepId,
        sessionId: ids.sessionId,
        userId: ids.userId,
        conceptRefs: [ids.conceptId],
        selectedNodeIds: [ids.curriculumNodeId],
        reasoningQuality: 0.75,
        confidenceSignal: 0.5,
        combinedScore: 0.71,
        correct: true,
        studyMode: 'knowledge_gaining',
        epistemicMode: 'generative_retrieval',
      },
    });

    expect(parsed.eventType).toBe('metacognition.evaluation.recorded');
  });

  it('rejects stale cohort event names from realignment schemas', () => {
    const parsed = StrategyReplanProposedEventSchema.safeParse({
      eventId: ids.eventId,
      eventType: 'session.cohort.proposed',
      aggregateType: 'Replan',
      aggregateId: ids.lessonPlanId,
      version: 1,
      timestamp: '2026-05-01T00:00:00.000Z',
      metadata,
      payload: {
        lessonPlanId: ids.lessonPlanId,
        sessionId: ids.sessionId,
        userId: ids.userId,
        triggerIds: [ids.triggerId],
        scope: 'local',
        interventionType: 'insert_repair_step',
        supersededStepIds: [ids.stepId],
        insertedStepIds: ['step_BBCDEFGHIJKLMNOPQRSTU'],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts Guardian activity rejection events', () => {
    const parsed = PedagogyValidationRejectedEventSchema.parse({
      eventId: ids.eventId,
      eventType: PedagogyEventType.PEDAGOGY_VALIDATION_REJECTED,
      aggregateType: 'GuardianValidation',
      aggregateId: 'validation_activity',
      version: 1,
      timestamp: '2026-05-02T00:00:00.000Z',
      metadata,
      payload: {
        validationId: 'validation_activity',
        targetType: 'activity',
        targetId: 'activity_ABCDEFGHIJKLMNOPQRSTU',
        reasonCodes: ['activity.content_source.missing'],
      },
    });

    expect(parsed.payload.targetType).toBe('activity');
  });
});
