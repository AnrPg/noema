import type {
  IAchievementProjectionDto,
  IBadgeProjectionDto,
  ICapabilityTierProgressDto,
  ICapabilityTierRequirementDto,
  IGamificationSummaryDto,
  IStreakDayDto,
  IStreakStatusDto,
} from '@noema/contracts';
import type {
  IConceptStateChangedPayload,
  IGamificationBadgePayload,
  IMetacognitionEvaluationRecordedPayload,
} from '@noema/events';
import type { ISessionCompletedPayload } from '@noema/events/session';
import type { CorrelationId, StudyMode, UserId } from '@noema/types';

export interface IProcessingContext {
  eventId: string;
  eventType: string;
  correlationId?: CorrelationId;
}

export interface IGamificationConfig {
  xpMultiplier: number;
  streakThreshold: number;
  levelThresholds: number[];
  capabilityTierThresholds: ICapabilityTierRequirementDto[];
}

export interface IUserGamificationProjectionRecord extends IGamificationSummaryDto {
  id: string;
  lastQualifiedDay: string | null;
  lastUnstableFlipAt: string | null;
}

export interface IGamificationReadModel {
  summary: IGamificationSummaryDto;
  streak: IStreakStatusDto;
  badges: IBadgeProjectionDto[];
  progression: ICapabilityTierProgressDto;
}

export interface IGamificationRepository {
  applyEvaluation(
    payload: IMetacognitionEvaluationRecordedPayload,
    context: IProcessingContext,
    config: IGamificationConfig
  ): Promise<void>;
  applyConceptStateChange(
    payload: IConceptStateChangedPayload,
    context: IProcessingContext,
    config: IGamificationConfig
  ): Promise<IGamificationBadgePayload[]>;
  applySessionCompleted(
    payload: ISessionCompletedPayload,
    context: IProcessingContext,
    config: IGamificationConfig
  ): Promise<void>;
  getReadModel(userId: UserId, studyMode: StudyMode): Promise<IGamificationReadModel>;
}

export interface IProjectionState {
  userId: UserId;
  studyMode: StudyMode;
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastQualifiedDay: string | null;
  sessionsCompleted: number;
  totalStepsCompleted: number;
  qualifyingEvaluations: number;
  averageReasoning: number | null;
  stableConcepts: number;
  activeDays: number;
  engagedCategories: string[];
  capabilityTier: number;
  memoryIntegrityScore: number;
  lastUnstableFlipAt: string | null;
}

export interface IStreakDayRecord extends IStreakDayDto {
  projectionId?: string;
}

export type BadgeRecord = IBadgeProjectionDto;
export type AchievementRecord = IAchievementProjectionDto;

export interface IProjectionSnapshot {
  projection: IProjectionState;
  streakDays: IStreakDayRecord[];
  badges: BadgeRecord[];
  achievements: AchievementRecord[];
}
