/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { UserId } from '@noema/types';
import { gamificationApi } from './api.js';
import type {
  BadgeProjectionDto,
  BadgesResponse,
  CapabilityTierProgressDto,
  GamificationProgressionResponse,
  GamificationQuery,
  GamificationSummaryDto,
  GamificationSummaryResponse,
  StreakStatusDto,
  StreakStatusResponse,
} from './types.js';

export const gamificationKeys = {
  all: ['gamification'] as const,
  summary: (userId: UserId, query: GamificationQuery) =>
    [...gamificationKeys.all, 'summary', userId, query] as const,
  streak: (userId: UserId, query: GamificationQuery) =>
    [...gamificationKeys.all, 'streak', userId, query] as const,
  badges: (userId: UserId, query: GamificationQuery) =>
    [...gamificationKeys.all, 'badges', userId, query] as const,
  progression: (userId: UserId, query: GamificationQuery) =>
    [...gamificationKeys.all, 'progression', userId, query] as const,
};

export function useGamificationSummary(
  userId: UserId,
  query: GamificationQuery,
  options?: Omit<
    UseQueryOptions<GamificationSummaryResponse, Error, GamificationSummaryDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gamificationKeys.summary(userId, query),
    queryFn: () => gamificationApi.getSummary(userId, query),
    select: (response) => response.data,
    enabled: userId !== '',
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useStreakStatus(
  userId: UserId,
  query: GamificationQuery,
  options?: Omit<
    UseQueryOptions<StreakStatusResponse, Error, StreakStatusDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gamificationKeys.streak(userId, query),
    queryFn: () => gamificationApi.getStreak(userId, query),
    select: (response) => response.data,
    enabled: userId !== '',
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useGamificationBadges(
  userId: UserId,
  query: GamificationQuery,
  options?: Omit<
    UseQueryOptions<BadgesResponse, Error, BadgeProjectionDto[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gamificationKeys.badges(userId, query),
    queryFn: () => gamificationApi.getBadges(userId, query),
    select: (response) => response.data.badges,
    enabled: userId !== '',
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useGamificationProgression(
  userId: UserId,
  query: GamificationQuery,
  options?: Omit<
    UseQueryOptions<GamificationProgressionResponse, Error, CapabilityTierProgressDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gamificationKeys.progression(userId, query),
    queryFn: () => gamificationApi.getProgression(userId, query),
    select: (response) => response.data,
    enabled: userId !== '',
    staleTime: 30 * 1000,
    ...options,
  });
}
