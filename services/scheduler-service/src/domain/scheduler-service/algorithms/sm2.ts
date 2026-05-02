export type SM2Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ISM2EvaluationInput {
  rating: SM2Rating;
  easeFactor: number | null;
  intervalDays: number;
  reviewCount: number;
}

export interface ISM2EvaluationResult {
  easeFactor: number;
  intervalDays: number;
}

const MIN_EASE_FACTOR = 1.3;

export function applySM2Evaluation(input: ISM2EvaluationInput): ISM2EvaluationResult {
  const quality = ratingToQuality(input.rating);
  const currentEase = input.easeFactor ?? 2.5;

  if (quality < 3) {
    return { easeFactor: Math.max(MIN_EASE_FACTOR, currentEase - 0.2), intervalDays: 1 };
  }

  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    currentEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  if (input.reviewCount <= 0) return { easeFactor, intervalDays: 1 };
  if (input.reviewCount === 1) return { easeFactor, intervalDays: 6 };

  return {
    easeFactor,
    intervalDays: Math.max(1, Math.round(input.intervalDays * easeFactor)),
  };
}

function ratingToQuality(rating: SM2Rating): number {
  switch (rating) {
    case 'again':
      return 1;
    case 'hard':
      return 3;
    case 'good':
      return 4;
    case 'easy':
      return 5;
  }
}
