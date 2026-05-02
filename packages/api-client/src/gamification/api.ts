import { http } from '../client.js';
import type { UserId } from '@noema/types';
import type {
  BadgesResponse,
  GamificationProgressionResponse,
  GamificationQuery,
  GamificationSummaryResponse,
  StreakStatusResponse,
} from './types.js';

export const gamificationApi = {
  getSummary: (userId: UserId, params: GamificationQuery): Promise<GamificationSummaryResponse> =>
    http.get(`/v1/users/${userId}/gamification/summary`, {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getStreak: (userId: UserId, params: GamificationQuery): Promise<StreakStatusResponse> =>
    http.get(`/v1/users/${userId}/gamification/streak`, {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getBadges: (userId: UserId, params: GamificationQuery): Promise<BadgesResponse> =>
    http.get(`/v1/users/${userId}/gamification/badges`, {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getProgression: (
    userId: UserId,
    params: GamificationQuery
  ): Promise<GamificationProgressionResponse> =>
    http.get(`/v1/users/${userId}/gamification/progression`, {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),
};
