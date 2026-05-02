export type LeitnerRating = 'again' | 'hard' | 'good' | 'easy';

export interface ILeitnerEvaluationInput {
  rating: LeitnerRating;
  box: number | null;
}

export interface ILeitnerEvaluationResult {
  box: number;
  intervalDays: number;
}

const BOX_INTERVALS = [1, 2, 4, 7, 14, 30, 60];

export function applyLeitnerEvaluation(input: ILeitnerEvaluationInput): ILeitnerEvaluationResult {
  const currentBox = input.box ?? 1;
  const box =
    input.rating === 'again'
      ? 1
      : input.rating === 'hard'
        ? Math.max(1, currentBox)
        : Math.min(BOX_INTERVALS.length, currentBox + (input.rating === 'easy' ? 2 : 1));
  return {
    box,
    intervalDays: BOX_INTERVALS[box - 1] ?? BOX_INTERVALS[BOX_INTERVALS.length - 1] ?? 1,
  };
}
