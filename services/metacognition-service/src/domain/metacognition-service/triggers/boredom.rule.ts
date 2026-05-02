import { LearningInterventionType, StepSelfRating, TriggerType } from '@noema/types';
import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import type { ITriggerRule } from './rule.js';

export class BoredomTriggerRule implements ITriggerRule {
  public readonly name = 'boredom';

  public evaluate(input: ITriggerRuleInput): ITriggerCandidate[] {
    const veryFast = input.responseTimeMs !== undefined && input.responseTimeMs < 2_500;
    const easy =
      input.correct && input.combinedScore > 0.9 && input.selfRating === StepSelfRating.KNEW_IT;
    if (!veryFast || !easy) return [];

    return [
      {
        type: TriggerType.BOREDOM,
        severity: 0.4,
        detectedFrom: ['context_intent', 'commitment_monitoring'],
        conceptRefs: input.conceptRefs,
        recommendedIntervention: LearningInterventionType.INCREASE_DIFFICULTY,
      },
    ];
  }
}
