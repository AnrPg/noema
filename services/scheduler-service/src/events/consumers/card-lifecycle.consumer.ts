/**
 * @noema/scheduler-service - Card Lifecycle Event Consumer (T2.1)
 *
 * Handles content-service card lifecycle events:
 * - card.created   → Creates a SchedulerCard with FSRS defaults + lane heuristic
 * - card.deleted   → Suspends (soft) or hard-deletes the SchedulerCard
 * - card.state.changed → Mirrors content-service state into scheduler domain
 *
 * Lane assignment heuristic:
 * - If cardType is a RemediationCardType → CALIBRATION lane (HLR algorithm)
 * - Otherwise → RETENTION lane (FSRS algorithm)
 *
 * @see SchedulerBaseConsumer   — reliability, observability, inbox dedup
 * @see ADR-003                 — Event consumer architecture unification
 */

import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import type { CardId, UserId } from '@noema/types';
import { RemediationCardType } from '@noema/types';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { SchedulerLane } from '../../types/scheduler.types.js';
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
    consumerGroup: 'scheduler-service:card-lifecycle',
    consumerName: overrides.consumerName,
    batchSize: 20,
    blockMs: 5000,
    retryBaseDelayMs: 250,
    maxProcessAttempts: 5,
    pendingIdleMs: 30_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:scheduler-service:card-lifecycle',
  };
}

// ============================================================================
// Lane assignment
// ============================================================================

/**
 * Set of all RemediationCardType values for O(1) lookup.
 * Cards with these types are assigned to the CALIBRATION lane (HLR).
 * All other card types go to the RETENTION lane (FSRS).
 */
const REMEDIATION_CARD_TYPES = new Set<string>(Object.values(RemediationCardType));

function assignLane(cardType: string | null | undefined): SchedulerLane {
  if (cardType !== null && cardType !== undefined && REMEDIATION_CARD_TYPES.has(cardType)) {
    return 'calibration';
  }
  return 'retention';
}

// ============================================================================
// Payload schemas
// ============================================================================

const CardCreatedPayloadSchema = z
  .object({
    entity: z
      .object({
        id: z.string().min(1),
        userId: z.string().min(1),
        cardType: z.string().min(1),
        state: z.string().optional(),
        difficulty: z.string().optional(),
        knowledgeNodeIds: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
      })
      .passthrough(),
    source: z.string().optional(),
    batchOperation: z.boolean().optional(),
  })
  .passthrough();

const CardDeletedPayloadSchema = z
  .object({
    cardType: z.string().optional(),
    soft: z.boolean().default(true),
  })
  .passthrough();

const CardStateChangedPayloadSchema = z
  .object({
    previousState: z.string().min(1),
    newState: z.string().min(1),
    reason: z.string().optional(),
  })
  .passthrough();

// ============================================================================
// Event type set
// ============================================================================

const CARD_LIFECYCLE_EVENTS = new Set(['card.created', 'card.deleted', 'card.state.changed']);

// ============================================================================
// Consumer
// ============================================================================

export class CardLifecycleConsumer extends SchedulerBaseConsumer {
  constructor(redis: Redis, logger: Logger, consumerName: string, sourceStreamKey?: string) {
    super(
      redis,
      buildConfig({
        sourceStreamKey: sourceStreamKey ?? 'noema:events:content-service',
        consumerName,
      }),
      logger
    );
  }

  protected async dispatchEvent(envelope: IStreamEventEnvelope): Promise<void> {
    if (!CARD_LIFECYCLE_EVENTS.has(envelope.eventType)) {
      return;
    }

    switch (envelope.eventType) {
      case 'card.created':
        await this.handleCardCreated(envelope);
        break;
      case 'card.deleted':
        await this.handleCardDeleted(envelope);
        break;
      case 'card.state.changed':
        await this.handleCardStateChanged(envelope);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // card.created → Bootstrap SchedulerCard
  // --------------------------------------------------------------------------

  private async handleCardCreated(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = CardCreatedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping invalid card.created payload');
      return;
    }

    const entity = parsed.data.entity;
    const userId = entity.userId as UserId;
    const cardId = entity.id as CardId;
    const lane = assignLane(entity.cardType);

    // Idempotency — skip if scheduler card already exists
    const existing = await this.dependencies.schedulerCardRepository.findByCard(userId, cardId);
    if (existing !== null) {
      this.logger.debug({ cardId }, 'SchedulerCard already exists for card.created; skipping');
      return;
    }

    await this.dependencies.schedulerCardRepository.create({
      id: `sc_${crypto.randomUUID()}`,
      cardId,
      userId,
      lane,
      stability: null,
      difficultyParameter: null,
      halfLife: null,
      interval: 0,
      nextReviewDate: new Date().toISOString(),
      lastReviewedAt: null,
      reviewCount: 0,
      lapseCount: 0,
      consecutiveCorrect: 0,
      schedulingAlgorithm: lane === 'retention' ? 'fsrs' : 'hlr',
      cardType: entity.cardType,
      difficulty: entity.difficulty ?? null,
      knowledgeNodeIds: entity.knowledgeNodeIds,
      state: 'new',
      suspendedUntil: null,
      suspendedReason: null,
      version: 1,
    });

    this.logger.info(
      { cardId, userId, lane, cardType: entity.cardType },
      'Created SchedulerCard from card.created event'
    );
  }

  // --------------------------------------------------------------------------
  // card.deleted → Suspend or hard-delete SchedulerCard
  // --------------------------------------------------------------------------

  private async handleCardDeleted(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = CardDeletedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn({ eventType: envelope.eventType }, 'Skipping invalid card.deleted payload');
      return;
    }

    const cardId = envelope.aggregateId as CardId;
    const userId = envelope.metadata?.['userId'] as string | undefined as UserId | undefined;

    if (userId === undefined) {
      this.logger.warn({ cardId }, 'card.deleted missing userId in metadata; skipping');
      return;
    }

    const existing = await this.dependencies.schedulerCardRepository.findByCard(userId, cardId);
    if (existing === null) {
      this.logger.debug({ cardId }, 'No SchedulerCard found for card.deleted; skipping');
      return;
    }

    if (parsed.data.soft) {
      // Soft delete → Suspend indefinitely with reason
      await this.dependencies.schedulerCardRepository.update(
        userId,
        cardId,
        {
          suspendedUntil: new Date('9999-12-31T23:59:59.999Z').toISOString(),
          suspendedReason: 'card_soft_deleted',
          state: 'suspended',
        },
        existing.version
      );
      this.logger.info({ cardId, userId }, 'Suspended SchedulerCard (soft-deleted content card)');
    } else {
      // Hard delete → Remove scheduler card entirely
      await this.dependencies.schedulerCardRepository.delete(userId, cardId);
      this.logger.info({ cardId, userId }, 'Hard-deleted SchedulerCard');
    }
  }

  // --------------------------------------------------------------------------
  // card.state.changed → Mirror state into scheduler domain
  // --------------------------------------------------------------------------

  private async handleCardStateChanged(envelope: IStreamEventEnvelope): Promise<void> {
    const parsed = CardStateChangedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      this.logger.warn(
        { eventType: envelope.eventType },
        'Skipping invalid card.state.changed payload'
      );
      return;
    }

    const cardId = envelope.aggregateId as CardId;
    const userId = envelope.metadata?.['userId'] as string | undefined as UserId | undefined;

    if (userId === undefined) {
      this.logger.warn({ cardId }, 'card.state.changed missing userId in metadata; skipping');
      return;
    }

    const existing = await this.dependencies.schedulerCardRepository.findByCard(userId, cardId);
    if (existing === null) {
      this.logger.debug({ cardId }, 'No SchedulerCard found for card.state.changed; skipping');
      return;
    }

    // Only update state if the content-service newState is a valid scheduler state.
    // Content "active" → scheduler keeps its own state. Content "suspended" → scheduler
    // suspends. Content "archived" → scheduler suspends with reason.
    const newState = parsed.data.newState.toLowerCase();
    const stateUpdate: Record<string, unknown> = {};

    if (newState === 'suspended') {
      stateUpdate['state'] = 'suspended';
      stateUpdate['suspendedReason'] = parsed.data.reason ?? 'content_state_changed';
      stateUpdate['suspendedUntil'] = new Date('9999-12-31T23:59:59.999Z').toISOString();
    } else if (newState === 'archived') {
      stateUpdate['state'] = 'suspended';
      stateUpdate['suspendedReason'] = 'content_archived';
      stateUpdate['suspendedUntil'] = new Date('9999-12-31T23:59:59.999Z').toISOString();
    } else if (newState === 'active' && existing.state === 'suspended') {
      // Reactivate: clear suspension, revert to last scheduling state
      stateUpdate['state'] = 'new';
      stateUpdate['suspendedUntil'] = null;
      stateUpdate['suspendedReason'] = null;
    }

    if (Object.keys(stateUpdate).length === 0) {
      this.logger.debug(
        { cardId, newState },
        'card.state.changed has no scheduler-relevant state transition; skipping'
      );
      return;
    }

    await this.dependencies.schedulerCardRepository.update(
      userId,
      cardId,
      stateUpdate,
      existing.version
    );

    this.logger.info(
      { cardId, userId, contentState: newState, schedulerUpdate: stateUpdate },
      'Updated SchedulerCard state from card.state.changed'
    );
  }
}
