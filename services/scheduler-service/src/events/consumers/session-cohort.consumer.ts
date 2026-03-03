/**
 * @noema/scheduler-service - Session Cohort Event Consumer
 *
 * Handles session cohort handshake events:
 * - session.cohort.proposed
 * - session.cohort.accepted
 * - session.cohort.revised
 * - session.cohort.committed
 *
 * Persists handshake state transitions via the reliability repository
 * and publishes corresponding schedule.handshake.* acknowledgement events.
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { CorrelationId, UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import type {
  HandshakeState,
  IConsumerLinkage,
} from '../../domain/scheduler-service/scheduler.repository.js';
import { SchedulerBaseConsumer } from './scheduler-base-consumer.js';

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'scheduler-service:session-cohort',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:session-cohort',
  };
}

// ============================================================================
// Payload schemas
// ============================================================================

const SessionCohortLinkageSchema = z.object({
  proposalId: z.string().min(1),
  decisionId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionRevision: z.number().int().nonnegative(),
  correlationId: z.string().min(1),
});

const SessionCohortProposedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    candidateCardIds: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

const SessionCohortAcceptedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    acceptedCardIds: z.array(z.string().min(1)).default([]),
    excludedCardIds: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

const SessionCohortRevisedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    revisionFrom: z.number().int().nonnegative(),
    revisionTo: z.number().int().nonnegative(),
    candidateCardIds: z.array(z.string().min(1)).default([]),
    reason: z.string().optional(),
  })
  .passthrough();

const SessionCohortCommittedPayloadSchema = z
  .object({
    userId: z.string().min(1),
    linkage: SessionCohortLinkageSchema,
    committedCardIds: z.array(z.string().min(1)).default([]),
    rejectedCardIds: z.array(z.string().min(1)).default([]),
    policyVersion: z.string().optional(),
  })
  .passthrough();

// ============================================================================
// Consumer
// ============================================================================

const COHORT_EVENT_TYPES = new Set([
  'session.cohort.proposed',
  'session.cohort.accepted',
  'session.cohort.revised',
  'session.cohort.committed',
]);

const EVENT_TO_STATE: Record<string, HandshakeState> = {
  'session.cohort.proposed': 'proposed',
  'session.cohort.accepted': 'accepted',
  'session.cohort.revised': 'revised',
  'session.cohort.committed': 'committed',
};

export class SessionCohortConsumer extends SchedulerBaseConsumer {
  constructor(redis: Redis, logger: Logger, consumerName: string, sourceStreamKey?: string) {
    super(
      redis,
      buildConfig({
        sourceStreamKey: sourceStreamKey ?? 'noema:events:session-service',
        consumerName,
      }),
      logger
    );
  }

  protected async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    if (!COHORT_EVENT_TYPES.has(envelope.eventType)) {
      return;
    }

    const state = EVENT_TO_STATE[envelope.eventType];
    if (state === undefined) {
      return;
    }

    await this.handleSessionCohortTransition(envelope, state);
  }

  private async handleSessionCohortTransition(
    envelope: IStreamEventEnvelope,
    state: HandshakeState
  ): Promise<void> {
    const parsed = this.parseCohortPayload(envelope);
    if (parsed === null) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid session cohort handshake payload'
      );
      return;
    }

    const linkage: IConsumerLinkage = {
      correlationId: parsed.linkage.correlationId,
      userId: parsed.userId as UserId,
      proposalId: parsed.linkage.proposalId,
      decisionId: parsed.linkage.decisionId,
      sessionId: parsed.linkage.sessionId,
      sessionRevision: parsed.linkage.sessionRevision,
    };

    await this.dependencies.reliabilityRepository.applyHandshakeTransition({
      state,
      eventType: envelope.eventType,
      linkage,
      metadata: {
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
      },
    });

    await this.dependencies.eventPublisher.publish({
      eventType: `schedule.handshake.${state}`,
      aggregateType: 'Schedule',
      aggregateId: parsed.linkage.sessionId,
      payload: {
        userId: parsed.userId,
        proposalId: parsed.linkage.proposalId,
        decisionId: parsed.linkage.decisionId,
        sessionId: parsed.linkage.sessionId,
        sessionRevision: parsed.linkage.sessionRevision,
        correlationId: parsed.linkage.correlationId,
        sourceEventType: envelope.eventType,
        ...this.extractCohortCards(parsed),
      },
      metadata: {
        correlationId: parsed.linkage.correlationId as CorrelationId,
        userId: parsed.userId as UserId,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Payload parsing helpers
  // --------------------------------------------------------------------------

  private parseCohortPayload(envelope: IStreamEventEnvelope): {
    userId: string;
    linkage: {
      proposalId: string;
      decisionId: string;
      sessionId: string;
      sessionRevision: number;
      correlationId: string;
    };
    candidateCardIds?: string[];
    acceptedCardIds?: string[];
    excludedCardIds?: string[];
    committedCardIds?: string[];
    rejectedCardIds?: string[];
  } | null {
    if (envelope.eventType === 'session.cohort.proposed') {
      const parsed = SessionCohortProposedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    if (envelope.eventType === 'session.cohort.accepted') {
      const parsed = SessionCohortAcceptedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    if (envelope.eventType === 'session.cohort.revised') {
      const parsed = SessionCohortRevisedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    if (envelope.eventType === 'session.cohort.committed') {
      const parsed = SessionCohortCommittedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? parsed.data : null;
    }

    return null;
  }

  private extractCohortCards(payload: {
    candidateCardIds?: string[];
    acceptedCardIds?: string[];
    excludedCardIds?: string[];
    committedCardIds?: string[];
    rejectedCardIds?: string[];
  }): Record<string, unknown> {
    return {
      candidateCardIds: payload.candidateCardIds ?? [],
      acceptedCardIds: payload.acceptedCardIds ?? [],
      excludedCardIds: payload.excludedCardIds ?? [],
      committedCardIds: payload.committedCardIds ?? [],
      rejectedCardIds: payload.rejectedCardIds ?? [],
    };
  }
}
