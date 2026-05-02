import { MetacognitionEventType } from '@noema/events';
import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import {
  LearningInterventionType,
  TriggerType,
  type ConceptId,
  type CorrelationId,
  type SessionId,
  type StepId,
  type TriggerId,
  type UserId,
} from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { StrategyService } from '../../domain/strategy/index.js';
import type { IMetacognitionTriggerInput } from '../../domain/strategy/strategy.service.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'session-service:metacognition-trigger',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 10_000,
    deadLetterStreamKey: 'noema:dlq:session-service:metacognition-trigger',
  };
}

export class MetacognitionTriggerConsumer extends BaseEventConsumer {
  constructor(
    redis: Redis,
    private readonly strategyService: StrategyService,
    logger: Logger,
    consumerName: string,
    sourceStreamKey = 'noema:events:metacognition-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== MetacognitionEventType.METACOGNITION_TRIGGER_FIRED) {
      return true;
    }

    const trigger = parseTrigger(envelope);
    if (trigger === null) {
      this.logger.warn({ envelope }, 'Ignoring malformed metacognition trigger');
      return true;
    }

    await this.strategyService.handleTrigger(trigger, {
      userId: trigger.userId,
      correlationId: readCorrelationId(envelope),
    });
    return true;
  }
}

function parseTrigger(envelope: IStreamEventEnvelope): IMetacognitionTriggerInput | null {
  const payload = envelope.payload;
  const triggerId = payload['triggerId'];
  const userId = payload['userId'];
  const type = payload['type'];
  const severity = payload['severity'];
  const stepId = payload['stepId'];
  const sessionId = payload['sessionId'];
  const conceptRefs = payload['conceptRefs'];
  const recommendedIntervention = payload['recommendedIntervention'];

  if (
    typeof triggerId !== 'string' ||
    typeof userId !== 'string' ||
    !isTriggerType(type) ||
    typeof severity !== 'number' ||
    typeof stepId !== 'string' ||
    typeof sessionId !== 'string' ||
    !Array.isArray(conceptRefs) ||
    !conceptRefs.every((value) => typeof value === 'string')
  ) {
    return null;
  }

  return {
    triggerId: triggerId as TriggerId,
    userId: userId as UserId,
    type,
    severity,
    conceptRefs: conceptRefs as ConceptId[],
    stepId: stepId as StepId,
    sessionId: sessionId as SessionId,
    ...(isLearningInterventionType(recommendedIntervention) ? { recommendedIntervention } : {}),
  };
}

function readCorrelationId(envelope: IStreamEventEnvelope): CorrelationId {
  const value = envelope.metadata['correlationId'];
  return (
    typeof value === 'string' && value.length > 0 ? value : `cor_${Date.now().toString(36)}`
  ) as CorrelationId;
}

function isTriggerType(value: unknown): value is TriggerType {
  return typeof value === 'string' && Object.values(TriggerType).includes(value as TriggerType);
}

function isLearningInterventionType(value: unknown): value is LearningInterventionType {
  return (
    typeof value === 'string' &&
    Object.values(LearningInterventionType).includes(value as LearningInterventionType)
  );
}
