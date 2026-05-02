import type {
  IBadgeProjectionDto,
  ICapabilityTierProgressDto,
  IStreakStatusDto,
  IGamificationSummaryDto,
} from '@noema/contracts';
import {
  GamificationEventType,
  type IGamificationBadgePayload,
  type IEventPublisher,
} from '@noema/events';
import type {
  IConceptStateChangedPayload,
  IMetacognitionEvaluationRecordedPayload,
} from '@noema/events';
import type { ISessionCompletedPayload } from '@noema/events/session';
import type { Logger } from 'pino';
import type { StudyMode, UserId } from '@noema/types';
import type { IGamificationConfig, IGamificationRepository, IProcessingContext } from './types.js';

export class GamificationService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: IGamificationRepository,
    private readonly eventPublisher: IEventPublisher,
    logger: Logger,
    private readonly config: IGamificationConfig
  ) {
    this.logger = logger.child({ component: 'GamificationService' });
  }

  async applyEvaluationEvent(
    payload: IMetacognitionEvaluationRecordedPayload,
    context: IProcessingContext
  ): Promise<void> {
    await this.repository.applyEvaluation(payload, context, this.config);
  }

  async applyConceptStateChangedEvent(
    payload: IConceptStateChangedPayload,
    context: IProcessingContext
  ): Promise<void> {
    const changes = await this.repository.applyConceptStateChange(payload, context, this.config);
    await Promise.all(
      changes.map((change) => this.publishBadgeEvent(change, payload.userId, context))
    );
  }

  async applySessionCompletedEvent(
    payload: ISessionCompletedPayload,
    context: IProcessingContext
  ): Promise<void> {
    await this.repository.applySessionCompleted(payload, context, this.config);
  }

  async getSummary(userId: UserId, studyMode: StudyMode): Promise<IGamificationSummaryDto> {
    return (await this.repository.getReadModel(userId, studyMode)).summary;
  }

  async getStreak(userId: UserId, studyMode: StudyMode): Promise<IStreakStatusDto> {
    return (await this.repository.getReadModel(userId, studyMode)).streak;
  }

  async getBadges(userId: UserId, studyMode: StudyMode): Promise<IBadgeProjectionDto[]> {
    return (await this.repository.getReadModel(userId, studyMode)).badges;
  }

  async getProgression(userId: UserId, studyMode: StudyMode): Promise<ICapabilityTierProgressDto> {
    return (await this.repository.getReadModel(userId, studyMode)).progression;
  }

  private async publishBadgeEvent(
    badge: IGamificationBadgePayload,
    userId: UserId,
    context: IProcessingContext
  ): Promise<void> {
    const eventType = badge.reason.includes('stable')
      ? GamificationEventType.GAMIFICATION_BADGE_GRANTED
      : GamificationEventType.GAMIFICATION_BADGE_REVOKED;
    await this.eventPublisher.publish({
      eventType,
      aggregateType: 'GamificationBadge',
      aggregateId: badge.badgeId,
      payload: badge,
      metadata: {
        correlationId: context.correlationId ?? (`correlation_${Date.now().toString(36)}` as never),
        userId,
      },
    });
    this.logger.debug({ badgeId: badge.badgeId, eventType }, 'Published gamification badge event');
  }
}
