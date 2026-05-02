import { SchedulerRating } from '@noema/types';

export function ratingFromCombinedScore(combinedScore: number): SchedulerRating {
  if (combinedScore < 0.3) return SchedulerRating.AGAIN;
  if (combinedScore < 0.5) return SchedulerRating.HARD;
  if (combinedScore < 0.8) return SchedulerRating.GOOD;
  return SchedulerRating.EASY;
}
