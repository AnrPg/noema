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
import type { CardId, StudyMode, UserId } from '@noema/types';
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
const DEFAULT_STUDY_MODES: StudyMode[] = ['knowledge_gaining'];

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
        supportedStudyModes: z
          .array(z.enum(['language_learning', 'knowledge_gaining']))
          .default(['knowledge_gaining']),
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
    const studyModes =
      (entity.supportedStudyModes as StudyMode[] | undefined) ?? DEFAULT_STUDY_MODES;

    for (const studyMode of studyModes) {
      const existing = await this.dependencies.schedulerCardRepository.findByCard(
        userId,
        cardId,
        studyMode
      );
      if (existing !== null) {
        this.logger.debug(
          { cardId, studyMode },
          'SchedulerCard already exists for card.created; skipping'
        );
        continue;
      }

      await this.dependencies.schedulerCardRepository.create({
        id: `sc_${crypto.randomUUID()}`,
        cardId,
        userId,
        studyMode,
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
    }

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

    for (const studyMode of ['knowledge_gaining', 'language_learning'] as StudyMode[]) {
      const existing = await this.dependencies.schedulerCardRepository.findByCard(
        userId,
        cardId,
        studyMode
      );
      if (existing === null) {
        continue;
      }

      if (parsed.data.soft) {
        await this.dependencies.schedulerCardRepository.update(
          userId,
          cardId,
          {
            suspendedUntil: new Date('9999-12-31T23:59:59.999Z').toISOString(),
            suspendedReason: 'card_soft_deleted',
            state: 'suspended',
          },
          existing.version,
          studyMode
        );
      } else {
        await this.dependencies.schedulerCardRepository.delete(userId, cardId, studyMode);
      }
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

    const newState = parsed.data.newState.toLowerCase();

    for (const studyMode of ['knowledge_gaining', 'language_learning'] as StudyMode[]) {
      const existing = await this.dependencies.schedulerCardRepository.findByCard(
        userId,
        cardId,
        studyMode
      );
      if (existing === null) {
        continue;
      }

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
        stateUpdate['state'] = 'new';
        stateUpdate['suspendedUntil'] = null;
        stateUpdate['suspendedReason'] = null;
      }

      if (Object.keys(stateUpdate).length === 0) {
        continue;
      }

      await this.dependencies.schedulerCardRepository.update(
        userId,
        cardId,
        stateUpdate,
        existing.version,
        studyMode
      );
    }

    this.logger.info(
      { cardId, userId, contentState: newState },
      'Updated SchedulerCard state from card.state.changed'
    );
  }
}
