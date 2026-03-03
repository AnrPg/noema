/**
 * @noema/scheduler-service - Scheduler Base Consumer
 *
 * Service-local subclass of the shared BaseEventConsumer that adds:
 * - Reliability repository integration (SchedulerEventInbox dedup)
 * - Session revision guards (stale-event rejection)
 * - Observability spans wrapping each message
 * - Linkage extraction + idempotency key building
 *
 * All scheduler-service consumers extend this instead of the shared base.
 *
 * @see @noema/events/consumer   — Shared lifecycle, DLQ, retry
 * @see ADR-003                  — Event consumer architecture unification
 */

import type { IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import type { UserId } from '@noema/types';
import { createHash, randomUUID } from 'node:crypto';

import type {
  ICalibrationDataRepository,
  IConsumerLinkage,
  IReviewRepository,
  ISchedulerCardRepository,
  ISchedulerEventReliabilityRepository,
} from '../../domain/scheduler-service/scheduler.repository.js';
import type { IEventPublisher } from '../../domain/shared/event-publisher.js';
import { schedulerObservability } from '../../infrastructure/observability/scheduler-observability.js';

// ============================================================================
// Dependencies
// ============================================================================

/**
 * Shared dependency bag for all scheduler consumers.
 * Injected once at bootstrap and shared across all consumer instances.
 */
export interface ISchedulerConsumerDependencies {
  schedulerCardRepository: ISchedulerCardRepository;
  reviewRepository: IReviewRepository;
  calibrationDataRepository: ICalibrationDataRepository;
  reliabilityRepository: ISchedulerEventReliabilityRepository;
  eventPublisher: IEventPublisher;
}

// ============================================================================
// Scheduler Base Consumer
// ============================================================================

export abstract class SchedulerBaseConsumer extends BaseEventConsumer {
  protected readonly dependencies: ISchedulerConsumerDependencies;

  constructor(...args: ConstructorParameters<typeof BaseEventConsumer>) {
    super(...args);
    // dependencies will be set by the concrete constructor — see setDependencies()
    this.dependencies = undefined as unknown as ISchedulerConsumerDependencies;
  }

  /**
   * Inject dependencies after construction.
   * Called by the bootstrap code after creating the consumer.
   */
  setDependencies(deps: ISchedulerConsumerDependencies): void {
    (this as unknown as { dependencies: ISchedulerConsumerDependencies }).dependencies = deps;
  }

  // --------------------------------------------------------------------------
  // Template method — wraps the domain logic with reliability + observability
  // --------------------------------------------------------------------------

  /**
   * Final implementation of the shared base's handleEvent().
   * Orchestrates: observability span → inbox claim → revision guard →
   * domain dispatch → inbox mark processed.
   *
   * Concrete consumers implement `dispatchEvent()` for domain logic.
   */
  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    const span = schedulerObservability.startSpan('event.consumer.handleEvent', {
      traceId: envelope.eventId ?? envelope.aggregateId,
      correlationId:
        (envelope.metadata?.['correlationId'] as string | undefined) ?? envelope.aggregateId,
      component: 'event',
    });
    let spanSuccess = false;

    try {
      const linkage = this.extractLinkage(envelope);
      const idempotencyKey = this.buildIdempotencyKey(envelope, linkage);

      // Inbox dedup — skip if already processed or in-flight
      const claimResult = await this.dependencies.reliabilityRepository.claimInbox({
        idempotencyKey,
        eventType: envelope.eventType,
        linkage,
        payload: envelope.payload,
      });

      if (claimResult.status !== 'claimed') {
        return true; // Already processed — ACK
      }

      // Revision guard — reject stale cohort events
      if (
        linkage.sessionId !== undefined &&
        linkage.proposalId !== undefined &&
        typeof linkage.sessionRevision === 'number'
      ) {
        const latestRevision =
          await this.dependencies.reliabilityRepository.readLatestSessionRevision(
            linkage.sessionId,
            linkage.proposalId
          );

        if (latestRevision !== null && linkage.sessionRevision < latestRevision) {
          await this.dependencies.reliabilityRepository.markInboxProcessed(idempotencyKey);
          return true; // Stale — ACK
        }
      }

      // Domain dispatch
      await this.dispatchEvent(envelope);

      // Mark as processed
      await this.dependencies.reliabilityRepository.markInboxProcessed(idempotencyKey);
      spanSuccess = true;
      return true;
    } catch (error: unknown) {
      // Mark inbox as failed (for retry tracking). Re-throw so the base
      // class handles retry/DLQ via its standard flow.
      try {
        const linkage = this.extractLinkage(envelope);
        const idempotencyKey = this.buildIdempotencyKey(envelope, linkage);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.dependencies.reliabilityRepository.markInboxFailed(idempotencyKey, errorMessage);
      } catch {
        // Best-effort — don't mask the original error
      }
      throw error;
    } finally {
      span.end(spanSuccess);
    }
  }

  // --------------------------------------------------------------------------
  // Abstract domain dispatch
  // --------------------------------------------------------------------------

  /**
   * Process a single event envelope. Concrete consumers implement this
   * to handle their specific event types.
   *
   * Unlike the shared base's `handleEvent()`, this method does NOT need
   * to return a boolean — the inbox/reliability/ACK logic is handled
   * by the `handleEvent()` wrapper above.
   */
  protected abstract dispatchEvent(envelope: IStreamEventEnvelope): Promise<void>;

  // --------------------------------------------------------------------------
  // Linkage extraction
  // --------------------------------------------------------------------------

  protected extractLinkage(envelope: IStreamEventEnvelope): IConsumerLinkage {
    const payload = envelope.payload;
    const payloadView = payload as {
      linkage?: unknown;
      proposalId?: unknown;
      orchestrationProposalId?: unknown;
      decisionId?: unknown;
      sessionId?: unknown;
      sessionRevision?: unknown;
      userId?: unknown;
      correlationId?: unknown;
    };
    const linkage = this.readRecord(payloadView.linkage);
    const linkageView = linkage as {
      proposalId?: unknown;
      decisionId?: unknown;
      sessionId?: unknown;
      sessionRevision?: unknown;
      correlationId?: unknown;
    } | null;

    const proposalId = this.readString(
      payloadView.proposalId ?? payloadView.orchestrationProposalId ?? linkageView?.proposalId
    );
    const decisionId = this.readString(payloadView.decisionId ?? linkageView?.decisionId);
    const sessionId = this.readString(payloadView.sessionId ?? linkageView?.sessionId);
    const sessionRevision = this.readNumber(
      payloadView.sessionRevision ?? linkageView?.sessionRevision
    );
    const userId = this.readString(payloadView.userId ?? envelope.metadata?.['userId']);

    const correlationFromPayload = this.readString(
      payloadView.correlationId ?? linkageView?.correlationId
    );
    const correlationId =
      correlationFromPayload ??
      this.readString(envelope.metadata?.['correlationId']) ??
      `cor_${randomUUID()}`;

    return {
      correlationId,
      ...(userId !== undefined ? { userId: userId as UserId } : {}),
      ...(proposalId !== undefined ? { proposalId } : {}),
      ...(decisionId !== undefined ? { decisionId } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(sessionRevision !== undefined ? { sessionRevision } : {}),
    };
  }

  protected buildIdempotencyKey(envelope: IStreamEventEnvelope, linkage: IConsumerLinkage): string {
    const payload = envelope.payload;
    const attemptId = this.readString(payload['attemptId']);

    if (attemptId !== undefined) {
      return `attempt:${attemptId}`;
    }

    if (
      linkage.sessionId !== undefined &&
      linkage.proposalId !== undefined &&
      typeof linkage.sessionRevision === 'number'
    ) {
      return `cohort:${envelope.eventType}:${linkage.sessionId}:${linkage.proposalId}:${String(linkage.sessionRevision)}`;
    }

    const digest = createHash('sha256')
      .update(JSON.stringify(envelope.payload))
      .digest('hex')
      .slice(0, 24);
    return `evt:${envelope.eventType}:${envelope.aggregateId}:${linkage.correlationId}:${digest}`;
  }

  // --------------------------------------------------------------------------
  // Utility helpers
  // --------------------------------------------------------------------------

  protected readCardIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string' && item !== '');
  }

  protected readLane(value: unknown): 'retention' | 'calibration' | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.toLowerCase();
    if (normalized === 'retention' || normalized === 'calibration') {
      return normalized;
    }
    return null;
  }

  protected readRating(value: unknown): 'again' | 'hard' | 'good' | 'easy' | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.toLowerCase();
    if (
      normalized === 'again' ||
      normalized === 'hard' ||
      normalized === 'good' ||
      normalized === 'easy'
    ) {
      return normalized;
    }
    return null;
  }

  protected isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return (
      message.includes('unique') ||
      message.includes('duplicate key') ||
      message.includes('constraint')
    );
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  protected readString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
