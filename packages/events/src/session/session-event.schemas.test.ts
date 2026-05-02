import { describe, expect, it } from 'vitest';
import { Environment } from '@noema/types';
import { SessionCompletedEventSchema } from './session-event.schemas.js';
import { SessionEventType } from './session.events.js';

describe('session event schemas', () => {
  it('validates step-first session.completed payloads', () => {
    const parsed = SessionCompletedEventSchema.parse({
      eventId: 'event_ABCDEFGHIJKLMNOPQRSTU',
      eventType: SessionEventType.SESSION_COMPLETED,
      aggregateType: 'Session',
      aggregateId: 'session_ABCDEFGHIJKLMNOPQRSTU',
      version: 1,
      timestamp: '2026-05-03T00:00:00.000Z',
      metadata: {
        serviceName: 'session-service',
        serviceVersion: '0.1.0',
        environment: Environment.TEST,
        correlationId: 'correlation_ABCDEFGHIJKLMNOPQRSTU',
        userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
      },
      payload: {
        sessionId: 'session_ABCDEFGHIJKLMNOPQRSTU',
        userId: 'user_ABCDEFGHIJKLMNOPQRSTU',
        studyMode: 'knowledge_gaining',
        completedAt: '2026-05-03T00:00:00.000Z',
        terminationReason: 'completed_normally',
        learningMode: 'goal_driven',
        sourceCategories: ['reasoning'],
        sourceDecks: ['deck_alpha'],
      },
    });

    expect(parsed.payload.sessionId).toBe('session_ABCDEFGHIJKLMNOPQRSTU');
    expect(parsed.payload.terminationReason).toBe('completed_normally');
  });
});
