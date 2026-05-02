import type { IApiResponse } from '@noema/contracts';
import type {
  IAchievementProjectionDto,
  IBadgeProjectionDto,
  ICapabilityTierProgressDto,
  IGamificationSummaryDto,
  IStreakStatusDto,
} from '@noema/contracts';
import type { StudyMode } from '@noema/types';

export interface IGamificationQuery {
  studyMode: StudyMode;
}

export type GamificationQuery = IGamificationQuery;
export type GamificationSummaryDto = IGamificationSummaryDto;
export type StreakStatusDto = IStreakStatusDto;
export type BadgeProjectionDto = IBadgeProjectionDto;
export type AchievementProjectionDto = IAchievementProjectionDto;
export type CapabilityTierProgressDto = ICapabilityTierProgressDto;

export type GamificationSummaryResponse = IApiResponse<IGamificationSummaryDto>;
export type StreakStatusResponse = IApiResponse<IStreakStatusDto>;
export type BadgesResponse = IApiResponse<{ badges: IBadgeProjectionDto[] }>;
export type GamificationProgressionResponse = IApiResponse<ICapabilityTierProgressDto>;
